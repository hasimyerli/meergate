package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type RunRepo struct {
	db *pgxpool.Pool
}

func NewRunRepo(db *pgxpool.Pool) *RunRepo {
	return &RunRepo{db: db}
}

// ScopeRun is a lightweight run row used for alert evaluation.
type ScopeRun struct {
	Status     string
	DurationMs *int64
}

// ListRecentRunsForScope returns up to `limit` most-recent terminal runs
// (passed|failed|error) matching the given alert scope, newest first.
// scopeType: all|test|suite|environment. For "all", scopeValue is ignored.
func (r *RunRepo) ListRecentRunsForScope(ctx context.Context, scopeType, scopeValue string, limit int) ([]ScopeRun, error) {
	if limit <= 0 {
		limit = 20
	}
	where := "WHERE status IN ('passed','failed','error')"
	params := []interface{}{}
	idx := 1
	switch scopeType {
	case model.AlertScopeTest:
		where += fmt.Sprintf(" AND test_id=$%d", idx)
		params = append(params, scopeValue)
		idx++
	case model.AlertScopeSuite:
		where += fmt.Sprintf(" AND suite_id=$%d", idx)
		params = append(params, scopeValue)
		idx++
	case model.AlertScopeSession:
		where += fmt.Sprintf(" AND session_id=$%d", idx)
		params = append(params, scopeValue)
		idx++
	case model.AlertScopeEnvironment:
		where += fmt.Sprintf(" AND environment=$%d", idx)
		params = append(params, scopeValue)
		idx++
	case model.AlertScopeAll:
		// no extra predicate
	}
	params = append(params, limit)
	rows, err := r.db.Query(ctx,
		fmt.Sprintf("SELECT status, duration_ms FROM runs %s ORDER BY created_at DESC LIMIT $%d", where, idx),
		params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]ScopeRun, 0)
	for rows.Next() {
		var sr ScopeRun
		if err := rows.Scan(&sr.Status, &sr.DurationMs); err != nil {
			return nil, err
		}
		out = append(out, sr)
	}
	return out, nil
}

func scanRun(row interface{ Scan(...interface{}) error }) (*model.Run, error) {
	var r model.Run
	var overridesJSON *string
	var runTagsJSON *string
	var trigger string

	err := row.Scan(
		&r.ID, &r.TestID, &r.SuiteID, &r.SessionID, &r.Status,
		&r.Mode, &overridesJSON, &r.Label, &trigger,
		&r.TriggeredBy, &r.GitRef, &r.GitCommit, &r.Environment, &r.JiraRef,
		&runTagsJSON, &r.StartedAt, &r.FinishedAt, &r.DurationMs,
		&r.Error, &r.CorrelationID, &r.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if trigger != "" {
		r.Trigger = trigger
	} else {
		r.Trigger = "manual"
	}

	if overridesJSON != nil && *overridesJSON != "" {
		if err := json.Unmarshal([]byte(*overridesJSON), &r.Overrides); err != nil {
			r.Overrides = nil
		}
	}

	if runTagsJSON != nil && *runTagsJSON != "" {
		if err := json.Unmarshal([]byte(*runTagsJSON), &r.RunTags); err != nil {
			r.RunTags = nil
		}
	}

	return &r, nil
}

func (r *RunRepo) Create(ctx context.Context, run *model.Run) error {
	var overridesJSON *string
	if run.Overrides != nil {
		b, _ := json.Marshal(run.Overrides)
		s := string(b)
		overridesJSON = &s
	}

	var runTagsJSON *string
	if run.RunTags != nil {
		b, _ := json.Marshal(run.RunTags)
		s := string(b)
		runTagsJSON = &s
	}

	trigger := run.Trigger
	if trigger == "" {
		trigger = "manual"
	}

	_, err := r.db.Exec(ctx,
		`INSERT INTO runs (
			id, test_id, suite_id, session_id, status, mode, overrides,
			label, trigger_type, triggered_by, git_ref, git_commit, environment, jira_ref, run_tags,
			started_at, finished_at, duration_ms, error, correlation_id, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
		run.ID, run.TestID, run.SuiteID, run.SessionID, string(run.Status),
		run.Mode, overridesJSON, run.Label, trigger,
		run.TriggeredBy, run.GitRef, run.GitCommit, run.Environment, run.JiraRef,
		runTagsJSON, run.StartedAt, run.FinishedAt, run.DurationMs,
		run.Error, run.CorrelationID, run.CreatedAt,
	)
	return err
}

type RunUpdates struct {
	Status     *model.RunStatus
	StartedAt  *string
	FinishedAt *string
	DurationMs *int64
	Error      *string
}

func (r *RunRepo) Update(ctx context.Context, id string, updates RunUpdates) error {
	sets := []string{}
	values := []interface{}{}
	idx := 1

	if updates.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		values = append(values, string(*updates.Status))
		idx++
	}
	if updates.StartedAt != nil {
		sets = append(sets, fmt.Sprintf("started_at = $%d", idx))
		values = append(values, *updates.StartedAt)
		idx++
	}
	if updates.FinishedAt != nil {
		sets = append(sets, fmt.Sprintf("finished_at = $%d", idx))
		values = append(values, *updates.FinishedAt)
		idx++
	}
	if updates.DurationMs != nil {
		sets = append(sets, fmt.Sprintf("duration_ms = $%d", idx))
		values = append(values, *updates.DurationMs)
		idx++
	}
	if updates.Error != nil {
		sets = append(sets, fmt.Sprintf("error = $%d", idx))
		values = append(values, *updates.Error)
		idx++
	}

	if len(sets) == 0 {
		return nil
	}

	values = append(values, id)
	query := fmt.Sprintf("UPDATE runs SET %s WHERE id = $%d", strings.Join(sets, ", "), idx)
	_, err := r.db.Exec(ctx, query, values...)
	return err
}

func (r *RunRepo) Delete(ctx context.Context, id string) error {
	if _, err := r.db.Exec(ctx, "DELETE FROM step_results WHERE run_id = $1", id); err != nil {
		return err
	}
	if _, err := r.db.Exec(ctx, "DELETE FROM artifacts WHERE run_id = $1", id); err != nil {
		return err
	}
	_, err := r.db.Exec(ctx, "DELETE FROM runs WHERE id = $1", id)
	return err
}

func (r *RunRepo) GetByID(ctx context.Context, id string) (*model.Run, error) {
	row := r.db.QueryRow(ctx, "SELECT id,test_id,suite_id,session_id,status,mode,overrides,label,trigger_type,triggered_by,git_ref,git_commit,environment,jira_ref,run_tags,started_at,finished_at,duration_ms,error,correlation_id,created_at FROM runs WHERE id=$1", id)
	run, err := scanRun(row)
	if err != nil {
		return nil, err
	}
	return run, nil
}

type ListRunsOpts struct {
	Status      *string
	TestID      *string
	SessionID   *string
	Environment *string
	Trigger     *string
	From        *string
	To          *string
	Limit       int
	Offset      int
}

type ListRunsResult struct {
	Runs  []*model.Run
	Total int
}

func (r *RunRepo) List(ctx context.Context, opts ListRunsOpts) (*ListRunsResult, error) {
	conditions := []string{}
	params := []interface{}{}
	idx := 1

	if opts.Status != nil {
		conditions = append(conditions, fmt.Sprintf("status=$%d", idx))
		params = append(params, *opts.Status)
		idx++
	}
	if opts.TestID != nil {
		conditions = append(conditions, fmt.Sprintf("test_id=$%d", idx))
		params = append(params, *opts.TestID)
		idx++
	}
	if opts.SessionID != nil {
		conditions = append(conditions, fmt.Sprintf("session_id=$%d", idx))
		params = append(params, *opts.SessionID)
		idx++
	}
	if opts.Environment != nil {
		conditions = append(conditions, fmt.Sprintf("environment=$%d", idx))
		params = append(params, *opts.Environment)
		idx++
	}
	if opts.Trigger != nil {
		conditions = append(conditions, fmt.Sprintf("trigger_type=$%d", idx))
		params = append(params, *opts.Trigger)
		idx++
	}
	if opts.From != nil {
		conditions = append(conditions, fmt.Sprintf("created_at >= $%d", idx))
		params = append(params, *opts.From)
		idx++
	}
	if opts.To != nil {
		conditions = append(conditions, fmt.Sprintf("created_at <= $%d", idx))
		params = append(params, *opts.To)
		idx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	if err := r.db.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM runs %s", where), params...).Scan(&total); err != nil {
		return nil, err
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := opts.Offset

	queryParams := append(params, limit, offset)
	rows, err := r.db.Query(ctx,
		fmt.Sprintf("SELECT id,test_id,suite_id,session_id,status,mode,overrides,label,trigger_type,triggered_by,git_ref,git_commit,environment,jira_ref,run_tags,started_at,finished_at,duration_ms,error,correlation_id,created_at FROM runs %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d", where, idx, idx+1),
		queryParams...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := make([]*model.Run, 0)
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}

	return &ListRunsResult{Runs: runs, Total: total}, nil
}

func (r *RunRepo) GetLastForTest(ctx context.Context, testID string) (*model.Run, error) {
	row := r.db.QueryRow(ctx, "SELECT id,test_id,suite_id,session_id,status,mode,overrides,label,trigger_type,triggered_by,git_ref,git_commit,environment,jira_ref,run_tags,started_at,finished_at,duration_ms,error,correlation_id,created_at FROM runs WHERE test_id=$1 ORDER BY created_at DESC LIMIT 1", testID)
	run, err := scanRun(row)
	if err != nil {
		return nil, err
	}
	return run, nil
}

func (r *RunRepo) GetStats(ctx context.Context, testID string, lastN int) (*model.TestStats, error) {
	if lastN <= 0 {
		lastN = 10
	}

	var totalRuns int
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM runs WHERE test_id=$1", testID).Scan(&totalRuns); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx, "SELECT status, duration_ms FROM runs WHERE test_id=$1 ORDER BY created_at DESC LIMIT $2", testID, lastN)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rowData struct {
		status     string
		durationMs *int64
	}
	var lastRuns []rowData
	for rows.Next() {
		var rd rowData
		if err := rows.Scan(&rd.status, &rd.durationMs); err != nil {
			return nil, err
		}
		lastRuns = append(lastRuns, rd)
	}

	var passed, failed, errCount int
	var totalDuration int64
	var durationCount int
	transitions := 0

	for i, run := range lastRuns {
		switch run.status {
		case "passed":
			passed++
		case "failed":
			failed++
		case "error":
			errCount++
		}
		if run.durationMs != nil {
			totalDuration += *run.durationMs
			durationCount++
		}
		if i > 0 && lastRuns[i-1].status != run.status {
			transitions++
		}
	}

	total := len(lastRuns)
	passRate := 0
	if total > 0 {
		passRate = int(float64(passed) / float64(total) * 100)
	}
	flakeScore := 0
	if total > 1 {
		flakeScore = int(float64(transitions) / float64(total-1) * 100)
	}
	avgDurationMs := 0
	if durationCount > 0 {
		avgDurationMs = int(totalDuration / int64(durationCount))
	}

	statuses := make([]string, len(lastRuns))
	for i, r := range lastRuns {
		statuses[i] = r.status
	}

	return &model.TestStats{
		TotalRuns:      totalRuns,
		Passed:         passed,
		Failed:         failed,
		Error:          errCount,
		PassRate:       passRate,
		FlakeScore:     flakeScore,
		AvgDurationMs:  avgDurationMs,
		Last10Statuses: statuses,
	}, nil
}

func (r *RunRepo) GetAllStats(ctx context.Context, lastN int) (map[string]*model.TestStats, error) {
	rows, err := r.db.Query(ctx, "SELECT DISTINCT test_id FROM runs")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var testIDs []string
	for rows.Next() {
		var tid string
		if err := rows.Scan(&tid); err != nil {
			return nil, err
		}
		testIDs = append(testIDs, tid)
	}

	result := make(map[string]*model.TestStats)
	for _, tid := range testIDs {
		stats, err := r.GetStats(ctx, tid, lastN)
		if err != nil {
			return nil, err
		}
		result[tid] = stats
	}
	return result, nil
}

func (r *RunRepo) GetForSession(ctx context.Context, sessionID string) ([]*model.Run, error) {
	rows, err := r.db.Query(ctx, "SELECT id,test_id,suite_id,session_id,status,mode,overrides,label,trigger_type,triggered_by,git_ref,git_commit,environment,jira_ref,run_tags,started_at,finished_at,duration_ms,error,correlation_id,created_at FROM runs WHERE session_id=$1 ORDER BY created_at DESC", sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := make([]*model.Run, 0)
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, nil
}
