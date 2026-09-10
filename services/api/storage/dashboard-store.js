const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const MIGRATION = path.join(__dirname, "..", "migrations", "0003_dashboard_tracking.sql");
const GOOGLE_MIGRATION = path.join(__dirname, "..", "migrations", "0004_dashboard_google_gsc.sql");
const BILLING_MIGRATION = path.join(__dirname, "..", "migrations", "0005_dashboard_billing.sql");

function createSqliteDashboardStore(options = {}) {
  const db = new DatabaseSync(options.filename || ":memory:");
  db.exec(fs.readFileSync(MIGRATION, "utf8"));
  db.exec(fs.readFileSync(GOOGLE_MIGRATION, "utf8"));
  db.exec(fs.readFileSync(BILLING_MIGRATION, "utf8"));
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
    const row = db.prepare(`SELECT p.*, plan.cadence, plan.enabled, plan.next_run_at
      FROM dashboard_projects p JOIN dashboard_tracking_plans plan ON plan.project_id = p.project_id
      WHERE p.project_id = ? LIMIT 1`).get(projectId);
    return row ? mapProject(row) : null;
  }

  function listProjects(accountId) {
    return db.prepare(`SELECT p.*, plan.cadence, plan.enabled, plan.next_run_at, member.role
      FROM dashboard_projects p
      JOIN dashboard_project_members member ON member.project_id = p.project_id
      JOIN dashboard_tracking_plans plan ON plan.project_id = p.project_id
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

  return {
    insertInvitation, consumeInvitation, findVerifiedAccountByEmail, authenticateSession, createSession,
    createProject, getProject, listProjects, getMembership, getEntitlement, upsertEntitlement, countProjects,
    createSubscriptionPeriod, getCurrentSubscriptionPeriod, manualUsage, reserveManualTrackingJob, settleTrackingJob, getTrackingJob, insertPaymentEvent,
    createQuestionSet, getQuestionSet, listQuestionSets,
    insertTrackingRun, getRun, listRuns, listRecentRuns, listObservationsForRuns,
    getObservationForProject, createAnnotation, listAnnotations,
    upsertGoogleConnection, getGoogleConnection, revokeGoogleConnection, startGscSync, finishGscSync,
    upsertGscDailyMetrics, listGscDailyMetrics, purgeGscMetrics,
    close: () => db.close()
  };
}

function mapGoogleConnection(row) {
  return { connectionId: row.connection_id, projectId: row.project_id, accountId: row.account_id,
    googleEmail: row.google_email, propertyUri: row.property_uri, ciphertext: row.refresh_token_ciphertext,
    iv: row.refresh_token_iv, tag: row.refresh_token_tag, scopes: parseJson(row.scopes_json, []), createdAt: row.created_at };
}

function boolToSql(value) {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function mapAccount(row) {
  return { accountId: row.account_id, email: row.email_normalized, status: row.status };
}

function mapProject(row) {
  return {
    projectId: row.project_id, name: row.name, siteUrl: row.site_url, timezone: row.timezone,
    cadence: row.cadence, enabled: Boolean(row.enabled), nextRunAt: row.next_run_at,
    role: row.role || null, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function mapEntitlement(row) {
  return {
    accountId: row.account_id, plan: row.plan, status: row.status,
    activeProjectLimit: Number(row.active_project_limit), manualRunLimit: Number(row.manual_run_limit),
    periodStart: row.period_start || null, periodEnd: row.period_end || null,
    graceEndsAt: row.grace_ends_at || null, cancelAt: row.cancel_at || null
  };
}

function mapTrackingJob(row) {
  return {
    jobId: row.job_id, accountId: row.account_id, projectId: row.project_id, kind: row.kind,
    status: row.status, reservationId: row.reservation_id || null, createdAt: row.created_at,
    completedAt: row.completed_at || null
  };
}

function mapQuestionSet(row) {
  return {
    questionSetId: row.question_set_id, projectId: row.project_id, version: Number(row.version),
    locale: row.locale, status: row.status, createdAt: row.created_at
  };
}

function mapQuestion(row) {
  return {
    questionId: row.question_id, questionSetId: row.question_set_id, text: row.text,
    intent: row.intent, tags: parseJson(row.tags_json, []), createdAt: row.created_at
  };
}

function mapRun(row) {
  return {
    runId: row.run_id, projectId: row.project_id, questionSetId: row.question_set_id,
    scheduledAt: row.scheduled_at, observedAt: row.observed_at, state: row.state,
    coverage: {
      expected: Number(row.expected_observations), measured: Number(row.measured_observations),
      unknown: Number(row.unknown_observations), failed: Number(row.failed_observations)
    },
    createdAt: row.created_at
  };
}

function mapObservation(row) {
  return {
    observationId: row.observation_id, runId: row.run_id, questionId: row.question_id,
    question: { text: row.question_text, intent: row.question_intent, tags: parseJson(row.question_tags_json, []) },
    questionSetVersion: Number(row.question_set_version), engine: row.engine, model: row.model,
    status: row.status, brandMentioned: sqlToBool(row.brand_mentioned),
    officialCitation: sqlToBool(row.official_citation), rawAnswer: row.raw_answer,
    citations: parseJson(row.citations_json, []), observedAt: row.observed_at, failureCode: row.failure_code
  };
}

function mapAnnotation(row) {
  return {
    annotationId: row.annotation_id, projectId: row.project_id, occurredAt: row.occurred_at,
    note: row.note, createdAt: row.created_at
  };
}

function sqlToBool(value) {
  return value === null || value === undefined ? null : Boolean(value);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function clampLimit(value) {
  return Math.max(1, Math.min(100, Number(value) || 50));
}

module.exports = { createSqliteDashboardStore };
