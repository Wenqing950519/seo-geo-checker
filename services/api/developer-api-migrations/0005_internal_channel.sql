-- Internal measurement channel (D-047).
--
-- Products A (Dashboard) and C (Agent) obtain measurement through Developer API
-- rather than reimplementing the four engines. They are NOT customers: internal
-- calls consume no customer quota, never appear in customer billing, and are
-- gated by their own admission switch and their own spend budget, so a runaway
-- internal caller cannot take the customer platform down with it — or vice versa.
--
-- Internal jobs deliberately reuse developer_jobs and the existing queue, lease
-- and attempt machinery. That reuse is the whole point of D-047: provider keys,
-- retry logic and cost accounting stay in exactly one place.

-- Reserved tenants keep the developer_jobs foreign key intact while marking
-- these rows as never-billable. Customer-facing reads are tenant-scoped already,
-- so they cannot see these.
ALTER TABLE developer_tenants ADD COLUMN kind TEXT NOT NULL DEFAULT 'customer';

INSERT OR IGNORE INTO developer_tenants(tenant_id, status, created_at, kind)
  VALUES ('tnt_internal_dashboard', 'active', '1970-01-01T00:00:00.000Z', 'internal');
INSERT OR IGNORE INTO developer_tenants(tenant_id, status, created_at, kind)
  VALUES ('tnt_internal_agent', 'active', '1970-01-01T00:00:00.000Z', 'internal');

-- NULL means a customer job. Attribution is per product, so "which caller spent
-- this" is always answerable — the reason D-047 rejected one shared secret.
ALTER TABLE developer_jobs ADD COLUMN caller TEXT;
CREATE INDEX IF NOT EXISTS idx_developer_jobs_caller_created
  ON developer_jobs(caller, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_internal_callers (
  caller_id TEXT PRIMARY KEY CHECK (caller_id IN ('dashboard', 'agent')),
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  secret_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);

-- The internal kill switch is separate from admission_enabled on purpose:
-- closing the internal channel must not close the customer platform.
INSERT OR IGNORE INTO developer_runtime_controls(control_key, control_value, reason, updated_at)
  VALUES ('internal_admission_enabled', 'false', 'internal channel ships closed', '1970-01-01T00:00:00.000Z');

-- Budget windows gain a scope so internal and customer spend are capped
-- separately. SQLite cannot widen a primary key in place, so the table is
-- rebuilt; existing rows are all customer spend.
CREATE TABLE developer_cost_budget_windows_v2 (
  scope TEXT NOT NULL CHECK (scope IN ('customer', 'internal')),
  window_kind TEXT NOT NULL CHECK (window_kind IN ('daily', 'monthly')),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  limit_twd_micros INTEGER NOT NULL CHECK (limit_twd_micros > 0),
  reserved_twd_micros INTEGER NOT NULL DEFAULT 0 CHECK (reserved_twd_micros >= 0),
  used_twd_micros INTEGER NOT NULL DEFAULT 0 CHECK (used_twd_micros >= 0),
  PRIMARY KEY (scope, window_kind, window_start)
);

INSERT INTO developer_cost_budget_windows_v2
  (scope, window_kind, window_start, window_end, limit_twd_micros, reserved_twd_micros, used_twd_micros)
  SELECT 'customer', window_kind, window_start, window_end,
         limit_twd_micros, reserved_twd_micros, used_twd_micros
  FROM developer_cost_budget_windows;

DROP TABLE developer_cost_budget_windows;
ALTER TABLE developer_cost_budget_windows_v2 RENAME TO developer_cost_budget_windows;

-- A reservation must credit back the same scope it drew from.
ALTER TABLE developer_cost_reservations ADD COLUMN scope TEXT NOT NULL DEFAULT 'customer';

INSERT OR IGNORE INTO developer_schema_migrations(migration_id, applied_at)
  VALUES ('0005_internal_channel', '1970-01-01T00:00:00.000Z');
