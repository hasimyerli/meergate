package meergine

import (
	"context"
	"log/slog"
	"time"

	"github.com/hasimyerli/meergine/adapter"
	"github.com/hasimyerli/meergine/event"
	"github.com/hasimyerli/meergine/model"
	"github.com/hasimyerli/meergine/util"
)

// Runner orchestrates a single test run: setup → main (sequential or DAG) →
// teardown. It resolves service targets through a CatalogResolver, streams live
// events through the request's Emitter, and returns a self-contained RunResult.
// It never touches a database.
type Runner struct {
	cfg     Config
	catalog CatalogResolver
	logger  *slog.Logger
}

// NewRunner builds a runner. catalog may be nil if no gRPC service resolution is
// needed (steps that reference the catalog will then fail to resolve).
func NewRunner(cfg Config, catalog CatalogResolver, logger *slog.Logger) *Runner {
	return &Runner{cfg: cfg, catalog: catalog, logger: logger}
}

// Run executes the request and returns the complete result. Any per-step
// callback (req.OnStep) fires as each step completes; the returned RunResult
// additionally carries every step, so callers can persist live, in bulk, or
// both.
func (r *Runner) Run(ctx context.Context, req RunRequest) *RunResult {
	manifest := req.Manifest
	emitter := req.Emitter
	if emitter == nil {
		emitter = event.NoOpEmitter{}
	}

	started := time.Now().UTC()
	res := &RunResult{
		Status:    model.RunStatusPassed,
		StartedAt: started,
		Extracts:  map[string]interface{}{},
	}

	interpCtx := &util.InterpolateContext{
		Params:    manifest.Params,
		Extract:   req.PreloadedExtract,
		Overrides: req.Overrides,
	}
	if interpCtx.Extract == nil {
		interpCtx.Extract = map[string]interface{}{}
	}

	adp := adapter.NewNetworkAdapter(adapter.WithServiceResolver(r.serviceResolver(ctx)))
	executor := NewExecutor(r.cfg, adp, emitter, r.logger)
	defer executor.CloseBrowser()

	if req.Resume {
		res.TotalCount = len(manifest.Steps) - req.FromStep
		emitter.Emit(event.EventRunStarted, event.RunStartedPayload{
			TestID:     manifest.ID,
			TestName:   manifest.Name,
			TotalSteps: res.TotalCount,
		})
		r.runMainFrom(ctx, executor, manifest.Steps, req.FromStep, interpCtx, req, res)
	} else {
		res.TotalCount = len(manifest.Setup) + len(manifest.Steps) + len(manifest.Teardown)

		var dagBatches [][]int
		if hasDependencies(manifest.Steps) {
			dagBatches = BuildDAG(manifest.Steps).TopologicalBatches()
		}
		emitter.Emit(event.EventRunStarted, event.RunStartedPayload{
			TestID:     manifest.ID,
			TestName:   manifest.Name,
			TotalSteps: res.TotalCount,
			DAGBatches: dagBatches,
		})

		r.runAll(ctx, executor, manifest, interpCtx, req, res)
	}

	r.finalize(res, emitter, started)
	return res
}

// runAll runs setup → main → teardown with the standard short-circuit rules.
func (r *Runner) runAll(ctx context.Context, ex *Executor, manifest *model.TestManifest, interpCtx *util.InterpolateContext, req RunRequest, res *RunResult) {
	// Setup — a failure aborts the main phase but teardown still runs.
	for i := range manifest.Setup {
		sr := r.runStep(ctx, ex, &manifest.Setup[i], i, interpCtx, "setup", req, res)
		if isFailure(sr.Status) {
			res.Status = model.RunStatusFailed
			res.Error = "setup step failed: " + manifest.Setup[i].Name
			r.runTeardown(ctx, ex, manifest, interpCtx, req, res)
			return
		}
	}

	// Main — DAG-ordered when any step declares dependencies, else sequential.
	if hasDependencies(manifest.Steps) {
		r.runDAG(ctx, ex, manifest.Steps, interpCtx, req, res)
	} else {
		for i := range manifest.Steps {
			sr := r.runStep(ctx, ex, &manifest.Steps[i], i, interpCtx, "main", req, res)
			if isFailure(sr.Status) {
				res.Status = model.RunStatusFailed
				if sr.Error != nil {
					res.Error = *sr.Error
				}
			}
		}
	}

	r.runTeardown(ctx, ex, manifest, interpCtx, req, res)
}

func (r *Runner) runTeardown(ctx context.Context, ex *Executor, manifest *model.TestManifest, interpCtx *util.InterpolateContext, req RunRequest, res *RunResult) {
	for i := range manifest.Teardown {
		r.runStep(ctx, ex, &manifest.Teardown[i], i, interpCtx, "teardown", req, res)
	}
}

// runMainFrom runs main steps from index `from` onward (resume path).
func (r *Runner) runMainFrom(ctx context.Context, ex *Executor, steps []model.TestStep, from int, interpCtx *util.InterpolateContext, req RunRequest, res *RunResult) {
	for i := from; i < len(steps); i++ {
		sr := r.runStep(ctx, ex, &steps[i], i, interpCtx, "main", req, res)
		if isFailure(sr.Status) {
			res.Status = model.RunStatusFailed
			if sr.Error != nil {
				res.Error = *sr.Error
			}
		}
	}
}

// runDAG runs main steps in topological batches, skipping any step whose
// dependency already failed.
func (r *Runner) runDAG(ctx context.Context, ex *Executor, steps []model.TestStep, interpCtx *util.InterpolateContext, req RunRequest, res *RunResult) {
	batches := BuildDAG(steps).TopologicalBatches()
	failedSteps := map[string]bool{}

	for _, batch := range batches {
		for _, idx := range batch {
			step := &steps[idx]
			if shouldSkip(step.DependsOn, failedSteps) {
				continue
			}
			sr := r.runStep(ctx, ex, step, idx, interpCtx, "main", req, res)
			if isFailure(sr.Status) {
				res.Status = model.RunStatusFailed
				failedSteps[step.Name] = true
				if sr.Error != nil {
					res.Error = *sr.Error
				}
			}
		}
	}
}

// runStep executes one step, records it on the result, aggregates its extracts
// and fires the caller's per-step callback.
func (r *Runner) runStep(ctx context.Context, ex *Executor, step *model.TestStep, idx int, interpCtx *util.InterpolateContext, phase string, req RunRequest, res *RunResult) *model.StepResult {
	sr := ex.ExecuteStep(ctx, step, idx, interpCtx, phase)
	res.Steps = append(res.Steps, *sr)
	for _, x := range sr.Extracts {
		if x.Type == "extract" {
			res.Extracts[x.Key] = x.Value
		}
	}
	if req.OnStep != nil {
		req.OnStep(*sr)
	}
	return sr
}

// finalize stamps timing/counts and emits the run_completed event.
func (r *Runner) finalize(res *RunResult, emitter event.Emitter, started time.Time) {
	res.FinishedAt = time.Now().UTC()
	res.DurationMs = res.FinishedAt.Sub(started).Milliseconds()

	for _, s := range res.Steps {
		switch s.Status {
		case "passed":
			res.PassedCount++
		case "failed", "error":
			res.FailedCount++
		}
	}

	emitter.Emit(event.EventRunCompleted, event.RunCompletedPayload{
		Status:      string(res.Status),
		DurationMs:  res.DurationMs,
		Error:       res.Error,
		PassedCount: res.PassedCount,
		FailedCount: res.FailedCount,
		TotalCount:  res.TotalCount,
	})
}

// serviceResolver bridges the adapter's resolver signature to the injected
// CatalogResolver, carrying the run context.
func (r *Runner) serviceResolver(ctx context.Context) adapter.ServiceResolver {
	return func(serviceFQN string) (*adapter.ServiceTarget, error) {
		if r.catalog == nil {
			return nil, errNoCatalog
		}
		return r.catalog.Resolve(ctx, serviceFQN)
	}
}

func isFailure(status string) bool { return status == "failed" || status == "error" }

func hasDependencies(steps []model.TestStep) bool {
	for _, s := range steps {
		if len(s.DependsOn) > 0 {
			return true
		}
	}
	return false
}

func shouldSkip(dependsOn []string, failed map[string]bool) bool {
	for _, dep := range dependsOn {
		if failed[dep] {
			return true
		}
	}
	return false
}
