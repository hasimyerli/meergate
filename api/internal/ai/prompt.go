package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/hasimyerli/meergate/internal/config"
	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"gopkg.in/yaml.v3"
)

var systemPromptCache string

func BuildSystemPrompt(catalogEntries []model.ServiceCatalogEntry) string {
	if systemPromptCache != "" {
		return systemPromptCache
	}

	var sb strings.Builder
	sb.WriteString("You are a test automation expert. Generate YAML test manifests.\n\n")

	sb.WriteString("## Top-Level Manifest Fields\n")
	sb.WriteString("| Field | Type | Required | Description |\n")
	sb.WriteString("|-------|------|----------|-------------|\n")
	sb.WriteString("| id | string | YES | Unique slug (lowercase, dashes). Example: `health-check-status` |\n")
	sb.WriteString("| name | string | YES | Human-readable test name |\n")
	sb.WriteString("| tags | string[] | no | Grouping/filtering labels — use these to categorize the test: `[smoke, rest, api]` |\n")
	sb.WriteString("| version | int | no | Manifest version (default 1) |\n")
	sb.WriteString("| owner | string | no | Test owner name |\n")
	sb.WriteString("| params | map | no | Default parameters. Referenced in steps as `{{params.key}}` |\n")
	sb.WriteString("| config.timeout_ms | int | no | Per-step timeout in ms (default 10000) |\n")
	sb.WriteString("| config.retries | int | no | Retry count on failure (default 0) |\n")
	sb.WriteString("| setup | step[] | no | Steps to run before main test |\n")
	sb.WriteString("| steps | step[] | YES | Main test steps (min 1) |\n")
	sb.WriteString("| teardown | step[] | no | Cleanup steps after test |\n")
	sb.WriteString("| matrix | map | no | Parameterized matrix. Each combination creates a separate run |\n\n")

	sb.WriteString("## Step Types and Fields\n")
	sb.WriteString("Every step requires `name` (unique) and `type`. Optional: `dependsOn`, `when`, `retries`, `extract`, `assert`.\n\n")

	sb.WriteString("### apiCall\n")
	sb.WriteString("HTTP REST API call.\n")
	sb.WriteString("- `method`: GET, POST, PUT, DELETE, PATCH\n")
	sb.WriteString("- `path`: API endpoint (supports `{{params.*}}` and `{{extract.*}}`)\n")
	sb.WriteString("- `baseUrl`: Base URL (from the service catalog; required for the call to reach a live endpoint)\n")
	sb.WriteString("- `body`: JSON request body\n")
	sb.WriteString("- `headers`: Additional HTTP headers (use for auth tokens, e.g. `Authorization`)\n\n")

	sb.WriteString("### grpcCall\n")
	sb.WriteString("gRPC unary call via server reflection.\n")
	sb.WriteString("- `service`: Fully qualified service name (e.g. `pkg.v1.MyService`)\n")
	sb.WriteString("- `rpcMethod`: Method name (e.g. `GetItem`)\n")
	sb.WriteString("- `target`: host:port (from the service catalog; or override here)\n")
	sb.WriteString("- `message`: JSON request message\n")
	sb.WriteString("- `metadata`: gRPC metadata key-value pairs\n")
	sb.WriteString("- `deadline`: gRPC deadline in ms\n\n")

	sb.WriteString("### wsSubscribe\n")
	sb.WriteString("WebSocket subscription. Connects to a URL, subscribes to a channel, waits for the first message.\n")
	sb.WriteString("- `url`: WebSocket URL (e.g. `wss://echo.websocket.events`)\n")
	sb.WriteString("- `channel`: Channel name to subscribe to (e.g. `updates`)\n")
	sb.WriteString("- `waitMs`: Max ms to wait for a message\n\n")

	sb.WriteString("### browserAction\n")
	sb.WriteString("Browser automation via chromedp.\n")
	sb.WriteString("- `action`: navigate, click, fill, select, hover, press, screenshot, waitFor, waitForSelector, extractText\n")
	sb.WriteString("- `url`: Target URL (for navigate)\n")
	sb.WriteString("- `selector`: CSS or text selector\n")
	sb.WriteString("- `value`: Input value (for fill/select)\n")
	sb.WriteString("- `screenshotName`: Screenshot filename\n\n")

	sb.WriteString("### waitUntil\n")
	sb.WriteString("Wait for a duration.\n")
	sb.WriteString("- `waitMs`: Milliseconds to wait\n\n")

	sb.WriteString("### assert\n")
	sb.WriteString("Standalone assertion step (uses `assert` array).\n")
	sb.WriteString("IMPORTANT: In a standalone `assert` step, the data context is the FLAT extract map from previous steps.\n")
	sb.WriteString("The `path` must reference extract keys directly: `$.myExtractKey`, NOT the original response structure.\n")
	sb.WriteString("For example, if a prior step has `extract: { item_id: $.data.id }`, the assert step path is `$.item_id`.\n")
	sb.WriteString("Do NOT use `$.data.id` or `$.extract.item_id` — only `$.item_id`.\n\n")

	sb.WriteString("## Assertion Types\n")
	sb.WriteString("| Type | Fields | Description |\n")
	sb.WriteString("|------|--------|-------------|\n")
	sb.WriteString("| statusCode | expected | HTTP status code equals expected |\n")
	sb.WriteString("| grpcStatus | expected | gRPC status code equals expected |\n")
	sb.WriteString("| jsonPath | path, expected | JSONPath value equals expected |\n")
	sb.WriteString("| jsonPathIncludes | path, expected | JSONPath array includes value |\n")
	sb.WriteString("| jsonPathNotIncludes | path, expected | JSONPath array does NOT include |\n")
	sb.WriteString("| greaterThan | path, expected, tolerance? | Numeric comparison |\n")
	sb.WriteString("| lessThan | path, expected, tolerance? | Numeric comparison |\n")
	sb.WriteString("| nonEmpty | path | Value is not empty/null/zero |\n")
	sb.WriteString("| contains | path, expected | String contains substring |\n")
	sb.WriteString("| wsMessageReceived | — | WebSocket message was received |\n")
	sb.WriteString("| jsonSchema | schema | Validate against inline JSON Schema |\n")
	sb.WriteString("| sumGreaterThan | path, expected, tolerance? | Sum of array values > expected |\n")
	sb.WriteString("| sumLessThan | path, expected | Sum of array values < expected |\n")
	sb.WriteString("| avgGreaterThan | path, expected, tolerance? | Average of array values > expected |\n")
	sb.WriteString("| avgLessThan | path, expected | Average of array values < expected |\n")
	sb.WriteString("| countGreaterThan | path, expected | Array element count > expected |\n")
	sb.WriteString("| countEquals | path, expected | Array element count == expected |\n")
	sb.WriteString("| minGreaterThan | path, expected, tolerance? | Minimum of array values > expected |\n")
	sb.WriteString("| maxLessThan | path, expected | Maximum of array values < expected |\n\n")
	sb.WriteString("### Aggregation Examples\n")
	sb.WriteString("These assertions work on arrays returned by JSONPath. For example, `$.data[*].volume` returns all volume values.\n")
	sb.WriteString("```yaml\n")
	sb.WriteString("assert:\n")
	sb.WriteString("  - type: sumGreaterThan\n")
	sb.WriteString("    path: $.data[*].volume\n")
	sb.WriteString("    expected: 1000000\n")
	sb.WriteString("  - type: countGreaterThan\n")
	sb.WriteString("    path: $.data[*].market\n")
	sb.WriteString("    expected: 10\n")
	sb.WriteString("```\n\n")

	sb.WriteString("## Template System\n")
	sb.WriteString("Use `use: template-id` with `with:` to reference step templates.\n")
	sb.WriteString("Template variables are interpolated with `{{with.key}}`.\n\n")

	sb.WriteString("## Variable Interpolation\n")
	sb.WriteString("- `{{params.key}}` — manifest-level params\n")
	sb.WriteString("- `{{extract.stepName.key}}` — extracted values from prior steps\n")
	sb.WriteString("- `{{env.VAR}}` — environment variables\n")
	sb.WriteString("- `{{with.key}}` — template variables\n\n")

	sb.WriteString("## Example Manifest\n")
	sb.WriteString("```yaml\n")
	sb.WriteString("id: e2e-activity-detail-check\n")
	sb.WriteString("name: Activity Detail End-to-End Check\n")
	sb.WriteString("tags: [e2e, rest, api]\n")
	sb.WriteString("steps:\n")
	sb.WriteString("  - name: list-activities\n")
	sb.WriteString("    type: apiCall\n")
	sb.WriteString("    method: GET\n")
	sb.WriteString("    baseUrl: https://fakerestapi.azurewebsites.net\n")
	sb.WriteString("    path: /api/v1/Activities\n")
	sb.WriteString("    assert:\n")
	sb.WriteString("      - type: statusCode\n")
	sb.WriteString("        expected: 200\n")
	sb.WriteString("      - type: nonEmpty\n")
	sb.WriteString("        path: $\n")
	sb.WriteString("    extract:\n")
	sb.WriteString("      first_id: $[0].id\n")
	sb.WriteString("  - name: check-first-id-positive\n")
	sb.WriteString("    type: assert\n")
	sb.WriteString("    dependsOn: [list-activities]\n")
	sb.WriteString("    assert:\n")
	sb.WriteString("      - type: greaterThan\n")
	sb.WriteString("        path: $.first_id\n")
	sb.WriteString("        expected: 0\n")
	sb.WriteString("```\n")
	sb.WriteString("Note: `check-first-id-positive` uses `$.first_id` because the extract key is `first_id`.\n")
	sb.WriteString("It does NOT use `$[0].id` (original response path) or `$.extract.first_id`.\n\n")

	templates := manifest.AllTemplates()
	if len(templates) > 0 {
		sb.WriteString("## Available Step Templates\n")
		for _, t := range templates {
			sb.WriteString("- `" + t.ID + "`: " + t.Name + "\n")
		}
		sb.WriteString("\n")
	}

	appendCatalogSection(&sb, catalogEntries)

	sb.WriteString("## Rules\n")
	sb.WriteString("1. Always return ONLY valid YAML inside ```yaml code fences.\n")
	sb.WriteString("2. Every step MUST have a unique `name`.\n")
	sb.WriteString("3. Use `dependsOn` to express step ordering (DAG).\n")
	sb.WriteString("4. Always include at least one assertion per step.\n")
	sb.WriteString("5. Use descriptive IDs: `e2e-user-signup-flow`, not `test-1`.\n")

	systemPromptCache = sb.String()
	return systemPromptCache
}

func InvalidateSystemPromptCache() {
	systemPromptCache = ""
}

func GenerateFromPrompt(ctx context.Context, cfg *config.Config, prompt string, history []model.ChatMessage, aiModel string, catalogEntries []model.ServiceCatalogEntry) (*model.GenerateResult, error) {
	systemPrompt := BuildSystemPrompt(catalogEntries)

	messages := []model.ChatMessage{
		{Role: "system", Content: systemPrompt},
	}
	messages = append(messages, history...)
	messages = append(messages, model.ChatMessage{Role: "user", Content: prompt})

	raw, err := CallLLM(ctx, cfg, messages, aiModel)
	if err != nil {
		return nil, err
	}

	yamlStr := extractYAML(raw)

	var m model.TestManifest
	var validationErrors []string
	if err := yaml.Unmarshal([]byte(yamlStr), &m); err != nil {
		validationErrors = append(validationErrors, "YAML parse error: "+err.Error())
	}

	return &model.GenerateResult{
		YAML:             yamlStr,
		Manifest:         m,
		ValidationErrors: validationErrors,
		HasErrors:        len(validationErrors) > 0,
		RawResponse:      raw,
	}, nil
}

func RefineManifest(ctx context.Context, cfg *config.Config, currentYAML, prompt string, history []model.ChatMessage, aiModel string, catalogEntries []model.ServiceCatalogEntry) (*model.GenerateResult, error) {
	refinedHistory := []model.ChatMessage{
		{Role: "user", Content: "Here is the current test manifest:\n```yaml\n" + currentYAML + "\n```"},
		{Role: "assistant", Content: "I see the current manifest. What changes would you like?"},
	}
	refinedHistory = append(refinedHistory, history...)

	return GenerateFromPrompt(ctx, cfg, prompt, refinedHistory, aiModel, catalogEntries)
}

const (
	maxPromptFieldDepth  = 2
	maxFieldsPerLevel    = 15
	maxMethodsPerService = 20
)

type protoField struct {
	Name          string       `json:"name"`
	Type          string       `json:"type"`
	Repeated      bool         `json:"repeated"`
	MessageFields []protoField `json:"messageFields,omitempty"`
}

type catalogMethod struct {
	Name           string          `json:"name"`
	RequestType    string          `json:"requestType"`
	ResponseType   string          `json:"responseType"`
	RequestFields  json.RawMessage `json:"requestFields"`
	ResponseFields json.RawMessage `json:"responseFields"`
}

type restParam struct {
	Name     string `json:"name"`
	In       string `json:"in"`
	Required bool   `json:"required"`
	Type     string `json:"type"`
}

func appendCatalogSection(sb *strings.Builder, entries []model.ServiceCatalogEntry) {
	var grpcEntries, restEntries []model.ServiceCatalogEntry
	for _, e := range entries {
		if e.Catalog == nil {
			continue
		}
		switch e.Protocol {
		case "grpc":
			grpcEntries = append(grpcEntries, e)
		case "rest":
			restEntries = append(restEntries, e)
		}
	}

	if len(grpcEntries) > 0 {
		sb.WriteString("## Available gRPC Services\n\n")
		sb.WriteString("IMPORTANT: Use ONLY the exact field names listed below for `message`, `extract`, and `assert.path`. Do NOT invent field names.\n\n")
		for _, e := range grpcEntries {
			fmt.Fprintf(sb, "### %s (`%s`)\n", e.Name, e.ID)
			fmt.Fprintf(sb, "Target: `%s`\n\n", e.Target)

			var cat struct {
				Methods []catalogMethod `json:"methods"`
			}
			if json.Unmarshal(e.Catalog, &cat) == nil {
				limit := len(cat.Methods)
				if limit > maxMethodsPerService {
					limit = maxMethodsPerService
				}
				for _, m := range cat.Methods[:limit] {
					fmt.Fprintf(sb, "#### `%s`\n", m.Name)

					var reqFields []protoField
					if len(m.RequestFields) > 0 {
						_ = json.Unmarshal(m.RequestFields, &reqFields)
					}
					if len(reqFields) > 0 {
						sb.WriteString("  Request fields: ")
						sb.WriteString(formatProtoFields(reqFields, 0))
						sb.WriteString("\n")
					}

					var respFields []protoField
					if len(m.ResponseFields) > 0 {
						_ = json.Unmarshal(m.ResponseFields, &respFields)
					}
					if len(respFields) > 0 {
						sb.WriteString("  Response fields: ")
						sb.WriteString(formatProtoFields(respFields, 0))
						sb.WriteString("\n")
					}
				}
				if len(cat.Methods) > maxMethodsPerService {
					fmt.Fprintf(sb, "  ...and %d more methods\n", len(cat.Methods)-maxMethodsPerService)
				}
			}
			sb.WriteString("\n")
		}
	}

	if len(restEntries) > 0 {
		sb.WriteString("## Available REST APIs\n\n")
		sb.WriteString("IMPORTANT: Use ONLY the exact field names listed below for request/response bodies and assertions.\n\n")
		for _, e := range restEntries {
			fmt.Fprintf(sb, "### %s\n", e.Name)
			fmt.Fprintf(sb, "Base URL: `%s`\n\n", e.Target)

			var cat struct {
				Endpoints []struct {
					Method         string          `json:"method"`
					Path           string          `json:"path"`
					OperationID    string          `json:"operationId"`
					Summary        string          `json:"summary"`
					Parameters     json.RawMessage `json:"parameters,omitempty"`
					RequestBody    json.RawMessage `json:"requestBody,omitempty"`
					ResponseSchema json.RawMessage `json:"responseSchema,omitempty"`
				} `json:"endpoints"`
			}
			if json.Unmarshal(e.Catalog, &cat) == nil {
				for _, ep := range cat.Endpoints {
					line := fmt.Sprintf("- `%s %s`", ep.Method, ep.Path)
					if ep.Summary != "" {
						line += " — " + ep.Summary
					}
					sb.WriteString(line + "\n")

					if len(ep.Parameters) > 0 {
						var params []restParam
						if json.Unmarshal(ep.Parameters, &params) == nil && len(params) > 0 {
							sb.WriteString("  Params: ")
							sb.WriteString(formatRESTParams(params))
							sb.WriteString("\n")
						}
					}

					if len(ep.RequestBody) > 0 {
						sb.WriteString("  Request body: ")
						sb.WriteString(formatRESTSchema(ep.RequestBody))
						sb.WriteString("\n")
					}

					if len(ep.ResponseSchema) > 0 {
						sb.WriteString("  Response: ")
						sb.WriteString(formatRESTSchema(ep.ResponseSchema))
						sb.WriteString("\n")
					}
				}
			}
			sb.WriteString("\n")
		}
	}
}

func formatProtoFields(fields []protoField, depth int) string {
	if len(fields) == 0 || depth > maxPromptFieldDepth {
		return "{...}"
	}

	var parts []string
	limit := len(fields)
	if limit > maxFieldsPerLevel {
		limit = maxFieldsPerLevel
	}

	for _, f := range fields[:limit] {
		prefix := ""
		if f.Repeated {
			prefix = "[]"
		}

		if f.Type == "message" && len(f.MessageFields) > 0 {
			if depth < maxPromptFieldDepth {
				nested := formatProtoFields(f.MessageFields, depth+1)
				parts = append(parts, fmt.Sprintf("`%s` %s%s", f.Name, prefix, nested))
			} else {
				parts = append(parts, fmt.Sprintf("`%s` %smessage{...}", f.Name, prefix))
			}
		} else {
			parts = append(parts, fmt.Sprintf("`%s` %s%s", f.Name, prefix, f.Type))
		}
	}

	if len(fields) > maxFieldsPerLevel {
		parts = append(parts, fmt.Sprintf("...%d more", len(fields)-maxFieldsPerLevel))
	}

	return "{" + strings.Join(parts, ", ") + "}"
}

func formatRESTParams(params []restParam) string {
	var parts []string
	for _, p := range params {
		s := fmt.Sprintf("`%s` (%s, %s", p.Name, p.In, p.Type)
		if p.Required {
			s += ", required"
		}
		s += ")"
		parts = append(parts, s)
	}
	return strings.Join(parts, ", ")
}

func formatRESTSchema(raw json.RawMessage) string {
	var schema map[string]interface{}
	if err := json.Unmarshal(raw, &schema); err != nil {
		return string(raw)
	}
	return formatSchemaMap(schema, 0)
}

func formatSchemaMap(schema map[string]interface{}, depth int) string {
	if depth > maxPromptFieldDepth {
		return "{...}"
	}

	typ, _ := schema["type"].(string)

	props, hasProps := schema["properties"].(map[string]interface{})
	if hasProps && len(props) > 0 {
		var parts []string
		count := 0
		for name, val := range props {
			if count >= maxFieldsPerLevel {
				parts = append(parts, fmt.Sprintf("...%d more", len(props)-maxFieldsPerLevel))
				break
			}
			switch v := val.(type) {
			case string:
				parts = append(parts, fmt.Sprintf("`%s` %s", name, v))
			case map[string]interface{}:
				parts = append(parts, fmt.Sprintf("`%s` %s", name, formatSchemaMap(v, depth+1)))
			default:
				parts = append(parts, fmt.Sprintf("`%s` unknown", name))
			}
			count++
		}
		return "{" + strings.Join(parts, ", ") + "}"
	}

	if typ == "array" {
		if items, ok := schema["items"].(map[string]interface{}); ok {
			return "[]" + formatSchemaMap(items, depth+1)
		}
		return "[]unknown"
	}

	if typ != "" {
		return typ
	}

	return "{...}"
}

func extractYAML(raw string) string {
	// Try to extract from code block
	re := regexp.MustCompile("(?s)```(?:yaml|yml)?\\n(.*?)```")
	matches := re.FindStringSubmatch(raw)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}

	// Try plain YAML (starts with id: or name:)
	lines := strings.Split(raw, "\n")
	var yamlLines []string
	inYAML := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !inYAML && (strings.HasPrefix(trimmed, "id:") || strings.HasPrefix(trimmed, "name:")) {
			inYAML = true
		}
		if inYAML {
			yamlLines = append(yamlLines, line)
		}
	}
	if len(yamlLines) > 0 {
		return strings.Join(yamlLines, "\n")
	}

	return raw
}
