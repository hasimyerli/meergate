package meergine

import (
	"context"
	"errors"
	"time"

	"github.com/hasimyerli/meergine/adapter"
	"github.com/hasimyerli/meergine/event"
	"github.com/hasimyerli/meergine/model"
)

// errNoCatalog is returned when a step needs gRPC service resolution but the
// runner was built without a CatalogResolver.
var errNoCatalog = errors.New("no catalog resolver configured for service resolution")

// Config holds the minimal runtime knobs the engine needs. The host builds it
// from its own configuration; the engine never reads environment variables or a
// full application config.
type Config struct {
	DefaultStepTimeoutMs int
	DefaultWSTimeoutMs   int
}

// CatalogResolver resolves a gRPC service FQN to a concrete target
// (host:port + transport). The engine depends only on this interface: the app
// implements it over its service-catalog database, while a CLI can implement it
// from a file or from the manifest itself.
type CatalogResolver interface {
	Resolve(ctx context.Context, serviceFQN string) (*adapter.ServiceTarget, error)
}

// OnStepFunc is invoked once, synchronously on the run goroutine, as each step
// COMPLETES. It receives the full StepResult so the caller can persist or stream
// it live. It is optional — nil means the engine simply collects results into
// RunResult. Do slow work (DB, network) asynchronously inside it (e.g. `go ...`)
// so the run is never blocked waiting on the caller.
type OnStepFunc func(model.StepResult)

// RunRequest is the input to a single run.
type RunRequest struct {
	Manifest  *model.TestManifest
	Overrides map[string]string // {{overrides.*}} values, usually run-scoped
	OnStep    OnStepFunc        // optional per-step completion callback
	Emitter   event.Emitter     // optional live event sink; nil -> events discarded

	// Resume support: when Resume is true the engine runs only the main steps
	// from FromStep onward (no setup/teardown), seeded with PreloadedExtract.
	Resume           bool
	FromStep         int
	PreloadedExtract map[string]interface{}
}

// RunResult is the complete, self-contained outcome of a run. The engine never
// persists it — it returns it and the caller decides what to do (write to a DB,
// print JSON, feed a report).
type RunResult struct {
	Status      model.RunStatus
	StartedAt   time.Time
	FinishedAt  time.Time
	DurationMs  int64
	Error       string
	Steps       []model.StepResult
	Extracts    map[string]interface{}
	PassedCount int
	FailedCount int
	TotalCount  int
}
