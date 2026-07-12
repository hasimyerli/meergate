package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type CatalogRepo struct {
	db *pgxpool.Pool
}

func NewCatalogRepo(db *pgxpool.Pool) *CatalogRepo {
	return &CatalogRepo{db: db}
}

func (r *CatalogRepo) Upsert(ctx context.Context, entry model.ServiceCatalogEntry) error {
	configJSON := entry.Config
	if configJSON == nil {
		configJSON = json.RawMessage(`{}`)
	}

	_, err := r.db.Exec(ctx,
		`INSERT INTO service_catalog (id, protocol, name, target, domain, config, catalog, synced_at, sync_error)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (id) DO UPDATE SET
		   protocol = EXCLUDED.protocol,
		   name = EXCLUDED.name,
		   target = EXCLUDED.target,
		   domain = EXCLUDED.domain,
		   config = EXCLUDED.config`,
		entry.ID, entry.Protocol, entry.Name, entry.Target, entry.Domain,
		configJSON, entry.Catalog, entry.SyncedAt, entry.SyncError,
	)
	return err
}

func (r *CatalogRepo) BulkUpsert(ctx context.Context, entries []model.ServiceCatalogEntry) error {
	if len(entries) == 0 {
		return nil
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	newIDs := make(map[string]bool, len(entries))
	var protocol string
	for _, e := range entries {
		newIDs[e.ID] = true
		if protocol == "" {
			protocol = e.Protocol
		}
	}

	if protocol != "" {
		rows, err := tx.Query(ctx,
			`SELECT id FROM service_catalog WHERE protocol = $1`, protocol)
		if err != nil {
			return fmt.Errorf("list existing %s entries: %w", protocol, err)
		}
		var staleIDs []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return fmt.Errorf("scan existing id: %w", err)
			}
			if !newIDs[id] {
				staleIDs = append(staleIDs, id)
			}
		}
		rows.Close()

		for _, id := range staleIDs {
			if _, err := tx.Exec(ctx, `DELETE FROM service_catalog WHERE id = $1`, id); err != nil {
				return fmt.Errorf("delete stale entry %s: %w", id, err)
			}
		}
	}

	for _, entry := range entries {
		configJSON := entry.Config
		if configJSON == nil {
			configJSON = json.RawMessage(`{}`)
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO service_catalog (id, protocol, name, target, domain, config)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (id) DO UPDATE SET
			   protocol = EXCLUDED.protocol,
			   name = EXCLUDED.name,
			   target = EXCLUDED.target,
			   domain = EXCLUDED.domain,
			   config = EXCLUDED.config`,
			entry.ID, entry.Protocol, entry.Name, entry.Target, entry.Domain, configJSON,
		)
		if err != nil {
			return fmt.Errorf("upsert %s: %w", entry.ID, err)
		}
	}

	return tx.Commit(ctx)
}

func (r *CatalogRepo) UpdateCatalog(ctx context.Context, id string, catalog json.RawMessage, syncedAt string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE service_catalog SET catalog = $1, synced_at = $2, sync_error = NULL WHERE id = $3`,
		catalog, syncedAt, id,
	)
	return err
}

func (r *CatalogRepo) UpdateSyncError(ctx context.Context, id string, syncErr string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE service_catalog SET sync_error = $1 WHERE id = $2`,
		syncErr, id,
	)
	return err
}

// HealthCheck is one historical probe row.
type HealthCheck struct {
	Status    string `json:"status"`
	LatencyMs *int   `json:"latency_ms"`
	CheckedAt string `json:"checked_at"`
}

// HealthStats are rolling latency percentiles + uptime over recorded checks.
type HealthStats struct {
	P50    *float64 `json:"p50"`
	P95    *float64 `json:"p95"`
	P99    *float64 `json:"p99"`
	Uptime *float64 `json:"uptime"` // 0..1
	Total  int      `json:"total"`
}

// InsertHealthCheck appends one probe result to the history.
func (r *CatalogRepo) InsertHealthCheck(ctx context.Context, id, serviceID, status string, latencyMs int, at string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO service_health_checks (id, service_id, status, latency_ms, checked_at) VALUES ($1,$2,$3,$4,$5)`,
		id, serviceID, status, latencyMs, at,
	)
	return err
}

// HealthHistory returns the most recent probes (oldest-first for charting).
func (r *CatalogRepo) HealthHistory(ctx context.Context, serviceID string, limit int) ([]HealthCheck, error) {
	rows, err := r.db.Query(ctx,
		`SELECT status, latency_ms, checked_at FROM service_health_checks
		 WHERE service_id=$1 ORDER BY checked_at DESC LIMIT $2`, serviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []HealthCheck
	for rows.Next() {
		var h HealthCheck
		if err := rows.Scan(&h.Status, &h.LatencyMs, &h.CheckedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	// reverse to oldest-first
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// HealthStats computes latency percentiles + uptime over the recorded checks.
func (r *CatalogRepo) HealthStats(ctx context.Context, serviceID string) (*HealthStats, error) {
	var s HealthStats
	err := r.db.QueryRow(ctx,
		`SELECT
		   PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latency_ms),
		   PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms),
		   PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms),
		   COUNT(*) FILTER (WHERE status='healthy')::float / NULLIF(COUNT(*),0),
		   COUNT(*)
		 FROM service_health_checks WHERE service_id=$1`, serviceID,
	).Scan(&s.P50, &s.P95, &s.P99, &s.Uptime, &s.Total)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// UpdateHealth records a connectivity/latency probe result.
func (r *CatalogRepo) UpdateHealth(ctx context.Context, id, status string, latencyMs int, at string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE service_catalog SET health_status = $1, latency_ms = $2, last_health_at = $3 WHERE id = $4`,
		status, latencyMs, at, id,
	)
	return err
}

// UpdateDrift records a schema-drift summary (empty string clears it).
func (r *CatalogRepo) UpdateDrift(ctx context.Context, id, summary string) error {
	var val interface{}
	if summary != "" {
		val = summary
	}
	_, err := r.db.Exec(ctx,
		`UPDATE service_catalog SET drift_summary = $1 WHERE id = $2`,
		val, id,
	)
	return err
}

func (r *CatalogRepo) List(ctx context.Context, protocol string) ([]model.ServiceCatalogEntry, error) {
	query := `SELECT id, protocol, name, target, domain, config, catalog, synced_at, sync_error, created_at,
	                 health_status, latency_ms, last_health_at, drift_summary
	          FROM service_catalog`
	var args []interface{}

	if protocol != "" {
		query += ` WHERE protocol = $1`
		args = append(args, protocol)
	}
	query += ` ORDER BY domain, name`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []model.ServiceCatalogEntry
	for rows.Next() {
		var e model.ServiceCatalogEntry
		if err := rows.Scan(&e.ID, &e.Protocol, &e.Name, &e.Target, &e.Domain,
			&e.Config, &e.Catalog, &e.SyncedAt, &e.SyncError, &e.CreatedAt,
			&e.HealthStatus, &e.LatencyMs, &e.LastHealthAt, &e.DriftSummary); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, nil
}

func (r *CatalogRepo) Get(ctx context.Context, id string) (*model.ServiceCatalogEntry, error) {
	var e model.ServiceCatalogEntry
	err := r.db.QueryRow(ctx,
		`SELECT id, protocol, name, target, domain, config, catalog, synced_at, sync_error, created_at,
		        health_status, latency_ms, last_health_at, drift_summary
		 FROM service_catalog WHERE id = $1`, id,
	).Scan(&e.ID, &e.Protocol, &e.Name, &e.Target, &e.Domain,
		&e.Config, &e.Catalog, &e.SyncedAt, &e.SyncError, &e.CreatedAt,
		&e.HealthStatus, &e.LatencyMs, &e.LastHealthAt, &e.DriftSummary)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *CatalogRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM service_catalog WHERE id = $1`, id)
	return err
}

func (r *CatalogRepo) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM service_catalog`).Scan(&count)
	return count, err
}

// ExtractDomain extracts a domain grouping from a gRPC service FQN.
// e.g. "proto.balance.v1.BalanceService" -> "balance"
func ExtractDomain(fqn string) string {
	parts := strings.Split(fqn, ".")
	for _, p := range parts {
		if p == "proto" || p == "" {
			continue
		}
		if len(p) <= 3 && strings.HasPrefix(p, "v") {
			continue
		}
		if strings.HasSuffix(p, "Service") || strings.HasSuffix(p, "Query") ||
			strings.HasSuffix(p, "Command") || strings.HasSuffix(p, "Validator") ||
			strings.HasSuffix(p, "Integration") {
			continue
		}
		return p
	}
	return fqn
}

// ExtractServiceName derives a human-readable name from a gRPC FQN.
// e.g. "proto.balance.v1.BalanceService" -> "BalanceService"
func ExtractServiceName(fqn string) string {
	parts := strings.Split(fqn, ".")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return fqn
}
