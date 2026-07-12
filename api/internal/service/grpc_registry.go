package service

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
)

// GRPCServiceEntry represents a known gRPC service (backward compat).
type GRPCServiceEntry struct {
	FQN    string `json:"fqn"`
	Target string `json:"target"`
	TLS    bool   `json:"tls"`
}

// GRPCMethodEntry represents an RPC method with field info.
type GRPCMethodEntry struct {
	Name           string          `json:"name"`
	RequestType    string          `json:"requestType,omitempty"`
	ResponseType   string          `json:"responseType,omitempty"`
	RequestFields  json.RawMessage `json:"requestFields,omitempty"`
	ResponseFields json.RawMessage `json:"responseFields,omitempty"`
}

// GRPCServiceDetail is the full service info with methods.
type GRPCServiceDetail struct {
	FQN     string            `json:"fqn"`
	Domain  string            `json:"domain"`
	Target  string            `json:"target"`
	TLS     bool              `json:"tls"`
	Methods []GRPCMethodEntry `json:"methods"`
}

// GRPCRegistry reads gRPC service info from the service_catalog DB table.
type GRPCRegistry struct {
	repo   *repository.CatalogRepo
	logger *slog.Logger
}

func NewGRPCRegistry(repo *repository.CatalogRepo, logger *slog.Logger) *GRPCRegistry {
	return &GRPCRegistry{repo: repo, logger: logger}
}

// ListServices returns a flat list of known gRPC services from DB.
// Services that failed sync or have no catalog data are excluded.
func (r *GRPCRegistry) ListServices() []GRPCServiceEntry {
	entries, err := r.repo.List(context.Background(), "grpc")
	if err != nil {
		r.logger.Warn("failed to list gRPC services from DB", "err", err)
		return nil
	}

	out := make([]GRPCServiceEntry, 0, len(entries))
	for _, e := range entries {
		if e.SyncError != nil && *e.SyncError != "" {
			continue
		}
		if len(e.Catalog) == 0 {
			continue
		}
		tls := extractTLSFromConfig(e.Config)
		out = append(out, GRPCServiceEntry{FQN: e.ID, Target: e.Target, TLS: tls})
	}
	return out
}

// ListServiceDetails returns full service info with methods from DB catalog JSONB.
// Services that failed sync or have no catalog data are excluded from builder dropdowns.
func (r *GRPCRegistry) ListServiceDetails() []GRPCServiceDetail {
	entries, err := r.repo.List(context.Background(), "grpc")
	if err != nil {
		r.logger.Warn("failed to list gRPC details from DB", "err", err)
		return nil
	}

	out := make([]GRPCServiceDetail, 0, len(entries))
	for _, e := range entries {
		if e.SyncError != nil && *e.SyncError != "" {
			continue
		}
		if len(e.Catalog) == 0 {
			continue
		}

		detail := GRPCServiceDetail{
			FQN:    e.ID,
			Domain: e.Domain,
			Target: e.Target,
			TLS:    extractTLSFromConfig(e.Config),
		}
		detail.Methods = extractMethodsFromCatalog(e.Catalog)
		out = append(out, detail)
	}
	return out
}

func extractTLSFromConfig(config json.RawMessage) bool {
	if config == nil {
		return true
	}
	var cfg struct {
		TLS bool `json:"tls"`
	}
	if json.Unmarshal(config, &cfg) == nil {
		return cfg.TLS
	}
	return true
}

func extractMethodsFromCatalog(catalog json.RawMessage) []GRPCMethodEntry {
	var cat struct {
		Methods []GRPCMethodEntry `json:"methods"`
	}
	if json.Unmarshal(catalog, &cat) == nil && cat.Methods != nil {
		return cat.Methods
	}
	return []GRPCMethodEntry{}
}

// CatalogEntriesToGRPCDetails converts ServiceCatalogEntry slice to GRPCServiceDetail slice.
// Used by the backward-compatible introspect endpoint.
func CatalogEntriesToGRPCDetails(entries []model.ServiceCatalogEntry) []GRPCServiceDetail {
	var out []GRPCServiceDetail
	for _, e := range entries {
		if e.Protocol != "grpc" {
			continue
		}
		detail := GRPCServiceDetail{
			FQN:    e.ID,
			Domain: e.Domain,
			Target: e.Target,
			TLS:    extractTLSFromConfig(e.Config),
		}
		if e.Catalog != nil {
			detail.Methods = extractMethodsFromCatalog(e.Catalog)
		}
		out = append(out, detail)
	}
	return out
}
