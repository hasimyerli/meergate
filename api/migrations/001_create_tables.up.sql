CREATE TABLE IF NOT EXISTS run_sessions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  environment TEXT,
  git_ref TEXT,
  git_commit TEXT,
  jira_ref TEXT,
  created_by TEXT,
  run_tags TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL,
  suite_id TEXT,
  session_id TEXT REFERENCES run_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL DEFAULT 'mock',
  overrides TEXT,
  label TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  triggered_by TEXT,
  git_ref TEXT,
  git_commit TEXT,
  environment TEXT,
  jira_ref TEXT,
  run_tags TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE TABLE IF NOT EXISTS step_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  request_summary TEXT,
  response_summary TEXT,
  assertions TEXT,
  duration_ms INTEGER,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_result_id TEXT REFERENCES step_results(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  suite TEXT,
  tags TEXT,
  test_ids TEXT,
  mode TEXT NOT NULL DEFAULT 'mock',
  enabled INTEGER NOT NULL DEFAULT 1,
  notify_url TEXT,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
  rerun_on_fail INTEGER NOT NULL DEFAULT 0,
  max_reruns INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_test_id ON runs(test_id);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
CREATE INDEX IF NOT EXISTS idx_runs_session_id ON runs(session_id);
CREATE INDEX IF NOT EXISTS idx_runs_environment ON runs(environment);
CREATE INDEX IF NOT EXISTS idx_runs_trigger_type ON runs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_step_results_run_id ON step_results(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON run_sessions(created_at);
