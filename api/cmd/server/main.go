package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hasimyerli/meergate/internal/config"
	"github.com/hasimyerli/meergate/internal/engine"
	"github.com/hasimyerli/meergate/internal/event"
	"github.com/hasimyerli/meergate/internal/handler"
	"github.com/hasimyerli/meergate/internal/manifest"
	"github.com/hasimyerli/meergate/internal/model"
	"github.com/hasimyerli/meergate/internal/repository"
	"github.com/hasimyerli/meergate/internal/scheduler"
	"github.com/hasimyerli/meergate/internal/service"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	pool, err := repository.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := repository.RunMigrations(context.Background(), pool, cfg.MigrationsPath); err != nil {
		logger.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	// Repositories
	runRepo := repository.NewRunRepo(pool)
	stepRepo := repository.NewStepRepo(pool)
	artifactRepo := repository.NewArtifactRepo(pool)
	sessionRepo := repository.NewSessionRepo(pool)
	scheduleRepo := repository.NewScheduleRepo(pool)
	userRepo := repository.NewUserRepo(pool)
	manifestRepo := repository.NewManifestRepo(pool)

	noteRepo := repository.NewNoteRepo(pool)
	catalogRepo := repository.NewCatalogRepo(pool)
	alertRuleRepo := repository.NewAlertRuleRepo(pool)
	alertEventRepo := repository.NewAlertEventRepo(pool)
	releaseGateRepo := repository.NewReleaseGateRepo(pool)

	// Load manifests from DB (no file-based seeding)
	manifest.LoadFromDB(context.Background(), manifestRepo)
	logger.Info("manifests loaded", "count", manifest.Count())

	// Services
	authService := service.NewAuthService(userRepo, cfg.JWTSecret, logger)
	testService := service.NewTestService(runRepo, manifestRepo, logger)
	runService := service.NewRunService(runRepo, stepRepo, artifactRepo, logger)
	sessionService := service.NewSessionService(sessionRepo, runRepo, logger)
	scheduleService := service.NewScheduleService(scheduleRepo, logger)
	aiService := service.NewAIService(cfg, catalogRepo, logger)
	builderService := service.NewBuilderService(manifestRepo, logger)
	catalogService := service.NewCatalogService(catalogRepo, logger)
	alertService := service.NewAlertService(alertRuleRepo, alertEventRepo, runRepo, logger)

	// gRPC Registry — reads from service_catalog DB table
	grpcRegistry := service.NewGRPCRegistry(catalogRepo, logger)

	// Seed the admin user from env. The password must come from
	// DEFAULT_ADMIN_PASSWORD — no insecure built-in default. If it is unset we
	// skip seeding (existing users are untouched) so we never create an
	// admin with a weak/empty password.
	if cfg.DefaultAdminPass == "" {
		logger.Warn("DEFAULT_ADMIN_PASSWORD not set — skipping admin seed; set it and restart to create the admin")
	} else if err := authService.SeedDefaultAdmin(context.Background(), cfg.DefaultAdminUser, cfg.DefaultAdminPass); err != nil {
		logger.Error("failed to seed admin", "error", err)
	}

	// Event Hub for cinema mode WebSocket
	hub := event.NewHub(logger)
	hub.StartCleanup(context.Background())

	// Engine
	runner := engine.NewRunner(cfg, runRepo, stepRepo, artifactRepo, catalogRepo, hub, logger)
	runner.SetAlertEvaluator(alertService)
	catalogService.SetDriftAlerter(alertService)

	// Release gate service runs a service's protection tests synchronously to
	// evaluate a candidate against its baseline (needs the runner).
	releaseGateService := service.NewReleaseGateService(releaseGateRepo, runRepo, runService, catalogService, runner.RunTest, logger)

	// Scheduler
	cronManager := scheduler.NewCronManager(scheduleRepo, runRepo, func(ctx context.Context, manifests []*model.TestManifest, schedule *model.Schedule) {
		runCtx := &model.RunContext{
			Trigger: "scheduled",
		}
		for _, m := range manifests {
			run, err := runService.CreateRun(ctx, m.ID, m.Suite, schedule.Mode, schedule.SessionID, nil, runCtx)
			if err != nil {
				logger.Error("failed to create run for schedule", "test_id", m.ID, "error", err)
				continue
			}
			go runner.RunTest(ctx, m, run)
		}
	}, logger)

	if err := cronManager.Init(context.Background()); err != nil {
		logger.Error("failed to init scheduler", "error", err)
	}
	defer cronManager.Stop()

	// Background health monitor for the service catalog.
	healthCtx, stopHealth := context.WithCancel(context.Background())
	defer stopHealth()
	go catalogService.StartHealthMonitor(healthCtx, 10*time.Minute)

	// Router
	deps := &handler.Deps{
		AuthService:        authService,
		TestService:        testService,
		RunService:         runService,
		SessionService:     sessionService,
		ScheduleService:    scheduleService,
		AlertService:       alertService,
		AIService:          aiService,
		BuilderService:     builderService,
		NoteRepo:           noteRepo,
		GRPCRegistry:       grpcRegistry,
		CatalogService:     catalogService,
		ReleaseGateService: releaseGateService,
		CronManager:        cronManager,
		Hub:                hub,
		RunEngine: func(ctx context.Context, m *model.TestManifest, run *model.Run) {
			runner.RunTest(ctx, m, run)
		},
		ResumeEngine: func(ctx context.Context, m *model.TestManifest, run *model.Run, fromStep int, extractCtx map[string]interface{}) {
			runner.ResumeTest(ctx, m, run, fromStep, extractCtx)
		},
		Logger:    logger,
		JWTSecret: cfg.JWTSecret,
	}

	router := handler.NewRouter(deps)

	// Wrap router to intercept WebSocket upgrades before Chi middleware.
	// Chi's Recoverer/Logger wrap ResponseWriter, breaking http.Hijacker
	// which nhooyr.io/websocket needs for the upgrade handshake.
	wsHandler := handler.RunWebSocketHandler(hub, logger)
	topHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") == "websocket" {
			wsHandler(w, r)
			return
		}
		router.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf("%s:%d", cfg.APIHost, cfg.APIPort)
	srv := &http.Server{
		Addr:    addr,
		Handler: topHandler,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info("server starting", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-quit
	logger.Info("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("server shutdown error", "error", err)
	}

	logger.Info("server stopped")
}
