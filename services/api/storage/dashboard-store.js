const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  mapGoogleConnection, boolToSql, mapAccount, mapProject, mapEntitlement, mapTrackingJob,
  mapQuestionSet, mapQuestion, mapRun, mapObservation, mapAnnotation,
  mapTruthSource, mapTruthBaseline, mapTruthCheck, mapTruthClaim, mapTruthFinding, mapTruthReview,
  sqlToBool, parseJson, clampLimit
} = require("./dashboard-row-mappers.js");

const MIGRATION = path.join(__dirname, "..", "migrations", "0003_dashboard_tracking.sql");
const GOOGLE_MIGRATION = path.join(__dirname, "..", "migrations", "0004_dashboard_google_gsc.sql");
const BILLING_MIGRATION = path.join(__dirname, "..", "migrations", "0005_dashboard_billing.sql");
const TRUTH_MIGRATION = path.join(__dirname, "..", "migrations", "0006_dashboard_truth.sql");

function createSqliteDashboardStore(options = {}) {
  const db = new DatabaseSync(options.filename || ":memory:");
  db.exec(fs.readFileSync(MIGRATION, "utf8"));
  db.exec(fs.readFileSync(GOOGLE_MIGRATION, "utf8"));
  db.exec(fs.readFileSync(BILLING_MIGRATION, "utf8"));
  db.exec(fs.readFileSync(TRUTH_MIGRATION, "utf8"));
  db.exec("PRAGMA foreign_keys = ON;");

  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function insertInvitation(input) {
    db.prepare(`INSERT INTO dashboard_auth_tokens (
      token_id, purpose, email_normalized, token_hash, created_at, expires_at
    ) VALUES (?, 'invitation', ?, ?, ?, ?)`).run(
      input.tokenId, input.email, input.tokenHash, input.createdAt, input.expiresAt
    );
  }

  function consumeInvitation(input) {
    return transaction(() => {
      const token = db.prepare(`SELECT * FROM dashboard_auth_tokens
        WHERE token_hash = ? AND purpose = 'invitation' AND consumed_at IS NULL LIMIT 1`)
        .get(input.tokenHash);
      if (!token || token.expires_at <= input.now) return null;
      let account = findVerifiedAccountByEmail(token.email_normalized);
      if (!account) {
        db.prepare(`INSERT INTO dashboard_accounts (
          account_id, email_normalized, status, created_at, verified_at
        ) VALUES (?, ?, 'verified', ?, ?)`).run(
          input.accountId, token.email_normalized, input.now, input.now
        );
        account = findVerifiedAccountByEmail(token.email_normalized);
      }
      const consumed = db.prepare(`UPDATE dashboard_auth_tokens SET consumed_at = ?
        WHERE token_id = ? AND consumed_at IS NULL`).run(input.now, token.token_id);
      if (Number(consumed.changes) !== 1) return null;
      db.prepare(`INSERT INTO dashboard_sessions (
        session_id, account_id, token_hash, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?)`).run(
        input.sessionId, account.accountId, input.sessionHash, input.now, input.sessionExpiresAt
      );
      return account;
    });
  }

  function findVerifiedAccountByEmail(email) {
    const row = db.prepare(`SELECT * FROM dashboard_accounts
      WHERE email_normalized = ? AND status = 'verified' LIMIT 1`).get(email);
    return row ? mapAccount(row) : null;
  }

  function authenticateSession(input) {
    const row = db.prepare(`SELECT s.session_id, s.account_id, s.expires_at, a.email_normalized
      FROM dashboard_sessions s JOIN dashboard_accounts a ON a.account_id = s.account_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
        AND a.status = 'verified' LIMIT 1`).get(input.tokenHash, input.now);
    if (!row) return null;
    db.prepare("UPDATE dashboard_sessions SET last_used_at = ? WHERE session_id = ?")
      .run(input.now, row.session_id);
    return {
      sessionId: row.session_id,
      accountId: row.account_id,
      email: row.email_normalized,
      expiresAt: row.expires_at
    };
  }

  function createSession(input) {
    db.prepare(`INSERT INTO dashboard_sessions (session_id, account_id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)`).run(input.sessionId, input.accountId, input.sessionHash, input.now, input.sessionExpiresAt);
    return true;
  }

  function createProject(input) {
    transaction(() => {
      db.prepare(`INSERT INTO dashboard_projects (
        project_id, name, site_url, timezone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(
        input.projectId, input.name, input.siteUrl, input.timezone, input.now, input.now
      );
      db.prepare(`INSERT INTO dashboard_project_members (
        project_id, account_id, role, created_at
      ) VALUES (?, ?, 'owner', ?)`).run(input.projectId, input.accountId, input.now);
      db.prepare(`INSERT INTO dashboard_tracking_plans (
        project_id, cadence, enabled, next_run_at, updated_at
      ) VALUES (?, 'weekly', 1, ?, ?)`).run(input.projectId, input.nextRunAt, input.now);
    });
    return getProject(input.projectId);
  }

  function getProject(projectId) {
    const row = db.prepare(`SELECT p.*, plan.cadence, plan.enabled, plan.next_run_at, truth_state.readiness AS truth_readiness
      FROM dashboard_projects p JOIN dashboard_tracking_plans plan ON plan.project_id = p.project_id
      LEFT JOIN dashboard_truth_project_state truth_state ON truth_state.project_id = p.project_id
      WHERE p.project_id = ? LIMIT 1`).get(projectId);
    return row ? mapProject(row) : null;
  }

  function listProjects(accountId) {
    return db.prepare(`SELECT p.*, plan.cadence, plan.enabled, plan.next_run_at, member.role, truth_state.readiness AS truth_readiness
      FROM dashboard_projects p
      JOIN dashboard_project_members member ON member.project_id = p.project_id
      JOIN dashboard_tracking_plans plan ON plan.project_id = p.project_id
      LEFT JOIN dashboard_truth_project_state truth_state ON truth_state.project_id = p.project_id
      WHERE member.account_id = ? ORDER BY p.updated_at DESC`).all(accountId).map(mapProject);
  }

  function getEntitlement(accountId) {
    const row = db.prepare("SELECT * FROM dashboard_entitlements WHERE account_id=? LIMIT 1").get(accountId);
    return row ? mapEntitlement(row) : null;
  }

  function upsertEntitlement(input) {
    db.prepare(`INSERT INTO dashboard_entitlements (
      account_id, plan, status, active_project_limit, manual_run_limit, period_start, period_end, grace_ends_at, cancel_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
      active_project_limit=excluded.active_project_limit, manual_run_limit=excluded.manual_run_limit,
      period_start=excluded.period_start, period_end=excluded.period_end, grace_ends_at=excluded.grace_ends_at,
      cancel_at=excluded.cancel_at, updated_at=excluded.updated_at`).run(
      input.accountId, input.plan, input.status, input.activeProjectLimit, input.manualRunLimit,
      input.periodStart || null, input.periodEnd || null, input.graceEndsAt || null, input.cancelAt || null, input.now
    );
    return getEntitlement(input.accountId);
  }

  function countProjects(accountId) {
    return Number(db.prepare("SELECT COUNT(*) AS count FROM dashboard_project_members WHERE account_id=?").get(accountId).count);
  }

  function createSubscriptionPeriod(input) {
    db.prepare(`INSERT INTO dashboard_subscription_periods (period_id, account_id, plan, starts_at, ends_at, manual_run_limit, created_at)
      VALUES (?, ?, 'paid_beta', ?, ?, ?, ?)`)
      .run(input.periodId, input.accountId, input.startsAt, input.endsAt, input.manualRunLimit, input.now);
    return { ...input, plan: "paid_beta" };
  }

  function getCurrentSubscriptionPeriod(accountId, startsAt) {
    const row = db.prepare("SELECT * FROM dashboard_subscription_periods WHERE account_id=? AND starts_at=? LIMIT 1").get(accountId, startsAt);
    return row ? { periodId: row.period_id, manualRunLimit: Number(row.manual_run_limit) } : null;
  }

  function manualUsage(periodId) {
    return Number(db.prepare("SELECT COUNT(*) AS count FROM dashboard_manual_run_reservations WHERE period_id=? AND status IN ('reserved','charged')").get(periodId).count);
  }

  function reserveManualTrackingJob(input) {
    return transaction(() => {
      const period = db.prepare("SELECT * FROM dashboard_subscription_periods WHERE period_id=? AND account_id=? LIMIT 1")
        .get(input.periodId, input.accountId);
      if (!period) return { rejected: "entitlement_required" };
      const used = Number(db.prepare("SELECT COUNT(*) AS count FROM dashboard_manual_run_reservations WHERE period_id=? AND status IN ('reserved','charged')")
        .get(input.periodId).count);
      if (used >= Number(period.manual_run_limit)) return { rejected: "manual_quota_exhausted" };
      const daily = Number(db.prepare("SELECT COUNT(*) AS count FROM dashboard_manual_run_reservations WHERE account_id=? AND day_taipei=? AND status IN ('reserved','charged')")
        .get(input.accountId, input.dayTaipei).count);
      if (daily >= input.dailyLimit) return { rejected: "daily_manual_limit" };
      db.prepare(`INSERT INTO dashboard_tracking_jobs (job_id,account_id,project_id,kind,status,dedupe_key,reservation_id,created_at,updated_at)
        VALUES (?, ?, ?, 'manual', 'queued', ?, ?, ?, ?)`)
        .run(input.jobId, input.accountId, input.projectId, input.dedupeKey, input.reservationId, input.now, input.now);
      db.prepare(`INSERT INTO dashboard_manual_run_reservations (reservation_id,account_id,period_id,day_taipei,status,job_id,created_at)
        VALUES (?, ?, ?, ?, 'reserved', ?, ?)`)
        .run(input.reservationId, input.accountId, input.periodId, input.dayTaipei, input.jobId, input.now);
      return { job: getTrackingJob(input.jobId), reservationId: input.reservationId };
    });
  }

  function settleTrackingJob(input) {
    return transaction(() => {
      const job = getTrackingJob(input.jobId);
      if (!job || !["queued", "running"].includes(job.status)) return false;
      const status = input.state === "complete" ? "succeeded" : input.state;
      db.prepare("UPDATE dashboard_tracking_jobs SET status=?, updated_at=?, completed_at=? WHERE job_id=?")
        .run(status, input.now, input.now, input.jobId);
      if (job.reservationId) {
        db.prepare("UPDATE dashboard_manual_run_reservations SET status=?, settled_at=? WHERE reservation_id=? AND status='reserved'")
          .run(status === "succeeded" ? "charged" : "released", input.now, job.reservationId);
      }
      return true;
    });
  }

  function getTrackingJob(jobId) {
    const row = db.prepare("SELECT * FROM dashboard_tracking_jobs WHERE job_id=? LIMIT 1").get(jobId);
    return row ? mapTrackingJob(row) : null;
  }

  function insertPaymentEvent(input) {
    const result = db.prepare(`INSERT OR IGNORE INTO dashboard_payment_events (
      payment_event_id,account_id,provider,provider_transaction_id,provider_period_id,event_type,status,occurred_at,created_at
    ) VALUES (?, ?, 'newebpay', ?, ?, ?, ?, ?, ?)`)
      .run(input.paymentEventId, input.accountId, input.providerTransactionId, input.providerPeriodId || null, input.eventType, input.status, input.occurredAt, input.now);
    return Number(result.changes) === 1;
  }

  function getMembership(projectId, accountId) {
    const row = db.prepare(`SELECT role FROM dashboard_project_members
      WHERE project_id = ? AND account_id = ? LIMIT 1`).get(projectId, accountId);
    return row ? { role: row.role } : null;
  }

  function createQuestionSet(input) {
    transaction(() => {
      if (input.status === "active") {
        db.prepare("UPDATE dashboard_question_sets SET status = 'archived' WHERE project_id = ? AND status = 'active'")
          .run(input.projectId);
      }
      db.prepare(`INSERT INTO dashboard_question_sets (
        question_set_id, project_id, version, locale, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(
        input.questionSetId, input.projectId, input.version, input.locale, input.status, input.now
      );
      const statement = db.prepare(`INSERT INTO dashboard_questions (
        question_id, question_set_id, text, intent, tags_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const question of input.questions) {
        statement.run(question.questionId, input.questionSetId, question.text, question.intent || null,
          JSON.stringify(question.tags || []), input.now);
      }
    });
    return getQuestionSet(input.questionSetId);
  }

  function getQuestionSet(questionSetId) {
    const row = db.prepare("SELECT * FROM dashboard_question_sets WHERE question_set_id = ? LIMIT 1").get(questionSetId);
    if (!row) return null;
    return {
      ...mapQuestionSet(row),
      questions: db.prepare("SELECT * FROM dashboard_questions WHERE question_set_id = ? ORDER BY created_at ASC")
        .all(questionSetId).map(mapQuestion)
    };
  }

  function listQuestionSets(projectId) {
    return db.prepare("SELECT * FROM dashboard_question_sets WHERE project_id = ? ORDER BY version DESC")
      .all(projectId).map(mapQuestionSet);
  }

  function insertTrackingRun(input) {
    transaction(() => {
      db.prepare(`INSERT INTO dashboard_tracking_runs (
        run_id, project_id, question_set_id, scheduled_at, observed_at, state,
        expected_observations, measured_observations, unknown_observations,
        failed_observations, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        input.runId, input.projectId, input.questionSetId, input.scheduledAt, input.observedAt,
        input.state, input.expectedObservations, input.measuredObservations,
        input.unknownObservations, input.failedObservations, input.now
      );
      const statement = db.prepare(`INSERT INTO dashboard_observations (
        observation_id, run_id, question_id, engine, model, status, brand_mentioned,
        official_citation, raw_answer, citations_json, observed_at, failure_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const observation of input.observations) {
        statement.run(
          observation.observationId, input.runId, observation.questionId, observation.engine,
          observation.model || null, observation.status, boolToSql(observation.brandMentioned),
          boolToSql(observation.officialCitation), observation.rawAnswer || null,
          JSON.stringify(observation.citations || []), observation.observedAt || input.observedAt || null,
          observation.failureCode || null
        );
      }
      db.prepare(`UPDATE dashboard_tracking_plans SET next_run_at = ?, updated_at = ?
        WHERE project_id = ?`).run(input.nextRunAt, input.now, input.projectId);
      db.prepare("UPDATE dashboard_projects SET updated_at = ? WHERE project_id = ?").run(input.now, input.projectId);
    });
    return getRun(input.runId);
  }

  function getRun(runId) {
    const row = db.prepare("SELECT * FROM dashboard_tracking_runs WHERE run_id = ? LIMIT 1").get(runId);
    return row ? mapRun(row) : null;
  }

  function listRuns(projectId, from, to) {
    return db.prepare(`SELECT * FROM dashboard_tracking_runs
      WHERE project_id = ? AND observed_at IS NOT NULL AND observed_at >= ? AND observed_at <= ?
      ORDER BY observed_at ASC`).all(projectId, from, to).map(mapRun);
  }

  function listRecentRuns(projectId, limit = 100) {
    return db.prepare(`SELECT * FROM dashboard_tracking_runs WHERE project_id = ?
      ORDER BY COALESCE(observed_at, scheduled_at) DESC LIMIT ?`).all(projectId, clampLimit(limit)).map(mapRun);
  }

  function listObservationsForRuns(runIds) {
    if (!runIds.length) return [];
    const placeholders = runIds.map(() => "?").join(",");
    return db.prepare(`SELECT observation.*, question.text AS question_text, question.intent AS question_intent,
      question.tags_json AS question_tags_json, question_set.version AS question_set_version
      FROM dashboard_observations observation
      JOIN dashboard_questions question ON question.question_id = observation.question_id
      JOIN dashboard_tracking_runs run ON run.run_id = observation.run_id
      JOIN dashboard_question_sets question_set ON question_set.question_set_id = run.question_set_id
      WHERE observation.run_id IN (${placeholders})`).all(...runIds).map(mapObservation);
  }

  function getObservationForProject(projectId, observationId) {
    const row = db.prepare(`SELECT observation.*, question.text AS question_text, question.intent AS question_intent,
      question.tags_json AS question_tags_json, question_set.version AS question_set_version
      FROM dashboard_observations observation
      JOIN dashboard_tracking_runs run ON run.run_id = observation.run_id
      JOIN dashboard_questions question ON question.question_id = observation.question_id
      JOIN dashboard_question_sets question_set ON question_set.question_set_id = run.question_set_id
      WHERE run.project_id = ? AND observation.observation_id = ? LIMIT 1`).get(projectId, observationId);
    return row ? mapObservation(row) : null;
  }

  function createAnnotation(input) {
    db.prepare(`INSERT INTO dashboard_annotations (
      annotation_id, project_id, account_id, occurred_at, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`).run(
      input.annotationId, input.projectId, input.accountId, input.occurredAt, input.note, input.now
    );
    return getAnnotation(input.annotationId);
  }

  function getAnnotation(annotationId) {
    const row = db.prepare("SELECT * FROM dashboard_annotations WHERE annotation_id = ? LIMIT 1").get(annotationId);
    return row ? mapAnnotation(row) : null;
  }

  function listAnnotations(projectId, from, to) {
    return db.prepare(`SELECT * FROM dashboard_annotations
      WHERE project_id = ? AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at DESC`)
      .all(projectId, from, to).map(mapAnnotation);
  }

  function upsertGoogleConnection(input) {
    db.prepare(`INSERT INTO dashboard_google_connections (
      connection_id, project_id, account_id, google_email, property_uri, refresh_token_ciphertext,
      refresh_token_iv, refresh_token_tag, scopes_json, created_at, updated_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(project_id) DO UPDATE SET account_id=excluded.account_id, google_email=excluded.google_email,
      property_uri=excluded.property_uri, refresh_token_ciphertext=excluded.refresh_token_ciphertext,
      refresh_token_iv=excluded.refresh_token_iv, refresh_token_tag=excluded.refresh_token_tag,
      scopes_json=excluded.scopes_json, updated_at=excluded.updated_at, revoked_at=NULL`).run(
      input.connectionId, input.projectId, input.accountId, input.googleEmail, input.propertyUri,
      input.ciphertext, input.iv, input.tag, JSON.stringify(input.scopes), input.now, input.now
    );
    return getGoogleConnection(input.projectId);
  }
  function getGoogleConnection(projectId) {
    const row = db.prepare("SELECT * FROM dashboard_google_connections WHERE project_id=? AND revoked_at IS NULL LIMIT 1").get(projectId);
    return row ? mapGoogleConnection(row) : null;
  }
  function revokeGoogleConnection(projectId, now) {
    const result = db.prepare("UPDATE dashboard_google_connections SET revoked_at=?, updated_at=? WHERE project_id=? AND revoked_at IS NULL").run(now, now, projectId);
    if (!result.changes) return false;
    db.prepare("DELETE FROM dashboard_gsc_daily_metrics WHERE project_id=?").run(projectId);
    return true;
  }
  function startGscSync(input) {
    db.prepare(`INSERT INTO dashboard_gsc_sync_runs (sync_run_id,project_id,connection_id,started_at,status,requested_from,requested_to)
      VALUES (?, ?, ?, ?, 'running', ?, ?)`).run(input.syncRunId, input.projectId, input.connectionId, input.now, input.from, input.to);
  }
  function finishGscSync(input) {
    db.prepare(`UPDATE dashboard_gsc_sync_runs SET completed_at=?, status=?, imported_rows=?, error_code=? WHERE sync_run_id=?`).run(
      input.now, input.status, input.importedRows || 0, input.errorCode || null, input.syncRunId);
  }
  function upsertGscDailyMetrics(projectId, propertyUri, rows, now) {
    const statement = db.prepare(`INSERT INTO dashboard_gsc_daily_metrics (project_id,property_uri,metric_date_pt,clicks,impressions,ctr,average_position,fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id,property_uri,metric_date_pt) DO UPDATE SET
      clicks=excluded.clicks, impressions=excluded.impressions, ctr=excluded.ctr, average_position=excluded.average_position, fetched_at=excluded.fetched_at`);
    for (const row of rows) statement.run(projectId, propertyUri, row.date, row.clicks, row.impressions, row.ctr, row.position, now);
  }
  function listGscDailyMetrics(projectId, from, to) {
    return db.prepare(`SELECT metric_date_pt,clicks,impressions,ctr,average_position,fetched_at FROM dashboard_gsc_daily_metrics
      WHERE project_id=? AND metric_date_pt>=? AND metric_date_pt<=? ORDER BY metric_date_pt ASC`).all(projectId, from, to)
      .map((row) => ({ date: row.metric_date_pt, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, average_position: row.average_position, fetched_at: row.fetched_at }));
  }
  function purgeGscMetrics(beforeDate) {
    return db.prepare("DELETE FROM dashboard_gsc_daily_metrics WHERE metric_date_pt < ?").run(beforeDate).changes;
  }

  // ---- Brand Truth sources, baselines, checks and reviews -----------------

  function getTruthReadiness(projectId) {
    const row = db.prepare("SELECT readiness FROM dashboard_truth_project_state WHERE project_id = ? LIMIT 1").get(projectId);
    return row?.readiness || "sources_pending";
  }

  function setTruthReadiness(input) {
    db.prepare(`INSERT INTO dashboard_truth_project_state (project_id, readiness, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET readiness=excluded.readiness, updated_at=excluded.updated_at`)
      .run(input.projectId, input.readiness, input.now);
    return getTruthReadiness(input.projectId);
  }

  function getTruthSourceByKey(projectId, canonicalUrl) {
    const row = db.prepare("SELECT * FROM dashboard_truth_sources WHERE project_id = ? AND canonical_url = ? LIMIT 1")
      .get(projectId, canonicalUrl);
    return row ? mapTruthSource(row) : null;
  }

  function insertTruthSource(input) {
    db.prepare(`INSERT INTO dashboard_truth_sources (
      source_id, project_id, source_kind, source_url, canonical_url, status,
      fetched_at, content_hash, metadata_json, snippets_json, candidate_fields_json,
      failure_code, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(project_id, canonical_url) DO UPDATE SET source_url=excluded.source_url,
      source_kind=excluded.source_kind, status='pending', fetched_at=NULL, content_hash=NULL,
      metadata_json='{}', snippets_json='[]', candidate_fields_json='{}', failure_code=NULL,
      updated_at=excluded.updated_at`).run(
      input.sourceId, input.projectId, input.kind, input.url, input.canonicalUrl || input.url,
      JSON.stringify(input.metadata || {}), JSON.stringify(input.snippets || []), JSON.stringify(input.candidateFields || {}),
      input.now, input.now
    );
    return getTruthSourceByKey(input.projectId, input.canonicalUrl || input.url);
  }

  function updateTruthSource(input) {
    const result = db.prepare(`UPDATE dashboard_truth_sources SET status=?, fetched_at=?, content_hash=?,
      metadata_json=?, snippets_json=?, candidate_fields_json=?, failure_code=?, updated_at=?
      WHERE source_id=? AND project_id=?`).run(
      input.status, input.fetchedAt || null, input.contentHash || null,
      JSON.stringify(input.metadata || {}), JSON.stringify(input.snippets || []), JSON.stringify(input.candidateFields || {}),
      input.failureCode || null, input.now, input.sourceId, input.projectId
    );
    if (!result.changes) return null;
    return getTruthSource(input.sourceId);
  }

  function getTruthSource(sourceId) {
    const row = db.prepare("SELECT * FROM dashboard_truth_sources WHERE source_id = ? LIMIT 1").get(sourceId);
    return row ? mapTruthSource(row) : null;
  }

  function listTruthSources(projectId) {
    return db.prepare("SELECT * FROM dashboard_truth_sources WHERE project_id = ? ORDER BY created_at ASC")
      .all(projectId).map(mapTruthSource);
  }

  function getTruthBaseline(projectId, branchId = "primary") {
    const row = db.prepare(`SELECT * FROM dashboard_truth_baselines
      WHERE project_id = ? AND branch_id = ? ORDER BY version DESC LIMIT 1`).get(projectId, branchId);
    return row ? attachTruthBaselineSources(mapTruthBaseline(row)) : null;
  }

  function createTruthBaseline(input) {
    return transaction(() => {
      const current = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM dashboard_truth_baselines WHERE project_id = ? AND branch_id = ?")
        .get(input.projectId, input.branchId || "primary");
      const version = Number(current?.version || 0) + 1;
      db.prepare(`INSERT INTO dashboard_truth_baselines (
        baseline_id, project_id, branch_id, branch_name, version, fields_json, source_ids_json,
        status, confirmed_by, confirmed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`).run(
        input.baselineId, input.projectId, input.branchId || "primary", input.branchName || null, version,
        JSON.stringify(input.fields || {}), JSON.stringify(input.sourceIds || []), input.accountId, input.confirmedAt, input.now
      );
      for (const source of input.sourceSnapshots || []) {
        db.prepare(`INSERT INTO dashboard_truth_baseline_sources (
          baseline_id, source_id, canonical_url, content_hash, snippets_json, metadata_json, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
          input.baselineId, source.sourceId, source.canonicalUrl, source.contentHash || null,
          JSON.stringify(source.snippets || []), JSON.stringify(source.metadata || {}), input.confirmedAt
        );
      }
      return getTruthBaselineById(input.baselineId);
    });
  }

  function getTruthBaselineById(baselineId) {
    const row = db.prepare("SELECT * FROM dashboard_truth_baselines WHERE baseline_id = ? LIMIT 1").get(baselineId);
    return row ? attachTruthBaselineSources(mapTruthBaseline(row)) : null;
  }

  function attachTruthBaselineSources(baseline) {
    baseline.sourceSnapshots = db.prepare(`SELECT source_id, canonical_url, content_hash, snippets_json, metadata_json, captured_at
      FROM dashboard_truth_baseline_sources WHERE baseline_id = ? ORDER BY source_id ASC`).all(baseline.baselineId).map((row) => ({
      sourceId: row.source_id, canonicalUrl: row.canonical_url, contentHash: row.content_hash || null,
      snippets: parseJson(row.snippets_json, []), metadata: parseJson(row.metadata_json, {}), capturedAt: row.captured_at
    }));
    return baseline;
  }

  function createTruthCheck(input) {
    db.prepare(`INSERT INTO dashboard_truth_check_runs (
      check_id, project_id, baseline_id, engine_ids_json, status, parser_version,
      created_by, created_at, updated_at, completed_at, error_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`).run(
      input.checkId, input.projectId, input.baselineId, JSON.stringify(input.engineIds), input.status || "queued",
      input.parserVersion, input.accountId, input.now, input.now
    );
    return getTruthCheck(input.checkId);
  }

  function claimTruthCheck(input) {
    const changed = db.prepare("UPDATE dashboard_truth_check_runs SET status='running', updated_at=? WHERE check_id=? AND status='queued'")
      .run(input.now, input.checkId).changes;
    return changed ? getTruthCheck(input.checkId) : null;
  }

  function listQueuedTruthChecks(limit = 10) {
    return db.prepare(`SELECT truth_check.*, baseline.version AS baseline_version
      FROM dashboard_truth_check_runs truth_check
      JOIN dashboard_truth_baselines baseline ON baseline.baseline_id = truth_check.baseline_id
      WHERE truth_check.status = 'queued' ORDER BY truth_check.created_at ASC LIMIT ?`).all(Math.max(1, Math.min(50, Number(limit) || 10)))
      .map(mapTruthCheck);
  }

  function getTruthCheck(checkId) {
    const row = db.prepare(`SELECT truth_check.*, baseline.version AS baseline_version
      FROM dashboard_truth_check_runs truth_check
      JOIN dashboard_truth_baselines baseline ON baseline.baseline_id = truth_check.baseline_id
      WHERE truth_check.check_id = ? LIMIT 1`).get(checkId);
    if (!row) return null;
    const check = mapTruthCheck(row);
    check.claims = db.prepare("SELECT * FROM dashboard_truth_claims WHERE check_id = ? ORDER BY created_at ASC").all(checkId).map(mapTruthClaim);
    check.findings = db.prepare("SELECT * FROM dashboard_truth_findings WHERE check_id = ? ORDER BY created_at ASC").all(checkId).map(mapTruthFinding);
    return check;
  }

  function insertTruthClaim(input) {
    db.prepare(`INSERT INTO dashboard_truth_claims (
      claim_id, check_id, observation_id, engine, model, field_name, claim_value,
      claim_text, entity_match, condition_json, parser_version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.claimId, input.checkId, input.observationId || null, input.engine, input.model || null,
      input.field, input.value || null, input.text, input.entityMatch || "unknown",
      JSON.stringify(input.condition || {}), input.parserVersion, input.now
    );
    return mapTruthClaim(db.prepare("SELECT * FROM dashboard_truth_claims WHERE claim_id = ?").get(input.claimId));
  }

  function insertTruthFinding(input) {
    db.prepare(`INSERT INTO dashboard_truth_findings (
      finding_id, check_id, claim_id, baseline_id, field_name, status, severity,
      confidence, evidence_json, review_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(
      input.findingId, input.checkId, input.claimId || null, input.baselineId, input.field,
      input.status, input.severity, input.confidence || "unknown", JSON.stringify(input.evidence || {}), input.now, input.now
    );
    return mapTruthFinding(db.prepare("SELECT * FROM dashboard_truth_findings WHERE finding_id = ?").get(input.findingId));
  }

  function finishTruthCheck(input) {
    db.prepare("UPDATE dashboard_truth_check_runs SET status=?, updated_at=?, completed_at=?, error_code=? WHERE check_id=?")
      .run(input.status, input.now, input.completedAt || input.now, input.errorCode || null, input.checkId);
    return getTruthCheck(input.checkId);
  }

  function getTruthFindingForProject(projectId, findingId) {
    const row = db.prepare(`SELECT finding.* FROM dashboard_truth_findings finding
      JOIN dashboard_truth_check_runs truth_check ON truth_check.check_id = finding.check_id
      WHERE truth_check.project_id = ? AND finding.finding_id = ? LIMIT 1`).get(projectId, findingId);
    return row ? mapTruthFinding(row) : null;
  }

  function reviewTruthFinding(input) {
    return transaction(() => {
      const changed = db.prepare(`UPDATE dashboard_truth_findings SET review_status=?, updated_at=?
        WHERE finding_id=? AND review_status='pending'`).run(input.decision, input.now, input.findingId);
      if (!changed.changes) return null;
      db.prepare(`INSERT INTO dashboard_truth_reviews (
        review_id, finding_id, project_id, account_id, decision, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        input.reviewId, input.findingId, input.projectId, input.accountId, input.decision, input.reason, input.now
      );
      return getTruthFindingForProject(input.projectId, input.findingId);
    });
  }

  return {
    insertInvitation, consumeInvitation, findVerifiedAccountByEmail, authenticateSession, createSession,
    createProject, getProject, listProjects, getMembership, getEntitlement, upsertEntitlement, countProjects,
    createSubscriptionPeriod, getCurrentSubscriptionPeriod, manualUsage, reserveManualTrackingJob, settleTrackingJob, getTrackingJob, insertPaymentEvent,
    createQuestionSet, getQuestionSet, listQuestionSets,
    insertTrackingRun, getRun, listRuns, listRecentRuns, listObservationsForRuns,
    getObservationForProject, createAnnotation, listAnnotations,
    upsertGoogleConnection, getGoogleConnection, revokeGoogleConnection, startGscSync, finishGscSync,
    upsertGscDailyMetrics, listGscDailyMetrics, purgeGscMetrics,
    getTruthReadiness, setTruthReadiness, insertTruthSource, updateTruthSource, getTruthSource, listTruthSources,
    getTruthBaseline, getTruthBaselineById, createTruthBaseline, createTruthCheck, claimTruthCheck, listQueuedTruthChecks, getTruthCheck,
    insertTruthClaim, insertTruthFinding, finishTruthCheck, getTruthFindingForProject, reviewTruthFinding,
    close: () => db.close()
  };
}

module.exports = { createSqliteDashboardStore };
