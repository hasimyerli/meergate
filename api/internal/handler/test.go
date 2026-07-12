package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/util"
)

func ListTestsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		suite := r.URL.Query().Get("suite")
		tag := r.URL.Query().Get("tag")
		items := deps.TestService.ListTests(suite, tag)
		util.Success(w, items)
	}
}

func GetTestHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		m := deps.TestService.GetTest(id)
		if m == nil {
			util.NotFound(w, "test not found")
			return
		}
		stats, _ := deps.TestService.GetStats(id)
		util.Success(w, map[string]interface{}{
			"manifest": m,
			"stats":    stats,
		})
	}
}

func GetTestStatsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		stats, err := deps.TestService.GetStats(id)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, stats)
	}
}

func ReloadTestsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := deps.TestService.Reload(); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{
			"message":   "reloaded",
			"manifests": manifest.Count(),
		})
	}
}

func DeleteTestHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := deps.TestService.DeleteManifest(id); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"deleted": true})
	}
}

func SaveTestHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var m model.TestManifest
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			util.BadRequest(w, "invalid manifest")
			return
		}
		if m.ID == "" {
			util.BadRequest(w, "id is required")
			return
		}
		if err := deps.TestService.SaveManifest(&m); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"saved": true, "id": m.ID})
	}
}

func ImportTestsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		count, err := deps.TestService.ImportFromFiles()
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{
			"message":   "imported",
			"manifests": count,
		})
	}
}

func ListTemplatesHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		templates := manifest.AllTemplates()
		util.Success(w, templates)
	}
}

func ListEnvironmentsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		util.Success(w, []struct{}{})
	}
}

func ListGRPCServicesHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.GRPCRegistry == nil {
			util.Success(w, make([]interface{}, 0))
			return
		}
		util.Success(w, deps.GRPCRegistry.ListServices())
	}
}

func GRPCIntrospectHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.GRPCRegistry == nil {
			util.Success(w, make([]interface{}, 0))
			return
		}
		util.Success(w, deps.GRPCRegistry.ListServiceDetails())
	}
}
