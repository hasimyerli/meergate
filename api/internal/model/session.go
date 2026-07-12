package model

type RunSession struct {
	ID          string  `json:"id"`
	Label       string  `json:"label"`
	Environment *string `json:"environment"`
	GitRef      *string `json:"git_ref"`
	GitCommit   *string `json:"git_commit"`
	JiraRef     *string `json:"jira_ref"`
	CreatedBy   *string `json:"created_by"`
	RunTags     *string `json:"run_tags"` // JSON array string in DB
	CreatedAt   string  `json:"created_at"`
	// Computed field (not stored in DB)
	Summary *RunSessionSummary `json:"summary,omitempty"`
}

type RunSessionSummary struct {
	Total      int   `json:"total"`
	Passed     int   `json:"passed"`
	Failed     int   `json:"failed"`
	Error      int   `json:"error"`
	Running    int   `json:"running"`
	Pending    int   `json:"pending"`
	DurationMs int64 `json:"duration_ms"`
}
