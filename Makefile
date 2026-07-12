# MeerGate monorepo — root orchestrator.
# Each project lives in its own folder with its own Makefile/Dockerfile and can
# run standalone; these targets bring the whole stack up together.
.PHONY: up down logs rebuild db db-down dev test tidy

# ── Full stack (Docker) ────────────────────────────────────────────────────────
# up: postgres + api (:3001) + web (:3000) + mock-exchange (:4010), all built.
up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

rebuild:
	docker compose build --no-cache

# ── Local dev (no Docker for api/web) ──────────────────────────────────────────
# db: just PostgreSQL via compose.dev.yml, waits until ready.
db:
	docker compose -f compose.dev.yml up -d
	@echo "PostgreSQL bekleniyor..."
	@until docker exec meergate-db-dev pg_isready -U postgres -d test_automation >/dev/null 2>&1; do sleep 1; done
	@echo "PostgreSQL hazır."

db-down:
	docker compose -f compose.dev.yml down

# dev: db + api (:3001) + web (:3000) + mock-exchange (:4010) locally. Ctrl+C stops all.
dev: db
	@echo "api :3001 + web :3000 + mock-exchange :4010 (Ctrl+C ile durur)"
	@trap 'kill 0' EXIT INT TERM; \
	(cd api && go run ./cmd/server) & \
	(cd web && pnpm dev) & \
	(cd mock-exchange && PORT=4010 go run .) & \
	wait

# ── Cross-module checks ────────────────────────────────────────────────────────
test:
	cd engine && go test ./...
	cd api && go test ./...
	cd mock-exchange && go test ./...

tidy:
	cd engine && go mod tidy
	cd api && go mod tidy
	cd mock-exchange && go mod tidy
