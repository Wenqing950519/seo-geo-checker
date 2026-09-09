const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { MAX_RESULT_BYTES } = require("./developer-measurement-result-store.js");

const MIGRATIONS_DIR = path.join(__dirname, "..", "developer-api-migrations");

function createSqliteDeveloperPlatformStore(options = {}) {
  const db = new DatabaseSync(options.filename || ":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "0001_measurement_results.sql"), "utf8"));
  db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "0002_platform_foundation.sql"), "utf8"));
  db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "0003_cost_budget_guard.sql"), "utf8"));

  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function insertAuthToken(token) {
    db.prepare(`INSERT INTO developer_auth_tokens (
      token_id, purpose, email_normalized, token_hash, encrypted_token, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(token.tokenId, token.purpose, token.email, token.tokenHash, token.encryptedToken || null, token.createdAt, token.expiresAt);
    return true;
  }

  function findVerifiedAccountByEmail(email) {
    return db.prepare(`SELECT account_id, tenant_id, email_normalized, status
      FROM developer_accounts WHERE email_normalized = ? AND status = 'verified' LIMIT 1`).get(email) || null;
  }

  function consumeAuthToken(input) {
    return transaction(() => {
      const token = db.prepare(`SELECT * FROM developer_auth_tokens
        WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL LIMIT 1`)
        .get(input.tokenHash, input.purpose);
      if (!token || token.expires_at <= input.now) return null;
      let account = findVerifiedAccountByEmail(token.email_normalized);
      if (input.purpose === "invitation" && !account) {
        db.prepare("INSERT INTO developer_tenants(tenant_id, status, created_at) VALUES (?, 'active', ?)")
          .run(input.tenantId, input.now);
        db.prepare(`INSERT INTO developer_accounts (
          account_id, tenant_id, email_normalized, status, created_at, verified_at
        ) VALUES (?, ?, ?, 'verified', ?, ?)`)
          .run(input.accountId, input.tenantId, token.email_normalized, input.now, input.now);
        account = findVerifiedAccountByEmail(token.email_normalized);
      }
      if (!account) return null;
      const consumed = db.prepare(`UPDATE developer_auth_tokens SET consumed_at = ?
        WHERE token_id = ? AND consumed_at IS NULL`).run(input.now, token.token_id);
      if (Number(consumed.changes) !== 1) return null;
      db.prepare(`INSERT INTO developer_management_sessions (
        session_id, tenant_id, token_hash, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?)`)
        .run(input.sessionId, account.tenant_id, input.sessionHash, input.now, input.sessionExpiresAt);
      return { accountId: account.account_id, tenantId: account.tenant_id };
    });
  }

  function authenticateSession({ tokenHash, now }) {
    const session = db.prepare(`SELECT session_id, tenant_id, expires_at FROM developer_management_sessions
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1`).get(tokenHash, now);
    if (!session) return null;
    db.prepare("UPDATE developer_management_sessions SET last_used_at = ? WHERE session_id = ?")
      .run(now, session.session_id);
    return { sessionId: session.session_id, tenantId: session.tenant_id, expiresAt: session.expires_at };
  }

  function listAuthOutbox({ now, limit = 100 }) {
    return db.prepare(`SELECT token_id, email_normalized, encrypted_token, expires_at
      FROM developer_auth_tokens
      WHERE purpose = 'login' AND consumed_at IS NULL AND expires_at > ? AND encrypted_token IS NOT NULL
      ORDER BY created_at ASC LIMIT ?`).all(now, Math.max(1, Math.min(100, Number(limit) || 100)));
  }

  function activateEntitlement(input) {
    return transaction(() => {
      const tenant = db.prepare("SELECT status FROM developer_tenants WHERE tenant_id = ? LIMIT 1").get(input.tenantId);
      if (!tenant || tenant.status !== "active") return null;
      const existing = db.prepare("SELECT * FROM developer_entitlements WHERE tenant_id = ? LIMIT 1").get(input.tenantId);
      if (existing) return mapEntitlement(existing);
      db.prepare(`INSERT INTO developer_entitlements (
        tenant_id, plan, status, activated_at, expires_at, quota_window_strategy, rounds_per_window
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(input.tenantId, input.plan, input.status, input.activatedAt, input.expiresAt || null, input.quotaWindowStrategy, input.roundsPerWindow);
      return mapEntitlement(db.prepare("SELECT * FROM developer_entitlements WHERE tenant_id = ?").get(input.tenantId));
    });
  }

  function getEntitlement(tenantId) {
    const row = db.prepare("SELECT * FROM developer_entitlements WHERE tenant_id = ? LIMIT 1").get(tenantId);
    return row ? mapEntitlement(row) : null;
  }

  function insertApiKey(input) {
    db.prepare(`INSERT INTO developer_api_keys (
      key_id, tenant_id, name, key_prefix, key_hash, scopes_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`)
      .run(input.keyId, input.tenantId, input.name, input.keyPrefix, input.keyHash, JSON.stringify(input.scopes), input.createdAt);
    return input.keyId;
  }

  function listApiKeys(tenantId) {
    return db.prepare(`SELECT key_id, name, key_prefix, scopes_json, status, created_at, revoked_at, last_used_at
      FROM developer_api_keys WHERE tenant_id = ? ORDER BY created_at DESC`).all(tenantId).map(mapApiKey);
  }

  function revokeApiKey({ tenantId, keyId, now }) {
    const result = db.prepare(`UPDATE developer_api_keys SET status = 'revoked', revoked_at = ?
      WHERE tenant_id = ? AND key_id = ? AND status = 'active'`).run(now, tenantId, keyId);
    return Number(result.changes) === 1;
  }

  function authenticateApiKey({ keyHash, now }) {
    const row = db.prepare(`SELECT key_id, tenant_id, scopes_json FROM developer_api_keys
      WHERE key_hash = ? AND status = 'active' LIMIT 1`).get(keyHash);
    if (!row) return null;
    const tenant = db.prepare("SELECT status FROM developer_tenants WHERE tenant_id = ?").get(row.tenant_id);
    if (!tenant || tenant.status !== "active") return null;
    db.prepare("UPDATE developer_api_keys SET last_used_at = ? WHERE key_id = ?").run(now, row.key_id);
    return { keyId: row.key_id, tenantId: row.tenant_id, scopes: JSON.parse(row.scopes_json) };
  }

  function getAdmission() {
    const row = db.prepare("SELECT control_value, reason, updated_at FROM developer_runtime_controls WHERE control_key = 'admission_enabled'").get();
    return { enabled: row?.control_value === "true", reason: row?.reason || null, updatedAt: row?.updated_at || null };
  }

  function setAdmission({ enabled, reason, now }) {
    db.prepare(`INSERT INTO developer_runtime_controls(control_key, control_value, reason, updated_at)
      VALUES ('admission_enabled', ?, ?, ?)
      ON CONFLICT(control_key) DO UPDATE SET control_value = excluded.control_value,
        reason = excluded.reason, updated_at = excluded.updated_at`)
      .run(enabled ? "true" : "false", reason || null, now);
    return getAdmission();
  }

  function admitJob(input) {
    return transaction(() => {
      const existing = db.prepare(`SELECT * FROM developer_jobs
        WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`).get(input.tenantId, input.idempotencyKey);
      if (existing) return { created: false, job: mapJob(existing) };
      if (!getAdmission().enabled) return { rejected: "service_unavailable" };
      const entitlement = getEntitlement(input.tenantId);
      if (!entitlement) return { rejected: "trial_not_started" };
      if (!["trialing", "active"].includes(entitlement.status) || (entitlement.expiresAt && entitlement.expiresAt <= input.now)) {
        return { rejected: "trial_expired" };
      }
      db.prepare(`INSERT OR IGNORE INTO developer_quota_windows (
        tenant_id, window_start, window_end, round_limit, used_rounds, reserved_rounds
      ) VALUES (?, ?, ?, ?, 0, 0)`)
        .run(input.tenantId, input.windowStart, input.windowEnd, entitlement.roundsPerWindow);
      const window = db.prepare(`SELECT * FROM developer_quota_windows
        WHERE tenant_id = ? AND window_start = ? LIMIT 1`).get(input.tenantId, input.windowStart);
      if (!window || Number(window.used_rounds) + Number(window.reserved_rounds) >= Number(window.round_limit)) {
        return { rejected: "quota_exhausted" };
      }
      if (input.costBudget && !reserveCostBudget(input)) return { rejected: "cost_budget_exhausted" };
      db.prepare(`INSERT INTO developer_jobs (
        job_id, measurement_id, tenant_id, idempotency_key, request_hash, request_json,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
        .run(input.jobId, input.measurementId, input.tenantId, input.idempotencyKey, input.requestHash, JSON.stringify(input.request), input.now, input.now);
      db.prepare(`INSERT INTO developer_quota_reservations (
        reservation_id, job_id, tenant_id, window_start, status, created_at
      ) VALUES (?, ?, ?, ?, 'reserved', ?)`)
        .run(input.reservationId, input.jobId, input.tenantId, input.windowStart, input.now);
      db.prepare(`UPDATE developer_quota_windows SET reserved_rounds = reserved_rounds + 1
        WHERE tenant_id = ? AND window_start = ?`).run(input.tenantId, input.windowStart);
      if (input.costBudget) {
        db.prepare(`INSERT INTO developer_cost_reservations (
          job_id, daily_window_start, monthly_window_start, reserved_twd_micros, status, created_at
        ) VALUES (?, ?, ?, ?, 'reserved', ?)`)
          .run(input.jobId, input.costBudget.dailyStart, input.costBudget.monthlyStart,
            input.costBudget.jobReserveMicros, input.now);
      }
      return { created: true, job: mapJob(db.prepare("SELECT * FROM developer_jobs WHERE job_id = ?").get(input.jobId)) };
    });
  }

  function reserveCostBudget(input) {
    const budget = input.costBudget;
    for (const item of [
      ["daily", budget.dailyStart, budget.dailyEnd, budget.dailyLimitMicros],
      ["monthly", budget.monthlyStart, budget.monthlyEnd, budget.monthlyLimitMicros]
    ]) {
      db.prepare(`INSERT OR IGNORE INTO developer_cost_budget_windows (
        window_kind, window_start, window_end, limit_twd_micros, reserved_twd_micros, used_twd_micros
      ) VALUES (?, ?, ?, ?, 0, 0)`).run(...item);
      const row = db.prepare(`SELECT limit_twd_micros, reserved_twd_micros, used_twd_micros
        FROM developer_cost_budget_windows WHERE window_kind = ? AND window_start = ?`).get(item[0], item[1]);
      if (!row || Number(row.used_twd_micros) + Number(row.reserved_twd_micros) + budget.jobReserveMicros > Number(row.limit_twd_micros)) {
        return false;
      }
    }
    db.prepare(`UPDATE developer_cost_budget_windows SET reserved_twd_micros = reserved_twd_micros + ?
      WHERE (window_kind = 'daily' AND window_start = ?) OR (window_kind = 'monthly' AND window_start = ?)`)
      .run(budget.jobReserveMicros, budget.dailyStart, budget.monthlyStart);
    return true;
  }

  function getJob({ tenantId, jobId }) {
    const row = db.prepare("SELECT * FROM developer_jobs WHERE tenant_id = ? AND job_id = ? LIMIT 1").get(tenantId, jobId);
    return row ? mapJob(row) : null;
  }

  function getJobByMeasurement({ tenantId, measurementId }) {
    const row = db.prepare("SELECT * FROM developer_jobs WHERE tenant_id = ? AND measurement_id = ? LIMIT 1").get(tenantId, measurementId);
    return row ? mapJob(row) : null;
  }

  function listJobs({ tenantId, limit = 50 }) {
    return db.prepare(`SELECT * FROM developer_jobs WHERE tenant_id = ?
      ORDER BY created_at DESC LIMIT ?`).all(tenantId, clampLimit(limit)).map(mapJob);
  }

  function claimJob(input) {
    return transaction(() => {
      const updated = db.prepare(`UPDATE developer_jobs SET status = 'running', worker_id = ?, lease_token = ?,
        lease_expires_at = ?, updated_at = ? WHERE job_id = ? AND status = 'queued'`)
        .run(input.workerId, input.leaseToken, input.leaseExpiresAt, input.now, input.jobId);
      if (Number(updated.changes) !== 1) return null;
      return mapJob(db.prepare("SELECT * FROM developer_jobs WHERE job_id = ?").get(input.jobId));
    });
  }

  function listQueuedJobs({ limit = 25 }) {
    return db.prepare("SELECT * FROM developer_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?")
      .all(clampLimit(limit)).map(mapJob);
  }

  function recordAttemptStarted(input) {
    db.prepare(`INSERT INTO developer_provider_attempts (
      attempt_id, job_id, tenant_id, profile_id, status, started_at
    ) VALUES (?, ?, ?, ?, 'started', ?)
    ON CONFLICT(job_id, profile_id) DO NOTHING`)
      .run(input.attemptId, input.jobId, input.tenantId, input.profileId, input.now);
  }

  function recordAttemptFinished(input) {
    const result = db.prepare(`UPDATE developer_provider_attempts SET status = ?, completed_at = ?,
      error_code = ?, usage_json = ?, cost_json = ?
      WHERE job_id = ? AND profile_id = ? AND status = 'started'`)
      .run(input.status, input.now, input.errorCode || null, jsonOrNull(input.usage), jsonOrNull(input.cost), input.jobId, input.profileId);
    return Number(result.changes) === 1;
  }

  function completeJob(input) {
    const resultJson = JSON.stringify(input.measurement);
    if (Buffer.byteLength(resultJson, "utf8") > MAX_RESULT_BYTES) {
      const error = new Error(`Measurement result exceeds ${MAX_RESULT_BYTES} bytes`);
      error.code = "result_too_large";
      throw error;
    }
    return transaction(() => {
      const job = db.prepare("SELECT * FROM developer_jobs WHERE job_id = ? LIMIT 1").get(input.jobId);
      if (!job || job.status !== "running" || job.lease_token !== input.leaseToken) return false;
      const reservation = db.prepare("SELECT * FROM developer_quota_reservations WHERE job_id = ? AND status = 'reserved'").get(input.jobId);
      if (!reservation) return false;
      db.prepare(`INSERT INTO developer_measurement_results (
        measurement_id, tenant_id, status, created_at, completed_at, expires_at, result_hash, result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(measurement_id) DO UPDATE SET status = excluded.status,
        completed_at = excluded.completed_at, expires_at = excluded.expires_at,
        result_hash = excluded.result_hash, result_json = excluded.result_json`)
        .run(input.measurement.measurement_id, input.measurement.tenant_id, input.measurement.status,
          input.measurement.created_at, input.measurement.completed_at, input.expiresAt || null,
          createHash("sha256").update(resultJson).digest("hex"), resultJson);
      const succeeded = input.measurement.status === "succeeded";
      db.prepare(`UPDATE developer_quota_windows SET
        reserved_rounds = CASE WHEN reserved_rounds > 0 THEN reserved_rounds - 1 ELSE 0 END,
        used_rounds = used_rounds + ? WHERE tenant_id = ? AND window_start = ?`)
        .run(succeeded ? 1 : 0, reservation.tenant_id, reservation.window_start);
      db.prepare("UPDATE developer_quota_reservations SET status = ?, settled_at = ? WHERE reservation_id = ?")
        .run(succeeded ? "charged" : "released", input.now, reservation.reservation_id);
      db.prepare(`UPDATE developer_jobs SET status = ?, completed_at = ?, updated_at = ?, error_code = ?,
        lease_token = NULL, lease_expires_at = NULL WHERE job_id = ?`)
        .run(input.measurement.status, input.now, input.now, input.errorCode || null, input.jobId);
      const cost = input.measurement.provider_cost || {};
      const actualTwdMicros = settleCostReservation(input.jobId, input.now, cost, input.twdPerUsd);
      db.prepare(`INSERT OR IGNORE INTO developer_cost_events (
        cost_event_id, job_id, tenant_id, amount_min_usd, amount_max_usd, has_unknown_cost, created_at, amount_twd_micros
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.costEventId, input.jobId, input.measurement.tenant_id,
          finiteOrNull(cost.minimum_usd), finiteOrNull(cost.maximum_usd), cost.has_unknown_cost ? 1 : 0, input.now,
          actualTwdMicros);
      return true;
    });
  }

  function settleCostReservation(jobId, now, cost, twdPerUsd) {
    const reservation = db.prepare("SELECT * FROM developer_cost_reservations WHERE job_id = ? AND status = 'reserved'").get(jobId);
    if (!reservation) return null;
    const estimated = Number(cost.maximum_usd);
    const computed = Number.isFinite(estimated) && estimated >= 0 && Number.isFinite(Number(twdPerUsd))
      ? Math.ceil(estimated * Number(twdPerUsd) * 1_000_000) : Number(reservation.reserved_twd_micros);
    const actual = cost.has_unknown_cost ? Math.max(computed, Number(reservation.reserved_twd_micros)) : computed;
    db.prepare(`UPDATE developer_cost_budget_windows SET
      reserved_twd_micros = CASE WHEN reserved_twd_micros >= ? THEN reserved_twd_micros - ? ELSE 0 END,
      used_twd_micros = used_twd_micros + ?
      WHERE (window_kind = 'daily' AND window_start = ?) OR (window_kind = 'monthly' AND window_start = ?)`)
      .run(reservation.reserved_twd_micros, reservation.reserved_twd_micros, actual,
        reservation.daily_window_start, reservation.monthly_window_start);
    db.prepare(`UPDATE developer_cost_reservations SET status = ?, actual_twd_micros = ?, settled_at = ? WHERE job_id = ?`)
      .run(cost.has_unknown_cost ? "ambiguous" : "charged", actual, now, jobId);
    return actual;
  }

  function failJob(input) {
    return transaction(() => {
      const job = db.prepare("SELECT * FROM developer_jobs WHERE job_id = ? LIMIT 1").get(input.jobId);
      if (!job || !["queued", "running"].includes(job.status)) return false;
      if (job.status === "running" && input.leaseToken && job.lease_token !== input.leaseToken) return false;
      const reservation = db.prepare("SELECT * FROM developer_quota_reservations WHERE job_id = ? AND status = 'reserved'").get(input.jobId);
      if (reservation) {
        db.prepare(`UPDATE developer_quota_windows SET reserved_rounds =
          CASE WHEN reserved_rounds > 0 THEN reserved_rounds - 1 ELSE 0 END
          WHERE tenant_id = ? AND window_start = ?`).run(reservation.tenant_id, reservation.window_start);
        db.prepare("UPDATE developer_quota_reservations SET status = 'released', settled_at = ? WHERE reservation_id = ?")
          .run(input.now, reservation.reservation_id);
      }
      settleFailedCostReservation(input.jobId, input.now, input.errorCode);
      db.prepare(`UPDATE developer_jobs SET status = 'failed', completed_at = ?, updated_at = ?,
        error_code = ?, lease_token = NULL, lease_expires_at = NULL WHERE job_id = ?`)
        .run(input.now, input.now, input.errorCode || "internal_error", input.jobId);
      return true;
    });
  }

  function settleFailedCostReservation(jobId, now, errorCode) {
    const cost = db.prepare("SELECT * FROM developer_cost_reservations WHERE job_id = ? AND status = 'reserved'").get(jobId);
    if (!cost) return;
    const ambiguous = errorCode === "ambiguous_attempt";
    db.prepare(`UPDATE developer_cost_budget_windows SET
      reserved_twd_micros = CASE WHEN reserved_twd_micros >= ? THEN reserved_twd_micros - ? ELSE 0 END,
      used_twd_micros = used_twd_micros + ?
      WHERE (window_kind = 'daily' AND window_start = ?) OR (window_kind = 'monthly' AND window_start = ?)`)
      .run(cost.reserved_twd_micros, cost.reserved_twd_micros, ambiguous ? cost.reserved_twd_micros : 0,
        cost.daily_window_start, cost.monthly_window_start);
    db.prepare(`UPDATE developer_cost_reservations SET status = ?, actual_twd_micros = ?, settled_at = ? WHERE job_id = ?`)
      .run(ambiguous ? "ambiguous" : "released", ambiguous ? cost.reserved_twd_micros : 0, now, jobId);
  }

  function expireStaleJobs({ now }) {
    return transaction(() => {
      const stale = db.prepare(`SELECT job_id FROM developer_jobs
        WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`).all(now);
      for (const item of stale) {
        db.prepare(`UPDATE developer_provider_attempts SET status = 'ambiguous', completed_at = ?, error_code = 'ambiguous_attempt'
          WHERE job_id = ? AND status = 'started'`).run(now, item.job_id);
        failJobWithoutTransaction(item.job_id, now, "ambiguous_attempt");
      }
      return stale.map((item) => item.job_id);
    });
  }

  function failJobWithoutTransaction(jobId, now, errorCode) {
    const reservation = db.prepare("SELECT * FROM developer_quota_reservations WHERE job_id = ? AND status = 'reserved'").get(jobId);
    if (reservation) {
      db.prepare(`UPDATE developer_quota_windows SET reserved_rounds =
        CASE WHEN reserved_rounds > 0 THEN reserved_rounds - 1 ELSE 0 END
        WHERE tenant_id = ? AND window_start = ?`).run(reservation.tenant_id, reservation.window_start);
      db.prepare("UPDATE developer_quota_reservations SET status = 'released', settled_at = ? WHERE reservation_id = ?")
        .run(now, reservation.reservation_id);
    }
    settleFailedCostReservation(jobId, now, errorCode);
    db.prepare(`UPDATE developer_jobs SET status = 'failed', completed_at = ?, updated_at = ?, error_code = ?,
      lease_token = NULL, lease_expires_at = NULL WHERE job_id = ?`).run(now, now, errorCode, jobId);
  }

  function getMeasurement({ tenantId, measurementId, now }) {
    const row = db.prepare(`SELECT result_json FROM developer_measurement_results
      WHERE tenant_id = ? AND measurement_id = ? AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`)
      .get(tenantId, measurementId, now);
    if (!row?.result_json) return null;
    try { return JSON.parse(row.result_json); } catch { return null; }
  }

  function deleteMeasurement({ tenantId, measurementId, now }) {
    return transaction(() => {
      const job = db.prepare(`SELECT job_id, status FROM developer_jobs
        WHERE tenant_id = ? AND measurement_id = ? LIMIT 1`).get(tenantId, measurementId);
      if (!job) return { status: "not_found" };
      if (!["succeeded", "failed"].includes(job.status)) return { status: "not_terminal" };
      db.prepare("DELETE FROM developer_measurement_results WHERE tenant_id = ? AND measurement_id = ?")
        .run(tenantId, measurementId);
      db.prepare("UPDATE developer_jobs SET content_deleted_at = ?, updated_at = ? WHERE job_id = ?")
        .run(now, now, job.job_id);
      return { status: "deleted" };
    });
  }

  function getUsage({ tenantId, windowStart, windowEnd, roundLimit }) {
    const row = db.prepare(`SELECT round_limit, used_rounds, reserved_rounds FROM developer_quota_windows
      WHERE tenant_id = ? AND window_start = ? LIMIT 1`).get(tenantId, windowStart);
    const used = Number(row?.used_rounds || 0);
    const reserved = Number(row?.reserved_rounds || 0);
    const limit = Number(row?.round_limit ?? roundLimit ?? 0);
    return {
      used_rounds: used,
      reserved_rounds: reserved,
      remaining_rounds: Math.max(0, limit - used - reserved),
      quota_limit: limit,
      window_start: windowStart,
      window_end: windowEnd
    };
  }

  function recordSecurityEvent(input) {
    db.prepare(`INSERT INTO developer_security_events (
      event_id, tenant_id, event_type, severity, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(input.eventId, input.tenantId || null, input.eventType, input.severity,
        JSON.stringify(sanitizeSecurityMetadata(input.metadata)), input.now);
  }

  function listSecurityEvents({ limit = 100 }) {
    return db.prepare(`SELECT event_id, tenant_id, event_type, severity, metadata_json, created_at
      FROM developer_security_events ORDER BY created_at DESC LIMIT ?`).all(clampLimit(limit)).map((row) => ({
      event_id: row.event_id,
      tenant_id: row.tenant_id,
      event_type: row.event_type,
      severity: row.severity,
      metadata: safeParse(row.metadata_json, {}),
      created_at: row.created_at
    }));
  }

  function getAdminOverview() {
    const scalar = (sql, params = []) => Number(Object.values(db.prepare(sql).get(...params) || {})[0] || 0);
    const jobRows = db.prepare("SELECT status, COUNT(*) AS count FROM developer_jobs GROUP BY status").all();
    const jobs = { queued: 0, running: 0, succeeded: 0, failed: 0 };
    for (const row of jobRows) jobs[row.status] = Number(row.count);
    const cost = db.prepare(`SELECT COALESCE(SUM(amount_min_usd), 0) AS minimum_usd,
      COALESCE(SUM(amount_max_usd), 0) AS maximum_usd,
      COALESCE(SUM(has_unknown_cost), 0) AS unknown_events,
      COALESCE(SUM(amount_twd_micros), 0) AS settled_twd_micros FROM developer_cost_events`).get();
    const budgets = db.prepare(`SELECT window_kind, window_start, window_end, limit_twd_micros,
      reserved_twd_micros, used_twd_micros FROM developer_cost_budget_windows
      WHERE window_end > ? ORDER BY window_kind`).all(new Date().toISOString());
    return {
      admission: getAdmission(),
      accounts: { total: scalar("SELECT COUNT(*) FROM developer_accounts WHERE status != 'deleted'") },
      api_keys: { active: scalar("SELECT COUNT(*) FROM developer_api_keys WHERE status = 'active'") },
      jobs,
      provider_cost: {
        minimum_usd: Number(cost.minimum_usd || 0),
        maximum_usd: Number(cost.maximum_usd || 0),
        unknown_events: Number(cost.unknown_events || 0),
        settled_twd: Number(cost.settled_twd_micros || 0) / 1_000_000
      },
      budget_windows: budgets.map(mapBudgetWindow)
    };
  }

  return {
    activateEntitlement,
    admitJob,
    authenticateApiKey,
    authenticateSession,
    claimJob,
    close: () => db.close(),
    completeJob,
    consumeAuthToken,
    deleteMeasurement,
    expireStaleJobs,
    findVerifiedAccountByEmail,
    getAdminOverview,
    getAdmission,
    getEntitlement,
    getJob,
    getJobByMeasurement,
    getMeasurement,
    getUsage,
    insertApiKey,
    insertAuthToken,
    listApiKeys,
    listAuthOutbox,
    listJobs,
    listQueuedJobs,
    listSecurityEvents,
    recordAttemptFinished,
    recordAttemptStarted,
    recordSecurityEvent,
    revokeApiKey,
    setAdmission,
    state: () => ({ kind: "sqlite", durable: options.filename !== ":memory:", maxResultBytes: MAX_RESULT_BYTES })
  };
}

function mapEntitlement(row) {
  return {
    tenantId: row.tenant_id,
    plan: row.plan,
    status: row.status,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at || null,
    quotaWindowStrategy: row.quota_window_strategy,
    roundsPerWindow: Number(row.rounds_per_window)
  };
}

function mapApiKey(row) {
  return {
    key_id: row.key_id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: safeParse(row.scopes_json, []),
    status: row.status,
    created_at: row.created_at,
    revoked_at: row.revoked_at || null,
    last_used_at: row.last_used_at || null
  };
}

function mapJob(row) {
  return {
    job_id: row.job_id,
    measurement_id: row.measurement_id,
    tenant_id: row.tenant_id,
    status: row.status,
    created_at: row.created_at,
    completed_at: row.completed_at || null,
    content_deleted_at: row.content_deleted_at || null,
    error_code: row.error_code || null,
    request_hash: row.request_hash,
    request: safeParse(row.request_json, null),
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

function jsonOrNull(value) {
  return value == null ? null : JSON.stringify(value);
}

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampLimit(value) {
  return Math.max(1, Math.min(250, Number(value) || 50));
}

function mapBudgetWindow(row) {
  return {
    kind: row.window_kind,
    window_start: row.window_start,
    window_end: row.window_end,
    limit_twd: Number(row.limit_twd_micros) / 1_000_000,
    reserved_twd: Number(row.reserved_twd_micros) / 1_000_000,
    used_twd: Number(row.used_twd_micros) / 1_000_000
  };
}

module.exports = { createSqliteDeveloperPlatformStore };
