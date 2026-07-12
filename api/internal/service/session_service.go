package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/util"
)

type SessionService struct {
	sessionRepo *repository.SessionRepo
	runRepo     *repository.RunRepo
	logger      *slog.Logger
}

func NewSessionService(sessionRepo *repository.SessionRepo, runRepo *repository.RunRepo, logger *slog.Logger) *SessionService {
	return &SessionService{sessionRepo: sessionRepo, runRepo: runRepo, logger: logger}
}

func (s *SessionService) Create(ctx context.Context, label, environment, gitRef, gitCommit, jiraRef, createdBy, runTags string) (*model.RunSession, error) {
	session := &model.RunSession{
		ID:          util.GenerateSessionID(),
		Label:       label,
		Environment: strPtrSession(environment),
		GitRef:      strPtrSession(gitRef),
		GitCommit:   strPtrSession(gitCommit),
		JiraRef:     strPtrSession(jiraRef),
		CreatedBy:   strPtrSession(createdBy),
		RunTags:     strPtrSession(runTags),
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *SessionService) Get(ctx context.Context, id string) (*model.RunSession, []*model.Run, *model.RunSessionSummary, error) {
	session, err := s.sessionRepo.GetByID(ctx, id)
	if err != nil {
		return nil, nil, nil, err
	}

	runs, err := s.runRepo.GetForSession(ctx, id)
	if err != nil {
		return session, nil, nil, err
	}

	summary, err := s.sessionRepo.ComputeSummary(ctx, id)
	if err != nil {
		return session, runs, nil, err
	}

	session.Summary = summary
	return session, runs, summary, nil
}

func (s *SessionService) List(ctx context.Context, limit, offset int) (*repository.ListSessionsResult, error) {
	result, err := s.sessionRepo.List(ctx, limit, offset)
	if err != nil {
		return nil, err
	}

	for _, sess := range result.Sessions {
		summary, err := s.sessionRepo.ComputeSummary(ctx, sess.ID)
		if err == nil {
			sess.Summary = summary
		}
	}

	return result, nil
}

func (s *SessionService) Update(ctx context.Context, id string, updates repository.SessionUpdates) error {
	return s.sessionRepo.Update(ctx, id, updates)
}

func (s *SessionService) Delete(ctx context.Context, id string) error {
	return s.sessionRepo.Delete(ctx, id)
}

func strPtrSession(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
