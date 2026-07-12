package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/hasimyerli/meergate/internal/ai"
	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

// DriftAlerter raises incidents when a sync detects a breaking schema change.
// Defined consumer-side so the catalog service has no dependency on alerts.
type DriftAlerter interface {
	EvaluateCatalogDrift(ctx context.Context, serviceID string, removed, affectedTests []string)
}

type CatalogService struct {
	repo         *repository.CatalogRepo
	logger       *slog.Logger
	driftAlerter DriftAlerter
}

// SetDriftAlerter wires optional breaking-change alerting invoked on sync.
func (s *CatalogService) SetDriftAlerter(d DriftAlerter) { s.driftAlerter = d }

func NewCatalogService(repo *repository.CatalogRepo, logger *slog.Logger) *CatalogService {
	return &CatalogService{repo: repo, logger: logger}
}

func (s *CatalogService) SyncAll(ctx context.Context) (*model.SyncReport, error) {
	entries, err := s.repo.List(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("list catalog: %w", err)
	}

	report := &model.SyncReport{Total: len(entries)}
	var mu sync.Mutex
	var wg sync.WaitGroup

	grpcTargets := groupGRPCByTarget(entries)

	for target, services := range grpcTargets {
		wg.Add(1)
		go func(target string, services []model.ServiceCatalogEntry) {
			defer wg.Done()

			useTLS := true
			if len(services) > 0 {
				var cfg struct {
					TLS bool `json:"tls"`
				}
				if json.Unmarshal(services[0].Config, &cfg) == nil {
					useTLS = cfg.TLS
				}
			}

			reflected, err := ReflectTarget(ctx, target, useTLS)

			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				errMsg := err.Error()
				if strings.Contains(errMsg, "Unimplemented") {
					errMsg = "server reflection not enabled on " + target
				}
				for _, svc := range services {
					_ = s.repo.UpdateSyncError(ctx, svc.ID, errMsg)
					report.Failed++
					report.Errors = append(report.Errors, model.SyncError{ID: svc.ID, Error: errMsg})
				}
				return
			}

			reflectedMap := make(map[string]ReflectedService)
			for _, rs := range reflected {
				reflectedMap[rs.FQN] = rs
			}

			now := time.Now().UTC().Format(time.RFC3339)
			for _, svc := range services {
				if rs, ok := reflectedMap[svc.ID]; ok {
					newSet := make(map[string]bool)
					for _, m := range rs.Methods {
						newSet[m.Name] = true
					}
					removed := s.recordDrift(ctx, svc.ID, catalogSignatures("grpc", svc.Catalog), newSet)
					s.triggerDriftAlert(ctx, svc, removed)
					catalogJSON, _ := json.Marshal(map[string]interface{}{"methods": rs.Methods})
					if err := s.repo.UpdateCatalog(ctx, svc.ID, catalogJSON, now); err != nil {
						report.Failed++
						report.Errors = append(report.Errors, model.SyncError{ID: svc.ID, Error: err.Error()})
					} else {
						report.Synced++
					}
				} else {
					_ = s.repo.UpdateSyncError(ctx, svc.ID, "service not found via reflection")
					report.Failed++
					report.Errors = append(report.Errors, model.SyncError{ID: svc.ID, Error: "service not found via reflection"})
				}
			}
		}(target, services)
	}

	for _, entry := range entries {
		if entry.Protocol != "rest" {
			continue
		}
		wg.Add(1)
		go func(entry model.ServiceCatalogEntry) {
			defer wg.Done()

			var cfg struct {
				SwaggerURL string `json:"swagger_url"`
			}
			_ = json.Unmarshal(entry.Config, &cfg)

			if cfg.SwaggerURL == "" {
				mu.Lock()
				_ = s.repo.UpdateSyncError(ctx, entry.ID, "no swagger_url configured")
				report.Failed++
				report.Errors = append(report.Errors, model.SyncError{ID: entry.ID, Error: "no swagger_url configured"})
				mu.Unlock()
				return
			}

			endpoints, err := DiscoverSwagger(ctx, entry.Target, cfg.SwaggerURL)

			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				_ = s.repo.UpdateSyncError(ctx, entry.ID, err.Error())
				report.Failed++
				report.Errors = append(report.Errors, model.SyncError{ID: entry.ID, Error: err.Error()})
				return
			}

			newSet := make(map[string]bool)
			for _, e := range endpoints {
				newSet[restSig(e.Method, e.Path)] = true
			}
			removed := s.recordDrift(ctx, entry.ID, catalogSignatures("rest", entry.Catalog), newSet)
			s.triggerDriftAlert(ctx, entry, removed)
			catalogJSON, _ := json.Marshal(map[string]interface{}{"endpoints": endpoints})
			now := time.Now().UTC().Format(time.RFC3339)
			if err := s.repo.UpdateCatalog(ctx, entry.ID, catalogJSON, now); err != nil {
				report.Failed++
				report.Errors = append(report.Errors, model.SyncError{ID: entry.ID, Error: err.Error()})
			} else {
				report.Synced++
			}
		}(entry)
	}

	wg.Wait()
	ai.InvalidateSystemPromptCache()

	s.logger.Info("catalog sync complete",
		"total", report.Total,
		"synced", report.Synced,
		"failed", report.Failed,
	)

	return report, nil
}

func (s *CatalogService) SyncOne(ctx context.Context, id string) error {
	entry, err := s.repo.Get(ctx, id)
	if err != nil {
		return fmt.Errorf("get catalog entry %s: %w", id, err)
	}

	now := time.Now().UTC().Format(time.RFC3339)

	switch entry.Protocol {
	case "grpc":
		var cfg struct {
			TLS bool `json:"tls"`
		}
		_ = json.Unmarshal(entry.Config, &cfg)

		reflected, err := ReflectTarget(ctx, entry.Target, cfg.TLS)
		if err != nil {
			_ = s.repo.UpdateSyncError(ctx, id, err.Error())
			return fmt.Errorf("reflect %s: %w", entry.Target, err)
		}

		for _, rs := range reflected {
			if rs.FQN == id {
				newSet := make(map[string]bool)
				for _, m := range rs.Methods {
					newSet[m.Name] = true
				}
				removed := s.recordDrift(ctx, id, catalogSignatures("grpc", entry.Catalog), newSet)
				s.triggerDriftAlert(ctx, *entry, removed)
				catalogJSON, _ := json.Marshal(map[string]interface{}{"methods": rs.Methods})
				ai.InvalidateSystemPromptCache()
				return s.repo.UpdateCatalog(ctx, id, catalogJSON, now)
			}
		}
		return s.repo.UpdateSyncError(ctx, id, "service not found via reflection")

	case "rest":
		var cfg struct {
			SwaggerURL string `json:"swagger_url"`
		}
		_ = json.Unmarshal(entry.Config, &cfg)

		if cfg.SwaggerURL == "" {
			return s.repo.UpdateSyncError(ctx, id, "no swagger_url configured")
		}

		endpoints, err := DiscoverSwagger(ctx, entry.Target, cfg.SwaggerURL)
		if err != nil {
			_ = s.repo.UpdateSyncError(ctx, id, err.Error())
			return fmt.Errorf("discover swagger %s: %w", id, err)
		}

		newSet := make(map[string]bool)
		for _, e := range endpoints {
			newSet[restSig(e.Method, e.Path)] = true
		}
		removed := s.recordDrift(ctx, id, catalogSignatures("rest", entry.Catalog), newSet)
		s.triggerDriftAlert(ctx, *entry, removed)
		catalogJSON, _ := json.Marshal(map[string]interface{}{"endpoints": endpoints})
		ai.InvalidateSystemPromptCache()
		return s.repo.UpdateCatalog(ctx, id, catalogJSON, now)
	}

	return fmt.Errorf("unknown protocol %q for %s", entry.Protocol, id)
}

func (s *CatalogService) List(ctx context.Context, protocol string) ([]model.ServiceCatalogEntry, error) {
	return s.repo.List(ctx, protocol)
}

func (s *CatalogService) AddTarget(ctx context.Context, entry model.ServiceCatalogEntry) error {
	return s.repo.Upsert(ctx, entry)
}

func (s *CatalogService) RemoveTarget(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}

func (s *CatalogService) Get(ctx context.Context, id string) (*model.ServiceCatalogEntry, error) {
	return s.repo.Get(ctx, id)
}

// --- Coverage: which discovered methods/endpoints have a test ---

type OperationCoverage struct {
	Name    string   `json:"name"` // gRPC method name OR "METHOD path" for REST
	Covered bool     `json:"covered"`
	TestIDs []string `json:"test_ids,omitempty"`
}

type ServiceCoverage struct {
	ID         string              `json:"id"`
	Total      int                 `json:"total"`
	Covered    int                 `json:"covered"`
	Operations []OperationCoverage `json:"operations"`
}

type CoverageReport struct {
	Services         []ServiceCoverage `json:"services"`
	TotalOperations  int               `json:"total_operations"`
	CoveredOperations int              `json:"covered_operations"`
}

func appendUnique(list []string, v string) []string {
	for _, x := range list {
		if x == v {
			return list
		}
	}
	return append(list, v)
}

// buildCoverageMaps scans every parsed manifest and indexes which tests exercise
// which catalog operation. grpcCov[serviceFQN][rpcMethod] and
// restCov[baseURL]["METHOD path"] both map to the list of test IDs.
func buildCoverageMaps() (grpcCov, restCov map[string]map[string][]string) {
	grpcCov = map[string]map[string][]string{}
	restCov = map[string]map[string][]string{}

	collect := func(testID string, steps []model.TestStep) {
		for _, step := range steps {
			switch step.Type {
			case "grpcCall":
				if step.Service != "" && step.RPCMethod != "" {
					if grpcCov[step.Service] == nil {
						grpcCov[step.Service] = map[string][]string{}
					}
					grpcCov[step.Service][step.RPCMethod] = appendUnique(grpcCov[step.Service][step.RPCMethod], testID)
				}
			case "apiCall":
				if step.BaseURL != "" && step.Path != "" {
					method := step.Method
					if method == "" {
						method = "GET"
					}
					sig := restSig(method, step.Path)
					if restCov[step.BaseURL] == nil {
						restCov[step.BaseURL] = map[string][]string{}
					}
					restCov[step.BaseURL][sig] = appendUnique(restCov[step.BaseURL][sig], testID)
				}
			}
		}
	}

	for id, m := range manifest.All() {
		collect(id, m.Setup)
		collect(id, m.Steps)
		collect(id, m.Teardown)
	}
	return grpcCov, restCov
}

// Coverage cross-joins every manifest step against the catalog to report which
// discovered methods/endpoints are exercised by a test. Computed in-memory from
// the parsed-manifest cache; no persistence.
func (s *CatalogService) Coverage(ctx context.Context) (*CoverageReport, error) {
	entries, err := s.repo.List(ctx, "")
	if err != nil {
		return nil, err
	}

	grpcCov, restCov := buildCoverageMaps()

	report := &CoverageReport{}
	for _, e := range entries {
		sc := ServiceCoverage{ID: e.ID}
		if e.Protocol == "grpc" {
			var c struct {
				Methods []struct {
					Name string `json:"name"`
				} `json:"methods"`
			}
			_ = json.Unmarshal(e.Catalog, &c)
			cov := grpcCov[e.ID]
			for _, mth := range c.Methods {
				tids := cov[mth.Name]
				sc.Operations = append(sc.Operations, OperationCoverage{Name: mth.Name, Covered: len(tids) > 0, TestIDs: tids})
			}
		} else {
			var c struct {
				Endpoints []struct {
					Method string `json:"method"`
					Path   string `json:"path"`
				} `json:"endpoints"`
			}
			_ = json.Unmarshal(e.Catalog, &c)
			cov := restCov[e.Target]
			for _, ep := range c.Endpoints {
				sig := restSig(ep.Method, ep.Path)
				tids := cov[sig]
				sc.Operations = append(sc.Operations, OperationCoverage{Name: sig, Covered: len(tids) > 0, TestIDs: tids})
			}
		}
		sc.Total = len(sc.Operations)
		for _, oc := range sc.Operations {
			if oc.Covered {
				sc.Covered++
			}
		}
		report.Services = append(report.Services, sc)
		report.TotalOperations += sc.Total
		report.CoveredOperations += sc.Covered
	}
	return report, nil
}

// catalogSignatures extracts a comparable set of method/endpoint identifiers
// from a stored catalog JSONB, for schema-drift detection.
func catalogSignatures(protocol string, catalog json.RawMessage) map[string]bool {
	set := map[string]bool{}
	if len(catalog) == 0 {
		return set
	}
	if protocol == "grpc" {
		var c struct {
			Methods []struct {
				Name string `json:"name"`
			} `json:"methods"`
		}
		_ = json.Unmarshal(catalog, &c)
		for _, m := range c.Methods {
			set[m.Name] = true
		}
	} else {
		var c struct {
			Endpoints []struct {
				Method string `json:"method"`
				Path   string `json:"path"`
			} `json:"endpoints"`
		}
		_ = json.Unmarshal(catalog, &c)
		for _, e := range c.Endpoints {
			set[restSig(e.Method, e.Path)] = true
		}
	}
	return set
}

// recordDrift compares the previously-synced signature set against the fresh one
// and persists a "+N -M" summary (empty clears it). No drift is recorded on the
// first sync (empty old set).
func restSig(method, path string) string { return strings.ToUpper(method) + " " + path }

// recordDrift persists a "+N -M" summary and returns the removed operation
// identifiers (empty on first sync). Removed ops signal a breaking change.
func (s *CatalogService) recordDrift(ctx context.Context, id string, oldSet, newSet map[string]bool) []string {
	if len(oldSet) == 0 {
		_ = s.repo.UpdateDrift(ctx, id, "")
		return nil
	}
	added := 0
	var removed []string
	for k := range newSet {
		if !oldSet[k] {
			added++
		}
	}
	for k := range oldSet {
		if !newSet[k] {
			removed = append(removed, k)
		}
	}
	summary := ""
	if added > 0 {
		summary += fmt.Sprintf("+%d", added)
	}
	if len(removed) > 0 {
		if summary != "" {
			summary += " "
		}
		summary += fmt.Sprintf("-%d", len(removed))
	}
	_ = s.repo.UpdateDrift(ctx, id, summary)
	return removed
}

// triggerDriftAlert raises a breaking-change incident (if wired) listing the
// tests that reference the removed operations.
func (s *CatalogService) triggerDriftAlert(ctx context.Context, entry model.ServiceCatalogEntry, removed []string) {
	if s.driftAlerter == nil || len(removed) == 0 {
		return
	}
	affected := s.affectedTestsForOps(entry, removed)
	s.driftAlerter.EvaluateCatalogDrift(ctx, entry.ID, removed, affected)
}

// affectedTestsForOps returns test IDs that reference the given (removed) ops.
func (s *CatalogService) affectedTestsForOps(entry model.ServiceCatalogEntry, ops []string) []string {
	grpcCov, restCov := buildCoverageMaps()
	seen := map[string]bool{}
	var out []string
	for _, op := range ops {
		var tids []string
		if entry.Protocol == "grpc" {
			tids = grpcCov[entry.ID][op]
		} else {
			tids = restCov[entry.Target][op] // op is already "METHOD path" (restSig)
		}
		for _, tid := range tids {
			if !seen[tid] {
				seen[tid] = true
				out = append(out, tid)
			}
		}
	}
	return out
}

// StartHealthMonitor periodically re-checks health/latency for every catalog
// entry until ctx is cancelled (first pass one interval after boot).
func (s *CatalogService) StartHealthMonitor(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 10 * time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.CheckHealthAll(ctx); err != nil {
				s.logger.Warn("health monitor sweep failed", "error", err)
			}
		}
	}
}

// HealthReport bundles recent probes + rolling latency/uptime stats.
type HealthReport struct {
	Checks []repository.HealthCheck `json:"checks"`
	Stats  *repository.HealthStats  `json:"stats"`
}

// HealthHistory returns the latency/health trend for one service.
func (s *CatalogService) HealthHistory(ctx context.Context, id string) (*HealthReport, error) {
	checks, err := s.repo.HealthHistory(ctx, id, 50)
	if err != nil {
		return nil, err
	}
	stats, err := s.repo.HealthStats(ctx, id)
	if err != nil {
		return nil, err
	}
	return &HealthReport{Checks: checks, Stats: stats}, nil
}

// CheckHealthAll probes every catalog entry and persists health/latency.
func (s *CatalogService) CheckHealthAll(ctx context.Context) error {
	entries, err := s.repo.List(ctx, "")
	if err != nil {
		return err
	}
	for _, e := range entries {
		s.CheckHealth(ctx, e)
	}
	return nil
}

// PreviewService is a lightweight gRPC service summary for the discovery preview.
type PreviewService struct {
	FQN         string `json:"fqn"`
	MethodCount int    `json:"method_count"`
}

// PreviewResult is returned by Preview (discover without saving).
type PreviewResult struct {
	Protocol  string               `json:"protocol"`
	Target    string               `json:"target"`
	TLS       bool                 `json:"tls"` // actual transport used (gRPC auto-detect)
	Services  []PreviewService     `json:"services,omitempty"`
	Endpoints []DiscoveredEndpoint `json:"endpoints,omitempty"`
}

// Preview reflects/discovers a target WITHOUT saving anything — powers the
// "see what's there before you add it" wizard step.
func (s *CatalogService) Preview(ctx context.Context, protocol, target string, preferTLS bool) (*PreviewResult, error) {
	if target == "" {
		return nil, fmt.Errorf("target is required")
	}
	switch protocol {
	case "grpc":
		reflected, usedTLS, err := ReflectTargetAuto(ctx, target, preferTLS)
		if err != nil {
			return nil, grpcReflectError(err, target)
		}
		if len(reflected) == 0 {
			return nil, fmt.Errorf("no services discovered at %s", target)
		}
		svcs := make([]PreviewService, 0, len(reflected))
		for _, rs := range reflected {
			svcs = append(svcs, PreviewService{FQN: rs.FQN, MethodCount: len(rs.Methods)})
		}
		return &PreviewResult{Protocol: "grpc", Target: target, TLS: usedTLS, Services: svcs}, nil
	case "rest":
		eps, err := s.DiscoverRESTTarget(ctx, target)
		if err != nil {
			return nil, err
		}
		return &PreviewResult{Protocol: "rest", Target: target, Endpoints: eps}, nil
	}
	return nil, fmt.Errorf("unknown protocol %q", protocol)
}

// DiscoverRESTTarget auto-locates and parses an OpenAPI/Swagger spec from a base
// URL (tries common paths). Does not save.
func (s *CatalogService) DiscoverRESTTarget(ctx context.Context, baseURL string) ([]DiscoveredEndpoint, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("base URL is required")
	}
	eps, err := DiscoverSwagger(ctx, baseURL, "")
	if err != nil {
		return nil, err
	}
	if len(eps) == 0 {
		return nil, fmt.Errorf("no OpenAPI/Swagger endpoints found at %s", baseURL)
	}
	return eps, nil
}

func grpcReflectError(err error, target string) error {
	if strings.Contains(err.Error(), "Unimplemented") {
		return fmt.Errorf("server reflection not enabled on %s", target)
	}
	return err
}

// DiscoverGRPCTarget connects to a gRPC host:port, lists services via reflection
// (auto-detecting TLS vs plaintext), and creates/updates one catalog entry per
// service (id = service FQN, methods populated + synced). No FQN needed up front.
// If only is non-empty, only those FQNs are saved.
func (s *CatalogService) DiscoverGRPCTarget(ctx context.Context, target string, tls bool, only ...string) ([]model.ServiceCatalogEntry, error) {
	if target == "" {
		return nil, fmt.Errorf("target (host:port) is required")
	}

	reflected, usedTLS, err := ReflectTargetAuto(ctx, target, tls)
	if err != nil {
		return nil, grpcReflectError(err, target)
	}
	if len(reflected) == 0 {
		return nil, fmt.Errorf("no services discovered at %s (reflection returned nothing)", target)
	}

	filter := map[string]bool{}
	for _, f := range only {
		filter[f] = true
	}

	now := time.Now().UTC().Format(time.RFC3339)
	configJSON, _ := json.Marshal(map[string]interface{}{"tls": usedTLS})

	created := make([]model.ServiceCatalogEntry, 0, len(reflected))
	for _, rs := range reflected {
		if len(filter) > 0 && !filter[rs.FQN] {
			continue
		}
		entry := model.ServiceCatalogEntry{
			ID:       rs.FQN,
			Protocol: "grpc",
			Name:     repository.ExtractServiceName(rs.FQN),
			Target:   target,
			Domain:   repository.ExtractDomain(rs.FQN),
			Config:   configJSON,
		}
		if err := s.repo.Upsert(ctx, entry); err != nil {
			return created, fmt.Errorf("save %s: %w", rs.FQN, err)
		}
		catalogJSON, _ := json.Marshal(map[string]interface{}{"methods": rs.Methods})
		_ = s.repo.UpdateCatalog(ctx, rs.FQN, catalogJSON, now)
		created = append(created, entry)
	}

	s.logger.Info("discovered gRPC services", "target", target, "tls", usedTLS, "count", len(created))
	return created, nil
}

// CheckHealth probes connectivity + latency for an entry and persists the result.
func (s *CatalogService) CheckHealth(ctx context.Context, entry model.ServiceCatalogEntry) {
	now := time.Now().UTC().Format(time.RFC3339)
	start := time.Now()
	ok := false
	switch entry.Protocol {
	case "grpc":
		tls := true
		var cfg struct {
			TLS bool `json:"tls"`
		}
		if json.Unmarshal(entry.Config, &cfg) == nil {
			tls = cfg.TLS
		}
		_, _, err := ReflectTargetAuto(ctx, entry.Target, tls)
		ok = err == nil
	case "rest":
		ok = pingHTTP(ctx, entry.Target)
	}
	latency := int(time.Since(start).Milliseconds())
	status := "unreachable"
	if ok {
		status = "healthy"
	}
	_ = s.repo.UpdateHealth(ctx, entry.ID, status, latency, now)
	_ = s.repo.InsertHealthCheck(ctx, util.GenerateHealthCheckID(), entry.ID, status, latency, now)
}

func pingHTTP(ctx context.Context, baseURL string) bool {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL, nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return true // any HTTP response (even 4xx) means the host is reachable
}

func (s *CatalogService) ImportGRPC(ctx context.Context, data json.RawMessage) (int, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return 0, fmt.Errorf("parse gRPC import data: %w", err)
	}

	var entries []model.ServiceCatalogEntry
	for key, val := range raw {
		if strings.HasPrefix(key, "_") || strings.HasPrefix(key, "$") {
			continue
		}
		var target struct {
			Target string `json:"target"`
			TLS    bool   `json:"tls"`
		}
		if err := json.Unmarshal(val, &target); err != nil || target.Target == "" {
			continue
		}

		configJSON, _ := json.Marshal(map[string]interface{}{"tls": target.TLS})
		entries = append(entries, model.ServiceCatalogEntry{
			ID:       key,
			Protocol: "grpc",
			Name:     repository.ExtractServiceName(key),
			Target:   target.Target,
			Domain:   repository.ExtractDomain(key),
			Config:   configJSON,
		})
	}

	if err := s.repo.BulkUpsert(ctx, entries); err != nil {
		return 0, err
	}

	s.logger.Info("imported gRPC targets", "count", len(entries))
	return len(entries), nil
}

func (s *CatalogService) ImportREST(ctx context.Context, data json.RawMessage) (int, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return 0, fmt.Errorf("parse REST import data: %w", err)
	}

	var entries []model.ServiceCatalogEntry
	for key, val := range raw {
		if strings.HasPrefix(key, "_") || strings.HasPrefix(key, "$") {
			continue
		}

		var fields map[string]string
		if err := json.Unmarshal(val, &fields); err != nil {
			continue
		}

		baseURL := coalesceField(fields, "target", "base_url", "base-url", "baseUrl", "baseURL")
		swaggerURL := coalesceField(fields, "swagger_url", "swagger-url", "swaggerUrl", "swaggerURL", "swagger")
		domain := coalesceField(fields, "domain")

		if baseURL == "" {
			continue
		}

		configJSON, _ := json.Marshal(map[string]interface{}{"swagger_url": swaggerURL})
		name := titleCase(strings.ReplaceAll(key, "-", " "))

		entries = append(entries, model.ServiceCatalogEntry{
			ID:       key,
			Protocol: "rest",
			Name:     name,
			Target:   baseURL,
			Domain:   domain,
			Config:   configJSON,
		})
	}

	if err := s.repo.BulkUpsert(ctx, entries); err != nil {
		return 0, err
	}

	s.logger.Info("imported REST targets", "count", len(entries))
	return len(entries), nil
}

func coalesceField(fields map[string]string, keys ...string) string {
	for _, k := range keys {
		if v := fields[k]; v != "" {
			return v
		}
	}
	return ""
}

func titleCase(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

func groupGRPCByTarget(entries []model.ServiceCatalogEntry) map[string][]model.ServiceCatalogEntry {
	groups := make(map[string][]model.ServiceCatalogEntry)
	for _, e := range entries {
		if e.Protocol == "grpc" {
			groups[e.Target] = append(groups[e.Target], e)
		}
	}
	return groups
}
