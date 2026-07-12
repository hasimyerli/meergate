-- Append-only latency/health history for the service registry (p95, uptime, trend).
CREATE TABLE IF NOT EXISTS service_health_checks (
    id         TEXT PRIMARY KEY,
    service_id TEXT NOT NULL,
    status     TEXT NOT NULL,
    latency_ms INTEGER,
    checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_health_checks_service ON service_health_checks(service_id, checked_at);
