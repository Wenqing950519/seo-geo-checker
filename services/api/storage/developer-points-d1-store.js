// Prepaid points store on the Developer API D1 database (migrations 0007, 0008).
// Separate from developer-platform-d1-store so quota/job admission stays
// untouched; crediting is one conditional batch so a redelivered callback can
// never add a second purchase entry.

function createDeveloperPointsD1Store({ execute } = {}) {
  if (typeof execute !== "function") throw new TypeError("A D1 execute function is required");

  async function query(sql, params = []) {
    return (await execute({ sql, params: normalizeParams(params) }))[0] || { results: [] };
  }

  async function batch(statements) {
    return execute({ batch: statements.map(({ sql, params = [] }) => ({ sql, params: normalizeParams(params) })) });
  }

  async function createOrder(order) {
    await query(`INSERT INTO developer_point_orders (
      session_id, tenant_id, mode, merchant_order_number, plan_id, plan_name, amount_twd, status, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)`, [
      order.sessionId, order.tenantId, order.mode, order.merchantOrderNumber, order.planId,
      order.planName, order.amountTwd, order.createdAt, order.expiresAt || null
    ]);
    return true;
  }

  async function getOrder(sessionId) {
    const row = (await query("SELECT * FROM developer_point_orders WHERE session_id = ? LIMIT 1", [sessionId])).results?.[0];
    return row ? mapOrder(row) : null;
  }

  async function creditOrder(input) {
    const results = await batch([
      {
        sql: `UPDATE developer_point_orders SET status = 'completed', completed_at = ?, payment_reference = ?
          WHERE session_id = ? AND status = 'created' AND amount_twd = ? AND mode = ?`,
        params: [input.completedAt, input.paymentReference || null, input.sessionId, input.amountTwd, input.mode]
      },
      {
        sql: `INSERT OR IGNORE INTO developer_point_ledger (entry_id, tenant_id, mode, kind, points, reference, created_at)
          SELECT ?, tenant_id, mode, 'purchase', amount_twd, session_id, ?
          FROM developer_point_orders WHERE session_id = ? AND status = 'completed'`,
        params: [input.entryId, input.now, input.sessionId]
      },
      eventStatement({ ...input, outcome: "credited" })
    ]);
    return Number(results?.[1]?.meta?.changes || 0) > 0;
  }

  async function markOrder(input) {
    await batch([
      {
        sql: `UPDATE developer_point_orders SET status = ?, failure_reason = ?
          WHERE session_id = ? AND status = 'created'`,
        params: [input.status, input.reason || null, input.sessionId]
      },
      eventStatement(input)
    ]);
    return true;
  }

  async function recordEvent(input) {
    const result = await query(eventStatement(input).sql, eventStatement(input).params);
    return Number(result.meta?.changes || 0) > 0;
  }

  // Paid points only: the ledger never holds gifts, so this is also the
  // refundable balance. Gifts are read with listGrants.
  async function getBalance({ tenantId, mode }) {
    const row = (await query(`SELECT COALESCE(SUM(points), 0) AS balance FROM developer_point_ledger
      WHERE tenant_id = ? AND mode = ?`, [tenantId, mode])).results?.[0];
    return Number(row?.balance || 0);
  }

  async function listLedger({ tenantId, mode, limit = 50 }) {
    const result = await query(`SELECT entry_id, kind, points, reference, created_at FROM developer_point_ledger
      WHERE tenant_id = ? AND mode = ? ORDER BY created_at DESC, entry_id DESC LIMIT ?`,
    [tenantId, mode, Math.max(1, Math.min(200, Number(limit) || 50))]);
    return (result.results || []).map((row) => ({
      entry_id: row.entry_id, kind: row.kind, points: Number(row.points),
      reference: row.reference, created_at: row.created_at
    }));
  }

  // One claim per tenant, mode and campaign (UNIQUE key), and never more claims
  // than the campaign's capacity: both are decided inside this single write.
  async function claimGrant(input) {
    const result = await query(`INSERT INTO developer_point_grants
      (grant_id, tenant_id, mode, promotion_id, points, remaining_points, granted_at, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM developer_point_grants WHERE promotion_id = ? AND mode = ?) < CAST(? AS INTEGER)
      ON CONFLICT (tenant_id, mode, promotion_id) DO NOTHING`, [
      input.grantId, input.tenantId, input.mode, input.promotionId, input.points, input.points,
      input.grantedAt, input.expiresAt, input.promotionId, input.mode, input.capacity
    ]);
    if (Number(result.meta?.changes || 0) > 0) return { claimed: true };
    const existing = await query(`SELECT 1 FROM developer_point_grants
      WHERE tenant_id = ? AND mode = ? AND promotion_id = ? LIMIT 1`, [input.tenantId, input.mode, input.promotionId]);
    return { claimed: false, reason: existing.results?.length ? "already_claimed" : "full" };
  }

  async function listGrants({ tenantId, mode }) {
    const result = await query(`SELECT grant_id, promotion_id, points, remaining_points, granted_at, expires_at
      FROM developer_point_grants WHERE tenant_id = ? AND mode = ? ORDER BY expires_at, grant_id`, [tenantId, mode]);
    return (result.results || []).map((row) => ({
      grant_id: row.grant_id, promotion_id: row.promotion_id, points: Number(row.points),
      remaining_points: Number(row.remaining_points), granted_at: row.granted_at, expires_at: row.expires_at
    }));
  }

  async function countClaims({ mode }) {
    const result = await query(`SELECT promotion_id, COUNT(*) AS claims FROM developer_point_grants
      WHERE mode = ? GROUP BY promotion_id`, [mode]);
    return Object.fromEntries((result.results || []).map((row) => [row.promotion_id, Number(row.claims)]));
  }

  return {
    claimGrant, countClaims, createOrder, creditOrder, getBalance, getOrder, listGrants, listLedger, markOrder, recordEvent
  };
}

function createBoundDeveloperPointsD1Store({ db } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A Cloudflare D1 binding is required");
  }
  return createDeveloperPointsD1Store({
    execute: async (payload) => {
      if (Array.isArray(payload.batch)) {
        return db.batch(payload.batch.map(({ sql, params }) => db.prepare(sql).bind(...params)));
      }
      return [await db.prepare(payload.sql).bind(...payload.params).all()];
    }
  });
}

function eventStatement(input) {
  return {
    sql: `INSERT OR IGNORE INTO developer_portaly_events (event_key, event, session_id, mode, outcome, received_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    params: [input.eventKey, input.event, input.sessionId || null, input.mode || null, input.outcome, input.now]
  };
}

function mapOrder(row) {
  return {
    sessionId: row.session_id, tenantId: row.tenant_id, mode: row.mode,
    merchantOrderNumber: row.merchant_order_number, planId: row.plan_id, planName: row.plan_name,
    amountTwd: Number(row.amount_twd), status: row.status, createdAt: row.created_at,
    completedAt: row.completed_at || null, failureReason: row.failure_reason || null
  };
}

function normalizeParams(params) {
  return params.map((value) => (value == null ? null : typeof value === "number" ? value : String(value)));
}

module.exports = { createBoundDeveloperPointsD1Store, createDeveloperPointsD1Store };
