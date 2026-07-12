package handler

import (
	"encoding/json"
	"net/http"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/util"
)

func ValidateBuilderHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var m model.TestManifest
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			util.BadRequest(w, "invalid manifest")
			return
		}

		errs := deps.BuilderService.Validate(&m)
		util.Success(w, map[string]interface{}{
			"valid":  len(errs) == 0,
			"errors": errs,
		})
	}
}

func SaveBuilderHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Manifest model.TestManifest `json:"manifest"`
			Filename string             `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			util.BadRequest(w, "invalid request body")
			return
		}

		if err := deps.BuilderService.Save(&body.Manifest); err != nil {
			util.InternalError(w, err.Error())
			return
		}

		util.Success(w, map[string]interface{}{"saved": true})
	}
}

func ExportYAMLHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var m model.TestManifest
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			util.BadRequest(w, "invalid manifest")
			return
		}

		yaml, err := deps.BuilderService.ExportYAML(&m)
		if err != nil {
			util.InternalError(w, err.Error())
			return
		}
		util.Success(w, map[string]interface{}{"yaml": yaml})
	}
}
