-- Developer API B database only. Never apply to product A's geocheck-reports D1.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS developer_tenants (
  tenant_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS developer_accounts (
  account_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  email_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('verified', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_developer_accounts_tenant ON developer_accounts(tenant_id);

CREATE TABLE IF NOT EXISTS developer_auth_tokens (
  token_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('invitation', 'login')),
  email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  encrypted_token TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_developer_auth_tokens_email_purpose
  ON developer_auth_tokens(email_normalized, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_management_sessions (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_developer_sessions_tenant ON developer_management_sessions(tenant_id);

CREATE TABLE IF NOT EXISTS developer_api_keys (
  key_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_developer_api_keys_tenant_created
  ON developer_api_keys(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_entitlements (
  tenant_id TEXT PRIMARY KEY REFERENCES developer_tenants(tenant_id),
  plan TEXT NOT NULL CHECK (plan IN ('free', 'basic', 'premium')),
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'expired', 'suspended')),
  activated_at TEXT NOT NULL,
  expires_at TEXT,
  quota_window_strategy TEXT NOT NULL,
  rounds_per_window INTEGER NOT NULL CHECK (rounds_per_window >= 0)
);

CREATE TABLE IF NOT EXISTS developer_quota_windows (
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  round_limit INTEGER NOT NULL CHECK (round_limit >= 0),
  used_rounds INTEGER NOT NULL DEFAULT 0 CHECK (used_rounds >= 0),
  reserved_rounds INTEGER NOT NULL DEFAULT 0 CHECK (reserved_rounds >= 0),
  PRIMARY KEY (tenant_id, window_start)
);

CREATE TABLE IF NOT EXISTS developer_jobs (
  job_id TEXT PRIMARY KEY,
  measurement_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  content_deleted_at TEXT,
  error_code TEXT,
  worker_id TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_developer_jobs_tenant_created ON developer_jobs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_developer_jobs_status_created ON developer_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS developer_quota_reservations (
  reservation_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES developer_jobs(job_id),
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  window_start TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'charged', 'released')),
  created_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS developer_provider_attempts (
  attempt_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES developer_jobs(job_id),
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  profile_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'ambiguous')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  usage_json TEXT,
  cost_json TEXT,
  UNIQUE (job_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_developer_attempts_job ON developer_provider_attempts(job_id);

CREATE TABLE IF NOT EXISTS developer_cost_events (
  cost_event_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES developer_jobs(job_id),
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  amount_min_usd REAL,
  amount_max_usd REAL,
  has_unknown_cost INTEGER NOT NULL CHECK (has_unknown_cost IN (0, 1)),
  amount_twd_micros INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (job_id)
);

CREATE TABLE IF NOT EXISTS developer_security_events (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_developer_security_events_created
  ON developer_security_events(created_at DESC);

CREATE TABLE IF NOT EXISTS developer_runtime_controls (
  control_key TEXT PRIMARY KEY,
  control_value TEXT NOT NULL,
  reason TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO developer_runtime_controls(control_key, control_value, reason, updated_at)
  VALUES ('admission_enabled', 'true', 'initial default', '1970-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS developer_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT OR IGNORE INTO developer_schema_migrations(migration_id, applied_at)
  VALUES ('0002_platform_foundation', '1970-01-01T00:00:00.000Z');
