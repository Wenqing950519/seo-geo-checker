-- Product A Dashboard subscription, payment and orchestration state.
-- These tables intentionally never share Developer API tenants, keys or quota.

CREATE TABLE IF NOT EXISTS dashboard_entitlements (
  account_id TEXT PRIMARY KEY REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'paid_beta')),
  status TEXT NOT NULL CHECK (status IN ('active', 'grace', 'expired', 'cancel_at_period_end')),
  active_project_limit INTEGER NOT NULL,
  manual_run_limit INTEGER NOT NULL,
  period_start TEXT,
  period_end TEXT,
  grace_ends_at TEXT,
  cancel_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_subscription_periods (
  period_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('paid_beta')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  manual_run_limit INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(account_id, starts_at)
);

CREATE TABLE IF NOT EXISTS dashboard_tracking_jobs (
  job_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('scheduled', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  dedupe_key TEXT NOT NULL UNIQUE,
  reservation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_manual_run_reservations (
  reservation_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES dashboard_subscription_periods(period_id) ON DELETE CASCADE,
  day_taipei TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'charged', 'released')),
  job_id TEXT NOT NULL UNIQUE REFERENCES dashboard_tracking_jobs(job_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_payment_events (
  payment_event_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('newebpay')),
  provider_transaction_id TEXT NOT NULL,
  provider_period_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_transaction_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_jobs_account_status ON dashboard_tracking_jobs(account_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_manual_reservations_period ON dashboard_manual_run_reservations(period_id, status);
CREATE INDEX IF NOT EXISTS idx_dashboard_manual_reservations_day ON dashboard_manual_run_reservations(account_id, day_taipei, status);
