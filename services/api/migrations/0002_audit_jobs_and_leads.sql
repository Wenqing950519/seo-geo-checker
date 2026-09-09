CREATE TABLE IF NOT EXISTS audit_jobs (
  job_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  site_url TEXT NOT NULL,
  custom_queries_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'completed_with_limitations', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at TEXT,
  error_code TEXT,
  diagnostics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_status_created ON audit_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_report_id ON audit_jobs(report_id);

CREATE TABLE IF NOT EXISTS audit_leads (
  lead_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  site_url TEXT NOT NULL,
  need TEXT NOT NULL,
  interest TEXT NOT NULL,
  source TEXT NOT NULL,
  report_id TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_leads_created_at ON audit_leads(created_at DESC);
