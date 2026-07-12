package handler

import (
	"encoding/json"
	"net/http"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/util"
	"gopkg.in/yaml.v3"
)

func AIStatusHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		util.Success(w, deps.AIService.StatusInfo())
	}
}

func AIGenerateHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Prompt  string              `json:"prompt"`
			History []model.ChatMessage `json:"history"`
			Model   string              `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if body.Prompt == "" {
			util.BadRequest(w, "prompt is required")
			return
		}

		result, err := deps.AIService.Generate(r.Context(), body.Prompt, body.History, body.Model)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, result)
	}
}

func AIRefineHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			YAML    string              `json:"yaml"`
			Prompt  string              `json:"prompt"`
			History []model.ChatMessage `json:"history"`
			Model   string              `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		result, err := deps.AIService.Refine(r.Context(), body.YAML, body.Prompt, body.History, body.Model)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, result)
	}
}

func AIDebugHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			RunID string `json:"run_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if body.RunID == "" {
			util.BadRequest(w, "run_id is required")
			return
		}

		result, err := deps.AIService.DebugRun(r.Context(), deps.RunService, body.RunID)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, result)
	}
}

func AISaveHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			YAML string `json:"yaml"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		var m model.TestManifest
		if err := yaml.Unmarshal([]byte(body.YAML), &m); err != nil {
			util.BadRequest(w, "invalid YAML: "+err.Error())
			return
		}

		if m.ID == "" {
			m.ID = "ai-" + util.GenerateRunID()
		}

		if err := deps.BuilderService.Save(&m); err != nil {
			util.InternalError(w, err.Error())
			return
		}

		util.Success(w, map[string]interface{}{"saved": true, "id": m.ID})
	}
}
