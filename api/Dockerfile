# API (Go backend) — build context is the REPO ROOT because this module depends
# on the sibling engine (folder `engine/`, module github.com/hasimyerli/meergine)
# via a local replace directive.
#   docker build -f api/Dockerfile .
FROM golang:1.26-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
# engine first (api/go.mod has: replace ...meergine => ../engine)
COPY engine/ engine/
COPY api/ api/
WORKDIR /src/api
RUN --mount=type=cache,target=/go/pkg/mod go mod download
RUN --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM alpine:3.21 AS runtime
# chromium + fonts for browserAction steps; ca-certificates for TLS targets.
RUN apk add --no-cache tini chromium nss freetype harfbuzz ttf-freefont ca-certificates
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV CHROME_PATH=/usr/bin/chromium-browser MIGRATIONS_PATH=./migrations
COPY --from=build --chown=app:app /server ./server
COPY --chown=app:app api/migrations/ ./migrations/
USER app
EXPOSE 3001
# The server auto-runs migrations on startup (main.go → RunMigrations).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./server"]
