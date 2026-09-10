-- Google identity and Search Console evidence remain Product A-only.
CREATE TABLE IF NOT EXISTS dashboard_google_connections (
  connection_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  property_uri TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  refresh_token_tag TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(project_id)
);

CREATE TABLE IF NOT EXISTS dashboard_gsc_sync_runs (
  sync_run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES dashboard_google_connections(connection_id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  requested_from TEXT NOT NULL,
  requested_to TEXT NOT NULL,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_gsc_daily_metrics (
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  property_uri TEXT NOT NULL,
  metric_date_pt TEXT NOT NULL,
  clicks REAL NOT NULL,
  impressions REAL NOT NULL,
  ctr REAL NOT NULL,
  average_position REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(project_id, property_uri, metric_date_pt)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_gsc_metrics_project_date
  ON dashboard_gsc_daily_metrics(project_id, metric_date_pt DESC);
