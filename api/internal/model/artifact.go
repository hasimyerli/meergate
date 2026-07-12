package model

type Artifact struct {
	ID           string `json:"id"`
	RunID        string `json:"run_id"`
	StepResultID string `json:"step_result_id"`
	Type         string `json:"type"`
	Key          string `json:"key"`
	Value        string `json:"value"`
	CreatedAt    string `json:"created_at"`
}
