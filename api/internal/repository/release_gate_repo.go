package repository

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type ReleaseGateRepo struct {
	db *pgxpool.Pool
}

func NewReleaseGateRepo(db *pgxpool.Pool) *ReleaseGateRepo {
	return &ReleaseGateRepo{db: db}
}

/* ── Release candidates ── */

func (r *ReleaseGateRepo) CreateCandidate(ctx context.Context, c *model.ReleaseCandidate) error {
	scope, _ := json.Marshal(c.Scope)
	results, _ := json.Marshal(c.Results)
	_, err := r.db.Exec(ctx,
		`INSERT INTO release_candidates
		   (id, service_id, label, target_version, environment, git_ref, git_commit, pr_ref, issue_ref, change_summary, status, scope_json, results_json, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		c.ID, c.ServiceID, c.Label, c.TargetVersion, c.Environment, c.GitRef, c.GitCommit, c.PRRef, c.IssueRef, c.ChangeSummary,
		c.Status, scope, results, c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *ReleaseGateRepo) UpdateCandidate(ctx context.Context, c *model.ReleaseCandidate) error {
	results, _ := json.Marshal(c.Results)
	_, err := r.db.Exec(ctx,
		`UPDATE release_candidates SET status=$1, results_json=$2, updated_at=$3 WHERE id=$4`,
		c.Status, results, c.UpdatedAt, c.ID,
	)
	return err
}

func scanCandidate(row pgx.Row) (*model.ReleaseCandidate, error) {
	var c model.ReleaseCandidate
	var scope, results []byte
	err := row.Scan(&c.ID, &c.ServiceID, &c.Label, &c.TargetVersion, &c.Environment, &c.GitRef, &c.GitCommit,
		&c.PRRef, &c.IssueRef, &c.ChangeSummary, &c.Status, &scope, &results, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(scope, &c.Scope)
	_ = json.Unmarshal(results, &c.Results)
	return &c, nil
}

const candidateCols = `id, service_id, label, target_version, environment, git_ref, git_commit, pr_ref, issue_ref, change_summary, status, scope_json, results_json, created_at, updated_at`

func (r *ReleaseGateRepo) GetCandidate(ctx context.Context, id string) (*model.ReleaseCandidate, error) {
	return scanCandidate(r.db.QueryRow(ctx, `SELECT `+candidateCols+` FROM release_candidates WHERE id=$1`, id))
}

// LatestCandidateForService returns the most recently created candidate, or nil.
func (r *ReleaseGateRepo) LatestCandidateForService(ctx context.Context, serviceID string) (*model.ReleaseCandidate, error) {
	c, err := scanCandidate(r.db.QueryRow(ctx,
		`SELECT `+candidateCols+` FROM release_candidates WHERE service_id=$1 ORDER BY created_at DESC LIMIT 1`, serviceID))
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return c, err
}

/* ── Baselines ── */

func (r *ReleaseGateRepo) CreateBaseline(ctx context.Context, b *model.ServiceBaseline) error {
	results, _ := json.Marshal(b.Results)
	_, err := r.db.Exec(ctx,
		`INSERT INTO service_baselines (id, service_id, candidate_id, label, results_json, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		b.ID, b.ServiceID, b.CandidateID, b.Label, results, b.CreatedAt,
	)
	return err
}

func (r *ReleaseGateRepo) LatestBaselineForService(ctx context.Context, serviceID string) (*model.ServiceBaseline, error) {
	var b model.ServiceBaseline
	var results []byte
	err := r.db.QueryRow(ctx,
		`SELECT id, service_id, candidate_id, label, results_json, created_at FROM service_baselines
		 WHERE service_id=$1 ORDER BY created_at DESC LIMIT 1`, serviceID).
		Scan(&b.ID, &b.ServiceID, &b.CandidateID, &b.Label, &results, &b.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(results, &b.Results)
	return &b, nil
}

// ServiceIDsWithGates returns every service id that has at least one candidate
// or baseline (used to build the gate landing overlay).
func (r *ReleaseGateRepo) ServiceIDsWithGates(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT service_id FROM release_candidates
		 UNION
		 SELECT service_id FROM service_baselines`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
