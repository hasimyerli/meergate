package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/util"
	"github.com/hasimyerli/meergine/adapter"
)

func SyncAllCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		report, err := deps.CatalogService.SyncAll(r.Context())
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, report)
	}
}

func SyncOneCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			util.BadRequest(w, "id is required")
			return
		}
		if err := deps.CatalogService.SyncOne(r.Context(), id); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"synced": id})
	}
}

func ListCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		protocol := r.URL.Query().Get("protocol")
		entries, err := deps.CatalogService.List(r.Context(), protocol)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		if entries == nil {
			entries = []model.ServiceCatalogEntry{}
		}
		util.Success(w, entries)
	}
}

func GetCatalogEntryHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		entries, err := deps.CatalogService.List(r.Context(), "")
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		for _, e := range entries {
			if e.ID == id {
				util.Success(w, e)
				return
			}
		}
		util.NotFound(w, "catalog entry not found")
	}
}

func AddCatalogTargetHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var entry model.ServiceCatalogEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		if entry.ID == "" || entry.Protocol == "" || entry.Target == "" {
			util.BadRequest(w, "id, protocol, and target are required")
			return
		}
		if entry.Protocol != "grpc" && entry.Protocol != "rest" {
			util.BadRequest(w, "protocol must be 'grpc' or 'rest'")
			return
		}
		if entry.Name == "" {
			entry.Name = entry.ID
		}

		if err := deps.CatalogService.AddTarget(r.Context(), entry); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Created(w, entry)
	}
}

func DiscoverCatalogTargetHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Target   string   `json:"target"`
			TLS      bool     `json:"tls"`
			Services []string `json:"services"` // optional subset (FQNs); empty = all
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if body.Target == "" {
			util.BadRequest(w, "target (host:port) is required")
			return
		}

		entries, err := deps.CatalogService.DiscoverGRPCTarget(r.Context(), body.Target, body.TLS, body.Services...)
		if err != nil {
			util.BadRequest(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"discovered": len(entries), "entries": entries})
	}
}

func HealthHistoryCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		rep, err := deps.CatalogService.HealthHistory(r.Context(), id)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, rep)
	}
}

func CoverageCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rep, err := deps.CatalogService.Coverage(r.Context())
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, rep)
	}
}

func PreviewCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Protocol string `json:"protocol"`
			Target   string `json:"target"`
			TLS      bool   `json:"tls"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if body.Protocol == "" || body.Target == "" {
			util.BadRequest(w, "protocol and target are required")
			return
		}
		res, err := deps.CatalogService.Preview(r.Context(), body.Protocol, body.Target, body.TLS)
		if err != nil {
			util.BadRequest(w, err.Error())
			return
		}
		util.Success(w, res)
	}
}

// InvokeCatalogHandler runs a single live call against a catalog entry (the
// in-app "Try it" console). Errors are returned as {ok:false} with HTTP 200 so
// the console can render them inline.
func InvokeCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			id = r.URL.Query().Get("id")
		}
		entry, err := deps.CatalogService.Get(r.Context(), id)
		if err != nil {
			util.BadRequest(w, "target not found: "+id)
			return
		}

		var body struct {
			Method  string                 `json:"method"`  // gRPC rpcMethod OR HTTP method
			Path    string                 `json:"path"`    // REST path
			Message map[string]interface{} `json:"message"` // gRPC message OR REST body
			Headers map[string]string      `json:"headers"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		adp := adapter.NewNetworkAdapter()
		start := time.Now()

		if entry.Protocol == "grpc" {
			tls := true
			var cfg struct {
				TLS bool `json:"tls"`
			}
			if json.Unmarshal(entry.Config, &cfg) == nil {
				tls = cfg.TLS
			}
			resp, err := adp.GRPC(entry.ID, body.Method, body.Message, &adapter.GRPCOpts{Target: entry.Target, TLS: &tls})
			latency := time.Since(start).Milliseconds()
			if err != nil {
				util.Success(w, map[string]interface{}{"ok": false, "error": err.Error(), "latency_ms": latency})
				return
			}
			util.Success(w, map[string]interface{}{"ok": true, "status": resp.Status, "message": resp.Message, "latency_ms": resp.DurationMs})
			return
		}

		// REST
		method := body.Method
		if method == "" {
			method = "GET"
		}
		resp, err := adp.Rest(method, body.Path, &adapter.RestOpts{BaseURL: entry.Target, Body: body.Message, Headers: body.Headers})
		latency := time.Since(start).Milliseconds()
		if err != nil {
			util.Success(w, map[string]interface{}{"ok": false, "error": err.Error(), "latency_ms": latency})
			return
		}
		util.Success(w, map[string]interface{}{"ok": true, "status_code": resp.StatusCode, "body": resp.Body, "headers": resp.Headers, "latency_ms": latency})
	}
}

func HealthCheckCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id != "" {
			entry, err := deps.CatalogService.Get(r.Context(), id)
			if err != nil {
				util.BadRequest(w, "target not found: "+id)
				return
			}
			deps.CatalogService.CheckHealth(r.Context(), *entry)
		} else {
			_ = deps.CatalogService.CheckHealthAll(r.Context())
		}
		util.Success(w, map[string]interface{}{"ok": true})
	}
}

func DeleteCatalogTargetHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Accept the id via path param or ?id= query. The query form avoids
		// proxy/path-encoding issues for ids containing ':' (e.g. host:port).
		id := chi.URLParam(r, "id")
		if id == "" {
			id = r.URL.Query().Get("id")
		}
		if id == "" {
			util.BadRequest(w, "id is required")
			return
		}
		if err := deps.CatalogService.RemoveTarget(r.Context(), id); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"deleted": id})
	}
}

func ImportCatalogHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Protocol string          `json:"protocol"`
			Data     json.RawMessage `json:"data"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		if body.Protocol == "" || body.Data == nil {
			util.BadRequest(w, "protocol and data are required")
			return
		}

		var count int
		var err error

		switch body.Protocol {
		case "grpc":
			count, err = deps.CatalogService.ImportGRPC(r.Context(), body.Data)
		case "rest":
			count, err = deps.CatalogService.ImportREST(r.Context(), body.Data)
		default:
			util.BadRequest(w, "protocol must be 'grpc' or 'rest'")
			return
		}

		if err != nil {
			util.InternalError(w, err.Error())
			return
		}

		util.Success(w, map[string]interface{}{
			"imported": count,
			"protocol": body.Protocol,
		})
	}
}
