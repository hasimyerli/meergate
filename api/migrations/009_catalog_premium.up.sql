-- Premium Service Catalog: health, latency and schema-drift tracking.
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS health_status  TEXT;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS latency_ms     INTEGER;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS last_health_at TEXT;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS drift_summary  TEXT;
