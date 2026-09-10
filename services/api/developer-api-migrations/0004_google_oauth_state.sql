-- Product B OAuth PKCE state only. It never stores Google access/refresh tokens.
-- A Dashboard OAuth/GSC state belongs to the Dashboard persistence boundary.
CREATE TABLE IF NOT EXISTS developer_google_oauth_states (
  state_id TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience = 'developer'),
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_developer_google_oauth_states_expires
  ON developer_google_oauth_states(expires_at);

INSERT OR IGNORE INTO developer_schema_migrations(migration_id, applied_at)
  VALUES ('0004_google_oauth_state', '1970-01-01T00:00:00.000Z');
