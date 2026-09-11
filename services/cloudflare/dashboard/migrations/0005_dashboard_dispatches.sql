-- Product A tracking dispatches (D-047 phase 2).
--
-- One Dashboard Tracking Run covers N tracked questions. The Developer API
-- measures one prompt per call and returns all four engines for it, so a Run
-- fans out into N internal measurements — one dispatch row each.
--
-- The rows exist because the channel is asynchronous by decision: A submits,
-- gets an id back, and collects the result on a later tick. Without durable
-- rows a Worker restart would lose track of paid work already in flight.
CREATE TABLE IF NOT EXISTS dashboard_tracking_dispatches (
  dispatch_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES dashboard_tracking_jobs(job_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES dashboard_projects(project_id) ON DELETE CASCADE,
  question_set_id TEXT NOT NULL REFERENCES dashboard_question_sets(question_set_id),
  question_id TEXT NOT NULL REFERENCES dashboard_questions(question_id),
  -- Stable across retries so a resubmission cannot double-charge the channel.
  idempotency_key TEXT NOT NULL UNIQUE,
  -- The Developer API measurement id, once the submission is accepted.
  measurement_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'submitted', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  -- Engine observations mapped into the Dashboard's own shape, held until every
  -- dispatch in the Run is terminal and the Run can be written in one piece.
  observations_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dashboard_dispatches_status
  ON dashboard_tracking_dispatches(status, created_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_dispatches_job
  ON dashboard_tracking_dispatches(job_id, status);

-- A Run is assembled from its dispatches exactly once. Recording which Run a
-- job produced also stops a second assembly after a retry.
ALTER TABLE dashboard_tracking_jobs ADD COLUMN run_id TEXT;
ALTER TABLE dashboard_tracking_jobs ADD COLUMN question_set_id TEXT;
ALTER TABLE dashboard_tracking_jobs ADD COLUMN scheduled_at TEXT;
