package service

import (
	"context"
	"log/slog"

	"github.com/hasimyerli/meergate/internal/ai"
	"github.com/hasimyerli/meergate/internal/config"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
)

type AIService struct {
	cfg         *config.Config
	catalogRepo *repository.CatalogRepo
	logger      *slog.Logger
}

func NewAIService(cfg *config.Config, catalogRepo *repository.CatalogRepo, logger *slog.Logger) *AIService {
	return &AIService{cfg: cfg, catalogRepo: catalogRepo, logger: logger}
}

func (s *AIService) getCatalogEntries(ctx context.Context) []model.ServiceCatalogEntry {
	if s.catalogRepo == nil {
		return nil
	}
	entries, err := s.catalogRepo.List(ctx, "")
	if err != nil {
		s.logger.Warn("failed to load catalog for AI prompt", "err", err)
		return nil
	}
	return entries
}

func (s *AIService) IsConfigured() bool {
	switch s.cfg.AIProvider {
	case "openai":
		return s.cfg.AIAPIKey != ""
	case "anthropic":
		return s.cfg.AIAnthropicAPIKey != ""
	case "cursor-cli":
		return s.cfg.AIAPIKey != ""
	default:
		return false
	}
}

func (s *AIService) StatusInfo() map[string]interface{} {
	return map[string]interface{}{
		"configured": s.IsConfigured(),
		"provider":   s.cfg.AIProvider,
		"model":      s.cfg.AIModel,
		"apiUrl":     s.cfg.AIAPIUrl,
	}
}

func (s *AIService) Generate(ctx context.Context, prompt string, history []model.ChatMessage, aiModel string) (*model.GenerateResult, error) {
	return ai.GenerateFromPrompt(ctx, s.cfg, prompt, history, aiModel, s.getCatalogEntries(ctx))
}

func (s *AIService) Refine(ctx context.Context, yaml, prompt string, history []model.ChatMessage, aiModel string) (*model.GenerateResult, error) {
	return ai.RefineManifest(ctx, s.cfg, yaml, prompt, history, aiModel, s.getCatalogEntries(ctx))
}

func (s *AIService) DebugRun(ctx context.Context, runService *RunService, runID string) (*model.GenerateResult, error) {
	run, steps, _, err := runService.GetRun(ctx, runID)
	if err != nil {
		return nil, err
	}

	// Build debug prompt from run context
	prompt := "Analyze this failed test run and suggest fixes:\n\n"
	prompt += "Test: " + run.TestID + "\n"
	prompt += "Status: " + string(run.Status) + "\n"
	if run.Error != nil {
		prompt += "Error: " + *run.Error + "\n"
	}

	for _, step := range steps {
		if step.Status == "failed" || step.Status == "error" {
			prompt += "\nFailed Step: " + step.StepName + " (" + step.StepType + ")\n"
			if step.Error != nil {
				prompt += "Error: " + *step.Error + "\n"
			}
		}
	}

	prompt += "\nPlease analyze the errors and suggest what might be wrong and how to fix the test."

	return ai.GenerateFromPrompt(ctx, s.cfg, prompt, nil, "", s.getCatalogEntries(ctx))
}
