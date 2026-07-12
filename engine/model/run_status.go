package model

// RunStatus is the terminal (or in-progress) state of a test run.
type RunStatus string

const (
	RunStatusPending RunStatus = "pending"
	RunStatusRunning RunStatus = "running"
	RunStatusPassed  RunStatus = "passed"
	RunStatusFailed  RunStatus = "failed"
	RunStatusError   RunStatus = "error"
)
