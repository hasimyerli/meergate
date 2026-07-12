package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

type AlertService struct {
	ruleRepo  *repository.AlertRuleRepo
	eventRepo *repository.AlertEventRepo
	runRepo   *repository.RunRepo
	logger    *slog.Logger
}

func NewAlertService(
	ruleRepo *repository.AlertRuleRepo,
	eventRepo *repository.AlertEventRepo,
	runRepo *repository.RunRepo,
	logger *slog.Logger,
) *AlertService {
	return &AlertService{ruleRepo: ruleRepo, eventRepo: eventRepo, runRepo: runRepo, logger: logger}
}

// ─── Rule CRUD ─────────────────────────────────────────────────────

func (s *AlertService) CreateRule(ctx context.Context, rule *model.AlertRule) error {
	rule.ID = util.GenerateAlertID()
	rule.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	if rule.ScopeType == "" {
		rule.ScopeType = model.AlertScopeAll
	}
	if rule.WindowN <= 0 {
		rule.WindowN = 20
	}
	return s.ruleRepo.Create(ctx, rule)
}

func (s *AlertService) ListRules(ctx context.Context) ([]*model.AlertRule, error) {
	return s.ruleRepo.List(ctx)
}

func (s *AlertService) GetRule(ctx context.Context, id string) (*model.AlertRule, error) {
	return s.ruleRepo.GetByID(ctx, id)
}

func (s *AlertService) UpdateRule(ctx context.Context, id string, updates repository.AlertRuleUpdates) error {
	return s.ruleRepo.Update(ctx, id, updates)
}

func (s *AlertService) DeleteRule(ctx context.Context, id string) error {
	return s.ruleRepo.Delete(ctx, id)
}

// ─── Events ────────────────────────────────────────────────────────

func (s *AlertService) ListEvents(ctx context.Context, opts repository.AlertEventListOpts) (*repository.AlertEventListResult, error) {
	return s.eventRepo.List(ctx, opts)
}

func (s *AlertService) AckEvent(ctx context.Context, id string) error {
	return s.eventRepo.Acknowledge(ctx, id)
}

// ─── Evaluation (satisfies engine.AlertEvaluator) ──────────────────

// EvaluateRun checks all enabled rules against a just-completed run and
// records incidents. It never returns an error and never panics — an alert
// failure must not affect the run (this may execute in a detached goroutine).
func (s *AlertService) EvaluateRun(ctx context.Context, run *model.Run) {
	rules, err := s.ruleRepo.ListEnabled(ctx)
	if err != nil {
		s.logger.Error("alert eval: list enabled rules", "error", err)
		return
	}
	for _, rule := range rules {
		if !scopeMatches(rule, run) {
			continue
		}
		fired, severity, message := s.evalCondition(ctx, rule, run)
		if !fired {
			continue
		}
		open, err := s.eventRepo.HasOpenForRule(ctx, rule.ID)
		if err != nil {
			s.logger.Error("alert eval: has-open check", "rule", rule.ID, "error", err)
			continue
		}
		if open {
			continue // one open incident per rule until acknowledged
		}
		runID := run.ID
		ev := &model.AlertEvent{
			ID:        util.GenerateAlertEventID(),
			RuleID:    rule.ID,
			RuleName:  rule.Name,
			RunID:     &runID,
			TestID:    run.TestID,
			Message:   message,
			Severity:  severity,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}
		if err := s.eventRepo.Create(ctx, ev); err != nil {
			s.logger.Warn("alert eval: create event", "rule", rule.ID, "error", err)
		}
	}
}

// EvaluateCatalogDrift is the sync-triggered sibling of EvaluateRun: it raises a
// (non-run) incident when a registry service loses operations (breaking change).
// affectedTests are the test IDs that reference the removed operations.
func (s *AlertService) EvaluateCatalogDrift(ctx context.Context, serviceID string, removed, affectedTests []string) {
	if len(removed) == 0 {
		return
	}
	rules, err := s.ruleRepo.ListEnabled(ctx)
	if err != nil {
		s.logger.Error("drift alert: list enabled rules", "error", err)
		return
	}
	for _, rule := range rules {
		if rule.Condition != model.AlertCondSchemaDrift {
			continue
		}
		// schema_drift applies to all services, or a specific service (scope=test).
		if !(rule.ScopeType == model.AlertScopeAll || (rule.ScopeType == model.AlertScopeTest && scopeVal(rule) == serviceID)) {
			continue
		}
		open, err := s.eventRepo.HasOpenForRule(ctx, rule.ID)
		if err != nil || open {
			continue
		}
		msg := fmt.Sprintf("Breaking change in %s: removed %d operation(s) [%s]", serviceID, len(removed), strings.Join(removed, ", "))
		if len(affectedTests) > 0 {
			msg += fmt.Sprintf(" — affects %d test(s): %s", len(affectedTests), strings.Join(affectedTests, ", "))
		}
		ev := &model.AlertEvent{
			ID:        util.GenerateAlertEventID(),
			RuleID:    rule.ID,
			RuleName:  rule.Name,
			RunID:     nil,
			TestID:    serviceID,
			Message:   msg,
			Severity:  model.AlertSeverityCritical,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}
		if err := s.eventRepo.Create(ctx, ev); err != nil {
			s.logger.Warn("drift alert: create event", "rule", rule.ID, "error", err)
		}
	}
}

func scopeMatches(rule *model.AlertRule, run *model.Run) bool {
	switch rule.ScopeType {
	case model.AlertScopeAll:
		return true
	case model.AlertScopeTest:
		return rule.ScopeValue != nil && *rule.ScopeValue == run.TestID
	case model.AlertScopeSuite:
		return rule.ScopeValue != nil && run.SuiteID != nil && *rule.ScopeValue == *run.SuiteID
	case model.AlertScopeSession:
		return rule.ScopeValue != nil && run.SessionID != nil && *rule.ScopeValue == *run.SessionID
	case model.AlertScopeEnvironment:
		return rule.ScopeValue != nil && run.Environment != nil && *rule.ScopeValue == *run.Environment
	}
	return false
}

func scopeVal(rule *model.AlertRule) string {
	if rule.ScopeValue == nil {
		return ""
	}
	return *rule.ScopeValue
}

// evalCondition returns (fired, severity, message).
func (s *AlertService) evalCondition(ctx context.Context, rule *model.AlertRule, run *model.Run) (bool, string, string) {
	switch rule.Condition {

	case model.AlertCondRunFailed:
		if run.Status == model.RunStatusFailed || run.Status == model.RunStatusError {
			return true, model.AlertSeverityWarning,
				fmt.Sprintf("Run %s finished with status %s", run.ID, run.Status)
		}
		return false, "", ""

	case model.AlertCondPassRateBelow:
		if rule.Threshold == nil {
			return false, "", ""
		}
		runs, err := s.runRepo.ListRecentRunsForScope(ctx, rule.ScopeType, scopeVal(rule), rule.WindowN)
		if err != nil || len(runs) == 0 {
			return false, "", ""
		}
		passed := 0
		for _, rr := range runs {
			if rr.Status == "passed" {
				passed++
			}
		}
		rate := float64(passed) / float64(len(runs)) * 100
		if rate < *rule.Threshold {
			return true, model.AlertSeverityCritical,
				fmt.Sprintf("Pass rate %.0f%% is below %.0f%% over the last %d runs", rate, *rule.Threshold, len(runs))
		}
		return false, "", ""

	case model.AlertCondAvgDurationAbove:
		if rule.Threshold == nil {
			return false, "", ""
		}
		runs, err := s.runRepo.ListRecentRunsForScope(ctx, rule.ScopeType, scopeVal(rule), rule.WindowN)
		if err != nil {
			return false, "", ""
		}
		var sum int64
		var n int
		for _, rr := range runs {
			if rr.DurationMs != nil {
				sum += *rr.DurationMs
				n++
			}
		}
		if n == 0 {
			return false, "", ""
		}
		avg := float64(sum) / float64(n)
		if avg > *rule.Threshold {
			return true, model.AlertSeverityWarning,
				fmt.Sprintf("Avg duration %.0fms exceeds %.0fms over the last %d runs", avg, *rule.Threshold, n)
		}
		return false, "", ""

	case model.AlertCondConsecutiveFailures:
		if rule.Threshold == nil {
			return false, "", ""
		}
		need := int(*rule.Threshold)
		if need <= 0 {
			return false, "", ""
		}
		runs, err := s.runRepo.ListRecentRunsForScope(ctx, rule.ScopeType, scopeVal(rule), rule.WindowN)
		if err != nil {
			return false, "", ""
		}
		streak := 0
		for _, rr := range runs { // newest first
			if rr.Status == "failed" || rr.Status == "error" {
				streak++
			} else {
				break
			}
		}
		if streak >= need {
			return true, model.AlertSeverityCritical,
				fmt.Sprintf("%d consecutive failures (threshold %d)", streak, need)
		}
		return false, "", ""
	}
	return false, "", ""
}
