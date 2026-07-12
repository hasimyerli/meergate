// Package engine is the application-side bridge to the standalone test engine
// in pkg/engine. The pure engine takes a manifest and returns a RunResult
// without ever touching a database; this bridge wires it to the app's
// repositories (run/step/artifact persistence), the WebSocket event Hub (live
// cinema view) and alert evaluation — keeping every DB concern out of pkg/engine
// so the engine can later be extracted as its own package.
package engine

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/hasimyerli/meergate/internal/config"
	"github.com/hasimyerli/meergate/internal/event"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
	pkgengine "github.com/hasimyerli/meergine"
	"github.com/hasimyerli/meergine/adapter"
)

// AlertEvaluator evaluates alert rules against a completed run. Defined here
// (consumer-side) so the engine has no dependency on the service layer.
type AlertEvaluator interface {
	EvaluateRun(ctx context.Context, run *model.Run)
}

// Runner adapts pkg/engine to the application: it persists results, streams
// events and evaluates alerts. Its public surface is unchanged from the old
// in-app engine so callers (main, release gate, scheduler) need no changes.
type Runner struct {
	eng          *pkgengine.Runner
	runRepo      *repository.RunRepo
	stepRepo     *repository.StepRepo
	artifactRepo *repository.ArtifactRepo
	hub          *event.Hub
	logger       *slog.Logger
	alertEval    AlertEvaluator
}

// SetAlertEvaluator wires optional alert evaluation invoked on run completion.
func (r *Runner) SetAlertEvaluator(e AlertEvaluator) { r.alertEval = e }

// NewRunner builds the bridge and the underlying pure engine.
func NewRunner(cfg *config.Config, runRepo *repository.RunRepo, stepRepo *repository.StepRepo, artifactRepo *repository.ArtifactRepo, catalogRepo *repository.CatalogRepo, hub *event.Hub, logger *slog.Logger) *Runner {
	eng := pkgengine.NewRunner(
		pkgengine.Config{
			DefaultStepTimeoutMs: cfg.DefaultStepTimeout,
			DefaultWSTimeoutMs:   cfg.DefaultWSTimeout,
		},
		&catalogResolver{repo: catalogRepo},
		logger,
	)
	return &Runner{
		eng:          eng,
		runRepo:      runRepo,
		stepRepo:     stepRepo,
		artifactRepo: artifactRepo,
		hub:          hub,
		logger:       logger,
	}
}

// RunTest runs the whole manifest for a run and persists the outcome.
func (r *Runner) RunTest(ctx context.Context, manifest *model.TestManifest, run *model.Run) {
	r.logger.Info("starting test run", "run_id", run.ID, "test_id", manifest.ID)
	r.execute(ctx, run, pkgengine.RunRequest{
		Manifest:  manifest,
		Overrides: run.Overrides,
		Emitter:   r.newEmitter(run.ID),
		OnStep:    r.stepPersister(run.ID),
	})
	r.logger.Info("test run completed", "run_id", run.ID)
}

// ResumeTest re-runs the main steps from fromStep onward, seeded with the
// already-extracted values, and persists the outcome.
func (r *Runner) ResumeTest(ctx context.Context, manifest *model.TestManifest, run *model.Run, fromStep int, preloadedExtract map[string]interface{}) {
	r.logger.Info("resuming test run", "run_id", run.ID, "from_step", fromStep)
	r.execute(ctx, run, pkgengine.RunRequest{
		Manifest:         manifest,
		Overrides:        run.Overrides,
		Emitter:          r.newEmitter(run.ID),
		OnStep:           r.stepPersister(run.ID),
		Resume:           true,
		FromStep:         fromStep,
		PreloadedExtract: preloadedExtract,
	})
}

// execute marks the run running, delegates to the pure engine and persists the
// final run row plus alert evaluation.
func (r *Runner) execute(ctx context.Context, run *model.Run, req pkgengine.RunRequest) {
	now := time.Now().UTC().Format(time.RFC3339)
	running := model.RunStatusRunning
	_ = r.runRepo.Update(ctx, run.ID, repository.RunUpdates{Status: &running, StartedAt: &now})

	res := r.eng.Run(ctx, req)

	finished := res.FinishedAt.Format(time.RFC3339)
	duration := res.DurationMs
	status := res.Status
	var errPtr *string
	if res.Error != "" {
		errPtr = &res.Error
	}
	_ = r.runRepo.Update(ctx, run.ID, repository.RunUpdates{
		Status:     &status,
		FinishedAt: &finished,
		DurationMs: &duration,
		Error:      errPtr,
	})

	if r.alertEval != nil {
		run.Status = status
		run.FinishedAt = &finished
		run.DurationMs = &duration
		r.alertEval.EvaluateRun(ctx, run)
	}
}

// stepPersister returns an OnStep callback that writes each completed step (and
// its extracts/screenshots) to the database.
func (r *Runner) stepPersister(runID string) pkgengine.OnStepFunc {
	return func(sr model.StepResult) {
		sr.RunID = runID
		if err := r.stepRepo.Create(context.Background(), &sr); err != nil {
			r.logger.Error("persist step failed", "run_id", runID, "step", sr.StepName, "error", err)
			return
		}
		for _, x := range sr.Extracts {
			_ = r.artifactRepo.Create(context.Background(), &model.Artifact{
				ID:           util.GenerateArtifactID(),
				RunID:        runID,
				StepResultID: sr.ID,
				Type:         x.Type,
				Key:          x.Key,
				Value:        x.Value,
				CreatedAt:    time.Now().UTC().Format(time.RFC3339),
			})
		}
	}
}

func (r *Runner) newEmitter(runID string) event.Emitter {
	if r.hub != nil {
		return event.NewRunEmitter(runID, r.hub)
	}
	return event.NoOpEmitter{}
}

// catalogResolver resolves a gRPC service FQN to its target from the service
// catalog, implementing pkg/engine.CatalogResolver.
type catalogResolver struct {
	repo *repository.CatalogRepo
}

func (c *catalogResolver) Resolve(ctx context.Context, serviceFQN string) (*adapter.ServiceTarget, error) {
	entry, err := c.repo.Get(ctx, serviceFQN)
	if err != nil {
		return nil, err
	}
	tls := true
	var cfg struct {
		TLS bool `json:"tls"`
	}
	if json.Unmarshal(entry.Config, &cfg) == nil {
		tls = cfg.TLS
	}
	return &adapter.ServiceTarget{Target: entry.Target, TLS: tls}, nil
}
