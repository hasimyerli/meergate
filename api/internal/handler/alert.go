package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

var validAlertConditions = map[string]bool{
	model.AlertCondRunFailed:           true,
	model.AlertCondPassRateBelow:       true,
	model.AlertCondAvgDurationAbove:    true,
	model.AlertCondConsecutiveFailures: true,
	model.AlertCondSchemaDrift:         true,
}

// Conditions that fire on an event (not a numeric run metric) and need no threshold.
var thresholdlessConditions = map[string]bool{
	model.AlertCondRunFailed:   true,
	model.AlertCondSchemaDrift: true,
}

func ListAlertRulesHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rules, err := deps.AlertService.ListRules(r.Context())
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, rules)
	}
}

func CreateAlertRuleHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name       string      `json:"name"`
			ScopeType  string      `json:"scope_type"`
			ScopeValue *string     `json:"scope_value"`
			Condition  string      `json:"condition"`
			Threshold  *float64    `json:"threshold"`
			WindowN    int         `json:"window_n"`
			Enabled    interface{} `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if req.Name == "" {
			util.BadRequest(w, "name is required")
			return
		}
		if !validAlertConditions[req.Condition] {
			util.BadRequest(w, "invalid condition")
			return
		}
		if !thresholdlessConditions[req.Condition] && req.Threshold == nil {
			util.BadRequest(w, "threshold is required for this condition")
			return
		}
		if req.ScopeType == "" {
			req.ScopeType = model.AlertScopeAll
		}
		if req.ScopeType != model.AlertScopeAll && (req.ScopeValue == nil || *req.ScopeValue == "") {
			util.BadRequest(w, "scope_value is required for this scope")
			return
		}

		rule := model.AlertRule{
			Name:       req.Name,
			ScopeType:  req.ScopeType,
			ScopeValue: req.ScopeValue,
			Condition:  req.Condition,
			Threshold:  req.Threshold,
			WindowN:    req.WindowN,
			Enabled:    1,
		}
		switch v := req.Enabled.(type) {
		case bool:
			if !v {
				rule.Enabled = 0
			}
		case float64:
			rule.Enabled = int(v)
		}

		if err := deps.AlertService.CreateRule(r.Context(), &rule); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Created(w, rule)
	}
}

func UpdateAlertRuleHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if v, ok := body["enabled"]; ok {
			switch val := v.(type) {
			case bool:
				if val {
					body["enabled"] = 1
				} else {
					body["enabled"] = 0
				}
			case float64:
				body["enabled"] = int(val)
			}
		}
		if v, ok := body["window_n"]; ok {
			if f, isFloat := v.(float64); isFloat {
				body["window_n"] = int(f)
			}
		}
		if err := deps.AlertService.UpdateRule(r.Context(), id, repository.AlertRuleUpdates(body)); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"updated": true})
	}
}

func DeleteAlertRuleHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := deps.AlertService.DeleteRule(r.Context(), id); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"deleted": true})
	}
}

func ListAlertEventsHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		opts := repository.AlertEventListOpts{Limit: 50}
		if v := r.URL.Query().Get("acknowledged"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				opts.Acknowledged = &n
			}
		}
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				opts.Limit = n
			}
		}
		res, err := deps.AlertService.ListEvents(r.Context(), opts)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, res)
	}
}

func AckAlertEventHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := deps.AlertService.AckEvent(r.Context(), id); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"acknowledged": true})
	}
}
