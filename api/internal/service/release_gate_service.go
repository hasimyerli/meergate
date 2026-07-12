package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

// runTestFn runs a single test synchronously (blocks until the run reaches a
// terminal status and is persisted). Injected to avoid an engine import cycle.
type runTestFn func(context.Context, *model.TestManifest, *model.Run)

// ReleaseGateService owns service-based release gates: creating release
// candidates, evaluating them by running the service's protection tests, and
// comparing results against the last good baseline to surface regressions.
type ReleaseGateService struct {
	repo       *repository.ReleaseGateRepo
	runRepo    *repository.RunRepo
	runService *RunService
	catalog    *CatalogService
	runTest    runTestFn
	logger     *slog.Logger
}

func NewReleaseGateService(repo *repository.ReleaseGateRepo, runRepo *repository.RunRepo, runService *RunService, catalog *CatalogService, runTest runTestFn, logger *slog.Logger) *ReleaseGateService {
	return &ReleaseGateService{repo: repo, runRepo: runRepo, runService: runService, catalog: catalog, runTest: runTest, logger: logger}
}

func nowRFC() string { return time.Now().UTC().Format(time.RFC3339) }

// gateTestIDs returns the set of tests protecting a service (union of test ids
// covering any of its operations), derived from the coverage map.
func (s *ReleaseGateService) gateTestIDs(ctx context.Context, serviceID string) []string {
	rep, err := s.catalog.Coverage(ctx)
	if err != nil || rep == nil {
		return nil
	}
	seen := map[string]bool{}
	var ids []string
	for _, sc := range rep.Services {
		if sc.ID != serviceID {
			continue
		}
		for _, op := range sc.Operations {
			for _, tid := range op.TestIDs {
				if !seen[tid] {
					seen[tid] = true
					ids = append(ids, tid)
				}
			}
		}
	}
	return ids
}

// CandidateInput carries the metadata collected in the New Release flow.
type CandidateInput struct {
	Label         string
	TargetVersion string
	Environment   string
	GitRef        string
	GitCommit     string
	PRRef         string
	IssueRef      string
	ChangeSummary string
}

func (s *ReleaseGateService) CreateCandidate(ctx context.Context, serviceID string, in CandidateInput) (*model.ReleaseCandidate, error) {
	scope := s.gateTestIDs(ctx, serviceID)
	now := nowRFC()
	c := &model.ReleaseCandidate{
		ID:            util.GenerateID("cand"),
		ServiceID:     serviceID,
		Label:         in.Label,
		TargetVersion: in.TargetVersion,
		Environment:   in.Environment,
		GitRef:        in.GitRef,
		GitCommit:     in.GitCommit,
		PRRef:         in.PRRef,
		IssueRef:      in.IssueRef,
		ChangeSummary: in.ChangeSummary,
		Status:        "draft",
		Scope:         scope,
		Results:       []model.TestResult{},
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := s.repo.CreateCandidate(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// EvaluateCandidate runs the candidate's gate tests synchronously, snapshots
// their results, and derives the candidate status from regressions vs baseline.
func (s *ReleaseGateService) EvaluateCandidate(ctx context.Context, candidateID string) (*model.ReleaseCandidate, error) {
	c, err := s.repo.GetCandidate(ctx, candidateID)
	if err != nil {
		return nil, err
	}
	c.Status = "evaluating"
	c.UpdatedAt = nowRFC()
	_ = s.repo.UpdateCandidate(ctx, c)

	results := make([]model.TestResult, 0, len(c.Scope))
	for _, tid := range c.Scope {
		m, ok := manifest.Get(tid)
		if !ok {
			continue
		}
		run, err := s.runService.CreateRun(ctx, m.ID, m.Suite, "real", nil, nil, &model.RunContext{
			Trigger:     "manual",
			Environment: c.Environment,
		})
		if err != nil {
			s.logger.Error("gate: create run failed", "test_id", tid, "error", err)
			continue
		}
		s.runTest(ctx, m, run) // synchronous — blocks until terminal
		status := string(model.RunStatusError)
		if updated, err := s.runRepo.GetByID(ctx, run.ID); err == nil && updated != nil {
			status = string(updated.Status)
		}
		results = append(results, model.TestResult{TestID: tid, RunID: run.ID, Status: status})
	}

	c.Results = results
	base, _ := s.repo.LatestBaselineForService(ctx, c.ServiceID)
	var counts model.RegressionCounts
	if base != nil {
		_, counts = diffResults(base.Results, results)
	}
	if counts.NewRegressions > 0 {
		c.Status = "blocked"
	} else {
		c.Status = "ready"
	}
	c.UpdatedAt = nowRFC()
	if err := s.repo.UpdateCandidate(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// MarkBaseline stores a candidate's results as the service's new good baseline.
func (s *ReleaseGateService) MarkBaseline(ctx context.Context, serviceID, candidateID string) (*model.ServiceBaseline, error) {
	var c *model.ReleaseCandidate
	var err error
	if candidateID != "" {
		c, err = s.repo.GetCandidate(ctx, candidateID)
	} else {
		c, err = s.repo.LatestCandidateForService(ctx, serviceID)
	}
	if err != nil {
		return nil, err
	}
	if c == nil || len(c.Results) == 0 {
		return nil, fmt.Errorf("no evaluated candidate to mark as baseline")
	}
	label := c.TargetVersion
	if label == "" {
		label = c.Label
	}
	b := &model.ServiceBaseline{
		ID:          util.GenerateID("base"),
		ServiceID:   serviceID,
		CandidateID: c.ID,
		Label:       label,
		Results:     c.Results,
		CreatedAt:   nowRFC(),
	}
	if err := s.repo.CreateBaseline(ctx, b); err != nil {
		return nil, err
	}
	return b, nil
}

// Summary derives the release-gate state for one service.
func (s *ReleaseGateService) Summary(ctx context.Context, serviceID string) (*model.GateSummary, error) {
	ids := s.gateTestIDs(ctx, serviceID)
	cand, _ := s.repo.LatestCandidateForService(ctx, serviceID)
	base, _ := s.repo.LatestBaselineForService(ctx, serviceID)

	sum := &model.GateSummary{ServiceID: serviceID, GateTestCount: len(ids), Candidate: cand, Baseline: base}
	if cand != nil && cand.UpdatedAt != "" && len(cand.Results) > 0 {
		e := cand.UpdatedAt
		sum.LastEvaluatedAt = &e
	}
	evaluated := cand != nil && len(cand.Results) > 0
	if evaluated {
		var baseResults []model.TestResult
		if base != nil {
			baseResults = base.Results
		}
		sum.Diffs, sum.Counts = diffResults(baseResults, cand.Results)
	}

	switch {
	case len(ids) == 0:
		sum.Status = "not_configured"
	case cand != nil && cand.Status == "evaluating":
		sum.Status = "evaluating"
	case evaluated && base != nil && sum.Counts.NewRegressions > 0:
		sum.Status = "blocked"
	case evaluated && base != nil:
		sum.Status = "ready"
	case base == nil:
		sum.Status = "no_baseline"
	default:
		sum.Status = "ready"
	}
	return sum, nil
}

// ListSummaries returns gate summaries for every service that has a candidate
// or baseline. The landing page overlays these on the full catalog.
func (s *ReleaseGateService) ListSummaries(ctx context.Context) (map[string]*model.GateSummary, error) {
	ids, err := s.repo.ServiceIDsWithGates(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]*model.GateSummary, len(ids))
	for _, id := range ids {
		if sum, err := s.Summary(ctx, id); err == nil {
			out[id] = sum
		}
	}
	return out, nil
}

func isFail(status string) bool {
	return status == string(model.RunStatusFailed) || status == string(model.RunStatusError)
}

// diffResults compares candidate results against a baseline, classifying each
// test and counting regressions. Only tests present in the candidate scope are
// diffed. A nil baseline yields no regressions (nothing to compare against).
func diffResults(baseline, candidate []model.TestResult) ([]model.TestDiff, model.RegressionCounts) {
	bmap := make(map[string]string, len(baseline))
	for _, r := range baseline {
		bmap[r.TestID] = r.Status
	}
	var diffs []model.TestDiff
	var counts model.RegressionCounts
	for _, r := range candidate {
		b, hasB := bmap[r.TestID]
		var t model.RegressionType
		switch {
		case !hasB && isFail(r.Status):
			t = model.RegressionNewFailure
			counts.NewTestFailures++
		case !hasB:
			t = model.RegressionNewPassing
		case isFail(r.Status) && !isFail(b):
			t = model.RegressionNew
			counts.NewRegressions++
		case isFail(r.Status) && isFail(b):
			t = model.RegressionKnown
			counts.KnownFailures++
		case !isFail(r.Status) && isFail(b):
			t = model.RegressionFixed
			counts.Fixed++
		default:
			t = model.RegressionStable
			counts.StillPassing++
		}
		diffs = append(diffs, model.TestDiff{TestID: r.TestID, BaselineStatus: b, CandidateStatus: r.Status, Type: t})
	}
	return diffs, counts
}
