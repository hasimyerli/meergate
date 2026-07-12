package model

type StepResult struct {
	ID              string            `json:"id"`
	RunID           string            `json:"run_id"`
	StepIndex       int               `json:"step_index"`
	StepName        string            `json:"step_name"`
	StepType        string            `json:"step_type"`
	Status          string            `json:"status"`
	RequestSummary  interface{}       `json:"request_summary"`
	ResponseSummary interface{}       `json:"response_summary"`
	Assertions      []AssertionResult `json:"assertions"`
	DurationMs      *int64            `json:"duration_ms"`
	Error           *string           `json:"error"`
	RetryCount      int               `json:"retry_count"`
	StartedAt       *string           `json:"started_at,omitempty"`
	CreatedAt       string            `json:"created_at"`

	// Extracts holds values pulled from this step's response via `extract`.
	// The engine populates it; the caller decides how (if at all) to persist
	// them — the engine itself never writes to a database.
	Extracts []StepExtract `json:"extracts,omitempty"`
}

// StepExtract is a single artifact produced by a step: a value pulled from the
// response (Type "extract") or a captured screenshot (Type "screenshot").
type StepExtract struct {
	Type     string `json:"type"` // "extract" | "screenshot"
	Key      string `json:"key"`
	Value    string `json:"value"`
	JSONPath string `json:"json_path,omitempty"`
}

type AssertionResult struct {
	Name     string      `json:"name"`
	Passed   bool        `json:"passed"`
	Expected interface{} `json:"expected"`
	Actual   interface{} `json:"actual"`
}
