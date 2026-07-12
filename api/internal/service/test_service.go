package service

import (
	"context"
	"log/slog"

	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"gopkg.in/yaml.v3"
)

type TestService struct {
	runRepo      *repository.RunRepo
	manifestRepo *repository.ManifestRepo
	logger       *slog.Logger
}

func NewTestService(runRepo *repository.RunRepo, manifestRepo *repository.ManifestRepo, logger *slog.Logger) *TestService {
	return &TestService{runRepo: runRepo, manifestRepo: manifestRepo, logger: logger}
}

func (s *TestService) ListTests(suite, tag string) []model.TestListItem {
	all := manifest.All()
	items := make([]model.TestListItem, 0)
	for _, m := range all {
		if suite != "" && m.Suite != suite {
			continue
		}
		if tag != "" && !containsTag(m.Tags, tag) {
			continue
		}

		item := model.TestListItem{
			ID:     m.ID,
			Name:   m.Name,
			Suite:  m.Suite,
			Tags:   m.Tags,
			Params: m.Params,
		}

		lastRun, err := s.runRepo.GetLastForTest(context.Background(), m.ID)
		if err == nil && lastRun != nil {
			st := string(lastRun.Status)
			item.LastRunStatus = &st
			item.LastRunAt = &lastRun.CreatedAt
		}

		items = append(items, item)
	}
	return items
}

func (s *TestService) GetTest(id string) *model.TestManifest {
	m, _ := manifest.Get(id)
	return m
}

func (s *TestService) GetStats(testID string) (*model.TestStats, error) {
	return s.runRepo.GetStats(context.Background(), testID, 10)
}

func (s *TestService) GetAllStats() (map[string]*model.TestStats, error) {
	return s.runRepo.GetAllStats(context.Background(), 10)
}

func (s *TestService) Reload() error {
	manifest.ReloadFromDB(context.Background(), s.manifestRepo)
	return nil
}

func (s *TestService) SaveManifest(m *model.TestManifest) error {
	yamlBytes, err := yaml.Marshal(m)
	if err != nil {
		return err
	}

	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}

	if err := s.manifestRepo.Upsert(context.Background(), m.ID, m.Name, m.Suite, tags, m.Version, m.Owner, string(yamlBytes)); err != nil {
		return err
	}

	manifest.ReloadFromDB(context.Background(), s.manifestRepo)
	return nil
}

func (s *TestService) DeleteManifest(id string) error {
	if err := s.manifestRepo.Delete(context.Background(), id); err != nil {
		return err
	}
	manifest.ReloadFromDB(context.Background(), s.manifestRepo)
	return nil
}

func (s *TestService) ImportFromFiles() (int, error) {
	manifest.ReloadFromDB(context.Background(), s.manifestRepo)
	return manifest.Count(), nil
}

func containsTag(tags []string, tag string) bool {
	for _, t := range tags {
		if t == tag {
			return true
		}
	}
	return false
}
