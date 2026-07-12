package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

func ListSchedulesHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		schedules, err := deps.ScheduleService.List(r.Context())
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, schedules)
	}
}

func CreateScheduleHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name        string      `json:"name"`
			Cron        string      `json:"cron"`
			Suite       *string     `json:"suite"`
			Tags        interface{} `json:"tags"`
			TestIDs     interface{} `json:"test_ids"`
			Mode        string      `json:"mode"`
			Enabled     interface{} `json:"enabled"`
			NotifyURL   *string     `json:"notify_url"`
			RerunOnFail interface{} `json:"rerun_on_fail"`
			MaxReruns   int         `json:"max_reruns"`
			SessionID   *string     `json:"session_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		if req.Name == "" || req.Cron == "" {
			util.BadRequest(w, "name and cron are required")
			return
		}

		schedule := model.Schedule{
			Name:      req.Name,
			Cron:      req.Cron,
			Suite:     req.Suite,
			Mode:      req.Mode,
			NotifyURL: req.NotifyURL,
			MaxReruns: req.MaxReruns,
			SessionID: req.SessionID,
		}

		if req.Tags != nil {
			b, _ := json.Marshal(req.Tags)
			s := string(b)
			schedule.Tags = &s
		}
		if req.TestIDs != nil {
			b, _ := json.Marshal(req.TestIDs)
			s := string(b)
			schedule.TestIDs = &s
		}

		switch v := req.Enabled.(type) {
		case bool:
			if v {
				schedule.Enabled = 1
			}
		case float64:
			schedule.Enabled = int(v)
		default:
			schedule.Enabled = 1
		}

		switch v := req.RerunOnFail.(type) {
		case bool:
			if v {
				schedule.RerunOnFail = 1
			}
		case float64:
			schedule.RerunOnFail = int(v)
		}

		if err := deps.ScheduleService.Create(r.Context(), &schedule); err != nil {
			util.InternalError(w, err.Error())
			return
		}

		if deps.CronManager != nil {
			deps.CronManager.AddJob(&schedule)
		}

		util.Created(w, schedule)
	}
}

func UpdateScheduleHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		normalizeScheduleFields(body)

		updates := repository.ScheduleUpdates(body)
		if err := deps.ScheduleService.Update(r.Context(), id, updates); err != nil {
			util.InternalError(w, err.Error())
			return
		}

		if deps.CronManager != nil {
			schedule, err := deps.ScheduleService.Get(r.Context(), id)
			if err == nil {
				deps.CronManager.RestartJob(schedule)
			}
		}

		util.Success(w, map[string]interface{}{"updated": true})
	}
}

func DeleteScheduleHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := deps.ScheduleService.Delete(r.Context(), id); err != nil {
			util.InternalError(w, err.Error())
			return
		}
		if deps.CronManager != nil {
			deps.CronManager.RemoveJob(id)
		}
		util.Success(w, map[string]interface{}{"deleted": true})
	}
}

func normalizeScheduleFields(body map[string]interface{}) {
	for _, key := range []string{"tags", "test_ids"} {
		if v, ok := body[key]; ok {
			if _, isString := v.(string); !isString {
				b, _ := json.Marshal(v)
				body[key] = string(b)
			}
		}
	}
	for _, key := range []string{"enabled", "rerun_on_fail"} {
		if v, ok := body[key]; ok {
			switch val := v.(type) {
			case bool:
				if val {
					body[key] = 1
				} else {
					body[key] = 0
				}
			case float64:
				body[key] = int(val)
			}
		}
	}
}

func TriggerScheduleHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		schedule, err := deps.ScheduleService.Get(r.Context(), id)
		if err != nil {
			util.NotFound(w, "schedule not found")
			return
		}
		if deps.CronManager != nil {
			go deps.CronManager.TriggerNow(schedule)
		}
		util.Success(w, map[string]interface{}{"triggered": true})
	}
}
