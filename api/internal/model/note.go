package model

type RunNote struct {
	ID        string `json:"id"`
	RunID     string `json:"run_id"`
	Author    string `json:"author"`
	Text      string `json:"text"`
	CreatedAt string `json:"created_at"`
}
