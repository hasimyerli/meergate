package event

import "time"

type EventType string

const (
	EventRunStarted         EventType = "run_started"
	EventStepStarted        EventType = "step_started"
	EventStepCompleted      EventType = "step_completed"
	EventAssertionEvaluated EventType = "assertion_evaluated"
	EventDataExtracted      EventType = "data_extracted"
	EventRunCompleted       EventType = "run_completed"
)

type Event struct {
	Type    EventType `json:"type"`
	RunID   string    `json:"run_id"`
	Ts      string    `json:"ts"`
	Seq     int64     `json:"seq"`
	Payload any       `json:"payload"`
}

type RunStartedPayload struct {
	TestID     string  `json:"test_id"`
	TestName   string  `json:"test_name"`
	TotalSteps int     `json:"total_steps"`
	DAGBatches [][]int `json:"dag_batches,omitempty"`
}

type StepStartedPayload struct {
	StepIndex int    `json:"step_index"`
	StepName  string `json:"step_name"`
	StepType  string `json:"step_type"`
	Phase     string `json:"phase"`
}

type StepCompletedPayload struct {
	StepIndex       int     `json:"step_index"`
	StepName        string  `json:"step_name"`
	StepType        string  `json:"step_type"`
	Status          string  `json:"status"`
	DurationMs      *int64  `json:"duration_ms,omitempty"`
	Error           *string `json:"error,omitempty"`
	RetryCount      int     `json:"retry_count"`
	RequestSummary  any     `json:"request_summary,omitempty"`
	ResponseSummary any     `json:"response_summary,omitempty"`
}

type AssertionEvaluatedPayload struct {
	StepIndex int    `json:"step_index"`
	StepName  string `json:"step_name"`
	Name      string `json:"name"`
	Passed    bool   `json:"passed"`
	Expected  any    `json:"expected,omitempty"`
	Actual    any    `json:"actual,omitempty"`
}

type DataExtractedPayload struct {
	StepIndex int    `json:"step_index"`
	StepName  string `json:"step_name"`
	Key       string `json:"key"`
	Value     any    `json:"value"`
	JSONPath  string `json:"json_path"`
}

type RunCompletedPayload struct {
	Status      string `json:"status"`
	DurationMs  int64  `json:"duration_ms"`
	Error       string `json:"error,omitempty"`
	PassedCount int    `json:"passed_count"`
	FailedCount int    `json:"failed_count"`
	TotalCount  int    `json:"total_count"`
}

func NewEvent(typ EventType, runID string, seq int64, payload any) Event {
	return Event{
		Type:    typ,
		RunID:   runID,
		Ts:      time.Now().UTC().Format(time.RFC3339Nano),
		Seq:     seq,
		Payload: payload,
	}
}
