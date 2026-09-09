-- Separate B database only. Do not run this migration against geocheck-reports (product A).
CREATE TABLE IF NOT EXISTS developer_measurement_results (
  measurement_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  expires_at TEXT,
  result_hash TEXT NOT NULL,
  result_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_developer_measurement_results_tenant_created
  ON developer_measurement_results (tenant_id, created_at DESC);
