CREATE TABLE IF NOT EXISTS audit_reports (
  report_id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL,
  site_origin TEXT NOT NULL,
  query_mode TEXT NOT NULL,
  query_set_version TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  stored_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  report_hash TEXT NOT NULL,
  report_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_cache_expiry
  ON audit_reports (cache_key, expires_at, created_at DESC);
