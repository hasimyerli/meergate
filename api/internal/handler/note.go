package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hasimyerli/meergate/internal/middleware"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

func ListNotesHandler(noteRepo *repository.NoteRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := chi.URLParam(r, "id")
		notes, err := noteRepo.ListByRunID(r.Context(), runID)
		if err != nil {
			util.Error(w, http.StatusInternalServerError, "failed to list notes")
			return
		}
		if notes == nil {
			notes = []model.RunNote{}
		}
		util.Success(w, notes)
	}
}

func CreateNoteHandler(noteRepo *repository.NoteRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := chi.URLParam(r, "id")
		author := middleware.GetUsername(r.Context())
		if author == "" {
			author = "anonymous"
		}

		var body struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Text == "" {
			util.Error(w, http.StatusBadRequest, "text is required")
			return
		}

		note := &model.RunNote{
			ID:        fmt.Sprintf("note_%d", time.Now().UnixNano()),
			RunID:     runID,
			Author:    author,
			Text:      body.Text,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}

		if err := noteRepo.Create(r.Context(), note); err != nil {
			util.Error(w, http.StatusInternalServerError, "failed to create note")
			return
		}
		util.Success(w, note)
	}
}

func DeleteNoteHandler(noteRepo *repository.NoteRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		noteID := chi.URLParam(r, "noteId")
		if err := noteRepo.Delete(r.Context(), noteID); err != nil {
			util.Error(w, http.StatusInternalServerError, "failed to delete note")
			return
		}
		util.Success(w, map[string]bool{"deleted": true})
	}
}
