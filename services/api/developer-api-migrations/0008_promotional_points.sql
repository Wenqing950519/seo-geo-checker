-- Developer API B database only. Gifted (promotional) points, following the
-- points rules in /terms#points: a gift states its expiry when it is granted,
-- lapses unused at that time, is never refundable, and is spent before paid
-- points, soonest expiry first.
--
-- developer_point_ledger (0007) stays the paid-points ledger, so its signed
-- sum is still exactly the refundable balance. Gifts live here instead and
-- carry their own remaining balance.
PRAGMA foreign_keys = ON;

-- One row per claim. UNIQUE (tenant_id, mode, promotion_id) is what limits a
-- tenant to one claim per campaign; the claim statement also counts rows to
-- enforce the campaign's capacity in the same write.
CREATE TABLE IF NOT EXISTS developer_point_grants (
  grant_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  promotion_id TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  remaining_points INTEGER NOT NULL CHECK (remaining_points >= 0 AND remaining_points <= points),
  granted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (tenant_id, mode, promotion_id)
);
CREATE INDEX IF NOT EXISTS idx_developer_point_grants_spend
  ON developer_point_grants(tenant_id, mode, expires_at);
CREATE INDEX IF NOT EXISTS idx_developer_point_grants_promotion
  ON developer_point_grants(promotion_id, mode);

-- What each measurement took from each gift, so a failed observation returns
-- exactly that amount to the same gift, once (released_at).
CREATE TABLE IF NOT EXISTS developer_point_grant_uses (
  job_id TEXT NOT NULL,
  grant_id TEXT NOT NULL REFERENCES developer_point_grants(grant_id),
  points INTEGER NOT NULL CHECK (points > 0),
  created_at TEXT NOT NULL,
  released_at TEXT,
  PRIMARY KEY (job_id, grant_id)
);
