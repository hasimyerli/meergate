package manifest

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"gopkg.in/yaml.v3"
)

var (
	manifestsMu sync.RWMutex
	manifests   = make(map[string]*model.TestManifest)
	templatesMu sync.RWMutex
	templates   = make(map[string]*model.StepTemplate)
)

// LoadFromDB loads manifests and templates from the database only.
// DB is the sole source of truth; no file-based seeding.
func LoadFromDB(ctx context.Context, repo *repository.ManifestRepo) {
	loadTemplatesFromDB(ctx, repo)
	loadManifestsFromDB(ctx, repo)
}

func loadTemplatesFromDB(ctx context.Context, repo *repository.ManifestRepo) {
	rows, err := repo.GetAllTemplates(ctx)
	if err != nil {
		log.Printf("failed to load templates from DB: %v", err)
		return
	}

	newTemplates := make(map[string]*model.StepTemplate)
	for _, row := range rows {
		var t model.StepTemplate
		if err := yaml.Unmarshal([]byte(row.YAMLContent), &t); err != nil {
			log.Printf("template parse error %s: %v", row.ID, err)
			continue
		}
		newTemplates[t.ID] = &t
	}

	templatesMu.Lock()
	templates = newTemplates
	templatesMu.Unlock()
}

func loadManifestsFromDB(ctx context.Context, repo *repository.ManifestRepo) {
	rows, err := repo.GetAll(ctx)
	if err != nil {
		log.Printf("failed to load manifests from DB: %v", err)
		return
	}

	templatesMu.RLock()
	tmplCopy := make(map[string]*model.StepTemplate, len(templates))
	for k, v := range templates {
		tmplCopy[k] = v
	}
	templatesMu.RUnlock()

	newManifests := make(map[string]*model.TestManifest)
	for _, row := range rows {
		var rawMap interface{}
		if err := yaml.Unmarshal([]byte(row.YAMLContent), &rawMap); err != nil {
			log.Printf("manifest yaml error %s: %v", row.ID, err)
			continue
		}
		jsonBytes, err := json.Marshal(normalizeYAML(rawMap))
		if err != nil {
			log.Printf("manifest marshal error %s: %v", row.ID, err)
			continue
		}
		var m model.TestManifest
		if err := json.Unmarshal(jsonBytes, &m); err != nil {
			log.Printf("manifest unmarshal error %s: %v", row.ID, err)
			continue
		}
		if m.ID == "" {
			continue
		}

		m.Steps = resolveSteps(m.Steps, tmplCopy)
		m.Setup = resolveSteps(m.Setup, tmplCopy)
		m.Teardown = resolveSteps(m.Teardown, tmplCopy)

		newManifests[m.ID] = &m
	}

	manifestsMu.Lock()
	manifests = newManifests
	manifestsMu.Unlock()
	log.Printf("Loaded %d manifests from DB", len(newManifests))
}

// ReloadFromDB refreshes the in-memory cache from the database.
func ReloadFromDB(ctx context.Context, repo *repository.ManifestRepo) {
	manifestsMu.Lock()
	manifests = make(map[string]*model.TestManifest)
	manifestsMu.Unlock()
	templatesMu.Lock()
	templates = make(map[string]*model.StepTemplate)
	templatesMu.Unlock()

	loadTemplatesFromDB(ctx, repo)
	loadManifestsFromDB(ctx, repo)
}

// normalizeYAML converts yaml.v3 types to JSON-compatible types.
func normalizeYAML(v interface{}) interface{} {
	switch val := v.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{}, len(val))
		for k, vv := range val {
			result[k] = normalizeYAML(vv)
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(val))
		for i, vv := range val {
			result[i] = normalizeYAML(vv)
		}
		return result
	default:
		return v
	}
}

func resolveSteps(steps []model.TestStep, tmpl map[string]*model.StepTemplate) []model.TestStep {
	if steps == nil {
		return nil
	}
	result := make([]model.TestStep, 0, len(steps))
	for _, step := range steps {
		result = append(result, resolveTemplateStep(step, tmpl))
	}
	return result
}

func resolveTemplateStep(step model.TestStep, tmpl map[string]*model.StepTemplate) model.TestStep {
	if step.Use == "" {
		return step
	}
	t, ok := tmpl[step.Use]
	if !ok {
		return step
	}

	resolved := model.TestStep{
		Name:      step.Name,
		Type:      t.Type,
		Method:    t.Method,
		Path:      t.Path,
		BaseURL:   t.BaseURL,
		Service:   t.Service,
		RPCMethod: t.RPCMethod,
		ProtoFile: t.ProtoFile,
		Channel:   t.Channel,
		WaitMs:    t.WaitMs,
		Action:    t.Action,
		URL:       t.URL,
		Selector:  t.Selector,
		DependsOn: step.DependsOn,
		Retries:   step.Retries,
		When:      step.When,
	}

	if t.Body != nil {
		resolved.Body = deepCopy(t.Body)
	}
	if t.Headers != nil {
		resolved.Headers = copyStrMap(t.Headers)
	}
	if t.Message != nil {
		resolved.Message = deepCopy(t.Message)
	}
	if t.Metadata != nil {
		resolved.Metadata = copyStrMap(t.Metadata)
	}
	if t.Value != nil {
		resolved.Value = t.Value
	}

	if step.Extract != nil {
		resolved.Extract = step.Extract
	} else if t.Extract != nil {
		resolved.Extract = copyStrMap(t.Extract)
	}

	if step.Assert != nil {
		resolved.Assert = step.Assert
	} else if t.Assert != nil {
		cp := make([]model.TestAssertion, len(t.Assert))
		copy(cp, t.Assert)
		resolved.Assert = cp
	}

	if len(step.With) > 0 {
		resolved = applyWith(resolved, step.With)
	}

	return resolved
}

func applyWith(step model.TestStep, withVars map[string]string) model.TestStep {
	replaceWithVars := func(s string) string {
		for k, v := range withVars {
			s = strings.ReplaceAll(s, "{{with."+k+"}}", v)
		}
		return s
	}

	if step.Path != "" {
		step.Path = replaceWithVars(step.Path)
	}
	if step.Service != "" {
		step.Service = replaceWithVars(step.Service)
	}
	if step.Channel != "" {
		step.Channel = replaceWithVars(step.Channel)
	}
	if step.URL != "" {
		step.URL = replaceWithVars(step.URL)
	}
	if step.Selector != "" {
		step.Selector = replaceWithVars(step.Selector)
	}
	if s, ok := step.Value.(string); ok {
		step.Value = replaceWithVars(s)
	}

	step.Body = processWithValue(step.Body, replaceWithVars)
	step.Message = processWithValue(step.Message, replaceWithVars)

	if step.Extract != nil {
		newExtract := make(map[string]string, len(step.Extract))
		for k, v := range step.Extract {
			newExtract[k] = replaceWithVars(v)
		}
		step.Extract = newExtract
	}

	if step.Assert != nil {
		newAssert := make([]model.TestAssertion, len(step.Assert))
		for i, a := range step.Assert {
			newAssert[i] = a
			if a.Path != "" {
				newAssert[i].Path = replaceWithVars(a.Path)
			}
			if s, ok := a.Expected.(string); ok {
				newAssert[i].Expected = replaceWithVars(s)
			}
		}
		step.Assert = newAssert
	}

	return step
}

func processWithValue(v interface{}, replace func(string) string) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case string:
		return replace(val)
	case map[string]interface{}:
		result := make(map[string]interface{}, len(val))
		for k, vv := range val {
			result[k] = processWithValue(vv, replace)
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(val))
		for i, vv := range val {
			result[i] = processWithValue(vv, replace)
		}
		return result
	default:
		return v
	}
}

func deepCopy(v interface{}) interface{} {
	b, _ := json.Marshal(v)
	var out interface{}
	_ = json.Unmarshal(b, &out)
	return out
}

func copyStrMap(m map[string]string) map[string]string {
	cp := make(map[string]string, len(m))
	for k, v := range m {
		cp[k] = v
	}
	return cp
}

// Get returns a manifest by ID from in-memory cache.
func Get(id string) (*model.TestManifest, bool) {
	manifestsMu.RLock()
	defer manifestsMu.RUnlock()
	m, ok := manifests[id]
	return m, ok
}

// All returns all loaded manifests.
func All() map[string]*model.TestManifest {
	manifestsMu.RLock()
	defer manifestsMu.RUnlock()
	cp := make(map[string]*model.TestManifest, len(manifests))
	for k, v := range manifests {
		cp[k] = v
	}
	return cp
}

// AllTemplates returns all loaded templates.
func AllTemplates() map[string]*model.StepTemplate {
	templatesMu.RLock()
	defer templatesMu.RUnlock()
	cp := make(map[string]*model.StepTemplate, len(templates))
	for k, v := range templates {
		cp[k] = v
	}
	return cp
}

// Count returns the number of loaded manifests.
func Count() int {
	manifestsMu.RLock()
	defer manifestsMu.RUnlock()
	return len(manifests)
}
