CREATE TABLE IF NOT EXISTS test_manifests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  suite TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  owner TEXT NOT NULL DEFAULT '',
  yaml_content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
  updated_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE TABLE IF NOT EXISTS step_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  yaml_content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
  updated_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE INDEX IF NOT EXISTS idx_test_manifests_suite ON test_manifests(suite);
CREATE INDEX IF NOT EXISTS idx_test_manifests_updated ON test_manifests(updated_at);
