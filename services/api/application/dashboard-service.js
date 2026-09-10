const { createHash, createHmac, randomBytes, randomUUID, createCipheriv, createDecipheriv } = require("node:crypto");

const ENGINE_IDS = Object.freeze(["openai", "gemini", "anthropic", "perplexity"]);
const MAX_QUESTIONS = 50;

class DashboardError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function createDashboardService(options = {}) {
  const store = requiredStore(options.store);
  const now = options.now || (() => new Date());
  const pepper = requireDashboardPepper(options.tokenPepper);
  const invitationTtlMs = positiveMs(options.invitationTtlMs, 7 * 24 * 60 * 60 * 1000);
  const sessionTtlMs = positiveMs(options.sessionTtlMs, 30 * 24 * 60 * 60 * 1000);
  const googleTokenKey = options.googleTokenKey ? normalizedEncryptionKey(options.googleTokenKey) : null;
  const gscClient = options.gscClient || null;

  async function createInvitation({ email }) {
    const normalizedEmail = normalizeEmail(email);
    if (await store.findVerifiedAccountByEmail(normalizedEmail)) {
      throw new DashboardError("account_exists", "A Dashboard account already exists", 409);
    }
    const createdAt = iso(now());
    const token = opaqueToken("gdi_");
    const expiresAt = addMilliseconds(createdAt, invitationTtlMs);
    await store.insertInvitation({
      tokenId: `daut_${randomUUID()}`, email: normalizedEmail, tokenHash: hashToken(token, pepper),
      createdAt, expiresAt
    });
    return { invitation_token: token, expires_at: expiresAt };
  }

  async function verifyInvitation({ token }) {
    const createdAt = iso(now());
    const sessionToken = opaqueToken("gds_");
    const sessionExpiresAt = addMilliseconds(createdAt, sessionTtlMs);
    const account = await store.consumeInvitation({
      tokenHash: hashToken(requiredToken(token), pepper), accountId: `dacc_${randomUUID()}`,
      sessionId: `dses_${randomUUID()}`, sessionHash: hashToken(sessionToken, pepper),
      now: createdAt, sessionExpiresAt
    });
    if (!account) throw new DashboardError("invalid_or_expired_token", "Invitation token is invalid or expired", 400);
    return { account_id: account.accountId, session_token: sessionToken, session_expires_at: sessionExpiresAt };
  }

  async function authenticateSession(sessionToken) {
    const token = String(sessionToken || "");
    if (!token.startsWith("gds_")) return null;
    return await store.authenticateSession({ tokenHash: hashToken(token, pepper), now: iso(now()) });
  }

  async function loginGoogleAccount({ email }) {
    const account = await store.findVerifiedAccountByEmail(normalizeEmail(email));
    if (!account) throw new DashboardError("account_not_authorized", "This Google account is not enabled for the Dashboard", 403);
    const createdAt = iso(now());
    const sessionToken = opaqueToken("gds_");
    const sessionExpiresAt = addMilliseconds(createdAt, sessionTtlMs);
    await store.createSession({ sessionId: `dses_${randomUUID()}`, accountId: account.accountId,
      sessionHash: hashToken(sessionToken, pepper), now: createdAt, sessionExpiresAt });
    return { account_id: account.accountId, session_token: sessionToken, session_expires_at: sessionExpiresAt };
  }

  async function createProject({ sessionToken, name, siteUrl, timezone = "Asia/Taipei" }) {
    const session = await requiredSession(sessionToken);
    const entitlement = await entitlementFor(session.accountId);
    if (!canUseDashboard(entitlement, now())) throw new DashboardError("dashboard_read_only", "Monitoring is unavailable until the subscription is restored", 403);
    if (await store.countProjects(session.accountId) >= entitlement.activeProjectLimit) {
      throw new DashboardError("project_limit_reached", `This plan allows ${entitlement.activeProjectLimit} active Projects`, 409);
    }
    const normalized = normalizeProject({ name, siteUrl, timezone });
    const timestamp = iso(now());
    return await store.createProject({
      projectId: `dprj_${randomUUID()}`, accountId: session.accountId, ...normalized,
      now: timestamp, nextRunAt: nextWeeklyRun(timestamp)
    });
  }

  async function listProjects({ sessionToken }) {
    const session = await requiredSession(sessionToken);
    return await store.listProjects(session.accountId);
  }

  async function getEntitlement({ sessionToken }) {
    const session = await requiredSession(sessionToken);
    return publicEntitlement(await entitlementFor(session.accountId));
  }

  async function requestManualTrackingRun({ sessionToken, projectId }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    const entitlement = await entitlementFor(session.accountId);
    if (!canUseDashboard(entitlement, now()) || entitlement.plan !== "paid_beta") {
      throw new DashboardError("manual_run_unavailable", "Manual updates require an active Paid Beta subscription", 403);
    }
    const timestamp = iso(now());
    const dayTaipei = taipeiDay(timestamp);
    const reservation = await store.reserveManualTrackingJob({
      jobId: `dtj_${randomUUID()}`, reservationId: `dmr_${randomUUID()}`,
      accountId: session.accountId, projectId, periodId: entitlement.periodId,
      dayTaipei, dailyLimit: 6, dedupeKey: `manual:${projectId}:${randomUUID()}`, now: timestamp
    });
    if (reservation.rejected) {
      const error = reservation.rejected === "daily_manual_limit" ? "daily_manual_limit" : "manual_quota_exhausted";
      throw new DashboardError(error, error === "daily_manual_limit" ? "Six manual updates are allowed per Taiwan day" : "No manual updates remain in this subscription period", 429);
    }
    return { job_id: reservation.job.jobId, status: reservation.job.status, manual_updates_remaining: await manualRemaining(entitlement, store) };
  }

  // Trusted orchestration settles the reservation after a terminal four-engine result.
  async function settleTrackingJob({ jobId, state }) {
    if (!new Set(["complete", "partial", "failed"]).has(state)) throw new DashboardError("invalid_job_state", "Invalid Tracking Job state", 400);
    return await store.settleTrackingJob({ jobId: requiredId(jobId, "jobId"), state, now: iso(now()) });
  }

  async function applySandboxPayment({ accountId, providerTransactionId, providerPeriodId, status = "succeeded", occurredAt = iso(now()) }) {
    const account = requiredId(accountId, "accountId");
    const transaction = requiredId(providerTransactionId, "providerTransactionId");
    const inserted = await store.insertPaymentEvent({ paymentEventId: `dpe_${randomUUID()}`, accountId: account,
      providerTransactionId: transaction, providerPeriodId: providerPeriodId || null, eventType: "periodic_payment", status,
      occurredAt: requiredIso(occurredAt, "occurredAt"), now: iso(now()) });
    if (!inserted) return publicEntitlement(await entitlementFor(account));
    if (status !== "succeeded") return publicEntitlement(await entitlementFor(account));
    const startsAt = iso(now());
    const endsAt = addMonths(startsAt, 1);
    const periodId = `dsp_${randomUUID()}`;
    await store.createSubscriptionPeriod({ periodId, accountId: account, startsAt, endsAt, manualRunLimit: 24, now: startsAt });
    return publicEntitlement(await store.upsertEntitlement({ accountId: account, plan: "paid_beta", status: "active",
      activeProjectLimit: 6, manualRunLimit: 24, periodStart: startsAt, periodEnd: endsAt, graceEndsAt: null, cancelAt: null, now: startsAt }), periodId);
  }

  async function createQuestionSet({ sessionToken, projectId, locale = "zh-TW", questions }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    const normalizedQuestions = normalizeQuestions(questions);
    const questionSets = await store.listQuestionSets(projectId);
    const timestamp = iso(now());
    return await store.createQuestionSet({
      questionSetId: `dqs_${randomUUID()}`, projectId, version: (questionSets[0]?.version || 0) + 1,
      locale: normalizeLocale(locale), status: "active", now: timestamp,
      questions: normalizedQuestions.map((question) => ({ ...question, questionId: `dqu_${randomUUID()}` })),
      accountId: session.accountId
    });
  }

  async function listTrackedQuestions({ sessionToken, projectId }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    const listedSets = await store.listQuestionSets(projectId);
    const sets = await Promise.all(listedSets.map((set) => store.getQuestionSet(set.questionSetId)));
    const latestRuns = await store.listRecentRuns(projectId, 1);
    const latestObservations = latestRuns.length ? await store.listObservationsForRuns([latestRuns[0].runId]) : [];
    const byQuestion = new Map();
    for (const observation of latestObservations) {
      if (!byQuestion.has(observation.questionId)) byQuestion.set(observation.questionId, []);
      byQuestion.get(observation.questionId).push(publicObservation(observation));
    }
    return sets.map((set) => ({
      ...set,
      questions: set.questions.map((question) => ({ ...question, latest_observations: byQuestion.get(question.questionId) || [] }))
    }));
  }

  // Trusted orchestration only. Dashboard browser routes deliberately do not expose it.
  async function recordTrackingRun(input) {
    const projectId = requiredId(input.projectId, "projectId");
    const questionSet = await store.getQuestionSet(requiredId(input.questionSetId, "questionSetId"));
    if (!questionSet || questionSet.projectId !== projectId) {
      throw new DashboardError("question_set_not_found", "Question set does not belong to this Project", 404);
    }
    const observations = normalizeRunObservations(input.observations, questionSet.questions);
    const scheduledAt = requiredIso(input.scheduledAt, "scheduledAt");
    const observedAt = requiredIso(input.observedAt, "observedAt");
    const counts = countStatuses(observations);
    const timestamp = iso(now());
    return await store.insertTrackingRun({
      runId: `drun_${randomUUID()}`, projectId, questionSetId: questionSet.questionSetId,
      scheduledAt, observedAt, state: deriveRunState(counts), expectedObservations: observations.length,
      measuredObservations: counts.measured, unknownObservations: counts.unknown,
      failedObservations: counts.failed, observations: observations.map((observation) => ({
        ...observation, observationId: `dobs_${randomUUID()}`
      })),
      now: timestamp, nextRunAt: nextWeeklyRun(scheduledAt)
    });
  }

  async function getOverview({ sessionToken, projectId, weeks = 12 }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    const range = normalizeRange(weeks, now());
    const project = await requireProject(projectId);
    const runs = await store.listRuns(projectId, range.from, range.to);
    const observations = await store.listObservationsForRuns(runs.map((run) => run.runId));
    const series = buildSeries(runs, observations);
    const current = series.at(-1) || null;
    const previous = comparablePrevious(series);
    return {
      project: publicProject(project), range, data_freshness_at: current?.observed_at || null,
      tracking: { cadence: project.cadence, enabled: project.enabled, next_run_at: project.nextRunAt },
      summary: buildSummary(current, previous), series,
      annotations: await store.listAnnotations(projectId, range.from, range.to),
      latest_run: current ? latestRunSummary(runs, current.run_id) : null
    };
  }

  async function getPerformance({ sessionToken, projectId, weeks = 12 }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    const range = normalizeRange(weeks, now());
    const runs = await store.listRuns(projectId, range.from, range.to);
    const observations = await store.listObservationsForRuns(runs.map((run) => run.runId));
    return {
      range,
      series: buildSeries(runs, observations),
      by_engine: groupPerformance(observations, "engine"),
      by_question: groupPerformance(observations, "questionId")
    };
  }

  async function getCitations({ sessionToken, projectId, weeks = 12 }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    const range = normalizeRange(weeks, now());
    const runs = await store.listRuns(projectId, range.from, range.to);
    const observations = await store.listObservationsForRuns(runs.map((run) => run.runId));
    return { range, sources: aggregateCitations(observations) };
  }

  async function getDataQuality({ sessionToken, projectId, weeks = 12 }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    const range = normalizeRange(weeks, now());
    const runs = (await store.listRecentRuns(projectId, 100))
      .filter((run) => run.scheduledAt >= range.from && run.scheduledAt <= range.to);
    return {
      range,
      runs: runs.map((run) => ({
        run_id: run.runId, scheduled_at: run.scheduledAt, observed_at: run.observedAt,
        state: run.state, coverage: run.coverage
      }))
    };
  }

  async function getEvidence({ sessionToken, projectId, observationId }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    const observation = await store.getObservationForProject(projectId, observationId);
    if (!observation) throw new DashboardError("evidence_not_found", "Evidence was not found", 404);
    return evidenceObservation(observation);
  }

  async function createAnnotation({ sessionToken, projectId, occurredAt, note }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    const trimmed = String(note || "").trim();
    if (!trimmed || trimmed.length > 500) throw new DashboardError("invalid_annotation", "Annotation must be 1 to 500 characters", 400);
    return await store.createAnnotation({
      annotationId: `dann_${randomUUID()}`, projectId, accountId: session.accountId,
      occurredAt: requiredIso(occurredAt, "occurredAt"), note: trimmed, now: iso(now())
    });
  }

  async function connectGoogleSearchConsole({ sessionToken, projectId, googleEmail, propertyUri, refreshToken, scopes }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    if (!googleTokenKey) throw new DashboardError("gsc_not_configured", "GSC token encryption is not configured", 503);
    if (!propertyMatchesProject(propertyUri, (await requireProject(projectId)).siteUrl)) {
      throw new DashboardError("gsc_property_mismatch", "Selected Search Console property does not match this Project site", 400);
    }
    const encrypted = encryptSecret(requiredToken(refreshToken), googleTokenKey);
    const connection = await store.upsertGoogleConnection({ connectionId: `dgsc_${randomUUID()}`, projectId, accountId: session.accountId,
      googleEmail: normalizeEmail(googleEmail), propertyUri, ciphertext: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag,
      scopes: Array.isArray(scopes) ? scopes : [], now: iso(now()) });
    return publicGoogleConnection(connection);
  }

  async function getGscSummary({ sessionToken, projectId, from, to }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    const connection = await store.getGoogleConnection(projectId);
    const range = gscDateRange(from, to, now());
    return { connection: connection ? publicGoogleConnection(connection) : null, range,
      data: await store.listGscDailyMetrics(projectId, range.from, range.to) };
  }

  async function syncGoogleSearchConsole({ sessionToken, projectId, from, to }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    if (!gscClient || !googleTokenKey) throw new DashboardError("gsc_not_configured", "GSC import is not configured", 503);
    const connection = await store.getGoogleConnection(projectId);
    if (!connection) throw new DashboardError("gsc_not_connected", "Connect a Search Console property first", 409);
    const range = gscDateRange(from, to, now());
    const syncRunId = `dgsr_${randomUUID()}`;
    await store.startGscSync({ syncRunId, projectId, connectionId: connection.connectionId, now: iso(now()), from: range.from, to: range.to });
    try {
      const rows = await gscClient.fetchDailyMetrics({ propertyUri: connection.propertyUri,
        refreshToken: decryptSecret(connection, googleTokenKey), from: range.from, to: range.to });
      const normalized = normalizeGscRows(rows);
      await store.upsertGscDailyMetrics(projectId, connection.propertyUri, normalized, iso(now()));
      await store.purgeGscMetrics(dateMonthsAgo(now(), 13));
      await store.finishGscSync({ syncRunId, now: iso(now()), status: "succeeded", importedRows: normalized.length });
      return { sync_run_id: syncRunId, imported_rows: normalized.length, range };
    } catch (error) {
      await store.finishGscSync({ syncRunId, now: iso(now()), status: "failed", errorCode: safeGscErrorCode(error) });
      throw new DashboardError(safeGscErrorCode(error), "Search Console import failed", 502);
    }
  }

  async function disconnectGoogleSearchConsole({ sessionToken, projectId }) {
    await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    if (!await store.revokeGoogleConnection(projectId, iso(now()))) throw new DashboardError("gsc_not_connected", "No active Search Console connection", 404);
    return { disconnected: true };
  }

  async function listDueTrackingPlans({ at = iso(now()) } = {}) {
    // Scheduling transport belongs to the Product A worker/queue. The domain
    // service intentionally returns only due project plan metadata.
    if (typeof store.listDueTrackingPlans !== "function") return [];
    return await store.listDueTrackingPlans(at);
  }

  async function requiredSession(sessionToken) {
    const session = await authenticateSession(sessionToken);
    if (!session) throw new DashboardError("auth_required", "A valid Dashboard session is required", 401);
    return session;
  }

  async function requiredProjectRole(sessionToken, projectId, roles) {
    const session = await requiredSession(sessionToken);
    const membership = await store.getMembership(requiredId(projectId, "projectId"), session.accountId);
    if (!membership || !roles.includes(membership.role)) {
      throw new DashboardError("project_access_denied", "Project access is not granted", 404);
    }
    return { ...session, role: membership.role };
  }

  async function requireProject(projectId) {
    const project = await store.getProject(projectId);
    if (!project) throw new DashboardError("project_not_found", "Project was not found", 404);
    return project;
  }

  return {
    createInvitation, verifyInvitation, authenticateSession, loginGoogleAccount, createProject, listProjects, getEntitlement,
    requestManualTrackingRun, settleTrackingJob, applySandboxPayment,
    createQuestionSet, listTrackedQuestions, recordTrackingRun, getOverview, getPerformance,
    getCitations, getDataQuality, getEvidence, createAnnotation, listDueTrackingPlans,
    connectGoogleSearchConsole, getGscSummary, syncGoogleSearchConsole, disconnectGoogleSearchConsole
  };

  async function entitlementFor(accountId) {
    const saved = await store.getEntitlement(accountId);
    if (!saved) return { accountId, plan: "free", status: "active", activeProjectLimit: 2, manualRunLimit: 0, periodId: null, periodStart: null, periodEnd: null, graceEndsAt: null };
    const currentPeriod = saved.periodStart ? await store.getCurrentSubscriptionPeriod?.(accountId, saved.periodStart) : null;
    const period = saved.periodStart ? { periodId: currentPeriod?.periodId || null } : {};
    return { ...saved, ...period };
  }
}

function normalizedEncryptionKey(value) {
  const key = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "base64");
  if (key.length !== 32) throw new Error("GSC token encryption key must decode to 32 bytes");
  return key;
}
function encryptSecret(value, key) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  return { ciphertext: Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
function decryptSecret(connection, key) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(connection.iv, "base64"));
  decipher.setAuthTag(Buffer.from(connection.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(connection.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
function propertyMatchesProject(propertyUri, siteUrl) {
  try { const host = new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase(); const property = String(propertyUri || "").toLowerCase();
    return property.startsWith("sc-domain:") ? host === property.slice(10) || host.endsWith(`.${property.slice(10)}`) : new URL(property).hostname.replace(/^www\./, "") === host;
  } catch { return false; }
}
function publicGoogleConnection(connection) { return { connection_id: connection.connectionId, property_uri: connection.propertyUri, google_email: connection.googleEmail, scopes: connection.scopes, connected_at: connection.createdAt }; }
function gscDateRange(from, to, clock) { const end = to || dateDaysAgo(clock(), 3); const start = from || dateDaysAgo(new Date(`${end}T12:00:00Z`), 89); if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw new DashboardError("invalid_gsc_range", "Invalid GSC date range", 400); return { from: start, to: end }; }
function dateDaysAgo(date, days) { const d = new Date(date); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); }
function dateMonthsAgo(date, months) { const d = new Date(date); d.setUTCMonth(d.getUTCMonth() - months); return d.toISOString().slice(0, 10); }
function normalizeGscRows(rows) { if (!Array.isArray(rows)) throw new Error("invalid_gsc_response"); return rows.map((row) => ({ date: String(row.date || row.keys?.[0] || ""), clicks: Number(row.clicks), impressions: Number(row.impressions), ctr: Number(row.ctr), position: Number(row.position) })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Object.values(row).every((value) => typeof value === "string" || Number.isFinite(value))); }
function safeGscErrorCode(error) { return /^[a-z0-9_]{1,64}$/i.test(error?.code || "") ? error.code : "gsc_upstream_error"; }

function buildSeries(runs, observations) {
  const byRun = new Map(runs.map((run) => [run.runId, []]));
  for (const observation of observations) byRun.get(observation.runId)?.push(observation);
  return runs.map((run) => {
    const rows = byRun.get(run.runId) || [];
    const measured = rows.filter((row) => row.status === "measured");
    return {
      run_id: run.runId, observed_at: run.observedAt, question_set_id: run.questionSetId,
      question_set_version: rows[0]?.questionSetVersion || null, state: run.state,
      coverage: run.coverage,
      metrics: {
        brand_mention_rate: ratio(measured.filter((row) => row.brandMentioned === true).length, measured.length),
        official_citation_rate: ratio(measured.filter((row) => row.officialCitation === true).length, measured.length),
        measurement_coverage: ratio(run.coverage.measured, run.coverage.expected),
        citation_source_count: { value: uniqueCitationDomains(rows).size, numerator: uniqueCitationDomains(rows).size, denominator: null }
      }
    };
  });
}

function buildSummary(current, previous) {
  if (!current) return { status: "no_data", metrics: {} };
  const metrics = {};
  for (const [key, metric] of Object.entries(current.metrics)) {
    const comparable = previous && previous.question_set_id === current.question_set_id;
    metrics[key] = {
      ...metric,
      delta: comparable && metric.value !== null && previous.metrics[key]?.value !== null
        ? round(metric.value - previous.metrics[key].value) : null,
      comparison_status: previous ? (comparable ? "comparable" : "question_set_changed") : "no_prior_run"
    };
  }
  return { status: "available", metrics };
}

function comparablePrevious(series) {
  if (series.length < 2) return null;
  return series.at(-2);
}

function groupPerformance(observations, key) {
  const groups = new Map();
  for (const observation of observations) {
    const id = key === "questionId" ? observation.questionId : observation.engine;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(observation);
  }
  return [...groups.entries()].map(([id, rows]) => {
    const measured = rows.filter((row) => row.status === "measured");
    return {
      key: id,
      label: key === "questionId" ? rows[0]?.question?.text || id : id,
      brand_mention_rate: ratio(measured.filter((row) => row.brandMentioned === true).length, measured.length),
      official_citation_rate: ratio(measured.filter((row) => row.officialCitation === true).length, measured.length),
      coverage: ratio(measured.length, rows.length)
    };
  });
}

function aggregateCitations(observations) {
  const sources = new Map();
  for (const observation of observations.filter((row) => row.status === "measured")) {
    for (const citation of observation.citations || []) {
      const domain = citationDomain(citation);
      if (!domain) continue;
      const current = sources.get(domain) || { domain, citations: 0, official_citations: 0 };
      current.citations += 1;
      if (citation.isOfficial === true) current.official_citations += 1;
      sources.set(domain, current);
    }
  }
  return [...sources.values()].sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain));
}

function latestRunSummary(runs, runId) {
  const run = runs.find((item) => item.runId === runId);
  return run ? { run_id: run.runId, observed_at: run.observedAt, state: run.state, coverage: run.coverage } : null;
}

function publicObservation(observation) {
  return {
    observation_id: observation.observationId, run_id: observation.runId, question_id: observation.questionId,
    engine: observation.engine, model: observation.model, status: observation.status,
    brand_mentioned: observation.brandMentioned, official_citation: observation.officialCitation,
    observed_at: observation.observedAt, failure_code: observation.failureCode
  };
}

function evidenceObservation(observation) {
  return {
    ...publicObservation(observation), question: observation.question, question_set_version: observation.questionSetVersion,
    raw_answer: observation.rawAnswer, citations: observation.citations
  };
}

function publicProject(project) {
  return {
    project_id: project.projectId, name: project.name, site_url: project.siteUrl, timezone: project.timezone,
    role: project.role || null, created_at: project.createdAt, updated_at: project.updatedAt
  };
}

function normalizeRunObservations(input, questions) {
  if (!Array.isArray(input)) throw new DashboardError("invalid_run", "observations must be an array", 400);
  const questionIds = new Set(questions.map((question) => question.questionId));
  const expected = questions.length * ENGINE_IDS.length;
  if (input.length !== expected) throw new DashboardError("invalid_run", "Every question must include all four engines", 400);
  const seen = new Set();
  return input.map((raw) => {
    const questionId = requiredId(raw?.questionId, "observation.questionId");
    const engine = String(raw?.engine || "").trim();
    if (!questionIds.has(questionId) || !ENGINE_IDS.includes(engine)) {
      throw new DashboardError("invalid_run", "Observation question or engine is not part of this Tracking Plan", 400);
    }
    const key = `${questionId}:${engine}`;
    if (seen.has(key)) throw new DashboardError("invalid_run", "Duplicate observation", 400);
    seen.add(key);
    const status = String(raw?.status || "");
    if (!["measured", "unknown", "failed"].includes(status)) {
      throw new DashboardError("invalid_run", "Invalid observation status", 400);
    }
    const brandMentioned = normalizeMeasuredBoolean(raw?.brandMentioned, status, "brandMentioned");
    const officialCitation = normalizeMeasuredBoolean(raw?.officialCitation, status, "officialCitation");
    const rawAnswer = raw?.rawAnswer == null ? null : boundedText(raw.rawAnswer, 32_000, "rawAnswer");
    const citations = normalizeCitations(raw?.citations, status);
    if (status !== "measured" && (rawAnswer || citations.length)) {
      throw new DashboardError("invalid_run", "Unknown or failed observations cannot carry answer evidence", 400);
    }
    return {
      questionId, engine, model: raw?.model == null ? null : boundedText(raw.model, 160, "model"), status,
      brandMentioned, officialCitation, rawAnswer, citations,
      observedAt: raw?.observedAt == null ? null : requiredIso(raw.observedAt, "observation.observedAt"),
      failureCode: raw?.failureCode == null ? null : boundedText(raw.failureCode, 120, "failureCode")
    };
  });
}

function normalizeMeasuredBoolean(value, status, label) {
  if (status !== "measured") {
    if (value !== null && value !== undefined) throw new DashboardError("invalid_run", `${label} must be null when not measured`, 400);
    return null;
  }
  if (typeof value !== "boolean") throw new DashboardError("invalid_run", `${label} must be boolean when measured`, 400);
  return value;
}

function normalizeCitations(value, status) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 50) throw new DashboardError("invalid_run", "citations must contain at most 50 entries", 400);
  if (status !== "measured") return [];
  return value.map((citation) => {
    const url = String(citation?.url || "").trim();
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      return { url: parsed.toString(), domain: parsed.hostname.toLowerCase(), isOfficial: citation.isOfficial === true };
    } catch {
      throw new DashboardError("invalid_run", "Citation URL must be http(s)", 400);
    }
  });
}

function normalizeQuestions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_QUESTIONS) {
    throw new DashboardError("invalid_question_set", `questions must contain 1 to ${MAX_QUESTIONS} items`, 400);
  }
  return value.map((question) => ({
    text: boundedText(question?.text, 1000, "question.text"),
    intent: question?.intent == null ? null : boundedText(question.intent, 120, "question.intent"),
    tags: normalizeTags(question?.tags)
  }));
}

function normalizeProject({ name, siteUrl, timezone }) {
  const normalizedName = boundedText(name, 120, "name");
  let parsed;
  try { parsed = new URL(String(siteUrl || "").trim()); } catch { throw new DashboardError("invalid_project", "siteUrl must be a valid http(s) URL", 400); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new DashboardError("invalid_project", "siteUrl must be a valid http(s) URL", 400);
  const normalizedTimezone = String(timezone || "").trim();
  if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(normalizedTimezone)) throw new DashboardError("invalid_project", "timezone must be an IANA timezone", 400);
  return { name: normalizedName, siteUrl: `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "") || "/"}`, timezone: normalizedTimezone };
}

function normalizeTags(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 12) throw new DashboardError("invalid_question_set", "tags must contain at most 12 items", 400);
  return value.map((tag) => boundedText(tag, 60, "question.tag"));
}

function normalizeLocale(value) {
  const locale = String(value || "").trim();
  if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale)) throw new DashboardError("invalid_question_set", "locale is invalid", 400);
  return locale;
}

function normalizeRange(weeks, clock) {
  const value = Number(weeks);
  if (![4, 12, 26].includes(value)) throw new DashboardError("invalid_range", "weeks must be 4, 12, or 26", 400);
  const end = new Date(clock);
  const start = new Date(end.getTime() - value * 7 * 24 * 60 * 60 * 1000);
  return { weeks: value, from: start.toISOString(), to: end.toISOString() };
}

function countStatuses(observations) {
  return observations.reduce((total, observation) => {
    total[observation.status] += 1;
    return total;
  }, { measured: 0, unknown: 0, failed: 0 });
}

function deriveRunState(counts) {
  if (counts.measured === 0 && counts.unknown === 0) return "failed";
  return counts.unknown || counts.failed ? "partial" : "complete";
}

function ratio(numerator, denominator) {
  return denominator > 0 ? { value: round((numerator / denominator) * 100), numerator, denominator } : { value: null, numerator: 0, denominator: 0 };
}

function uniqueCitationDomains(observations) {
  const result = new Set();
  for (const citation of observations.flatMap((observation) => observation.citations || [])) {
    const domain = citationDomain(citation);
    if (domain) result.add(domain);
  }
  return result;
}

function citationDomain(citation) {
  const value = String(citation?.domain || "").trim().toLowerCase();
  if (value) return value;
  try { return new URL(citation?.url).hostname.toLowerCase(); } catch { return null; }
}

function requiredStore(value) {
  if (!value || typeof value.getProject !== "function" || typeof value.insertTrackingRun !== "function") {
    throw new Error("Dashboard service requires a Dashboard store");
  }
  return value;
}

function requireDashboardPepper(value) {
  const pepper = String(value || "");
  if (Buffer.byteLength(pepper, "utf8") < 32) throw new Error("DASHBOARD_TOKEN_PEPPER must be at least 32 bytes");
  return pepper;
}

function hashToken(token, pepper) {
  return createHmac("sha256", pepper).update(String(token || "")).digest("hex");
}

function opaqueToken(prefix) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new DashboardError("invalid_request", "A valid email address is required", 400);
  }
  return email;
}

function requiredToken(value) {
  const token = String(value || "").trim();
  if (!token || token.length > 512) throw new DashboardError("invalid_request", "A valid invitation token is required", 400);
  return token;
}

function requiredId(value, label) {
  const id = String(value || "").trim();
  if (!id || id.length > 180) throw new DashboardError("invalid_request", `${label} is required`, 400);
  return id;
}

function boundedText(value, max, label) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new DashboardError("invalid_request", `${label} must be 1 to ${max} characters`, 400);
  return text;
}

function requiredIso(value, label) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) throw new DashboardError("invalid_request", `${label} must be an ISO timestamp`, 400);
  return date.toISOString();
}

function nextWeeklyRun(value) {
  return new Date(new Date(value).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function addMilliseconds(value, ms) {
  return new Date(new Date(value).getTime() + ms).toISOString();
}

function addMonths(value, months) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function taipeiDay(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function canUseDashboard(entitlement, date) {
  if (entitlement.status === "active" || entitlement.status === "cancel_at_period_end") return true;
  return entitlement.status === "grace" && entitlement.graceEndsAt && new Date(entitlement.graceEndsAt) > new Date(date);
}

async function manualRemaining(entitlement, store) {
  return entitlement.plan === "paid_beta" && entitlement.periodId
    ? Math.max(0, entitlement.manualRunLimit - await store.manualUsage(entitlement.periodId))
    : 0;
}

function publicEntitlement(entitlement, periodId = entitlement.periodId || null) {
  return {
    plan: entitlement.plan, status: entitlement.status, active_project_limit: entitlement.activeProjectLimit,
    manual_run_limit: entitlement.manualRunLimit, period_start: entitlement.periodStart || null,
    period_end: entitlement.periodEnd || null, grace_ends_at: entitlement.graceEndsAt || null,
    period_id: periodId, daily_manual_limit: entitlement.plan === "paid_beta" ? 6 : 0,
    timezone: "Asia/Taipei", price_twd: entitlement.plan === "paid_beta" ? 330 : 0
  };
}

function iso(value) {
  return new Date(value).toISOString();
}

function positiveMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

module.exports = { createDashboardService, DashboardError, ENGINE_IDS };
