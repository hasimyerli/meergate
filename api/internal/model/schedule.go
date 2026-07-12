package model

type Schedule struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Cron        string  `json:"cron"`
	Suite       *string `json:"suite"`
	Tags        *string `json:"tags"`     // JSON array string
	TestIDs     *string `json:"test_ids"` // JSON array string
	Mode        string  `json:"mode"`
	Enabled     int     `json:"enabled"`
	NotifyURL   *string `json:"notify_url"`
	LastRunAt   *string `json:"last_run_at"`
	NextRunAt   *string `json:"next_run_at"`
	CreatedAt   string  `json:"created_at"`
	RerunOnFail int     `json:"rerun_on_fail"`
	MaxReruns   int     `json:"max_reruns"`
	SessionID   *string `json:"session_id"`
}
