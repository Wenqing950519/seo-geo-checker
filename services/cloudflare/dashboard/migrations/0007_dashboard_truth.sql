-- Product A Brand Truth evidence and review data. Logical namespace is separate
-- from existing tracking, while foreign keys keep it in the same Project D1.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dashboard_truth_project_state (
  project_id TEXT PRIMARY KEY REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  readiness TEXT NOT NULL CHECK (readiness IN ('sources_pending', 'baseline_pending', 'ready')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_truth_sources (
  source_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('website', 'google_maps', 'facebook')),
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'partial', 'failed')),
  fetched_at TEXT,
  content_hash TEXT,
  metadata_json TEXT NOT NULL,
  snippets_json TEXT NOT NULL,
  candidate_fields_json TEXT NOT NULL,
  failure_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, canonical_url)
);

CREATE TABLE IF NOT EXISTS dashboard_truth_baselines (
  baseline_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL,
  branch_name TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  fields_json TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed')),
  confirmed_by TEXT NOT NULL REFERENCES dashboard_accounts(account_id),
  confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, branch_id, version)
);

CREATE TABLE IF NOT EXISTS dashboard_truth_baseline_sources (
  baseline_id TEXT NOT NULL REFERENCES dashboard_truth_baselines(baseline_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES dashboard_truth_sources(source_id),
  canonical_url TEXT NOT NULL,
  content_hash TEXT,
  snippets_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  PRIMARY KEY (baseline_id, source_id)
);

CREATE TABLE IF NOT EXISTS dashboard_truth_check_runs (
  check_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  baseline_id TEXT NOT NULL REFERENCES dashboard_truth_baselines(baseline_id),
  engine_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed')),
  parser_version TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES dashboard_accounts(account_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_truth_claims (
  claim_id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES dashboard_truth_check_runs(check_id) ON DELETE CASCADE,
  observation_id TEXT,
  engine TEXT NOT NULL CHECK (engine IN ('openai', 'gemini', 'anthropic', 'perplexity')),
  model TEXT,
  field_name TEXT NOT NULL CHECK (field_name IN ('address', 'phone', 'hours')),
  claim_value TEXT,
  claim_text TEXT NOT NULL,
  entity_match TEXT NOT NULL CHECK (entity_match IN ('same', 'different', 'unknown')),
  condition_json TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_truth_findings (
  finding_id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES dashboard_truth_check_runs(check_id) ON DELETE CASCADE,
  claim_id TEXT REFERENCES dashboard_truth_claims(claim_id) ON DELETE SET NULL,
  baseline_id TEXT NOT NULL REFERENCES dashboard_truth_baselines(baseline_id),
  field_name TEXT NOT NULL CHECK (field_name IN ('address', 'phone', 'hours')),
  status TEXT NOT NULL CHECK (status IN ('supported', 'contradiction', 'insufficient', 'not_mentioned', 'failed')),
  severity TEXT NOT NULL CHECK (severity IN ('green', 'yellow', 'red', 'gray')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  evidence_json TEXT NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'accepted', 'rejected', 'needs_data')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_truth_reviews (
  review_id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES dashboard_truth_findings(finding_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES dashboard_accounts(account_id),
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected', 'needs_data')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_truth_sources_project ON dashboard_truth_sources(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_truth_baselines_project ON dashboard_truth_baselines(project_id, branch_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_truth_baseline_sources_baseline ON dashboard_truth_baseline_sources(baseline_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_truth_checks_project ON dashboard_truth_check_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_truth_claims_check ON dashboard_truth_claims(check_id, engine, field_name);
CREATE INDEX IF NOT EXISTS idx_dashboard_truth_findings_check ON dashboard_truth_findings(check_id, severity, review_status);
CREATE INDEX IF NOT EXISTS idx_dashboard_truth_reviews_finding ON dashboard_truth_reviews(finding_id, created_at DESC);
