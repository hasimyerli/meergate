package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

func ListSessionsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 50
		offset := 0
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		if v := r.URL.Query().Get("offset"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				offset = n
			}
		}

		result, err := deps.SessionService.List(r.Context(), limit, offset)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}

		util.Success(w, map[string]interface{}{
			"sessions": result.Sessions,
			"total":    result.Total,
		})
	}
}

func GetSessionHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		session, runs, _, err := deps.SessionService.Get(r.Context(), id)
		if err != nil {
			util.NotFound(w, "session not found")
			return
		}

		util.Success(w, map[string]interface{}{
			"session": session,
			"runs":    runs,
		})
	}
}

func CreateSessionHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Label       string `json:"label"`
			Environment string `json:"environment"`
			GitRef      string `json:"git_ref"`
			GitCommit   string `json:"git_commit"`
			JiraRef     string `json:"jira_ref"`
			CreatedBy   string `json:"created_by"`
			RunTags     string `json:"run_tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		session, err := deps.SessionService.Create(r.Context(), body.Label, body.Environment, body.GitRef, body.GitCommit, body.JiraRef, body.CreatedBy, body.RunTags)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}

		util.Created(w, session)
	}
}

func UpdateSessionHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		updates := repository.SessionUpdates(body)
		if err := deps.SessionService.Update(r.Context(), id, updates); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"updated": true})
	}
}

func DeleteSessionHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := deps.SessionService.Delete(r.Context(), id); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"deleted": true})
	}
}
