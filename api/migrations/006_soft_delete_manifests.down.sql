DROP INDEX IF EXISTS idx_test_manifests_deleted;
ALTER TABLE test_manifests DROP COLUMN IF EXISTS deleted_at;
