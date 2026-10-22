-- Bounds unauthenticated URL probes and lead writes before they use external resources.
CREATE TABLE IF NOT EXISTS audit_request_admissions (
  request_id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_request_admissions_time ON audit_request_admissions(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_request_admissions_client_time ON audit_request_admissions(client_key, created_at);
