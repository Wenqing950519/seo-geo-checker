-- Developer API B database only. Prepaid points bought through Portaly Payment (LSL-D-003).
-- Test-mode and live-mode rows share tables but never share a balance: every
-- order and ledger entry carries the mode of the Portaly key that produced it.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS developer_point_orders (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  merchant_order_number TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount_twd INTEGER NOT NULL CHECK (amount_twd > 0),
  status TEXT NOT NULL CHECK (status IN ('created', 'completed', 'failed', 'review')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  completed_at TEXT,
  failure_reason TEXT,
  payment_reference TEXT
);
CREATE INDEX IF NOT EXISTS idx_developer_point_orders_tenant
  ON developer_point_orders(tenant_id, created_at DESC);

-- The signed sum of points per tenant and mode is the balance. One purchase
-- entry per Portaly session; per-observation charges are not wired yet.
CREATE TABLE IF NOT EXISTS developer_point_ledger (
  entry_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES developer_tenants(tenant_id),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  kind TEXT NOT NULL CHECK (kind IN ('purchase', 'charge', 'refund', 'adjustment')),
  points INTEGER NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (kind, reference)
);
CREATE INDEX IF NOT EXISTS idx_developer_point_ledger_tenant
  ON developer_point_ledger(tenant_id, mode, created_at DESC);

-- Verified Portaly callbacks, keyed on the payload's own event identity so a
-- redelivery (same payload, re-signed headers) is recognised.
CREATE TABLE IF NOT EXISTS developer_portaly_events (
  event_key TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  session_id TEXT,
  mode TEXT,
  outcome TEXT NOT NULL,
  received_at TEXT NOT NULL
);
