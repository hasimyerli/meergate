package model

import "encoding/json"

type ServiceCatalogEntry struct {
	ID        string          `json:"id"`
	Protocol  string          `json:"protocol"`
	Name      string          `json:"name"`
	Target    string          `json:"target"`
	Domain    string          `json:"domain"`
	Config    json.RawMessage `json:"config"`
	Catalog   json.RawMessage `json:"catalog,omitempty"`
	SyncedAt  *string         `json:"synced_at,omitempty"`
	SyncError *string         `json:"sync_error,omitempty"`
	CreatedAt string          `json:"created_at"`

	// Premium: health + schema-drift tracking.
	HealthStatus *string `json:"health_status,omitempty"` // healthy | unreachable | unknown
	LatencyMs    *int    `json:"latency_ms,omitempty"`
	LastHealthAt *string `json:"last_health_at,omitempty"`
	DriftSummary *string `json:"drift_summary,omitempty"` // e.g. "+2 -1"
}

type SyncReport struct {
	Total  int         `json:"total"`
	Synced int         `json:"synced"`
	Failed int         `json:"failed"`
	Errors []SyncError `json:"errors,omitempty"`
}

type SyncError struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}
