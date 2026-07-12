package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

type ScheduleService struct {
	scheduleRepo *repository.ScheduleRepo
	logger       *slog.Logger
}

func NewScheduleService(scheduleRepo *repository.ScheduleRepo, logger *slog.Logger) *ScheduleService {
	return &ScheduleService{scheduleRepo: scheduleRepo, logger: logger}
}

func (s *ScheduleService) Create(ctx context.Context, schedule *model.Schedule) error {
	schedule.ID = util.GenerateScheduleID()
	schedule.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.scheduleRepo.Create(ctx, schedule)
}

func (s *ScheduleService) Get(ctx context.Context, id string) (*model.Schedule, error) {
	return s.scheduleRepo.GetByID(ctx, id)
}

func (s *ScheduleService) List(ctx context.Context) ([]*model.Schedule, error) {
	return s.scheduleRepo.List(ctx)
}

func (s *ScheduleService) Update(ctx context.Context, id string, updates repository.ScheduleUpdates) error {
	return s.scheduleRepo.Update(ctx, id, updates)
}

func (s *ScheduleService) Delete(ctx context.Context, id string) error {
	return s.scheduleRepo.Delete(ctx, id)
}

func (s *ScheduleService) ListEnabled(ctx context.Context) ([]*model.Schedule, error) {
	return s.scheduleRepo.ListEnabled(ctx)
}
