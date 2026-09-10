-- Product A Dashboard tracking data. This schema is intentionally separate
-- from developer_* tables: Dashboard permissions are project memberships, not
-- Developer API tenants or API keys.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dashboard_accounts (
  account_id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('verified', 'disabled')),
  created_at TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_auth_tokens (
  token_id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('invitation')),
  email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  session_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_project_members (
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, account_id)
);

CREATE TABLE IF NOT EXISTS dashboard_tracking_plans (
  project_id TEXT PRIMARY KEY REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('weekly')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  next_run_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_question_sets (
  question_set_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS dashboard_questions (
  question_id TEXT PRIMARY KEY,
  question_set_id TEXT NOT NULL REFERENCES dashboard_question_sets(question_set_id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  intent TEXT,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_tracking_runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  question_set_id TEXT NOT NULL REFERENCES dashboard_question_sets(question_set_id),
  scheduled_at TEXT NOT NULL,
  observed_at TEXT,
  state TEXT NOT NULL CHECK (state IN ('complete', 'partial', 'failed')),
  expected_observations INTEGER NOT NULL CHECK (expected_observations >= 0),
  measured_observations INTEGER NOT NULL CHECK (measured_observations >= 0),
  unknown_observations INTEGER NOT NULL CHECK (unknown_observations >= 0),
  failed_observations INTEGER NOT NULL CHECK (failed_observations >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_observations (
  observation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES dashboard_tracking_runs(run_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES dashboard_questions(question_id),
  engine TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('measured', 'unknown', 'failed')),
  brand_mentioned INTEGER,
  official_citation INTEGER,
  raw_answer TEXT,
  citations_json TEXT NOT NULL,
  observed_at TEXT,
  failure_code TEXT,
  CHECK (brand_mentioned IS NULL OR brand_mentioned IN (0, 1)),
  CHECK (official_citation IS NULL OR official_citation IN (0, 1)),
  UNIQUE (run_id, question_id, engine)
);

CREATE TABLE IF NOT EXISTS dashboard_annotations (
  annotation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id),
  occurred_at TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_members_account ON dashboard_project_members(account_id, project_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_runs_project_observed ON dashboard_tracking_runs(project_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_observations_run ON dashboard_observations(run_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_annotations_project_time ON dashboard_annotations(project_id, occurred_at DESC);
