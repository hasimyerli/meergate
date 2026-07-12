package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
)

type DiscoveredEndpoint struct {
	Method         string          `json:"method"`
	Path           string          `json:"path"`
	OperationID    string          `json:"operationId,omitempty"`
	Summary        string          `json:"summary,omitempty"`
	Tags           []string        `json:"tags,omitempty"`
	Parameters     json.RawMessage `json:"parameters,omitempty"`
	RequestBody    json.RawMessage `json:"requestBody,omitempty"`
	ResponseSchema json.RawMessage `json:"responseSchema,omitempty"`
}

type SwaggerParam struct {
	Name     string `json:"name"`
	In       string `json:"in"`
	Required bool   `json:"required"`
	Type     string `json:"type"`
}

// DiscoverSwagger fetches and parses a Swagger/OpenAPI spec, returning discovered endpoints.
func DiscoverSwagger(ctx context.Context, baseURL, swaggerURL string) ([]DiscoveredEndpoint, error) {
	fullURL := resolveSwaggerURL(baseURL, swaggerURL)

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	loader := openapi3.NewLoader()
	loader.Context = ctx
	loader.IsExternalRefsAllowed = true

	doc, err := loader.LoadFromURI(&url.URL{})
	if err != nil {
		doc, err = loadFromHTTP(ctx, fullURL, loader)
		if err != nil {
			return nil, fmt.Errorf("load swagger from %s: %w", fullURL, err)
		}
	}

	if doc == nil {
		return nil, fmt.Errorf("nil document from %s", fullURL)
	}

	var endpoints []DiscoveredEndpoint
	if doc.Paths == nil {
		return endpoints, nil
	}

	for path, pathItem := range doc.Paths.Map() {
		ops := map[string]*openapi3.Operation{
			"GET":     pathItem.Get,
			"POST":    pathItem.Post,
			"PUT":     pathItem.Put,
			"DELETE":  pathItem.Delete,
			"PATCH":   pathItem.Patch,
			"HEAD":    pathItem.Head,
			"OPTIONS": pathItem.Options,
		}

		for method, op := range ops {
			if op == nil {
				continue
			}

			ep := DiscoveredEndpoint{
				Method:      method,
				Path:        path,
				OperationID: op.OperationID,
				Summary:     op.Summary,
				Tags:        op.Tags,
			}

			if params := extractParams(op.Parameters); params != nil {
				ep.Parameters, _ = json.Marshal(params)
			}

			if op.RequestBody != nil && op.RequestBody.Value != nil {
				if schema := extractRequestBodySchema(op.RequestBody.Value); schema != nil {
					ep.RequestBody, _ = json.Marshal(schema)
				}
			}

			if op.Responses != nil {
				if schema := extractResponseSchema(op.Responses); schema != nil {
					ep.ResponseSchema, _ = json.Marshal(schema)
				}
			}

			endpoints = append(endpoints, ep)
		}
	}

	sort.Slice(endpoints, func(i, j int) bool {
		if endpoints[i].Path != endpoints[j].Path {
			return endpoints[i].Path < endpoints[j].Path
		}
		return endpoints[i].Method < endpoints[j].Method
	})

	return endpoints, nil
}

func loadFromHTTP(ctx context.Context, rawURL string, loader *openapi3.Loader) (*openapi3.T, error) {
	doc, err := tryLoadSpec(ctx, rawURL, loader)
	if err == nil {
		return doc, nil
	}

	parsed, parseErr := url.Parse(rawURL)
	if parseErr != nil {
		return nil, err
	}
	baseOrigin := parsed.Scheme + "://" + parsed.Host

	candidates := []string{
		baseOrigin + "/swagger/v1/swagger.json",
		baseOrigin + "/swagger/doc.json",
		baseOrigin + "/swagger.json",
		baseOrigin + "/openapi.json",
		baseOrigin + "/api-docs",
		baseOrigin + "/v1/swagger.json",
	}

	for _, candidate := range candidates {
		if candidate == rawURL {
			continue
		}
		if d, e := tryLoadSpec(ctx, candidate, loader); e == nil {
			return d, nil
		}
	}

	return nil, fmt.Errorf("failed to unmarshal data from %s (tried %d alternative paths)", rawURL, len(candidates))
}

func tryLoadSpec(ctx context.Context, rawURL string, loader *openapi3.Loader) (*openapi3.T, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, rawURL)
	}

	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "text/html") {
		return nil, fmt.Errorf("HTML response from %s (expected JSON/YAML)", rawURL)
	}

	u, _ := url.Parse(rawURL)
	return loader.LoadFromURI(u)
}

func resolveSwaggerURL(baseURL, swaggerURL string) string {
	if strings.HasPrefix(swaggerURL, "http://") || strings.HasPrefix(swaggerURL, "https://") {
		return swaggerURL
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(swaggerURL, "/")
}

func extractParams(params openapi3.Parameters) []SwaggerParam {
	if len(params) == 0 {
		return nil
	}
	var result []SwaggerParam
	for _, p := range params {
		if p.Value == nil {
			continue
		}
		sp := SwaggerParam{
			Name:     p.Value.Name,
			In:       p.Value.In,
			Required: p.Value.Required,
		}
		if p.Value.Schema != nil && p.Value.Schema.Value != nil {
			sp.Type = p.Value.Schema.Value.Type.Slice()[0]
		}
		result = append(result, sp)
	}
	return result
}

func extractRequestBodySchema(body *openapi3.RequestBody) map[string]interface{} {
	for _, mediaType := range body.Content {
		if mediaType.Schema != nil && mediaType.Schema.Value != nil {
			return schemaToMap(mediaType.Schema.Value)
		}
	}
	return nil
}

func extractResponseSchema(responses *openapi3.Responses) map[string]interface{} {
	for code, ref := range responses.Map() {
		if !strings.HasPrefix(code, "2") || ref.Value == nil {
			continue
		}
		for _, mediaType := range ref.Value.Content {
			if mediaType.Schema != nil && mediaType.Schema.Value != nil {
				return schemaToMap(mediaType.Schema.Value)
			}
		}
	}
	return nil
}

func schemaToMap(s *openapi3.Schema) map[string]interface{} {
	if s == nil {
		return nil
	}
	result := map[string]interface{}{}
	types := s.Type.Slice()
	if len(types) > 0 {
		result["type"] = types[0]
	}

	if len(s.Properties) > 0 {
		props := map[string]interface{}{}
		for name, prop := range s.Properties {
			if prop.Value != nil {
				propTypes := prop.Value.Type.Slice()
				if len(propTypes) > 0 {
					props[name] = propTypes[0]
				} else {
					props[name] = "unknown"
				}
			}
		}
		result["properties"] = props
	}

	if s.Items != nil && s.Items.Value != nil {
		result["items"] = schemaToMap(s.Items.Value)
	}

	return result
}
