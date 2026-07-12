# API (Go backend). Needs PostgreSQL (DATABASE_URL) — use the root `make db`
# or root `make up` for the full stack.
.PHONY: build run dev test lint tidy migrate docker

BINARY=server

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o $(BINARY) ./cmd/server

run: build
	./$(BINARY)

dev:
	go run ./cmd/server

test:
	go test ./...

lint:
	golangci-lint run ./...

tidy:
	go mod tidy

migrate:
	go run ./cmd/server -migrate

docker:
	docker build -f Dockerfile -t meergate-api ..
