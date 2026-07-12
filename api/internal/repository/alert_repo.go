package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

// ─── Alert rules ───────────────────────────────────────────────────

type AlertRuleRepo struct {
	db *pgxpool.Pool
}

func NewAlertRuleRepo(db *pgxpool.Pool) *AlertRuleRepo {
	return &AlertRuleRepo{db: db}
}

const alertRuleCols = "id,name,enabled,scope_type,scope_value,condition,threshold,window_n,created_at"

func scanAlertRule(row interface{ Scan(...interface{}) error }) (*model.AlertRule, error) {
	var a model.AlertRule
	err := row.Scan(
		&a.ID, &a.Name, &a.Enabled, &a.ScopeType, &a.ScopeValue,
		&a.Condition, &a.Threshold, &a.WindowN, &a.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *AlertRuleRepo) Create(ctx context.Context, a *model.AlertRule) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO alert_rules (`+alertRuleCols+`) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		a.ID, a.Name, a.Enabled, a.ScopeType, a.ScopeValue,
		a.Condition, a.Threshold, a.WindowN, a.CreatedAt,
	)
	return err
}

func (r *AlertRuleRepo) GetByID(ctx context.Context, id string) (*model.AlertRule, error) {
	row := r.db.QueryRow(ctx, "SELECT "+alertRuleCols+" FROM alert_rules WHERE id=$1", id)
	return scanAlertRule(row)
}

func (r *AlertRuleRepo) List(ctx context.Context) ([]*model.AlertRule, error) {
	return r.query(ctx, "SELECT "+alertRuleCols+" FROM alert_rules ORDER BY created_at DESC")
}

func (r *AlertRuleRepo) ListEnabled(ctx context.Context) ([]*model.AlertRule, error) {
	return r.query(ctx, "SELECT "+alertRuleCols+" FROM alert_rules WHERE enabled=1 ORDER BY created_at DESC")
}

func (r *AlertRuleRepo) query(ctx context.Context, sql string) ([]*model.AlertRule, error) {
	rows, err := r.db.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*model.AlertRule, 0)
	for rows.Next() {
		a, err := scanAlertRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

type AlertRuleUpdates map[string]interface{}

func (r *AlertRuleRepo) Update(ctx context.Context, id string, updates AlertRuleUpdates) error {
	if len(updates) == 0 {
		return nil
	}
	sets := []string{}
	values := []interface{}{}
	idx := 1
	for k, v := range updates {
		sets = append(sets, fmt.Sprintf("%s=$%d", k, idx))
		values = append(values, v)
		idx++
	}
	values = append(values, id)
	query := fmt.Sprintf("UPDATE alert_rules SET %s WHERE id=$%d", strings.Join(sets, ", "), idx)
	_, err := r.db.Exec(ctx, query, values...)
	return err
}

func (r *AlertRuleRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM alert_rules WHERE id=$1", id)
	return err
}

// ─── Alert events (incidents) ──────────────────────────────────────

type AlertEventRepo struct {
	db *pgxpool.Pool
}

func NewAlertEventRepo(db *pgxpool.Pool) *AlertEventRepo {
	return &AlertEventRepo{db: db}
}

const alertEventCols = "id,rule_id,rule_name,run_id,test_id,message,severity,acknowledged,created_at"

func scanAlertEvent(row interface{ Scan(...interface{}) error }) (*model.AlertEvent, error) {
	var e model.AlertEvent
	err := row.Scan(
		&e.ID, &e.RuleID, &e.RuleName, &e.RunID, &e.TestID,
		&e.Message, &e.Severity, &e.Acknowledged, &e.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// Create inserts an incident. ON CONFLICT DO NOTHING absorbs the
// uq_alert_events_open race (a second open incident for the same rule).
func (r *AlertEventRepo) Create(ctx context.Context, e *model.AlertEvent) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO alert_events (`+alertEventCols+`) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		 ON CONFLICT DO NOTHING`,
		e.ID, e.RuleID, e.RuleName, e.RunID, e.TestID,
		e.Message, e.Severity, e.Acknowledged, e.CreatedAt,
	)
	return err
}

// HasOpenForRule reports whether an unacknowledged incident already exists.
func (r *AlertEventRepo) HasOpenForRule(ctx context.Context, ruleID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM alert_events WHERE rule_id=$1 AND acknowledged=0)", ruleID,
	).Scan(&exists)
	return exists, err
}

type AlertEventListOpts struct {
	Acknowledged *int // nil = all; 0 = open only; 1 = acked only
	Limit        int
}

type AlertEventListResult struct {
	Events []*model.AlertEvent `json:"events"`
	Total  int                 `json:"total"`
}

func (r *AlertEventRepo) List(ctx context.Context, opts AlertEventListOpts) (*AlertEventListResult, error) {
	where := ""
	params := []interface{}{}
	idx := 1
	if opts.Acknowledged != nil {
		where = fmt.Sprintf(" WHERE acknowledged=$%d", idx)
		params = append(params, *opts.Acknowledged)
		idx++
	}

	var total int
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM alert_events"+where, params...).Scan(&total); err != nil {
		return nil, err
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	params = append(params, limit)
	rows, err := r.db.Query(ctx,
		fmt.Sprintf("SELECT %s FROM alert_events%s ORDER BY created_at DESC LIMIT $%d", alertEventCols, where, idx),
		params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]*model.AlertEvent, 0)
	for rows.Next() {
		e, err := scanAlertEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return &AlertEventListResult{Events: events, Total: total}, nil
}

func (r *AlertEventRepo) Acknowledge(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "UPDATE alert_events SET acknowledged=1 WHERE id=$1", id)
	return err
}
