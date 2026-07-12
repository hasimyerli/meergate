ALTER TABLE test_manifests ADD COLUMN IF NOT EXISTS deleted_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_test_manifests_deleted ON test_manifests(deleted_at);
