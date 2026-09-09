-- Global provider-spend guard. Limits are supplied by runtime policy, not baked into schema.
CREATE TABLE IF NOT EXISTS developer_cost_budget_windows (
  window_kind TEXT NOT NULL CHECK (window_kind IN ('daily', 'monthly')),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  limit_twd_micros INTEGER NOT NULL CHECK (limit_twd_micros > 0),
  reserved_twd_micros INTEGER NOT NULL DEFAULT 0 CHECK (reserved_twd_micros >= 0),
  used_twd_micros INTEGER NOT NULL DEFAULT 0 CHECK (used_twd_micros >= 0),
  PRIMARY KEY (window_kind, window_start)
);

CREATE TABLE IF NOT EXISTS developer_cost_reservations (
  job_id TEXT PRIMARY KEY REFERENCES developer_jobs(job_id),
  daily_window_start TEXT NOT NULL,
  monthly_window_start TEXT NOT NULL,
  reserved_twd_micros INTEGER NOT NULL CHECK (reserved_twd_micros > 0),
  actual_twd_micros INTEGER,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'charged', 'released', 'ambiguous')),
  created_at TEXT NOT NULL,
  settled_at TEXT
);

INSERT OR IGNORE INTO developer_schema_migrations(migration_id, applied_at)
  VALUES ('0003_cost_budget_guard', '1970-01-01T00:00:00.000Z');
