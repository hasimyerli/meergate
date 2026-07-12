package model

// Alert scope types — what a rule applies to.
const (
	AlertScopeAll         = "all"
	AlertScopeTest        = "test"
	AlertScopeSuite       = "suite"
	AlertScopeSession     = "session"
	AlertScopeEnvironment = "environment"
)

// Alert condition types — what triggers a rule on run completion.
const (
	AlertCondRunFailed           = "run_failed"
	AlertCondPassRateBelow       = "pass_rate_below"
	AlertCondAvgDurationAbove    = "avg_duration_above"
	AlertCondConsecutiveFailures = "consecutive_failures"
	AlertCondSchemaDrift         = "schema_drift" // sync-triggered: breaking change in a registry service
)

// Alert severities.
const (
	AlertSeverityWarning  = "warning"
	AlertSeverityCritical = "critical"
)

// AlertRule is a user-defined condition evaluated on every run completion.
type AlertRule struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Enabled    int      `json:"enabled"`
	ScopeType  string   `json:"scope_type"`
	ScopeValue *string  `json:"scope_value"`
	Condition  string   `json:"condition"`
	Threshold  *float64 `json:"threshold"`
	WindowN    int      `json:"window_n"`
	CreatedAt  string   `json:"created_at"`
}

// AlertEvent is a fired incident, recorded when a rule matches.
type AlertEvent struct {
	ID           string  `json:"id"`
	RuleID       string  `json:"rule_id"`
	RuleName     string  `json:"rule_name"`
	RunID        *string `json:"run_id"`
	TestID       string  `json:"test_id"`
	Message      string  `json:"message"`
	Severity     string  `json:"severity"`
	Acknowledged int     `json:"acknowledged"`
	CreatedAt    string  `json:"created_at"`
}
