package model

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GenerateResult struct {
	YAML             string      `json:"yaml"`
	Manifest         interface{} `json:"manifest,omitempty"`
	ValidationErrors []string    `json:"validationErrors,omitempty"`
	HasErrors        bool        `json:"hasErrors"`
	RawResponse      string      `json:"rawResponse,omitempty"`
}
