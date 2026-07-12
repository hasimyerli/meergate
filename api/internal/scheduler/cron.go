package scheduler

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/robfig/cron/v3"
)

type RunFunc func(ctx context.Context, manifests []*model.TestManifest, schedule *model.Schedule)

type CronManager struct {
	cron         *cron.Cron
	jobs         map[string]cron.EntryID
	mu           sync.Mutex
	scheduleRepo *repository.ScheduleRepo
	runRepo      *repository.RunRepo
	runFunc      RunFunc
	logger       *slog.Logger
}

func NewCronManager(scheduleRepo *repository.ScheduleRepo, runRepo *repository.RunRepo, runFunc RunFunc, logger *slog.Logger) *CronManager {
	return &CronManager{
		cron:         cron.New(cron.WithParser(cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor))),
		jobs:         make(map[string]cron.EntryID),
		scheduleRepo: scheduleRepo,
		runRepo:      runRepo,
		runFunc:      runFunc,
		logger:       logger,
	}
}

func (cm *CronManager) Init(ctx context.Context) error {
	schedules, err := cm.scheduleRepo.ListEnabled(ctx)
	if err != nil {
		return err
	}

	for _, s := range schedules {
		cm.AddJob(s)
	}

	cm.cron.Start()
	cm.logger.Info("scheduler started", "jobs", len(schedules))
	return nil
}

func (cm *CronManager) AddJob(schedule *model.Schedule) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if schedule.Enabled == 0 {
		return
	}

	entryID, err := cm.cron.AddFunc(schedule.Cron, func() {
		cm.executeSchedule(schedule)
	})
	if err != nil {
		cm.logger.Error("failed to add cron job", "schedule", schedule.Name, "error", err)
		return
	}

	cm.jobs[schedule.ID] = entryID
	cm.logger.Info("cron job added", "schedule", schedule.Name, "cron", schedule.Cron)
}

func (cm *CronManager) RemoveJob(id string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if entryID, ok := cm.jobs[id]; ok {
		cm.cron.Remove(entryID)
		delete(cm.jobs, id)
	}
}

func (cm *CronManager) RestartJob(schedule *model.Schedule) {
	cm.RemoveJob(schedule.ID)
	cm.AddJob(schedule)
}

func (cm *CronManager) TriggerNow(schedule *model.Schedule) {
	cm.executeSchedule(schedule)
}

func (cm *CronManager) Stop() {
	cm.cron.Stop()
}

func (cm *CronManager) executeSchedule(schedule *model.Schedule) {
	ctx := context.Background()
	cm.logger.Info("executing schedule", "name", schedule.Name)

	manifests := cm.findManifests(schedule)
	if len(manifests) == 0 {
		cm.logger.Warn("no manifests found for schedule", "name", schedule.Name)
		return
	}

	cm.runFunc(ctx, manifests, schedule)

	now := time.Now().UTC().Format(time.RFC3339)
	_ = cm.scheduleRepo.Update(ctx, schedule.ID, repository.ScheduleUpdates{
		"last_run_at": now,
	})
}

func (cm *CronManager) findManifests(schedule *model.Schedule) []*model.TestManifest {
	all := manifest.All()
	var result []*model.TestManifest

	// Session-based: find test IDs from previous runs in that session
	if schedule.SessionID != nil && *schedule.SessionID != "" {
		runs, err := cm.runRepo.GetForSession(context.Background(), *schedule.SessionID)
		if err != nil {
			cm.logger.Error("failed to get session runs", "session_id", *schedule.SessionID, "error", err)
			return nil
		}
		idSet := make(map[string]struct{})
		for _, r := range runs {
			idSet[r.TestID] = struct{}{}
		}
		for _, m := range all {
			if _, ok := idSet[m.ID]; ok {
				result = append(result, m)
			}
		}
		return result
	}

	// Explicit test IDs
	if schedule.TestIDs != nil && *schedule.TestIDs != "" {
		var ids []string
		if err := json.Unmarshal([]byte(*schedule.TestIDs), &ids); err != nil {
			cm.logger.Error("failed to parse test_ids", "raw", *schedule.TestIDs, "error", err)
			return nil
		}
		idSet := make(map[string]struct{}, len(ids))
		for _, id := range ids {
			idSet[id] = struct{}{}
		}
		for _, m := range all {
			if _, ok := idSet[m.ID]; ok {
				result = append(result, m)
			}
		}
		return result
	}

	// Suite/tag filter
	var tags []string
	if schedule.Tags != nil && *schedule.Tags != "" {
		_ = json.Unmarshal([]byte(*schedule.Tags), &tags)
	}

	for _, m := range all {
		if schedule.Suite != nil && *schedule.Suite != "" && m.Suite != *schedule.Suite {
			continue
		}
		if len(tags) > 0 {
			matched := false
			for _, tag := range tags {
				for _, mt := range m.Tags {
					if mt == tag {
						matched = true
						break
					}
				}
				if matched {
					break
				}
			}
			if !matched {
				continue
			}
		}
		result = append(result, m)
	}
	return result
}
