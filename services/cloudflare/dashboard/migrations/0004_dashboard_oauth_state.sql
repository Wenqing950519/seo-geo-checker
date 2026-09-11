-- Product A Dashboard OAuth PKCE state only. It never stores Google access or
-- refresh tokens: a Search Console refresh token is encrypted into
-- dashboard_google_connections after the user picks a property.
--
-- State must outlive a single Worker isolate, so it cannot live in memory.
-- This table is Dashboard-owned and is never shared with developer_* state.
CREATE TABLE IF NOT EXISTS dashboard_google_oauth_states (
  state_id TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('dashboard', 'gsc')),
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  -- Only the 'gsc' audience carries these: the signed-in session asking to
  -- connect a property, and the Project the property will be attached to.
  session_token TEXT,
  project_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_google_oauth_states_expires
  ON dashboard_google_oauth_states(expires_at);
