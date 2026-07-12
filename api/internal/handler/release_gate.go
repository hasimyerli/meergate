package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/service"
	"github.com/hasimyerli/meergate/internal/util"
)

// ListGatesHandler returns gate summaries for every service that has a
// candidate or baseline, keyed by service id. The frontend overlays these on
// the full service catalog.
func ListGatesHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		summaries, err := deps.ReleaseGateService.ListSummaries(r.Context())
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, summaries)
	}
}

// GetGateHandler returns the derived gate summary for one service.
func GetGateHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serviceID := chi.URLParam(r, "id")
		sum, err := deps.ReleaseGateService.Summary(r.Context(), serviceID)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, sum)
	}
}

// CreateCandidateHandler creates a release candidate for a service and captures
// its gate test scope.
func CreateCandidateHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serviceID := chi.URLParam(r, "id")
		var req struct {
			Label         string `json:"label"`
			TargetVersion string `json:"target_version"`
			Environment   string `json:"environment"`
			GitRef        string `json:"git_ref"`
			GitCommit     string `json:"git_commit"`
			PRRef         string `json:"pr_ref"`
			IssueRef      string `json:"issue_ref"`
			ChangeSummary string `json:"change_summary"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}
		c, err := deps.ReleaseGateService.CreateCandidate(r.Context(), serviceID, service.CandidateInput{
			Label:         req.Label,
			TargetVersion: req.TargetVersion,
			Environment:   req.Environment,
			GitRef:        req.GitRef,
			GitCommit:     req.GitCommit,
			PRRef:         req.PRRef,
			IssueRef:      req.IssueRef,
			ChangeSummary: req.ChangeSummary,
		})
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Created(w, c)
	}
}

// EvaluateCandidateHandler runs a candidate's gate tests and returns the
// updated candidate. Synchronous — blocks until the gate tests finish.
func EvaluateCandidateHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		c, err := deps.ReleaseGateService.EvaluateCandidate(r.Context(), id)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, c)
	}
}

// MarkBaselineHandler stores a candidate's results as the service's new
// good baseline.
func MarkBaselineHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serviceID := chi.URLParam(r, "id")
		var req struct {
			CandidateID string `json:"candidate_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		b, err := deps.ReleaseGateService.MarkBaseline(r.Context(), serviceID, req.CandidateID)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Created(w, b)
	}
}
