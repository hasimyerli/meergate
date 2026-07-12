package service

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"gopkg.in/yaml.v3"
)

var (
	validIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

	validStepTypes = map[string]bool{
		"apiCall":       true,
		"grpcCall":      true,
		"wsSubscribe":   true,
		"browserAction": true,
		"waitUntil":     true,
		"assert":        true,
	}
	validHTTPMethods = map[string]bool{
		"GET": true, "POST": true, "PUT": true, "DELETE": true, "PATCH": true,
	}
	validBrowserActions = map[string]bool{
		"navigate": true, "click": true, "fill": true, "select": true,
		"hover": true, "press": true, "screenshot": true, "waitFor": true,
		"waitForSelector": true, "extractText": true,
	}
	validAssertionTypes = map[string]bool{
		"statusCode": true, "grpcStatus": true, "jsonPath": true,
		"jsonPathIncludes": true, "jsonPathNotIncludes": true,
		"greaterThan": true, "lessThan": true, "nonEmpty": true,
		"contains": true, "wsMessageReceived": true, "jsonSchema": true,
	}
)

type BuilderService struct {
	manifestRepo *repository.ManifestRepo
	logger       *slog.Logger
}

func NewBuilderService(manifestRepo *repository.ManifestRepo, logger *slog.Logger) *BuilderService {
	return &BuilderService{manifestRepo: manifestRepo, logger: logger}
}

func (s *BuilderService) Validate(m *model.TestManifest) []string {
	var errs []string

	if m.ID == "" {
		errs = append(errs, "id is required")
	} else if !validIDPattern.MatchString(m.ID) {
		errs = append(errs, "id must be lowercase alphanumeric with dashes (e.g. my-test-id)")
	}

	if m.Name == "" {
		errs = append(errs, "name is required")
	}

	if m.Config.TimeoutMs < 0 {
		errs = append(errs, "config.timeout_ms must be >= 0")
	}
	if m.Config.Retries < 0 {
		errs = append(errs, "config.retries must be >= 0")
	}

	if len(m.Steps) == 0 {
		errs = append(errs, "at least one step is required")
	}

	allStepNames := make(map[string]bool)
	validateSteps := func(prefix string, steps []model.TestStep) {
		for i, step := range steps {
			label := fmt.Sprintf("%s[%d]", prefix, i)
			if step.Name == "" {
				errs = append(errs, label+": name is required")
			} else if allStepNames[step.Name] {
				errs = append(errs, label+fmt.Sprintf(": duplicate step name %q", step.Name))
			} else {
				allStepNames[step.Name] = true
			}

			if step.Type == "" && step.Use == "" {
				errs = append(errs, label+": type is required (or use a template via 'use')")
			} else if step.Type != "" && !validStepTypes[step.Type] {
				errs = append(errs, label+fmt.Sprintf(": invalid type %q, must be one of: %s", step.Type, strings.Join(stepTypeList(), ", ")))
			}

			switch step.Type {
			case "apiCall":
				if step.Method != "" && !validHTTPMethods[step.Method] {
					errs = append(errs, label+fmt.Sprintf(": invalid method %q", step.Method))
				}
				if step.Path == "" && step.Use == "" {
					errs = append(errs, label+": path is required for apiCall")
				}
			case "grpcCall":
				if step.Service == "" && step.Use == "" {
					errs = append(errs, label+": service is required for grpcCall")
				}
				if step.RPCMethod == "" && step.Use == "" {
					errs = append(errs, label+": rpcMethod is required for grpcCall")
				}
			case "wsSubscribe":
				if step.Channel == "" && step.Use == "" {
					errs = append(errs, label+": channel is required for wsSubscribe")
				}
			case "browserAction":
				if step.Action == "" {
					errs = append(errs, label+": action is required for browserAction")
				} else if !validBrowserActions[step.Action] {
					errs = append(errs, label+fmt.Sprintf(": invalid browser action %q", step.Action))
				}
				if step.Action == "navigate" && step.URL == "" {
					errs = append(errs, label+": url is required for navigate action")
				}
			}

			for j, a := range step.Assert {
				alabel := fmt.Sprintf("%s.assert[%d]", label, j)
				if a.Type == "" {
					errs = append(errs, alabel+": type is required")
				} else if !validAssertionTypes[a.Type] {
					errs = append(errs, alabel+fmt.Sprintf(": invalid assertion type %q", a.Type))
				}
			}

			for _, dep := range step.DependsOn {
				if !allStepNames[dep] {
					errs = append(errs, label+fmt.Sprintf(": dependsOn references unknown step %q", dep))
				}
			}
		}
	}

	validateSteps("setup", m.Setup)
	validateSteps("step", m.Steps)
	validateSteps("teardown", m.Teardown)

	return errs
}

func stepTypeList() []string {
	out := make([]string, 0, len(validStepTypes))
	for k := range validStepTypes {
		out = append(out, k)
	}
	return out
}

func (s *BuilderService) Save(m *model.TestManifest) error {
	data, err := yaml.Marshal(m)
	if err != nil {
		return err
	}

	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}

	if err := s.manifestRepo.Upsert(context.Background(), m.ID, m.Name, m.Suite, tags, m.Version, m.Owner, string(data)); err != nil {
		return err
	}

	manifest.ReloadFromDB(context.Background(), s.manifestRepo)
	return nil
}

func (s *BuilderService) ExportYAML(m *model.TestManifest) (string, error) {
	data, err := yaml.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
