-- Deploy this initial Product A D1 migration only after creating geocheck-dashboard.
-- Canonical local schema remains services/api/migrations/0003_dashboard_tracking.sql.
CREATE TABLE IF NOT EXISTS dashboard_worker_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
