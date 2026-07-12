CREATE TABLE IF NOT EXISTS alert_rules (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    scope_type  TEXT NOT NULL DEFAULT 'all',   -- all | test | suite | environment
    scope_value TEXT,                          -- null when scope_type='all'
    condition   TEXT NOT NULL,                 -- run_failed | pass_rate_below | avg_duration_above | consecutive_failures
    threshold   DOUBLE PRECISION,              -- percent | ms | N ; null for run_failed
    window_n    INTEGER NOT NULL DEFAULT 20,
    created_at  TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE TABLE IF NOT EXISTS alert_events (
    id           TEXT PRIMARY KEY,
    rule_id      TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    rule_name    TEXT NOT NULL,
    run_id       TEXT REFERENCES runs(id) ON DELETE SET NULL,
    test_id      TEXT NOT NULL,
    message      TEXT NOT NULL,
    severity     TEXT NOT NULL DEFAULT 'warning',  -- warning | critical
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE INDEX IF NOT EXISTS idx_alert_events_ack  ON alert_events(acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_rule ON alert_events(rule_id);

-- At most one OPEN (unacknowledged) incident per rule; makes the app-level
-- dedup race-safe under concurrent detached RunTest goroutines.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_events_open ON alert_events(rule_id) WHERE acknowledged = 0;
