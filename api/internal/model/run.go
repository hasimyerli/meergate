package model

// RunStatus and its constants are defined in pkg/model and re-exported via
// pkg_alias.go so both the engine and this application share one vocabulary.

type Run struct {
	ID            string            `json:"id"`
	TestID        string            `json:"test_id"`
	SuiteID       *string           `json:"suite_id"`
	SessionID     *string           `json:"session_id"`
	Status        RunStatus         `json:"status"`
	Mode          string            `json:"mode"`
	Overrides     map[string]string `json:"overrides"`
	Label         *string           `json:"label"`
	Trigger       string            `json:"trigger"`
	TriggeredBy   *string           `json:"triggered_by"`
	GitRef        *string           `json:"git_ref"`
	GitCommit     *string           `json:"git_commit"`
	Environment   *string           `json:"environment"`
	JiraRef       *string           `json:"jira_ref"`
	RunTags       []string          `json:"run_tags"`
	StartedAt     *string           `json:"started_at"`
	FinishedAt    *string           `json:"finished_at"`
	DurationMs    *int64            `json:"duration_ms"`
	Error         *string           `json:"error"`
	CorrelationID string            `json:"correlation_id"`
	CreatedAt     string            `json:"created_at"`
}

type RunContext struct {
	Label       string   `json:"label"`
	Trigger     string   `json:"trigger"`
	TriggeredBy string   `json:"triggered_by"`
	GitRef      string   `json:"git_ref"`
	GitCommit   string   `json:"git_commit"`
	Environment string   `json:"environment"`
	JiraRef     string   `json:"jira_ref"`
	RunTags     []string `json:"run_tags"`
}

type TestStats struct {
	TotalRuns      int      `json:"totalRuns"`
	Passed         int      `json:"passed"`
	Failed         int      `json:"failed"`
	Error          int      `json:"error"`
	PassRate       int      `json:"passRate"`
	FlakeScore     int      `json:"flakeScore"`
	AvgDurationMs  int      `json:"avgDurationMs"`
	Last10Statuses []string `json:"last10Statuses"`
}

type TestListItem struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Suite         string            `json:"suite"`
	Tags          []string          `json:"tags"`
	Version       int               `json:"version"`
	Params        map[string]string `json:"params"`
	LastRunStatus *string           `json:"lastRunStatus"`
	LastRunAt     *string           `json:"lastRunAt"`
	PassRate      *int              `json:"passRate"`
	FlakeScore    *int              `json:"flakeScore"`
	Owner         string            `json:"owner"`
}
