-- Research access is explicit, revocable and never a customer entitlement.
CREATE TABLE developer_mcp_research_grants (
  principal_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT
);
ALTER TABLE developer_jobs ADD COLUMN mcp_principal_id TEXT REFERENCES developer_mcp_research_grants(principal_id);
ALTER TABLE developer_jobs ADD COLUMN study_id TEXT;
CREATE UNIQUE INDEX idx_developer_mcp_one_active_job ON developer_jobs(mcp_principal_id)
  WHERE mcp_principal_id IS NOT NULL AND status IN ('queued', 'running');
CREATE INDEX idx_developer_mcp_jobs ON developer_jobs(mcp_principal_id, created_at DESC);
INSERT INTO developer_runtime_controls(control_key, control_value, reason, updated_at)
  VALUES ('mcp_admission_enabled', 'false', 'research MCP ships closed', '1970-01-01T00:00:00.000Z');
INSERT OR IGNORE INTO developer_schema_migrations(migration_id, applied_at)
  VALUES ('0006_mcp_research', '1970-01-01T00:00:00.000Z');
