package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

func CreateRunHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			TestID    string                 `json:"test_id"`
			Mode      string                 `json:"mode"`
			Overrides map[string]interface{} `json:"overrides"`
			Context   *model.RunContext      `json:"context"`
			SessionID *string                `json:"session_id"`
			RunID     *string                `json:"run_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		m, ok := manifest.Get(body.TestID)
		if !ok {
			util.NotFound(w, "test not found: "+body.TestID)
			return
		}

		if body.Mode == "" {
			body.Mode = "real"
		}

		// Delete old run if re-running from builder
		if body.RunID != nil {
			_ = deps.RunService.DeleteRun(r.Context(), *body.RunID)
		}

		overrides := toStringMap(body.Overrides)
		run, err := deps.RunService.CreateRun(r.Context(), m.ID, m.Suite, body.Mode, body.SessionID, overrides, body.Context)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}

		// Run test in background
		go func() {
			deps.RunEngine(context.Background(), m, run)
		}()

		util.Success(w, run)
	}
}

func BatchRunHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Suite     string                 `json:"suite"`
			Tags      []string               `json:"tags"`
			Mode      string                 `json:"mode"`
			Overrides map[string]interface{} `json:"overrides"`
			Context   *model.RunContext      `json:"context"`
			SessionID *string                `json:"session_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		if body.Mode == "" {
			body.Mode = "real"
		}

		all := manifest.All()
		var manifests []*model.TestManifest
		for _, m := range all {
			if body.Suite != "" && m.Suite != body.Suite {
				continue
			}
			if len(body.Tags) > 0 && !hasAnyTag(m.Tags, body.Tags) {
				continue
			}
			manifests = append(manifests, m)
		}

		runs := make([]*model.Run, 0)
		for _, m := range manifests {
			run, err := deps.RunService.CreateRun(r.Context(), m.ID, m.Suite, body.Mode, body.SessionID, toStringMap(body.Overrides), body.Context)
			if err != nil {
				deps.Logger.Error("failed to create run", "test_id", m.ID, "error", err)
				continue
			}
			runs = append(runs, run)

			mc := m
			rc := run
			go func() {
				deps.RunEngine(context.Background(), mc, rc)
			}()
		}

		util.Success(w, map[string]interface{}{
			"runs":  runs,
			"total": len(runs),
		})
	}
}

func ListRunsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		opts := repository.ListRunsOpts{
			Limit:  50,
			Offset: 0,
		}
		if v := q.Get("status"); v != "" {
			opts.Status = &v
		}
		if v := q.Get("test_id"); v != "" {
			opts.TestID = &v
		}
		if v := q.Get("session_id"); v != "" {
			opts.SessionID = &v
		}
		if v := q.Get("environment"); v != "" {
			opts.Environment = &v
		}
		if v := q.Get("trigger"); v != "" {
			opts.Trigger = &v
		}
		if v := q.Get("from"); v != "" {
			opts.From = &v
		}
		if v := q.Get("to"); v != "" {
			opts.To = &v
		}
		if v := q.Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				opts.Limit = n
			}
		}
		if v := q.Get("offset"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				opts.Offset = n
			}
		}

		result, err := deps.RunService.ListRuns(r.Context(), opts)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}

		util.Success(w, map[string]interface{}{
			"runs":  result.Runs,
			"total": result.Total,
		})
	}
}

func GetRunHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		run, steps, artifacts, err := deps.RunService.GetRun(r.Context(), id)
		if err != nil {
			util.NotFound(w, "run not found")
			return
		}

		m, _ := manifest.Get(run.TestID)

		util.Success(w, map[string]interface{}{
			"run":       run,
			"steps":     steps,
			"artifacts": artifacts,
			"manifest":  m,
		})
	}
}

func ResumeRunHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body struct {
			FromStep  int                    `json:"from_step"`
			Overrides map[string]interface{} `json:"overrides"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		origRun, _, _, err := deps.RunService.GetRun(r.Context(), id)
		if err != nil {
			util.NotFound(w, "run not found")
			return
		}

		m, ok := manifest.Get(origRun.TestID)
		if !ok {
			util.NotFound(w, "test not found")
			return
		}

		extractCtx, _ := deps.RunService.GetExtractContext(r.Context(), id, body.FromStep)

		run, err := deps.RunService.CreateRun(r.Context(), m.ID, m.Suite, origRun.Mode, origRun.SessionID, toStringMap(body.Overrides), nil)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}

		go func() {
			deps.ResumeEngine(context.Background(), m, run, body.FromStep, extractCtx)
		}()

		util.Success(w, run)
	}
}

func DeleteRunHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := deps.RunService.DeleteRun(r.Context(), id); err != nil {
			util.BadRequest(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"deleted": true})
	}
}

func toStringMap(m map[string]interface{}) map[string]string {
	if m == nil {
		return nil
	}
	result := make(map[string]string, len(m))
	for k, v := range m {
		result[k] = fmt.Sprintf("%v", v)
	}
	return result
}

func hasAnyTag(tags []string, filter []string) bool {
	set := make(map[string]bool, len(tags))
	for _, t := range tags {
		set[t] = true
	}
	for _, f := range filter {
		if set[f] {
			return true
		}
	}
	return false
}
