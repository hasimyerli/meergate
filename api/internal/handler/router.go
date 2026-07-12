package handler

import (
	"context"
	"log/slog"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/hasimyerli/meergate/internal/event"
	"github.com/hasimyerli/meergate/internal/middleware"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/service"
)

type Deps struct {
	AuthService        *service.AuthService
	TestService        *service.TestService
	RunService         *service.RunService
	SessionService     *service.SessionService
	ScheduleService    *service.ScheduleService
	AlertService       *service.AlertService
	AIService          *service.AIService
	BuilderService     *service.BuilderService
	NoteRepo           *repository.NoteRepo
	GRPCRegistry       *service.GRPCRegistry
	CatalogService     *service.CatalogService
	ReleaseGateService *service.ReleaseGateService
	CronManager        CronJobManager
	Hub                *event.Hub
	RunEngine          func(ctx context.Context, m *model.TestManifest, run *model.Run)
	ResumeEngine       func(ctx context.Context, m *model.TestManifest, run *model.Run, fromStep int, extractCtx map[string]interface{})
	Logger             *slog.Logger
	JWTSecret          string
}

type CronJobManager interface {
	AddJob(schedule *model.Schedule)
	RemoveJob(id string)
	RestartJob(schedule *model.Schedule)
	TriggerNow(schedule *model.Schedule)
}

func NewRouter(deps *Deps) *chi.Mux {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(middleware.Logger(deps.Logger))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	r.Use(middleware.JWTAuth(deps.JWTSecret))

	// Health
	r.Get("/health", HealthHandler(deps))

	// Auth
	r.Post("/api/auth/login", LoginHandler(deps))
	r.Get("/api/auth/me", MeHandler(deps))
	r.Post("/api/auth/logout", LogoutHandler())

	// Tests
	r.Get("/api/tests", ListTestsHandler(deps))
	r.Get("/api/tests/{id}", GetTestHandler(deps))
	r.Get("/api/tests/{id}/stats", GetTestStatsHandler(deps))
	r.Post("/api/tests/reload", ReloadTestsHandler(deps))
	r.Post("/api/tests/import", ImportTestsHandler(deps))
	r.Post("/api/tests", SaveTestHandler(deps))
	r.Put("/api/tests/{id}", SaveTestHandler(deps))
	r.Delete("/api/tests/{id}", DeleteTestHandler(deps))
	r.Get("/api/templates", ListTemplatesHandler(deps))
	r.Get("/api/environments", ListEnvironmentsHandler(deps))
	r.Get("/api/grpc/services", ListGRPCServicesHandler(deps))
	r.Get("/api/grpc/introspect", GRPCIntrospectHandler(deps))

	// Runs
	r.Post("/api/runs", CreateRunHandler(deps))
	r.Post("/api/runs/batch", BatchRunHandler(deps))
	r.Get("/api/runs", ListRunsHandler(deps))
	r.Get("/api/runs/{id}", GetRunHandler(deps))
	r.Post("/api/runs/{id}/resume", ResumeRunHandler(deps))
	r.Delete("/api/runs/{id}", DeleteRunHandler(deps))
	r.Get("/api/runs/{id}/notes", ListNotesHandler(deps.NoteRepo))
	r.Post("/api/runs/{id}/notes", CreateNoteHandler(deps.NoteRepo))
	r.Delete("/api/runs/{id}/notes/{noteId}", DeleteNoteHandler(deps.NoteRepo))

	// Sessions
	r.Get("/api/sessions", ListSessionsHandler(deps))
	r.Get("/api/sessions/{id}", GetSessionHandler(deps))
	r.Post("/api/sessions", CreateSessionHandler(deps))
	r.Put("/api/sessions/{id}", UpdateSessionHandler(deps))
	r.Delete("/api/sessions/{id}", DeleteSessionHandler(deps))

	// Schedules
	r.Get("/api/schedules", ListSchedulesHandler(deps))
	r.Post("/api/schedules", CreateScheduleHandler(deps))
	r.Put("/api/schedules/{id}", UpdateScheduleHandler(deps))
	r.Delete("/api/schedules/{id}", DeleteScheduleHandler(deps))
	r.Post("/api/schedules/{id}/trigger", TriggerScheduleHandler(deps))

	r.Get("/api/alerts", ListAlertRulesHandler(deps))
	r.Post("/api/alerts", CreateAlertRuleHandler(deps))
	r.Put("/api/alerts/{id}", UpdateAlertRuleHandler(deps))
	r.Delete("/api/alerts/{id}", DeleteAlertRuleHandler(deps))
	r.Get("/api/alert-events", ListAlertEventsHandler(deps))
	r.Post("/api/alert-events/{id}/ack", AckAlertEventHandler(deps))

	// Release gates (service-based)
	r.Get("/api/release-gates", ListGatesHandler(deps))
	r.Get("/api/release-gates/{id}", GetGateHandler(deps))
	r.Post("/api/release-gates/{id}/candidates", CreateCandidateHandler(deps))
	r.Post("/api/release-gates/{id}/baseline", MarkBaselineHandler(deps))
	r.Post("/api/release-candidates/{id}/evaluate", EvaluateCandidateHandler(deps))

	// Schema
	r.Get("/api/schema", SchemaHandler())

	// Builder
	r.Post("/api/builder/validate", ValidateBuilderHandler(deps))
	r.Post("/api/builder/save", SaveBuilderHandler(deps))
	r.Post("/api/builder/export-yaml", ExportYAMLHandler(deps))

	// Service Catalog
	r.Post("/api/catalog/sync", SyncAllCatalogHandler(deps))
	r.Post("/api/catalog/sync/{id}", SyncOneCatalogHandler(deps))
	r.Get("/api/catalog", ListCatalogHandler(deps))
	r.Get("/api/catalog/{id}", GetCatalogEntryHandler(deps))
	r.Post("/api/catalog/targets", AddCatalogTargetHandler(deps))
	r.Post("/api/catalog/discover", DiscoverCatalogTargetHandler(deps))
	r.Get("/api/catalog/coverage", CoverageCatalogHandler(deps))
	r.Get("/api/catalog/{id}/health-history", HealthHistoryCatalogHandler(deps))
	r.Post("/api/catalog/preview", PreviewCatalogHandler(deps))
	r.Post("/api/catalog/health", HealthCheckCatalogHandler(deps))
	r.Post("/api/catalog/{id}/invoke", InvokeCatalogHandler(deps))
	r.Delete("/api/catalog/targets/{id}", DeleteCatalogTargetHandler(deps))
	r.Delete("/api/catalog/targets", DeleteCatalogTargetHandler(deps))
	r.Post("/api/catalog/import", ImportCatalogHandler(deps))

	// AI
	r.Get("/api/ai/status", AIStatusHandler(deps))
	r.Post("/api/ai/generate", AIGenerateHandler(deps))
	r.Post("/api/ai/refine", AIRefineHandler(deps))
	r.Post("/api/ai/debug", AIDebugHandler(deps))
	r.Post("/api/ai/save", AISaveHandler(deps))

	return r
}
