package handler

import (
	"net/http"

	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/util"
)

func HealthHandler(deps *Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		util.Success(w, map[string]interface{}{
			"status":    "ok",
			"manifests": manifest.Count(),
		})
	}
}
