// Product A Dashboard store backed by a Cloudflare D1 binding.
//
// It exposes exactly the same method surface as `dashboard-store.js` (the Node
// `node:sqlite` store) so `dashboard-service.js` can run unchanged in a Worker.
// This module must never import `node:sqlite`: the Workers bundle test rejects it.
//
// D1 has no interactive transactions (`BEGIN IMMEDIATE`). Every place where the
// SQLite store relied on one is re-expressed as a single `batch()` — which D1
// executes as one implicit transaction — with the invariant pushed into the SQL
// itself as a conditional `INSERT ... SELECT ... WHERE` or a guarded `UPDATE`.
// The two paths where this matters for correctness are `consumeInvitation`
// (an invitation must be consumable exactly once) and `reserveManualTrackingJob`
// (manual-update quota must never be over-drawn).

const {
  mapGoogleConnection, boolToSql, mapAccount, mapProject, mapEntitlement, mapTrackingJob,
  mapQuestionSet, mapQuestion, mapRun, mapObservation, mapAnnotation, parseJson, clampLimit
} = require("./dashboard-row-mappers.js");

// D1 binds at most 100 parameters per statement; keep IN (...) fan-out well below it.
const MAX_IN_PARAMETERS = 50;
// A tracking run is inserted as one atomic batch. Refuse rather than silently
// splitting it into non-atomic chunks.
const MAX_ATOMIC_STATEMENTS = 200;
// GSC upserts are idempotent, so they may be chunked without losing correctness.
const GSC_UPSERT_CHUNK = 100;

function createD1DashboardStore(options = {}) {
  const execute = options.execute;
  if (typeof execute !== "function") throw new TypeError("A D1 execute function is required");

  async function query(sql, params = []) {
    const results = await execute({ sql, params: normalizeParams(params) });
    return results[0] || { results: [], meta: {} };
  }

  async function batch(statements) {
    if (statements.length > MAX_ATOMIC_STATEMENTS) {
      throw new Error(`Dashboard D1 batch exceeds ${MAX_ATOMIC_STATEMENTS} atomic statements`);
    }
    return execute({ batch: statements.map(({ sql, params = [] }) => ({ sql, params: normalizeParams(params) })) });
  }

  async function first(sql, params = []) {
    return rows(await query(sql, params))[0] || null;
  }

  // ---- accounts, invitations and sessions ----

  async function insertInvitation(input) {
    await query(`INSERT INTO dashboard_auth_tokens (
      token_id, purpose, email_normalized, token_hash, created_at, expires_at
    ) VALUES (?, 'invitation', ?, ?, ?, ?)`, [
      input.tokenId, input.email, input.tokenHash, input.createdAt, input.expiresAt
    ]);
    return true;
  }

  async function consumeInvitation(input) {
    // One atomic batch. The account and session inserts are gated on the token
    // still being unconsumed; the final UPDATE is the single authoritative gate
    // and its RETURNING row is what decides success.
    const results = await batch([
      {
        sql: `INSERT INTO dashboard_accounts (account_id, email_normalized, status, created_at, verified_at)
          SELECT ?, token.email_normalized, 'verified', ?, ?
          FROM dashboard_auth_tokens token
          WHERE token.token_hash = ? AND token.purpose = 'invitation'
            AND token.consumed_at IS NULL AND token.expires_at > ?
            AND NOT EXISTS (
              SELECT 1 FROM dashboard_accounts existing
              WHERE existing.email_normalized = token.email_normalized AND existing.status = 'verified'
            )`,
        params: [input.accountId, input.now, input.now, input.tokenHash, input.now]
      },
      {
        sql: `INSERT INTO dashboard_sessions (session_id, account_id, token_hash, created_at, expires_at)
          SELECT ?, account.account_id, ?, ?, ?
          FROM dashboard_auth_tokens token
          JOIN dashboard_accounts account
            ON account.email_normalized = token.email_normalized AND account.status = 'verified'
          WHERE token.token_hash = ? AND token.purpose = 'invitation'
            AND token.consumed_at IS NULL AND token.expires_at > ?`,
        params: [input.sessionId, input.sessionHash, input.now, input.sessionExpiresAt, input.tokenHash, input.now]
      },
      {
        sql: `UPDATE dashboard_auth_tokens SET consumed_at = ?
          WHERE token_hash = ? AND purpose = 'invitation'
            AND consumed_at IS NULL AND expires_at > ?
          RETURNING email_normalized`,
        params: [input.now, input.tokenHash, input.now]
      }
    ]);
    const consumed = rows(results[2])[0];
    if (!consumed) return null;
    return findVerifiedAccountByEmail(consumed.email_normalized);
  }

  async function findVerifiedAccountByEmail(email) {
    const row = await first(`SELECT * FROM dashboard_accounts
      WHERE email_normalized = ? AND status = 'verified' LIMIT 1`, [email]);
    return row ? mapAccount(row) : null;
  }

  async function authenticateSession(input) {
    const results = await batch([
      {
        sql: `UPDATE dashboard_sessions SET last_used_at = ?
          WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
        params: [input.now, input.tokenHash, input.now]
      },
      {
        sql: `SELECT session.session_id, session.account_id, session.expires_at, account.email_normalized
          FROM dashboard_sessions session
          JOIN dashboard_accounts account ON account.account_id = session.account_id
          WHERE session.token_hash = ? AND session.revoked_at IS NULL AND session.expires_at > ?
            AND account.status = 'verified' LIMIT 1`,
        params: [input.tokenHash, input.now]
      }
    ]);
    const row = rows(results[1])[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      accountId: row.account_id,
      email: row.email_normalized,
      expiresAt: row.expires_at
    };
  }

  async function createSession(input) {
    await query(`INSERT INTO dashboard_sessions (session_id, account_id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)`, [input.sessionId, input.accountId, input.sessionHash, input.now, input.sessionExpiresAt]);
    return true;
  }

  // ---- projects ----

  async function createProject(input) {
    await batch([
      {
        sql: `INSERT INTO dashboard_projects (project_id, name, site_url, timezone, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        params: [input.projectId, input.name, input.siteUrl, input.timezone, input.now, input.now]
      },
      {
        sql: `INSERT INTO dashboard_project_members (project_id, account_id, role, created_at)
          VALUES (?, ?, 'owner', ?)`,
        params: [input.projectId, input.accountId, input.now]
      },
      {
        sql: `INSERT INTO dashboard_tracking_plans (project_id, cadence, enabled, next_run_at, updated_at)
          VALUES (?, 'weekly', 1, ?, ?)`,
        params: [input.projectId, input.nextRunAt, input.now]
      }
    ]);
    return getProject(input.projectId);
  }

  async function getProject(projectId) {
    const row = await first(`SELECT project.*, plan.cadence, plan.enabled, plan.next_run_at
      FROM dashboard_projects project
      JOIN dashboard_tracking_plans plan ON plan.project_id = project.project_id
      WHERE project.project_id = ? LIMIT 1`, [projectId]);
    return row ? mapProject(row) : null;
  }

  async function listProjects(accountId) {
    const result = await query(`SELECT project.*, plan.cadence, plan.enabled, plan.next_run_at, member.role
      FROM dashboard_projects project
      JOIN dashboard_project_members member ON member.project_id = project.project_id
      JOIN dashboard_tracking_plans plan ON plan.project_id = project.project_id
      WHERE member.account_id = ? ORDER BY project.updated_at DESC`, [accountId]);
    return rows(result).map(mapProject);
  }

  async function getMembership(projectId, accountId) {
    const row = await first(`SELECT role FROM dashboard_project_members
      WHERE project_id = ? AND account_id = ? LIMIT 1`, [projectId, accountId]);
    return row ? { role: row.role } : null;
  }

  async function countProjects(accountId) {
    const row = await first("SELECT COUNT(*) AS count FROM dashboard_project_members WHERE account_id = ?", [accountId]);
    return Number(row?.count || 0);
  }

  // ---- entitlements, subscription periods and manual-run quota ----

  async function getEntitlement(accountId) {
    const row = await first("SELECT * FROM dashboard_entitlements WHERE account_id = ? LIMIT 1", [accountId]);
    return row ? mapEntitlement(row) : null;
  }

  async function upsertEntitlement(input) {
    await query(`INSERT INTO dashboard_entitlements (
      account_id, plan, status, active_project_limit, manual_run_limit,
      period_start, period_end, grace_ends_at, cancel_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
      active_project_limit=excluded.active_project_limit, manual_run_limit=excluded.manual_run_limit,
      period_start=excluded.period_start, period_end=excluded.period_end, grace_ends_at=excluded.grace_ends_at,
      cancel_at=excluded.cancel_at, updated_at=excluded.updated_at`, [
      input.accountId, input.plan, input.status, input.activeProjectLimit, input.manualRunLimit,
      input.periodStart || null, input.periodEnd || null, input.graceEndsAt || null, input.cancelAt || null, input.now
    ]);
    return getEntitlement(input.accountId);
  }

  async function createSubscriptionPeriod(input) {
    await query(`INSERT INTO dashboard_subscription_periods (
      period_id, account_id, plan, starts_at, ends_at, manual_run_limit, created_at
    ) VALUES (?, ?, 'paid_beta', ?, ?, ?, ?)`, [
      input.periodId, input.accountId, input.startsAt, input.endsAt, input.manualRunLimit, input.now
    ]);
    return { ...input, plan: "paid_beta" };
  }

  async function getCurrentSubscriptionPeriod(accountId, startsAt) {
    const row = await first(`SELECT * FROM dashboard_subscription_periods
      WHERE account_id = ? AND starts_at = ? LIMIT 1`, [accountId, startsAt]);
    return row ? { periodId: row.period_id, manualRunLimit: Number(row.manual_run_limit) } : null;
  }

  async function manualUsage(periodId) {
    const row = await first(`SELECT COUNT(*) AS count FROM dashboard_manual_run_reservations
      WHERE period_id = ? AND status IN ('reserved','charged')`, [periodId]);
    return Number(row?.count || 0);
  }

  async function reserveManualTrackingJob(input) {
    // The quota checks live inside the INSERT so that D1 evaluates them in the
    // same transaction as the write; a concurrent reservation cannot slip
    // between a separate read and write. `changes === 0` means a gate rejected it.
    const results = await batch([
      {
        sql: `INSERT INTO dashboard_tracking_jobs (
          job_id, account_id, project_id, kind, status, dedupe_key, reservation_id, created_at, updated_at
        )
        SELECT ?, ?, ?, 'manual', 'queued', ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM dashboard_subscription_periods
                WHERE period_id = ? AND account_id = ?) = 1
          AND (SELECT COUNT(*) FROM dashboard_manual_run_reservations
                WHERE period_id = ? AND status IN ('reserved','charged'))
              < (SELECT manual_run_limit FROM dashboard_subscription_periods WHERE period_id = ?)
          AND (SELECT COUNT(*) FROM dashboard_manual_run_reservations
                WHERE account_id = ? AND day_taipei = ? AND status IN ('reserved','charged')) < ?`,
        params: [
          input.jobId, input.accountId, input.projectId, input.dedupeKey, input.reservationId, input.now, input.now,
          input.periodId, input.accountId,
          input.periodId, input.periodId,
          input.accountId, input.dayTaipei, input.dailyLimit
        ]
      },
      {
        sql: `INSERT INTO dashboard_manual_run_reservations (
          reservation_id, account_id, period_id, day_taipei, status, job_id, created_at
        )
        SELECT ?, ?, ?, ?, 'reserved', ?, ?
        WHERE EXISTS (SELECT 1 FROM dashboard_tracking_jobs WHERE job_id = ?)`,
        params: [
          input.reservationId, input.accountId, input.periodId, input.dayTaipei,
          input.jobId, input.now, input.jobId
        ]
      }
    ]);
    if (changes(results[0]) !== 1) return { rejected: await rejectionReason(input) };
    return { job: await getTrackingJob(input.jobId), reservationId: input.reservationId };
  }

  // Only used to report *why* a reservation was refused, after the atomic gate
  // has already refused it. It never grants anything.
  async function rejectionReason(input) {
    const period = await first(`SELECT manual_run_limit FROM dashboard_subscription_periods
      WHERE period_id = ? AND account_id = ? LIMIT 1`, [input.periodId, input.accountId]);
    if (!period) return "entitlement_required";
    const daily = await first(`SELECT COUNT(*) AS count FROM dashboard_manual_run_reservations
      WHERE account_id = ? AND day_taipei = ? AND status IN ('reserved','charged')`, [input.accountId, input.dayTaipei]);
    if (Number(daily?.count || 0) >= Number(input.dailyLimit)) return "daily_manual_limit";
    return "manual_quota_exhausted";
  }

  async function settleTrackingJob(input) {
    const status = input.state === "complete" ? "succeeded" : input.state;
    const results = await batch([
      {
        sql: `UPDATE dashboard_tracking_jobs SET status = ?, updated_at = ?, completed_at = ?
          WHERE job_id = ? AND status IN ('queued','running')
          RETURNING reservation_id`,
        params: [status, input.now, input.now, input.jobId]
      },
      {
        // Gated on the row this very batch just settled, so a job that was
        // already terminal cannot re-settle its reservation.
        sql: `UPDATE dashboard_manual_run_reservations SET status = ?, settled_at = ?
          WHERE job_id = ? AND status = 'reserved'
            AND EXISTS (
              SELECT 1 FROM dashboard_tracking_jobs job
              WHERE job.job_id = ? AND job.status = ? AND job.completed_at = ?
            )`,
        params: [
          status === "succeeded" ? "charged" : "released", input.now,
          input.jobId, input.jobId, status, input.now
        ]
      }
    ]);
    return rows(results[0]).length === 1;
  }

  async function getTrackingJob(jobId) {
    const row = await first("SELECT * FROM dashboard_tracking_jobs WHERE job_id = ? LIMIT 1", [jobId]);
    return row ? mapTrackingJob(row) : null;
  }

  async function insertPaymentEvent(input) {
    const result = await query(`INSERT OR IGNORE INTO dashboard_payment_events (
      payment_event_id, account_id, provider, provider_transaction_id, provider_period_id,
      event_type, status, occurred_at, created_at
    ) VALUES (?, ?, 'newebpay', ?, ?, ?, ?, ?, ?)`, [
      input.paymentEventId, input.accountId, input.providerTransactionId, input.providerPeriodId || null,
      input.eventType, input.status, input.occurredAt, input.now
    ]);
    return changes(result) === 1;
  }

  // ---- question sets ----

  async function createQuestionSet(input) {
    const statements = [];
    if (input.status === "active") {
      statements.push({
        sql: "UPDATE dashboard_question_sets SET status = 'archived' WHERE project_id = ? AND status = 'active'",
        params: [input.projectId]
      });
    }
    statements.push({
      sql: `INSERT INTO dashboard_question_sets (question_set_id, project_id, version, locale, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      params: [input.questionSetId, input.projectId, input.version, input.locale, input.status, input.now]
    });
    for (const question of input.questions) {
      statements.push({
        sql: `INSERT INTO dashboard_questions (question_id, question_set_id, text, intent, tags_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        params: [
          question.questionId, input.questionSetId, question.text, question.intent || null,
          JSON.stringify(question.tags || []), input.now
        ]
      });
    }
    await batch(statements);
    return getQuestionSet(input.questionSetId);
  }

  async function getQuestionSet(questionSetId) {
    const row = await first("SELECT * FROM dashboard_question_sets WHERE question_set_id = ? LIMIT 1", [questionSetId]);
    if (!row) return null;
    const questions = await query(`SELECT * FROM dashboard_questions
      WHERE question_set_id = ? ORDER BY created_at ASC`, [questionSetId]);
    return { ...mapQuestionSet(row), questions: rows(questions).map(mapQuestion) };
  }

  async function listQuestionSets(projectId) {
    const result = await query(`SELECT * FROM dashboard_question_sets
      WHERE project_id = ? ORDER BY version DESC`, [projectId]);
    return rows(result).map(mapQuestionSet);
  }

  // ---- tracking runs and observations ----

  async function insertTrackingRun(input) {
    const statements = [{
      sql: `INSERT INTO dashboard_tracking_runs (
        run_id, project_id, question_set_id, scheduled_at, observed_at, state,
        expected_observations, measured_observations, unknown_observations,
        failed_observations, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        input.runId, input.projectId, input.questionSetId, input.scheduledAt, input.observedAt,
        input.state, input.expectedObservations, input.measuredObservations,
        input.unknownObservations, input.failedObservations, input.now
      ]
    }];
    for (const observation of input.observations) {
      statements.push({
        sql: `INSERT INTO dashboard_observations (
          observation_id, run_id, question_id, engine, model, status, brand_mentioned,
          official_citation, raw_answer, citations_json, observed_at, failure_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          observation.observationId, input.runId, observation.questionId, observation.engine,
          observation.model || null, observation.status, boolToSql(observation.brandMentioned),
          boolToSql(observation.officialCitation), observation.rawAnswer || null,
          JSON.stringify(observation.citations || []), observation.observedAt || input.observedAt || null,
          observation.failureCode || null
        ]
      });
    }
    statements.push({
      sql: "UPDATE dashboard_tracking_plans SET next_run_at = ?, updated_at = ? WHERE project_id = ?",
      params: [input.nextRunAt, input.now, input.projectId]
    });
    statements.push({
      sql: "UPDATE dashboard_projects SET updated_at = ? WHERE project_id = ?",
      params: [input.now, input.projectId]
    });
    await batch(statements);
    return getRun(input.runId);
  }

  async function getRun(runId) {
    const row = await first("SELECT * FROM dashboard_tracking_runs WHERE run_id = ? LIMIT 1", [runId]);
    return row ? mapRun(row) : null;
  }

  async function listRuns(projectId, from, to) {
    const result = await query(`SELECT * FROM dashboard_tracking_runs
      WHERE project_id = ? AND observed_at IS NOT NULL AND observed_at >= ? AND observed_at <= ?
      ORDER BY observed_at ASC`, [projectId, from, to]);
    return rows(result).map(mapRun);
  }

  async function listRecentRuns(projectId, limit = 100) {
    const result = await query(`SELECT * FROM dashboard_tracking_runs WHERE project_id = ?
      ORDER BY COALESCE(observed_at, scheduled_at) DESC LIMIT ?`, [projectId, clampLimit(limit)]);
    return rows(result).map(mapRun);
  }

  async function listObservationsForRuns(runIds) {
    if (!runIds.length) return [];
    const collected = [];
    for (const chunk of chunkArray(runIds, MAX_IN_PARAMETERS)) {
      const placeholders = chunk.map(() => "?").join(",");
      const result = await query(`SELECT observation.*, question.text AS question_text,
        question.intent AS question_intent, question.tags_json AS question_tags_json,
        question_set.version AS question_set_version
        FROM dashboard_observations observation
        JOIN dashboard_questions question ON question.question_id = observation.question_id
        JOIN dashboard_tracking_runs run ON run.run_id = observation.run_id
        JOIN dashboard_question_sets question_set ON question_set.question_set_id = run.question_set_id
        WHERE observation.run_id IN (${placeholders})`, chunk);
      collected.push(...rows(result).map(mapObservation));
    }
    return collected;
  }

  async function getObservationForProject(projectId, observationId) {
    const row = await first(`SELECT observation.*, question.text AS question_text,
      question.intent AS question_intent, question.tags_json AS question_tags_json,
      question_set.version AS question_set_version
      FROM dashboard_observations observation
      JOIN dashboard_tracking_runs run ON run.run_id = observation.run_id
      JOIN dashboard_questions question ON question.question_id = observation.question_id
      JOIN dashboard_question_sets question_set ON question_set.question_set_id = run.question_set_id
      WHERE run.project_id = ? AND observation.observation_id = ? LIMIT 1`, [projectId, observationId]);
    return row ? mapObservation(row) : null;
  }

  // ---- annotations ----

  async function createAnnotation(input) {
    await query(`INSERT INTO dashboard_annotations (
      annotation_id, project_id, account_id, occurred_at, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`, [
      input.annotationId, input.projectId, input.accountId, input.occurredAt, input.note, input.now
    ]);
    const row = await first("SELECT * FROM dashboard_annotations WHERE annotation_id = ? LIMIT 1", [input.annotationId]);
    return row ? mapAnnotation(row) : null;
  }

  async function listAnnotations(projectId, from, to) {
    const result = await query(`SELECT * FROM dashboard_annotations
      WHERE project_id = ? AND occurred_at >= ? AND occurred_at <= ?
      ORDER BY occurred_at DESC`, [projectId, from, to]);
    return rows(result).map(mapAnnotation);
  }

  // ---- tracking dispatches (D-047 phase 2) ----

  // A plan is due when its next run time has passed. Claiming it pushes the next
  // run forward in the same statement, so two Worker ticks cannot both claim it.
  async function claimDueTrackingPlans({ now, nextRunAt, limit }) {
    const result = await query(`SELECT plan.project_id, plan.next_run_at, member.account_id,
      project.name, project.site_url, question_set.question_set_id
      FROM dashboard_tracking_plans plan
      JOIN dashboard_projects project ON project.project_id = plan.project_id
      JOIN dashboard_project_members member
        ON member.project_id = plan.project_id AND member.role = 'owner'
      JOIN dashboard_question_sets question_set
        ON question_set.project_id = plan.project_id AND question_set.status = 'active'
      WHERE plan.enabled = 1 AND plan.next_run_at IS NOT NULL AND plan.next_run_at <= ?
      ORDER BY plan.next_run_at ASC LIMIT ?`, [now, clampLimit(limit)]);
    const due = rows(result);
    if (!due.length) return [];
    const claimed = await batch(due.map((row) => ({
      sql: `UPDATE dashboard_tracking_plans SET next_run_at = ?, updated_at = ?
        WHERE project_id = ? AND next_run_at = ?
        RETURNING project_id`,
      params: [nextRunAt, now, row.project_id, row.next_run_at]
    })));
    const won = new Set(claimed.flatMap((entry) => rows(entry).map((row) => row.project_id)));
    return due.filter((row) => won.has(row.project_id)).map((row) => ({
      projectId: row.project_id, accountId: row.account_id,
      name: row.name, siteUrl: row.site_url, questionSetId: row.question_set_id
    }));
  }

  async function createDispatchedTrackingJob(input) {
    await batch([
      {
        sql: `INSERT INTO dashboard_tracking_jobs (
          job_id, account_id, project_id, kind, status, dedupe_key,
          created_at, updated_at, question_set_id, scheduled_at
        ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
        params: [input.jobId, input.accountId, input.projectId, input.kind, input.dedupeKey,
          input.now, input.now, input.questionSetId, input.scheduledAt]
      },
      ...input.dispatches.map((dispatch) => ({
        sql: `INSERT INTO dashboard_tracking_dispatches (
          dispatch_id, job_id, project_id, question_set_id, question_id,
          idempotency_key, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        params: [dispatch.dispatchId, input.jobId, input.projectId, input.questionSetId,
          dispatch.questionId, dispatch.idempotencyKey, input.now, input.now]
      }))
    ]);
    return getTrackingJob(input.jobId);
  }

  async function listDispatches({ status, limit }) {
    const result = await query(`SELECT dispatch.*, question.text AS question_text,
      project.name AS project_name, project.site_url AS project_site_url,
      question_set.locale AS locale
      FROM dashboard_tracking_dispatches dispatch
      JOIN dashboard_questions question ON question.question_id = dispatch.question_id
      JOIN dashboard_projects project ON project.project_id = dispatch.project_id
      JOIN dashboard_question_sets question_set ON question_set.question_set_id = dispatch.question_set_id
      WHERE dispatch.status = ? ORDER BY dispatch.created_at ASC LIMIT ?`,
    [status, clampLimit(limit)]);
    return rows(result).map(mapDispatch);
  }

  // Claiming before submission keeps a retried tick from paying twice for the
  // same question: only the tick that moves the row out of 'pending' submits it.
  async function claimDispatchForSubmission({ dispatchId, now }) {
    const result = await query(`UPDATE dashboard_tracking_dispatches
      SET status = 'submitted', attempts = attempts + 1, updated_at = ?
      WHERE dispatch_id = ? AND status = 'pending'
      RETURNING dispatch_id`, [now, dispatchId]);
    return rows(result).length === 1;
  }

  async function attachDispatchMeasurement({ dispatchId, measurementId, now }) {
    await query(`UPDATE dashboard_tracking_dispatches SET measurement_id = ?, updated_at = ?
      WHERE dispatch_id = ?`, [measurementId, now, dispatchId]);
  }

  async function releaseDispatch({ dispatchId, now }) {
    await query(`UPDATE dashboard_tracking_dispatches SET status = 'pending', updated_at = ?
      WHERE dispatch_id = ? AND status = 'submitted' AND measurement_id IS NULL`, [now, dispatchId]);
  }

  async function settleDispatch({ dispatchId, status, observations, errorCode, now }) {
    const result = await query(`UPDATE dashboard_tracking_dispatches
      SET status = ?, observations_json = ?, error_code = ?, updated_at = ?, completed_at = ?
      WHERE dispatch_id = ? AND status IN ('pending', 'submitted')
      RETURNING dispatch_id`, [
      status, observations ? JSON.stringify(observations) : null,
      errorCode || null, now, now, dispatchId
    ]);
    return rows(result).length === 1;
  }

  // A job is assemblable once no dispatch is still outstanding and no Run has
  // been written for it yet.
  async function listAssemblableJobs({ limit }) {
    const result = await query(`SELECT job.* FROM dashboard_tracking_jobs job
      WHERE job.status IN ('queued', 'running') AND job.run_id IS NULL
        AND EXISTS (SELECT 1 FROM dashboard_tracking_dispatches WHERE job_id = job.job_id)
        AND NOT EXISTS (
          SELECT 1 FROM dashboard_tracking_dispatches
          WHERE job_id = job.job_id AND status IN ('pending', 'submitted')
        )
      ORDER BY job.created_at ASC LIMIT ?`, [clampLimit(limit)]);
    return rows(result).map((row) => ({
      ...mapTrackingJob(row),
      questionSetId: row.question_set_id,
      scheduledAt: row.scheduled_at
    }));
  }

  async function listDispatchesForJob(jobId) {
    const result = await query(`SELECT * FROM dashboard_tracking_dispatches
      WHERE job_id = ? ORDER BY created_at ASC`, [jobId]);
    return rows(result).map(mapDispatch);
  }

  async function attachRunToJob({ jobId, runId, now }) {
    const result = await query(`UPDATE dashboard_tracking_jobs SET run_id = ?, updated_at = ?
      WHERE job_id = ? AND run_id IS NULL
      RETURNING job_id`, [runId, now, jobId]);
    return rows(result).length === 1;
  }

  // ---- Google Search Console ----

  async function upsertGoogleConnection(input) {
    await query(`INSERT INTO dashboard_google_connections (
      connection_id, project_id, account_id, google_email, property_uri, refresh_token_ciphertext,
      refresh_token_iv, refresh_token_tag, scopes_json, created_at, updated_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(project_id) DO UPDATE SET account_id=excluded.account_id, google_email=excluded.google_email,
      property_uri=excluded.property_uri, refresh_token_ciphertext=excluded.refresh_token_ciphertext,
      refresh_token_iv=excluded.refresh_token_iv, refresh_token_tag=excluded.refresh_token_tag,
      scopes_json=excluded.scopes_json, updated_at=excluded.updated_at, revoked_at=NULL`, [
      input.connectionId, input.projectId, input.accountId, input.googleEmail, input.propertyUri,
      input.ciphertext, input.iv, input.tag, JSON.stringify(input.scopes), input.now, input.now
    ]);
    return getGoogleConnection(input.projectId);
  }

  async function getGoogleConnection(projectId) {
    const row = await first(`SELECT * FROM dashboard_google_connections
      WHERE project_id = ? AND revoked_at IS NULL LIMIT 1`, [projectId]);
    return row ? mapGoogleConnection(row) : null;
  }

  async function revokeGoogleConnection(projectId, now) {
    const results = await batch([
      {
        sql: `UPDATE dashboard_google_connections SET revoked_at = ?, updated_at = ?
          WHERE project_id = ? AND revoked_at IS NULL
          RETURNING connection_id`,
        params: [now, now, projectId]
      },
      {
        sql: `DELETE FROM dashboard_gsc_daily_metrics
          WHERE project_id = ? AND EXISTS (
            SELECT 1 FROM dashboard_google_connections
            WHERE project_id = ? AND revoked_at = ?
          )`,
        params: [projectId, projectId, now]
      }
    ]);
    return rows(results[0]).length === 1;
  }

  async function startGscSync(input) {
    await query(`INSERT INTO dashboard_gsc_sync_runs (
      sync_run_id, project_id, connection_id, started_at, status, requested_from, requested_to
    ) VALUES (?, ?, ?, ?, 'running', ?, ?)`, [
      input.syncRunId, input.projectId, input.connectionId, input.now, input.from, input.to
    ]);
  }

  async function finishGscSync(input) {
    await query(`UPDATE dashboard_gsc_sync_runs
      SET completed_at = ?, status = ?, imported_rows = ?, error_code = ?
      WHERE sync_run_id = ?`, [
      input.now, input.status, input.importedRows || 0, input.errorCode || null, input.syncRunId
    ]);
  }

  async function upsertGscDailyMetrics(projectId, propertyUri, metricRows, now) {
    for (const chunk of chunkArray(metricRows, GSC_UPSERT_CHUNK)) {
      await batch(chunk.map((row) => ({
        sql: `INSERT INTO dashboard_gsc_daily_metrics (
          project_id, property_uri, metric_date_pt, clicks, impressions, ctr, average_position, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, property_uri, metric_date_pt) DO UPDATE SET
          clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr,
          average_position=excluded.average_position, fetched_at=excluded.fetched_at`,
        params: [projectId, propertyUri, row.date, row.clicks, row.impressions, row.ctr, row.position, now]
      })));
    }
  }

  async function listGscDailyMetrics(projectId, from, to) {
    const result = await query(`SELECT metric_date_pt, clicks, impressions, ctr, average_position, fetched_at
      FROM dashboard_gsc_daily_metrics
      WHERE project_id = ? AND metric_date_pt >= ? AND metric_date_pt <= ?
      ORDER BY metric_date_pt ASC`, [projectId, from, to]);
    return rows(result).map((row) => ({
      date: row.metric_date_pt, clicks: row.clicks, impressions: row.impressions,
      ctr: row.ctr, average_position: row.average_position, fetched_at: row.fetched_at
    }));
  }

  async function purgeGscMetrics(beforeDate) {
    const result = await query("DELETE FROM dashboard_gsc_daily_metrics WHERE metric_date_pt < ?", [beforeDate]);
    return changes(result);
  }

  return {
    insertInvitation, consumeInvitation, findVerifiedAccountByEmail, authenticateSession, createSession,
    createProject, getProject, listProjects, getMembership, getEntitlement, upsertEntitlement, countProjects,
    createSubscriptionPeriod, getCurrentSubscriptionPeriod, manualUsage, reserveManualTrackingJob,
    settleTrackingJob, getTrackingJob, insertPaymentEvent,
    createQuestionSet, getQuestionSet, listQuestionSets,
    insertTrackingRun, getRun, listRuns, listRecentRuns, listObservationsForRuns,
    getObservationForProject, createAnnotation, listAnnotations,
    upsertGoogleConnection, getGoogleConnection, revokeGoogleConnection, startGscSync, finishGscSync,
    upsertGscDailyMetrics, listGscDailyMetrics, purgeGscMetrics,
    claimDueTrackingPlans, createDispatchedTrackingJob, listDispatches, claimDispatchForSubmission,
    attachDispatchMeasurement, releaseDispatch, settleDispatch, listAssemblableJobs,
    listDispatchesForJob, attachRunToJob,
    close: async () => {},
    state: () => ({ kind: "d1-binding" })
  };
}

function createBoundD1DashboardStore(options = {}) {
  const db = options.db;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A Cloudflare D1 binding is required");
  }
  return createD1DashboardStore({
    ...options,
    execute: async (payload) => {
      if (Array.isArray(payload.batch)) {
        return db.batch(payload.batch.map(({ sql, params }) => db.prepare(sql).bind(...params)));
      }
      return [await db.prepare(payload.sql).bind(...payload.params).all()];
    }
  });
}

function mapDispatch(row) {
  return {
    dispatchId: row.dispatch_id, jobId: row.job_id, projectId: row.project_id,
    questionSetId: row.question_set_id, questionId: row.question_id,
    idempotencyKey: row.idempotency_key, measurementId: row.measurement_id || null,
    status: row.status, attempts: Number(row.attempts || 0), errorCode: row.error_code || null,
    observations: row.observations_json ? parseJson(row.observations_json, []) : null,
    questionText: row.question_text, projectName: row.project_name,
    projectSiteUrl: row.project_site_url, locale: row.locale,
    createdAt: row.created_at, completedAt: row.completed_at || null
  };
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function normalizeParams(params) {
  return params.map((value) => (value === undefined ? null : value));
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

module.exports = { createD1DashboardStore, createBoundD1DashboardStore };
