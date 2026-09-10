const { createHash } = require("node:crypto");
const { MAX_RESULT_BYTES } = require("./developer-measurement-result-store.js");

const MAX_D1_RESPONSE_BYTES = 2 * 1024 * 1024;

function createD1DeveloperPlatformStore(options = {}) {
  const config = normalizeConfig(options.config || process.env);
  const fetchImpl = options.fetch || globalThis.fetch;
  const execute = options.execute || null;
  if (!config.enabled && !execute) throw new Error("Developer D1 platform store configuration is incomplete");

  async function request(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_D1_RESPONSE_BYTES) throw new Error("Developer D1 response exceeded size limit");
      let body;
      try { body = JSON.parse(text); } catch { throw new Error("Developer D1 returned invalid JSON"); }
      if (!response.ok || body.success !== true || !Array.isArray(body.result) || body.result.some((item) => item?.success === false)) {
        const error = new Error("Developer D1 query failed");
        error.code = "persistence_error";
        throw error;
      }
      return body.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function query(sql, params = []) {
    if (execute) return (await execute({ sql, params: normalizeParams(params) }))[0] || { results: [] };
    return (await request({ sql, params: normalizeParams(params) }))[0] || { results: [] };
  }

  async function batch(statements) {
    if (execute) return execute({ batch: statements.map(({ sql, params = [] }) => ({ sql, params: normalizeParams(params) })) });
    return request({ batch: statements.map(({ sql, params = [] }) => ({ sql, params: normalizeParams(params) })) });
  }

  async function insertAuthToken(token) {
    await query(`INSERT INTO developer_auth_tokens (
      token_id, purpose, email_normalized, token_hash, encrypted_token, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      token.tokenId, token.purpose, token.email, token.tokenHash,
      token.encryptedToken || null, token.createdAt, token.expiresAt
    ]);
    return true;
  }

  async function findVerifiedAccountByEmail(email) {
    const result = await query(`SELECT account_id, tenant_id, email_normalized, status
      FROM developer_accounts WHERE email_normalized = ? AND status = 'verified' LIMIT 1`, [email]);
    return result.results?.[0] || null;
  }

  async function consumeAuthToken(input) {
    if (input.purpose === "invitation") {
      await batch([
        {
          sql: `INSERT INTO developer_tenants(tenant_id, status, created_at)
            SELECT ?, 'active', ? WHERE EXISTS (
              SELECT 1 FROM developer_auth_tokens WHERE token_hash = ? AND purpose = 'invitation'
              AND consumed_at IS NULL AND expires_at > ?
            ) AND NOT EXISTS (
              SELECT 1 FROM developer_accounts a JOIN developer_auth_tokens t
              ON a.email_normalized = t.email_normalized WHERE t.token_hash = ?
            )`,
          params: [input.tenantId, input.now, input.tokenHash, input.now, input.tokenHash]
        },
        {
          sql: `INSERT INTO developer_accounts(account_id, tenant_id, email_normalized, status, created_at, verified_at)
            SELECT ?, ?, email_normalized, 'verified', ?, ? FROM developer_auth_tokens
            WHERE token_hash = ? AND purpose = 'invitation' AND consumed_at IS NULL AND expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM developer_accounts a WHERE a.email_normalized = developer_auth_tokens.email_normalized)`,
          params: [input.accountId, input.tenantId, input.now, input.now, input.tokenHash, input.now]
        },
        {
          sql: `INSERT INTO developer_management_sessions(session_id, tenant_id, token_hash, created_at, expires_at)
            SELECT ?, a.tenant_id, ?, ?, ? FROM developer_auth_tokens t
            JOIN developer_accounts a ON a.email_normalized = t.email_normalized
            WHERE t.token_hash = ? AND t.purpose = 'invitation' AND t.consumed_at IS NULL AND t.expires_at > ?`,
          params: [input.sessionId, input.sessionHash, input.now, input.sessionExpiresAt, input.tokenHash, input.now]
        },
        {
          sql: `UPDATE developer_auth_tokens SET consumed_at = ? WHERE token_hash = ?
            AND purpose = 'invitation' AND consumed_at IS NULL
            AND EXISTS (SELECT 1 FROM developer_management_sessions WHERE session_id = ?)`,
          params: [input.now, input.tokenHash, input.sessionId]
        }
      ]);
    } else {
      await batch([
        {
          sql: `INSERT INTO developer_management_sessions(session_id, tenant_id, token_hash, created_at, expires_at)
            SELECT ?, a.tenant_id, ?, ?, ? FROM developer_auth_tokens t
            JOIN developer_accounts a ON a.email_normalized = t.email_normalized
            WHERE t.token_hash = ? AND t.purpose = 'login' AND t.consumed_at IS NULL
            AND t.expires_at > ? AND a.status = 'verified'`,
          params: [input.sessionId, input.sessionHash, input.now, input.sessionExpiresAt, input.tokenHash, input.now]
        },
        {
          sql: `UPDATE developer_auth_tokens SET consumed_at = ? WHERE token_hash = ?
            AND purpose = 'login' AND consumed_at IS NULL
            AND EXISTS (SELECT 1 FROM developer_management_sessions WHERE session_id = ?)`,
          params: [input.now, input.tokenHash, input.sessionId]
        }
      ]);
    }
    const result = await query(`SELECT a.account_id, s.tenant_id FROM developer_management_sessions s
      JOIN developer_accounts a ON a.tenant_id = s.tenant_id WHERE s.session_id = ? LIMIT 1`, [input.sessionId]);
    const row = result.results?.[0];
    return row ? { accountId: row.account_id, tenantId: row.tenant_id } : null;
  }

  async function authenticateSession({ tokenHash, now }) {
    const result = await query(`SELECT session_id, tenant_id, expires_at FROM developer_management_sessions
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1`, [tokenHash, now]);
    const row = result.results?.[0];
    if (!row) return null;
    await query("UPDATE developer_management_sessions SET last_used_at = ? WHERE session_id = ?", [now, row.session_id]);
    return { sessionId: row.session_id, tenantId: row.tenant_id, expiresAt: row.expires_at };
  }

  async function createSession({ sessionId, tenantId, tokenHash, now, sessionExpiresAt }) {
    await query(`INSERT INTO developer_management_sessions (
      session_id, tenant_id, token_hash, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?)`, [sessionId, tenantId, tokenHash, now, sessionExpiresAt]);
    return { sessionId, tenantId, expiresAt: sessionExpiresAt };
  }

  async function listAuthOutbox({ now, limit = 100 }) {
    const result = await query(`SELECT token_id, email_normalized, encrypted_token, expires_at
      FROM developer_auth_tokens WHERE purpose = 'login' AND consumed_at IS NULL
      AND expires_at > ? AND encrypted_token IS NOT NULL ORDER BY created_at ASC LIMIT ?`,
    [now, clampLimit(limit)]);
    return result.results || [];
  }

  async function activateEntitlement(input) {
    await query(`INSERT OR IGNORE INTO developer_entitlements (
      tenant_id, plan, status, activated_at, expires_at, quota_window_strategy, rounds_per_window
    ) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM developer_tenants WHERE tenant_id = ? AND status = 'active'
    )`, [input.tenantId, input.plan, input.status, input.activatedAt, input.expiresAt || null,
      input.quotaWindowStrategy, input.roundsPerWindow, input.tenantId]);
    return getEntitlement(input.tenantId);
  }

  async function getEntitlement(tenantId) {
    const result = await query("SELECT * FROM developer_entitlements WHERE tenant_id = ? LIMIT 1", [tenantId]);
    const row = result.results?.[0];
    return row ? mapEntitlement(row) : null;
  }

  async function insertApiKey(input) {
    await query(`INSERT INTO developer_api_keys (
      key_id, tenant_id, name, key_prefix, key_hash, scopes_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`, [
      input.keyId, input.tenantId, input.name, input.keyPrefix, input.keyHash,
      JSON.stringify(input.scopes), input.createdAt
    ]);
    return input.keyId;
  }

  async function listApiKeys(tenantId) {
    const result = await query(`SELECT key_id, name, key_prefix, scopes_json, status, created_at, revoked_at, last_used_at
      FROM developer_api_keys WHERE tenant_id = ? ORDER BY created_at DESC`, [tenantId]);
    return (result.results || []).map(mapApiKey);
  }

  async function revokeApiKey({ tenantId, keyId, now }) {
    const result = await query(`UPDATE developer_api_keys SET status = 'revoked', revoked_at = ?
      WHERE tenant_id = ? AND key_id = ? AND status = 'active'`, [now, tenantId, keyId]);
    return Number(result.meta?.changes || 0) === 1;
  }

  async function authenticateApiKey({ keyHash, now }) {
    const result = await query(`SELECT k.key_id, k.tenant_id, k.scopes_json FROM developer_api_keys k
      JOIN developer_tenants t ON t.tenant_id = k.tenant_id
      WHERE k.key_hash = ? AND k.status = 'active' AND t.status = 'active' LIMIT 1`, [keyHash]);
    const row = result.results?.[0];
    if (!row) return null;
    await query("UPDATE developer_api_keys SET last_used_at = ? WHERE key_id = ?", [now, row.key_id]);
    return { keyId: row.key_id, tenantId: row.tenant_id, scopes: safeParse(row.scopes_json, []) };
  }

  async function getAdmission() {
    const result = await query("SELECT control_value, reason, updated_at FROM developer_runtime_controls WHERE control_key = 'admission_enabled'");
    const row = result.results?.[0];
    return { enabled: row?.control_value === "true", reason: row?.reason || null, updatedAt: row?.updated_at || null };
  }

  async function setAdmission({ enabled, reason, now }) {
    await query(`INSERT INTO developer_runtime_controls(control_key, control_value, reason, updated_at)
      VALUES ('admission_enabled', ?, ?, ?) ON CONFLICT(control_key) DO UPDATE SET
      control_value = excluded.control_value, reason = excluded.reason, updated_at = excluded.updated_at`,
    [enabled ? "true" : "false", reason || null, now]);
    return getAdmission();
  }

  async function admitJob(input) {
    const existing = await findJobByOperation(input.tenantId, input.idempotencyKey);
    if (existing) return { created: false, job: existing };
    try {
      const budget = input.costBudget;
      const budgetStatements = budget ? [
        {
          sql: `INSERT OR IGNORE INTO developer_cost_budget_windows
            (window_kind, window_start, window_end, limit_twd_micros, reserved_twd_micros, used_twd_micros)
            VALUES ('daily', ?, ?, ?, 0, 0)`,
          params: [budget.dailyStart, budget.dailyEnd, budget.dailyLimitMicros]
        },
        {
          sql: `INSERT OR IGNORE INTO developer_cost_budget_windows
            (window_kind, window_start, window_end, limit_twd_micros, reserved_twd_micros, used_twd_micros)
            VALUES ('monthly', ?, ?, ?, 0, 0)`,
          params: [budget.monthlyStart, budget.monthlyEnd, budget.monthlyLimitMicros]
        }
      ] : [];
      const budgetCondition = budget ? ` AND EXISTS (
        SELECT 1 FROM developer_cost_budget_windows WHERE window_kind = 'daily' AND window_start = ?
        AND used_twd_micros + reserved_twd_micros + ? <= limit_twd_micros
      ) AND EXISTS (
        SELECT 1 FROM developer_cost_budget_windows WHERE window_kind = 'monthly' AND window_start = ?
        AND used_twd_micros + reserved_twd_micros + ? <= limit_twd_micros
      )` : "";
      const budgetConditionParams = budget
        ? [budget.dailyStart, budget.jobReserveMicros, budget.monthlyStart, budget.jobReserveMicros] : [];
      const costReservationStatements = budget ? [
        {
          sql: `INSERT INTO developer_cost_reservations
            (job_id, daily_window_start, monthly_window_start, reserved_twd_micros, status, created_at)
            SELECT ?, ?, ?, ?, 'reserved', ? WHERE EXISTS (SELECT 1 FROM developer_jobs WHERE job_id = ?)`,
          params: [input.jobId, budget.dailyStart, budget.monthlyStart, budget.jobReserveMicros, input.now, input.jobId]
        },
        {
          sql: `UPDATE developer_cost_budget_windows SET reserved_twd_micros = reserved_twd_micros + ?
            WHERE ((window_kind = 'daily' AND window_start = ?) OR (window_kind = 'monthly' AND window_start = ?))
            AND EXISTS (SELECT 1 FROM developer_cost_reservations WHERE job_id = ? AND status = 'reserved')`,
          params: [budget.jobReserveMicros, budget.dailyStart, budget.monthlyStart, input.jobId]
        }
      ] : [];
      await batch([
        ...budgetStatements,
        {
          sql: `INSERT OR IGNORE INTO developer_quota_windows (
            tenant_id, window_start, window_end, round_limit, used_rounds, reserved_rounds
          ) SELECT ?, ?, ?, rounds_per_window, 0, 0 FROM developer_entitlements
          WHERE tenant_id = ? AND status IN ('trialing', 'active') AND (expires_at IS NULL OR expires_at > ?)`,
          params: [input.tenantId, input.windowStart, input.windowEnd, input.tenantId, input.now]
        },
        {
          sql: `INSERT INTO developer_jobs (
            job_id, measurement_id, tenant_id, idempotency_key, request_hash, request_json,
            status, created_at, updated_at
          ) SELECT ?, ?, ?, ?, ?, ?, 'queued', ?, ? WHERE EXISTS (
            SELECT 1 FROM developer_runtime_controls WHERE control_key = 'admission_enabled' AND control_value = 'true'
          ) AND EXISTS (
            SELECT 1 FROM developer_quota_windows WHERE tenant_id = ? AND window_start = ?
            AND used_rounds + reserved_rounds < round_limit
          )${budgetCondition}`,
          params: [input.jobId, input.measurementId, input.tenantId, input.idempotencyKey,
            input.requestHash, JSON.stringify(input.request), input.now, input.now,
            input.tenantId, input.windowStart, ...budgetConditionParams]
        },
        {
          sql: `INSERT INTO developer_quota_reservations (
            reservation_id, job_id, tenant_id, window_start, status, created_at
          ) SELECT ?, ?, ?, ?, 'reserved', ? WHERE EXISTS (
            SELECT 1 FROM developer_jobs WHERE job_id = ?
          )`,
          params: [input.reservationId, input.jobId, input.tenantId, input.windowStart, input.now, input.jobId]
        },
        {
          sql: `UPDATE developer_quota_windows SET reserved_rounds = reserved_rounds + 1
            WHERE tenant_id = ? AND window_start = ? AND EXISTS (
              SELECT 1 FROM developer_quota_reservations WHERE reservation_id = ?
            )`,
          params: [input.tenantId, input.windowStart, input.reservationId]
        },
        ...costReservationStatements
      ]);
    } catch (error) {
      const raced = await findJobByOperation(input.tenantId, input.idempotencyKey);
      if (raced) return { created: false, job: raced };
      throw error;
    }
    const job = await getJob({ tenantId: input.tenantId, jobId: input.jobId });
    if (job) return { created: true, job };
    const admission = await getAdmission();
    if (!admission.enabled) return { rejected: "service_unavailable" };
    const entitlement = await getEntitlement(input.tenantId);
    if (!entitlement) return { rejected: "trial_not_started" };
    if (entitlement.expiresAt && entitlement.expiresAt <= input.now) return { rejected: "trial_expired" };
    if (input.costBudget) {
      const budget = await query(`SELECT COUNT(*) AS available FROM developer_cost_budget_windows WHERE
        (window_kind = 'daily' AND window_start = ? AND used_twd_micros + reserved_twd_micros + ? <= limit_twd_micros)
        OR (window_kind = 'monthly' AND window_start = ? AND used_twd_micros + reserved_twd_micros + ? <= limit_twd_micros)`,
      [input.costBudget.dailyStart, input.costBudget.jobReserveMicros,
        input.costBudget.monthlyStart, input.costBudget.jobReserveMicros]);
      if (Number(budget.results?.[0]?.available || 0) < 2) return { rejected: "cost_budget_exhausted" };
    }
    return { rejected: "quota_exhausted" };
  }

  async function findJobByOperation(tenantId, idempotencyKey) {
    const result = await query("SELECT * FROM developer_jobs WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1", [tenantId, idempotencyKey]);
    return result.results?.[0] ? mapJob(result.results[0]) : null;
  }

  async function getJob({ tenantId, jobId }) {
    const result = await query("SELECT * FROM developer_jobs WHERE tenant_id = ? AND job_id = ? LIMIT 1", [tenantId, jobId]);
    return result.results?.[0] ? mapJob(result.results[0]) : null;
  }

  async function getJobByMeasurement({ tenantId, measurementId }) {
    const result = await query("SELECT * FROM developer_jobs WHERE tenant_id = ? AND measurement_id = ? LIMIT 1", [tenantId, measurementId]);
    return result.results?.[0] ? mapJob(result.results[0]) : null;
  }

  async function listJobs({ tenantId, limit = 50 }) {
    const result = await query("SELECT * FROM developer_jobs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?", [tenantId, clampLimit(limit)]);
    return (result.results || []).map(mapJob);
  }

  async function claimJob(input) {
    await query(`UPDATE developer_jobs SET status = 'running', worker_id = ?, lease_token = ?, lease_expires_at = ?, updated_at = ?
      WHERE job_id = ? AND status = 'queued'`, [input.workerId, input.leaseToken, input.leaseExpiresAt, input.now, input.jobId]);
    const result = await query("SELECT * FROM developer_jobs WHERE job_id = ? AND lease_token = ? LIMIT 1", [input.jobId, input.leaseToken]);
    return result.results?.[0] ? mapJob(result.results[0]) : null;
  }

  async function listQueuedJobs({ limit = 25 }) {
    const result = await query("SELECT * FROM developer_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?", [clampLimit(limit)]);
    return (result.results || []).map(mapJob);
  }

  async function recordAttemptStarted(input) {
    await query(`INSERT INTO developer_provider_attempts(attempt_id, job_id, tenant_id, profile_id, status, started_at)
      VALUES (?, ?, ?, ?, 'started', ?) ON CONFLICT(job_id, profile_id) DO NOTHING`,
    [input.attemptId, input.jobId, input.tenantId, input.profileId, input.now]);
  }

  async function recordAttemptFinished(input) {
    const result = await query(`UPDATE developer_provider_attempts SET status = ?, completed_at = ?, error_code = ?,
      usage_json = ?, cost_json = ? WHERE job_id = ? AND profile_id = ? AND status = 'started'`,
    [input.status, input.now, input.errorCode || null, jsonOrNull(input.usage), jsonOrNull(input.cost), input.jobId, input.profileId]);
    return Number(result.meta?.changes || 0) === 1;
  }

  async function completeJob(input) {
    const resultJson = JSON.stringify(input.measurement);
    if (Buffer.byteLength(resultJson, "utf8") > MAX_RESULT_BYTES) {
      const error = new Error(`Measurement result exceeds ${MAX_RESULT_BYTES} bytes`);
      error.code = "result_too_large";
      throw error;
    }
    const cost = input.measurement.provider_cost || {};
    const costReservationResult = await query("SELECT * FROM developer_cost_reservations WHERE job_id = ? AND status = 'reserved'", [input.jobId]);
    const costReservation = costReservationResult.results?.[0];
    const estimated = Number(cost.maximum_usd);
    const computedTwd = Number.isFinite(estimated) && estimated >= 0 && Number.isFinite(Number(input.twdPerUsd))
      ? Math.ceil(estimated * Number(input.twdPerUsd) * 1_000_000) : Number(costReservation?.reserved_twd_micros || 0);
    const actualTwdMicros = cost.has_unknown_cost
      ? Math.max(computedTwd, Number(costReservation?.reserved_twd_micros || 0)) : computedTwd;
    const settleStatements = costReservation ? [
      {
        sql: `UPDATE developer_cost_budget_windows SET
          reserved_twd_micros = CASE WHEN reserved_twd_micros >= ? THEN reserved_twd_micros - ? ELSE 0 END,
          used_twd_micros = used_twd_micros + ?
          WHERE (window_kind = 'daily' AND window_start = ?) OR (window_kind = 'monthly' AND window_start = ?)`,
        params: [costReservation.reserved_twd_micros, costReservation.reserved_twd_micros, actualTwdMicros,
          costReservation.daily_window_start, costReservation.monthly_window_start]
      },
      {
        sql: `UPDATE developer_cost_reservations SET status = ?, actual_twd_micros = ?, settled_at = ?
          WHERE job_id = ? AND status = 'reserved'`,
        params: [cost.has_unknown_cost ? "ambiguous" : "charged", actualTwdMicros, input.now, input.jobId]
      }
    ] : [];
    await batch([
      {
        sql: `INSERT INTO developer_measurement_results (
          measurement_id, tenant_id, status, created_at, completed_at, expires_at, result_hash, result_json
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM developer_jobs WHERE job_id = ? AND status = 'running' AND lease_token = ?
        ) ON CONFLICT(measurement_id) DO NOTHING`,
        params: [input.measurement.measurement_id, input.measurement.tenant_id, input.measurement.status,
          input.measurement.created_at, input.measurement.completed_at, input.expiresAt || null,
          createHash("sha256").update(resultJson).digest("hex"), resultJson, input.jobId, input.leaseToken]
      },
      {
        sql: `UPDATE developer_quota_windows SET reserved_rounds = CASE WHEN reserved_rounds > 0 THEN reserved_rounds - 1 ELSE 0 END,
          used_rounds = used_rounds + ? WHERE (tenant_id, window_start) IN (
            SELECT tenant_id, window_start FROM developer_quota_reservations WHERE job_id = ? AND status = 'reserved'
          ) AND EXISTS (SELECT 1 FROM developer_measurement_results WHERE measurement_id = ?)`,
        params: [input.measurement.status === "succeeded" ? 1 : 0, input.jobId, input.measurement.measurement_id]
      },
      {
        sql: `UPDATE developer_quota_reservations SET status = ?, settled_at = ? WHERE job_id = ? AND status = 'reserved'
          AND EXISTS (SELECT 1 FROM developer_measurement_results WHERE measurement_id = ?)`,
        params: [input.measurement.status === "succeeded" ? "charged" : "released", input.now, input.jobId, input.measurement.measurement_id]
      },
      {
        sql: `INSERT INTO developer_cost_events(cost_event_id, job_id, tenant_id, amount_min_usd, amount_max_usd, has_unknown_cost, created_at, amount_twd_micros)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM developer_measurement_results WHERE measurement_id = ?
          ) ON CONFLICT(job_id) DO NOTHING`,
        params: [input.costEventId, input.jobId, input.measurement.tenant_id,
          finiteOrNull(cost.minimum_usd), finiteOrNull(cost.maximum_usd), cost.has_unknown_cost ? 1 : 0,
          input.now, costReservation ? actualTwdMicros : null, input.measurement.measurement_id]
      },
      ...settleStatements,
      {
        sql: `UPDATE developer_jobs SET status = ?, completed_at = ?, updated_at = ?, error_code = ?,
          lease_token = NULL, lease_expires_at = NULL WHERE job_id = ? AND status = 'running'
          AND lease_token = ? AND EXISTS (SELECT 1 FROM developer_measurement_results WHERE measurement_id = ?)`,
        params: [input.measurement.status, input.now, input.now, input.errorCode || null,
          input.jobId, input.leaseToken, input.measurement.measurement_id]
      }
    ]);
    const finished = await query("SELECT status FROM developer_jobs WHERE job_id = ?", [input.jobId]);
    return ["succeeded", "failed"].includes(finished.results?.[0]?.status);
  }

  async function failJob(input) {
    const job = await query("SELECT status, lease_token FROM developer_jobs WHERE job_id = ? LIMIT 1", [input.jobId]);
    const row = job.results?.[0];
    if (!row || !["queued", "running"].includes(row.status)) return false;
    if (row.status === "running" && input.leaseToken && row.lease_token !== input.leaseToken) return false;
    const leaseClause = input.leaseToken ? " AND (status = 'queued' OR lease_token = ?)" : "";
    const leaseParams = input.leaseToken ? [input.leaseToken] : [];
    const costResult = await query("SELECT * FROM developer_cost_reservations WHERE job_id = ? AND status = 'reserved'", [input.jobId]);
    const costReservation = costResult.results?.[0];
    const ambiguous = input.errorCode === "ambiguous_attempt";
    const costStatements = costReservation ? [
      {
        sql: `UPDATE developer_cost_budget_windows SET
          reserved_twd_micros = CASE WHEN reserved_twd_micros >= ? THEN reserved_twd_micros - ? ELSE 0 END,
          used_twd_micros = used_twd_micros + ?
          WHERE ((window_kind = 'daily' AND window_start = ?) OR (window_kind = 'monthly' AND window_start = ?))
          AND EXISTS (SELECT 1 FROM developer_jobs WHERE job_id = ?${leaseClause})`,
        params: [costReservation.reserved_twd_micros, costReservation.reserved_twd_micros,
          ambiguous ? costReservation.reserved_twd_micros : 0, costReservation.daily_window_start,
          costReservation.monthly_window_start, input.jobId, ...leaseParams]
      },
      {
        sql: `UPDATE developer_cost_reservations SET status = ?, actual_twd_micros = ?, settled_at = ?
          WHERE job_id = ? AND status = 'reserved'
          AND EXISTS (SELECT 1 FROM developer_jobs WHERE job_id = ?${leaseClause})`,
        params: [ambiguous ? "ambiguous" : "released", ambiguous ? costReservation.reserved_twd_micros : 0,
          input.now, input.jobId, input.jobId, ...leaseParams]
      }
    ] : [];
    await batch([
      {
        sql: `UPDATE developer_quota_windows SET reserved_rounds = CASE WHEN reserved_rounds > 0 THEN reserved_rounds - 1 ELSE 0 END
          WHERE (tenant_id, window_start) IN (
            SELECT tenant_id, window_start FROM developer_quota_reservations WHERE job_id = ? AND status = 'reserved'
          ) AND EXISTS (SELECT 1 FROM developer_jobs WHERE job_id = ?${leaseClause})`,
        params: [input.jobId, input.jobId, ...leaseParams]
      },
      {
        sql: `UPDATE developer_quota_reservations SET status = 'released', settled_at = ?
          WHERE job_id = ? AND status = 'reserved'
          AND EXISTS (SELECT 1 FROM developer_jobs WHERE job_id = ?${leaseClause})`,
        params: [input.now, input.jobId, input.jobId, ...leaseParams]
      },
      ...costStatements,
      {
        sql: `UPDATE developer_jobs SET status = 'failed', completed_at = ?, updated_at = ?, error_code = ?,
          lease_token = NULL, lease_expires_at = NULL WHERE job_id = ? AND status IN ('queued', 'running')${leaseClause}`,
        params: [input.now, input.now, input.errorCode || "internal_error", input.jobId, ...leaseParams]
      }
    ]);
    const finished = await query("SELECT status FROM developer_jobs WHERE job_id = ?", [input.jobId]);
    return finished.results?.[0]?.status === "failed";
  }

  async function expireStaleJobs({ now }) {
    const result = await query(`SELECT job_id FROM developer_jobs WHERE status = 'running'
      AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`, [now]);
    const ids = (result.results || []).map((row) => row.job_id);
    for (const jobId of ids) {
      await query(`UPDATE developer_provider_attempts SET status = 'ambiguous', completed_at = ?, error_code = 'ambiguous_attempt'
        WHERE job_id = ? AND status = 'started'`, [now, jobId]);
      await failJob({ jobId, errorCode: "ambiguous_attempt", now });
    }
    return ids;
  }

  async function getMeasurement({ tenantId, measurementId, now }) {
    const result = await query(`SELECT result_json FROM developer_measurement_results WHERE tenant_id = ?
      AND measurement_id = ? AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`, [tenantId, measurementId, now]);
    const value = result.results?.[0]?.result_json;
    return value ? safeParse(value, null) : null;
  }

  async function deleteMeasurement({ tenantId, measurementId, now }) {
    const job = await getJobByMeasurement({ tenantId, measurementId });
    if (!job) return { status: "not_found" };
    if (!["succeeded", "failed"].includes(job.status)) return { status: "not_terminal" };
    await batch([
      { sql: "DELETE FROM developer_measurement_results WHERE tenant_id = ? AND measurement_id = ?", params: [tenantId, measurementId] },
      { sql: "UPDATE developer_jobs SET content_deleted_at = ?, updated_at = ? WHERE job_id = ?", params: [now, now, job.job_id] }
    ]);
    return { status: "deleted" };
  }

  async function getUsage({ tenantId, windowStart, windowEnd, roundLimit }) {
    const result = await query(`SELECT round_limit, used_rounds, reserved_rounds FROM developer_quota_windows
      WHERE tenant_id = ? AND window_start = ? LIMIT 1`, [tenantId, windowStart]);
    const row = result.results?.[0];
    const used = Number(row?.used_rounds || 0);
    const reserved = Number(row?.reserved_rounds || 0);
    const limit = Number(row?.round_limit ?? roundLimit ?? 0);
    return {
      used_rounds: used, reserved_rounds: reserved,
      remaining_rounds: Math.max(0, limit - used - reserved), quota_limit: limit,
      window_start: windowStart, window_end: windowEnd
    };
  }

  async function recordSecurityEvent(input) {
    await query(`INSERT INTO developer_security_events(event_id, tenant_id, event_type, severity, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [input.eventId, input.tenantId || null, input.eventType,
      input.severity, JSON.stringify(sanitizeSecurityMetadata(input.metadata)), input.now]);
  }

  async function listSecurityEvents({ limit = 100 }) {
    const result = await query(`SELECT event_id, tenant_id, event_type, severity, metadata_json, created_at
      FROM developer_security_events ORDER BY created_at DESC LIMIT ?`, [clampLimit(limit)]);
    return (result.results || []).map((row) => ({
      event_id: row.event_id, tenant_id: row.tenant_id, event_type: row.event_type,
      severity: row.severity, metadata: safeParse(row.metadata_json, {}), created_at: row.created_at
    }));
  }

  async function getAdminOverview() {
    const results = await batch([
      { sql: "SELECT control_value, reason, updated_at FROM developer_runtime_controls WHERE control_key = 'admission_enabled'" },
      { sql: "SELECT COUNT(*) AS count FROM developer_accounts WHERE status != 'deleted'" },
      { sql: "SELECT COUNT(*) AS count FROM developer_api_keys WHERE status = 'active'" },
      { sql: "SELECT status, COUNT(*) AS count FROM developer_jobs GROUP BY status" },
      { sql: `SELECT COALESCE(SUM(amount_min_usd), 0) AS minimum_usd,
        COALESCE(SUM(amount_max_usd), 0) AS maximum_usd,
        COALESCE(SUM(has_unknown_cost), 0) AS unknown_events,
        COALESCE(SUM(amount_twd_micros), 0) AS settled_twd_micros FROM developer_cost_events` },
      { sql: `SELECT window_kind, window_start, window_end, limit_twd_micros,
        reserved_twd_micros, used_twd_micros FROM developer_cost_budget_windows
        WHERE window_end > ? ORDER BY window_kind`, params: [new Date().toISOString()] }
    ]);
    const admission = results[0]?.results?.[0];
    const jobs = { queued: 0, running: 0, succeeded: 0, failed: 0 };
    for (const row of results[3]?.results || []) jobs[row.status] = Number(row.count);
    const cost = results[4]?.results?.[0] || {};
    return {
      admission: { enabled: admission?.control_value === "true", reason: admission?.reason || null, updatedAt: admission?.updated_at || null },
      accounts: { total: Number(results[1]?.results?.[0]?.count || 0) },
      api_keys: { active: Number(results[2]?.results?.[0]?.count || 0) },
      jobs,
      provider_cost: {
        minimum_usd: Number(cost.minimum_usd || 0), maximum_usd: Number(cost.maximum_usd || 0),
        unknown_events: Number(cost.unknown_events || 0),
        settled_twd: Number(cost.settled_twd_micros || 0) / 1_000_000
      },
      budget_windows: (results[5]?.results || []).map(mapBudgetWindow)
    };
  }

  return {
    activateEntitlement, admitJob, authenticateApiKey, authenticateSession, claimJob, createSession,
    completeJob, consumeAuthToken, deleteMeasurement, expireStaleJobs,
    findVerifiedAccountByEmail, getAdminOverview, getAdmission, getEntitlement,
    getJob, getJobByMeasurement, getMeasurement, getUsage, insertApiKey, insertAuthToken,
    listApiKeys, listAuthOutbox, listJobs, listQueuedJobs, listSecurityEvents,
    recordAttemptFinished, recordAttemptStarted, recordSecurityEvent, revokeApiKey, setAdmission,
    state: () => ({ kind: config.kind, enabled: true, maxResultBytes: MAX_RESULT_BYTES })
  };
}

function createBoundD1DeveloperPlatformStore(options = {}) {
  const db = options.db;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A Cloudflare D1 binding is required");
  }
  return createD1DeveloperPlatformStore({
    ...options,
    execute: async (payload) => {
      if (Array.isArray(payload.batch)) {
        return db.batch(payload.batch.map(({ sql, params }) => db.prepare(sql).bind(...params)));
      }
      return [await db.prepare(payload.sql).bind(...payload.params).all()];
    }
  });
}

function normalizeConfig(source) {
  const gatewayUrl = String(source.GEOCHECK_DEVELOPER_D1_GATEWAY_URL || source.gatewayUrl || "").trim().replace(/\/+$/, "");
  const gatewayToken = String(source.GEOCHECK_DEVELOPER_D1_GATEWAY_TOKEN || source.gatewayToken || "").trim();
  const accountId = String(source.GEOCHECK_DEVELOPER_D1_ACCOUNT_ID || source.accountId || "").trim();
  const databaseId = String(source.GEOCHECK_DEVELOPER_D1_DATABASE_ID || source.databaseId || "").trim();
  const apiToken = String(source.GEOCHECK_DEVELOPER_D1_API_TOKEN || source.apiToken || "").trim();
  const auditDatabaseId = String(source.CLOUDFLARE_D1_DATABASE_ID || "").trim();
  if (databaseId && auditDatabaseId && databaseId === auditDatabaseId) {
    throw new Error("Developer API must not use product A's D1 database");
  }
  const gatewayEnabled = Boolean(gatewayUrl && gatewayToken);
  const restEnabled = Boolean(accountId && databaseId && apiToken);
  if (gatewayEnabled && restEnabled) throw new Error("Configure Developer D1 gateway or REST credentials, not both");
  return {
    accountId, databaseId, apiToken: gatewayEnabled ? gatewayToken : apiToken,
    timeoutMs: Math.max(1_000, Number(source.DEVELOPER_API_D1_TIMEOUT_MS || source.timeoutMs || 5_000)),
    enabled: gatewayEnabled || restEnabled,
    kind: gatewayEnabled ? "d1-gateway" : "d1-rest",
    endpoint: gatewayEnabled
      ? `${gatewayUrl}/v1/query`
      : `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
  };
}

function mapEntitlement(row) {
  return {
    tenantId: row.tenant_id, plan: row.plan, status: row.status,
    activatedAt: row.activated_at, expiresAt: row.expires_at || null,
    quotaWindowStrategy: row.quota_window_strategy, roundsPerWindow: Number(row.rounds_per_window)
  };
}

function mapApiKey(row) {
  return {
    key_id: row.key_id, name: row.name, key_prefix: row.key_prefix,
    scopes: safeParse(row.scopes_json, []), status: row.status,
    created_at: row.created_at, revoked_at: row.revoked_at || null,
    last_used_at: row.last_used_at || null
  };
}

function mapJob(row) {
  return {
    job_id: row.job_id, measurement_id: row.measurement_id, tenant_id: row.tenant_id,
    status: row.status, created_at: row.created_at, completed_at: row.completed_at || null,
    content_deleted_at: row.content_deleted_at || null, error_code: row.error_code || null,
    request_hash: row.request_hash, request: safeParse(row.request_json, null),
    lease_token: row.lease_token || null
  };
}

function sanitizeSecurityMetadata(value) {
  const input = value && typeof value === "object" ? value : {};
  const output = {};
  for (const [key, item] of Object.entries(input)) {
    if (/email|token|secret|key|prompt|answer|url/i.test(key)) continue;
    if (["string", "number", "boolean"].includes(typeof item) || item == null) output[key] = item;
  }
  return output;
}

function jsonOrNull(value) { return value == null ? null : JSON.stringify(value); }
function safeParse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function clampLimit(value) { return Math.max(1, Math.min(250, Number(value) || 50)); }
function normalizeParams(params) {
  return params.map((value) => value == null ? null : typeof value === "boolean" ? (value ? "1" : "0") : String(value));
}
function mapBudgetWindow(row) {
  return {
    kind: row.window_kind, window_start: row.window_start, window_end: row.window_end,
    limit_twd: Number(row.limit_twd_micros) / 1_000_000,
    reserved_twd: Number(row.reserved_twd_micros) / 1_000_000,
    used_twd: Number(row.used_twd_micros) / 1_000_000
  };
}

module.exports = { createBoundD1DeveloperPlatformStore, createD1DeveloperPlatformStore };
