-- Pending Search Console property choices.
--
-- Connecting GSC is two steps: Google calls back with a refresh token and the
-- properties matching the Project's domain, then the user picks one. Those two
-- requests land in different Worker isolates, so the intermediate state cannot
-- live in memory.
--
-- The record holds a Google refresh token and the session allowed to spend it,
-- so it is stored as one encrypted payload under the same key that protects a
-- stored connection — never in clear text. Rows are short lived, deleted as soon
-- as the choice is made, and swept on the next write.
CREATE TABLE IF NOT EXISTS dashboard_gsc_pending_connections (
  pending_id TEXT PRIMARY KEY,
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_tag TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_gsc_pending_expires
  ON dashboard_gsc_pending_connections(expires_at);
