package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/hasimyerli/meergate/internal/model"
)

type ScheduleRepo struct {
	db *pgxpool.Pool
}

func NewScheduleRepo(db *pgxpool.Pool) *ScheduleRepo {
	return &ScheduleRepo{db: db}
}

func scanSchedule(row interface{ Scan(...interface{}) error }) (*model.Schedule, error) {
	var s model.Schedule
	err := row.Scan(
		&s.ID, &s.Name, &s.Cron, &s.Suite, &s.Tags, &s.TestIDs,
		&s.Mode, &s.Enabled, &s.NotifyURL, &s.LastRunAt, &s.NextRunAt,
		&s.CreatedAt, &s.RerunOnFail, &s.MaxReruns, &s.SessionID,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (s *ScheduleRepo) Create(ctx context.Context, schedule *model.Schedule) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO schedules (id,name,cron,suite,tags,test_ids,mode,enabled,notify_url,last_run_at,next_run_at,created_at,rerun_on_fail,max_reruns,session_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		schedule.ID, schedule.Name, schedule.Cron, schedule.Suite, schedule.Tags, schedule.TestIDs,
		schedule.Mode, schedule.Enabled, schedule.NotifyURL, schedule.LastRunAt, schedule.NextRunAt,
		schedule.CreatedAt, schedule.RerunOnFail, schedule.MaxReruns, schedule.SessionID,
	)
	return err
}

type ScheduleUpdates map[string]interface{}

func (s *ScheduleRepo) Update(ctx context.Context, id string, updates ScheduleUpdates) error {
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
	query := fmt.Sprintf("UPDATE schedules SET %s WHERE id=$%d", strings.Join(sets, ", "), idx)
	_, err := s.db.Exec(ctx, query, values...)
	return err
}

func (s *ScheduleRepo) Delete(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, "DELETE FROM schedules WHERE id=$1", id)
	return err
}

func (s *ScheduleRepo) GetByID(ctx context.Context, id string) (*model.Schedule, error) {
	row := s.db.QueryRow(ctx,
		"SELECT id,name,cron,suite,tags,test_ids,mode,enabled,notify_url,last_run_at,next_run_at,created_at,rerun_on_fail,max_reruns,session_id FROM schedules WHERE id=$1",
		id,
	)
	return scanSchedule(row)
}

func (s *ScheduleRepo) List(ctx context.Context) ([]*model.Schedule, error) {
	rows, err := s.db.Query(ctx, "SELECT id,name,cron,suite,tags,test_ids,mode,enabled,notify_url,last_run_at,next_run_at,created_at,rerun_on_fail,max_reruns,session_id FROM schedules ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	schedules := make([]*model.Schedule, 0)
	for rows.Next() {
		sc, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		schedules = append(schedules, sc)
	}
	return schedules, nil
}

func (s *ScheduleRepo) ListEnabled(ctx context.Context) ([]*model.Schedule, error) {
	rows, err := s.db.Query(ctx, "SELECT id,name,cron,suite,tags,test_ids,mode,enabled,notify_url,last_run_at,next_run_at,created_at,rerun_on_fail,max_reruns,session_id FROM schedules WHERE enabled=1 ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	schedules := make([]*model.Schedule, 0)
	for rows.Next() {
		sc, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		schedules = append(schedules, sc)
	}
	return schedules, nil
}
