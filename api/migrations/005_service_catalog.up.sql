CREATE TABLE IF NOT EXISTS service_catalog (
    id         TEXT PRIMARY KEY,
    protocol   TEXT NOT NULL CHECK (protocol IN ('grpc', 'rest')),
    name       TEXT NOT NULL,
    target     TEXT NOT NULL,
    domain     TEXT NOT NULL DEFAULT '',
    config     JSONB NOT NULL DEFAULT '{}',
    catalog    JSONB,
    synced_at  TEXT,
    sync_error TEXT,
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE INDEX IF NOT EXISTS idx_catalog_protocol ON service_catalog(protocol);
CREATE INDEX IF NOT EXISTS idx_catalog_domain ON service_catalog(domain);
