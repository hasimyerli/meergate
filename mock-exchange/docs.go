package main

import (
	_ "embed"
	"net/http"
)

// openapiSpec is the OpenAPI 3.0 description, embedded into the binary so the
// server stays a single self-contained artifact (no runtime file reads). It is
// served verbatim at /openapi.json — meerGate's Service Catalog can import it
// directly for REST discovery.
//
//go:embed openapi.json
var openapiSpec []byte

func (s *Server) handleOpenAPI(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(openapiSpec)
}

// swaggerHTML renders Swagger UI pointed at /openapi.json. The UI assets load
// from the public unpkg CDN — this adds NO Go dependency (nothing in go.mod);
// it only needs internet in the browser to render. The spec itself is local.
const swaggerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Mock Exchange API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    };
  </script>
</body>
</html>`

func (s *Server) handleSwaggerUI(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(swaggerHTML))
}
