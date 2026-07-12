package model

// TestResult is a single test's outcome snapshot captured during a gate
// evaluation (candidate) or stored as part of a baseline.
type TestResult struct {
	TestID string `json:"test_id"`
	RunID  string `json:"run_id"`
	Status string `json:"status"` // passed | failed | error | skipped
}

// ReleaseCandidate is a new release attempt for a single service. Its gate
// scope is the set of tests protecting that service; results are filled in when
// the candidate is evaluated.
type ReleaseCandidate struct {
	ID            string       `json:"id"`
	ServiceID     string       `json:"service_id"`
	Label         string       `json:"label"`
	TargetVersion string       `json:"target_version"`
	Environment   string       `json:"environment"`
	GitRef        string       `json:"git_ref"`
	GitCommit     string       `json:"git_commit"`
	PRRef         string       `json:"pr_ref"`
	IssueRef      string       `json:"issue_ref"`
	ChangeSummary string       `json:"change_summary"`
	Status        string       `json:"status"` // draft | evaluating | ready | blocked
	Scope         []string     `json:"scope"`
	Results       []TestResult `json:"results"`
	CreatedAt     string       `json:"created_at"`
	UpdatedAt     string       `json:"updated_at"`
}

// ServiceBaseline is the last known-good release snapshot for a service. New
// candidates are compared against it to detect regressions.
type ServiceBaseline struct {
	ID          string       `json:"id"`
	ServiceID   string       `json:"service_id"`
	CandidateID string       `json:"candidate_id"`
	Label       string       `json:"label"`
	Results     []TestResult `json:"results"`
	CreatedAt   string       `json:"created_at"`
}

// RegressionType classifies how a test's candidate result compares to baseline.
type RegressionType string

const (
	RegressionNew        RegressionType = "new_regression"   // baseline passed, candidate failed
	RegressionKnown      RegressionType = "known_failure"    // baseline failed, candidate failed
	RegressionFixed      RegressionType = "fixed"            // baseline failed, candidate passed
	RegressionStable     RegressionType = "still_passing"    // baseline passed, candidate passed
	RegressionNewFailure RegressionType = "new_test_failure" // not in baseline, candidate failed
	RegressionNewPassing RegressionType = "new_test_passing" // not in baseline, candidate passed
	RegressionNotRun     RegressionType = "missing"          // in baseline, not in candidate
)

// TestDiff is one row of a candidate-vs-baseline comparison.
type TestDiff struct {
	TestID          string         `json:"test_id"`
	BaselineStatus  string         `json:"baseline_status"` // "" if absent
	CandidateStatus string         `json:"candidate_status"`
	Type            RegressionType `json:"type"`
}

// RegressionCounts summarizes a diff.
type RegressionCounts struct {
	NewRegressions  int `json:"new_regressions"`
	KnownFailures   int `json:"known_failures"`
	Fixed           int `json:"fixed"`
	StillPassing    int `json:"still_passing"`
	NewTestFailures int `json:"new_test_failures"`
}

// GateSummary is the derived release-gate state for one service.
type GateSummary struct {
	ServiceID       string            `json:"service_id"`
	Status          string            `json:"status"` // ready | watch | blocked | no_baseline | not_configured | evaluating
	GateTestCount   int               `json:"gate_test_count"`
	Candidate       *ReleaseCandidate `json:"candidate"`
	Baseline        *ServiceBaseline  `json:"baseline"`
	Diffs           []TestDiff        `json:"diffs"`
	Counts          RegressionCounts  `json:"counts"`
	LastEvaluatedAt *string           `json:"last_evaluated_at"`
}
