-- Service-based release gates: release candidates and per-service baselines.
-- Idempotent (runner re-applies every .up.sql on startup, no tracking table).

CREATE TABLE IF NOT EXISTS release_candidates (
    id             TEXT PRIMARY KEY,
    service_id     TEXT NOT NULL,
    label          TEXT NOT NULL DEFAULT '',
    target_version TEXT NOT NULL DEFAULT '',
    environment    TEXT NOT NULL DEFAULT '',
    git_ref        TEXT NOT NULL DEFAULT '',
    git_commit     TEXT NOT NULL DEFAULT '',
    pr_ref         TEXT NOT NULL DEFAULT '',
    issue_ref      TEXT NOT NULL DEFAULT '',
    change_summary TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'draft', -- draft | evaluating | ready | blocked
    scope_json     JSONB NOT NULL DEFAULT '[]',   -- array of test ids in the gate scope
    results_json   JSONB NOT NULL DEFAULT '[]',   -- array of {test_id, run_id, status} snapshots
    created_at     TEXT NOT NULL DEFAULT NOW()::TEXT,
    updated_at     TEXT NOT NULL DEFAULT NOW()::TEXT
);

CREATE INDEX IF NOT EXISTS idx_release_candidates_service ON release_candidates(service_id, created_at);

CREATE TABLE IF NOT EXISTS service_baselines (
    id           TEXT PRIMARY KEY,
    service_id   TEXT NOT NULL,
    candidate_id TEXT NOT NULL DEFAULT '',
    label        TEXT NOT NULL DEFAULT '',
    results_json JSONB NOT NULL DEFAULT '[]', -- array of {test_id, run_id, status} of the good release
    created_at   TEXT NOT NULL DEFAULT NOW()::TEXT
);

CREATE INDEX IF NOT EXISTS idx_service_baselines_service ON service_baselines(service_id, created_at);
