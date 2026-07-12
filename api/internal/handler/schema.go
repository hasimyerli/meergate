package handler

import (
	"net/http"

	"github.com/hasimyerli/meergate/internal/static"
)

func SchemaHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/schema+json")
		w.WriteHeader(http.StatusOK)
		w.Write(static.ManifestSchemaJSON)
	}
}
