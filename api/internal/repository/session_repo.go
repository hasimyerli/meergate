package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type SessionRepo struct {
	db *pgxpool.Pool
}

func NewSessionRepo(db *pgxpool.Pool) *SessionRepo {
	return &SessionRepo{db: db}
}

func scanSession(row interface{ Scan(...interface{}) error }) (*model.RunSession, error) {
	var s model.RunSession
	if err := row.Scan(&s.ID, &s.Label, &s.Environment, &s.GitRef, &s.GitCommit, &s.JiraRef, &s.CreatedBy, &s.RunTags, &s.CreatedAt); err != nil {
		return nil, err
	}
	return &s, nil
}

func (s *SessionRepo) Create(ctx context.Context, session *model.RunSession) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO run_sessions (id,label,environment,git_ref,git_commit,jira_ref,created_by,run_tags,created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		session.ID, session.Label, session.Environment, session.GitRef, session.GitCommit,
		session.JiraRef, session.CreatedBy, session.RunTags, session.CreatedAt,
	)
	return err
}

type SessionUpdates map[string]interface{}

func (s *SessionRepo) Update(ctx context.Context, id string, updates SessionUpdates) error {
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
	query := fmt.Sprintf("UPDATE run_sessions SET %s WHERE id=$%d", strings.Join(sets, ", "), idx)
	_, err := s.db.Exec(ctx, query, values...)
	return err
}

func (s *SessionRepo) Delete(ctx context.Context, id string) error {
	if _, err := s.db.Exec(ctx, "UPDATE runs SET session_id=NULL WHERE session_id=$1", id); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, "DELETE FROM run_sessions WHERE id=$1", id)
	return err
}

func (s *SessionRepo) GetByID(ctx context.Context, id string) (*model.RunSession, error) {
	row := s.db.QueryRow(ctx, "SELECT id,label,environment,git_ref,git_commit,jira_ref,created_by,run_tags,created_at FROM run_sessions WHERE id=$1", id)
	return scanSession(row)
}

type ListSessionsResult struct {
	Sessions []*model.RunSession
	Total    int
}

func (s *SessionRepo) List(ctx context.Context, limit, offset int) (*ListSessionsResult, error) {
	var total int
	if err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM run_sessions").Scan(&total); err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(ctx, "SELECT id,label,environment,git_ref,git_commit,jira_ref,created_by,run_tags,created_at FROM run_sessions ORDER BY created_at DESC LIMIT $1 OFFSET $2", limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]*model.RunSession, 0)
	for rows.Next() {
		sess, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, sess)
	}
	return &ListSessionsResult{Sessions: sessions, Total: total}, nil
}

func (s *SessionRepo) ComputeSummary(ctx context.Context, sessionID string) (*model.RunSessionSummary, error) {
	rows, err := s.db.Query(ctx, "SELECT status,duration_ms FROM runs WHERE session_id=$1", sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summary := &model.RunSessionSummary{}
	for rows.Next() {
		var status string
		var durationMs *int64
		if err := rows.Scan(&status, &durationMs); err != nil {
			return nil, err
		}
		summary.Total++
		switch status {
		case "passed":
			summary.Passed++
		case "failed":
			summary.Failed++
		case "error":
			summary.Error++
		case "running":
			summary.Running++
		case "pending":
			summary.Pending++
		}
		if durationMs != nil {
			summary.DurationMs += *durationMs
		}
	}
	return summary, nil
}
