package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

type RunService struct {
	runRepo      *repository.RunRepo
	stepRepo     *repository.StepRepo
	artifactRepo *repository.ArtifactRepo
	logger       *slog.Logger
}

func NewRunService(runRepo *repository.RunRepo, stepRepo *repository.StepRepo, artifactRepo *repository.ArtifactRepo, logger *slog.Logger) *RunService {
	return &RunService{runRepo: runRepo, stepRepo: stepRepo, artifactRepo: artifactRepo, logger: logger}
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (s *RunService) CreateRun(ctx context.Context, testID, suiteID, mode string, sessionID *string, overrides map[string]string, runCtx *model.RunContext) (*model.Run, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	trigger := "manual"
	var triggeredBy, gitRef, gitCommit, env, jiraRef, label string
	var runTags []string
	if runCtx != nil {
		if runCtx.Trigger != "" {
			trigger = runCtx.Trigger
		}
		triggeredBy = runCtx.TriggeredBy
		gitRef = runCtx.GitRef
		gitCommit = runCtx.GitCommit
		env = runCtx.Environment
		jiraRef = runCtx.JiraRef
		label = runCtx.Label
		runTags = runCtx.RunTags
	}

	run := &model.Run{
		ID:            util.GenerateRunID(),
		TestID:        testID,
		SuiteID:       strPtr(suiteID),
		SessionID:     sessionID,
		Status:        model.RunStatusPending,
		Mode:          mode,
		Overrides:     overrides,
		Label:         strPtr(label),
		Trigger:       trigger,
		TriggeredBy:   strPtr(triggeredBy),
		GitRef:        strPtr(gitRef),
		GitCommit:     strPtr(gitCommit),
		Environment:   strPtr(env),
		JiraRef:       strPtr(jiraRef),
		RunTags:       runTags,
		CorrelationID: util.GenerateCorrelationID(),
		CreatedAt:     now,
	}

	if err := s.runRepo.Create(ctx, run); err != nil {
		return nil, err
	}
	return run, nil
}

func (s *RunService) GetRun(ctx context.Context, id string) (*model.Run, []*model.StepResult, []*model.Artifact, error) {
	run, err := s.runRepo.GetByID(ctx, id)
	if err != nil {
		return nil, nil, nil, err
	}

	steps, err := s.stepRepo.GetForRun(ctx, id)
	if err != nil {
		return run, nil, nil, err
	}

	artifacts, err := s.artifactRepo.GetForRun(ctx, id)
	if err != nil {
		return run, steps, nil, err
	}

	return run, steps, artifacts, nil
}

func (s *RunService) ListRuns(ctx context.Context, opts repository.ListRunsOpts) (*repository.ListRunsResult, error) {
	return s.runRepo.List(ctx, opts)
}

func (s *RunService) DeleteRun(ctx context.Context, id string) error {
	run, err := s.runRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if run.Status == model.RunStatusRunning || run.Status == model.RunStatusPending {
		return ErrRunInProgress
	}
	return s.runRepo.Delete(ctx, id)
}

func (s *RunService) GetExtractContext(ctx context.Context, runID string, fromStep int) (map[string]interface{}, error) {
	return s.artifactRepo.GetExtractContext(ctx, runID, fromStep)
}

var ErrRunInProgress = errors.New("cannot delete a running or pending run")
