package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type StepRepo struct {
	db *pgxpool.Pool
}

func NewStepRepo(db *pgxpool.Pool) *StepRepo {
	return &StepRepo{db: db}
}

func (s *StepRepo) Create(ctx context.Context, step *model.StepResult) error {
	var reqJSON, respJSON, assertJSON *string

	if step.RequestSummary != nil {
		b, _ := json.Marshal(step.RequestSummary)
		v := string(b)
		reqJSON = &v
	}
	if step.ResponseSummary != nil {
		b, _ := json.Marshal(step.ResponseSummary)
		v := string(b)
		respJSON = &v
	}
	if step.Assertions != nil {
		b, _ := json.Marshal(step.Assertions)
		v := string(b)
		assertJSON = &v
	}

	_, err := s.db.Exec(ctx,
		`INSERT INTO step_results (id,run_id,step_index,step_name,step_type,status,request_summary,response_summary,assertions,duration_ms,error,retry_count,started_at,created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		step.ID, step.RunID, step.StepIndex, step.StepName, step.StepType, step.Status,
		reqJSON, respJSON, assertJSON, step.DurationMs, step.Error, step.RetryCount, step.StartedAt, step.CreatedAt,
	)
	return err
}

type StepUpdates struct {
	Status          *string
	RequestSummary  interface{}
	ResponseSummary interface{}
	Assertions      []model.AssertionResult
	DurationMs      *int64
	Error           *string
	RetryCount      *int
	StartedAt       *string
}

func (s *StepRepo) Update(ctx context.Context, id string, updates StepUpdates) error {
	sets := []string{}
	values := []interface{}{}
	idx := 1

	if updates.Status != nil {
		sets = append(sets, fmt.Sprintf("status=$%d", idx))
		values = append(values, *updates.Status)
		idx++
	}
	if updates.RequestSummary != nil {
		b, _ := json.Marshal(updates.RequestSummary)
		sets = append(sets, fmt.Sprintf("request_summary=$%d", idx))
		values = append(values, string(b))
		idx++
	}
	if updates.ResponseSummary != nil {
		b, _ := json.Marshal(updates.ResponseSummary)
		sets = append(sets, fmt.Sprintf("response_summary=$%d", idx))
		values = append(values, string(b))
		idx++
	}
	if updates.Assertions != nil {
		b, _ := json.Marshal(updates.Assertions)
		sets = append(sets, fmt.Sprintf("assertions=$%d", idx))
		values = append(values, string(b))
		idx++
	}
	if updates.DurationMs != nil {
		sets = append(sets, fmt.Sprintf("duration_ms=$%d", idx))
		values = append(values, *updates.DurationMs)
		idx++
	}
	if updates.Error != nil {
		sets = append(sets, fmt.Sprintf("error=$%d", idx))
		values = append(values, *updates.Error)
		idx++
	}
	if updates.RetryCount != nil {
		sets = append(sets, fmt.Sprintf("retry_count=$%d", idx))
		values = append(values, *updates.RetryCount)
		idx++
	}
	if updates.StartedAt != nil {
		sets = append(sets, fmt.Sprintf("started_at=$%d", idx))
		values = append(values, *updates.StartedAt)
		idx++
	}

	if len(sets) == 0 {
		return nil
	}

	values = append(values, id)
	query := fmt.Sprintf("UPDATE step_results SET %s WHERE id=$%d", strings.Join(sets, ", "), idx)
	_, err := s.db.Exec(ctx, query, values...)
	return err
}

func (s *StepRepo) GetForRun(ctx context.Context, runID string) ([]*model.StepResult, error) {
	rows, err := s.db.Query(ctx,
		"SELECT id,run_id,step_index,step_name,step_type,status,request_summary,response_summary,assertions,duration_ms,error,retry_count,started_at,created_at FROM step_results WHERE run_id=$1 ORDER BY step_index ASC",
		runID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]*model.StepResult, 0)
	for rows.Next() {
		var sr model.StepResult
		var reqJSON, respJSON, assertJSON *string
		if err := rows.Scan(
			&sr.ID, &sr.RunID, &sr.StepIndex, &sr.StepName, &sr.StepType, &sr.Status,
			&reqJSON, &respJSON, &assertJSON,
			&sr.DurationMs, &sr.Error, &sr.RetryCount, &sr.StartedAt, &sr.CreatedAt,
		); err != nil {
			return nil, err
		}
		if reqJSON != nil {
			_ = json.Unmarshal([]byte(*reqJSON), &sr.RequestSummary)
		}
		if respJSON != nil {
			_ = json.Unmarshal([]byte(*respJSON), &sr.ResponseSummary)
		}
		if assertJSON != nil {
			_ = json.Unmarshal([]byte(*assertJSON), &sr.Assertions)
		}
		results = append(results, &sr)
	}
	return results, nil
}
