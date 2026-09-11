const { randomUUID } = require("node:crypto");
const {
  DeveloperApiError, buildMeasurement, failedEngineResult, hashRequest,
  normalizeEngineResult, normalizeMeasurementRequest, normalizeProviders,
  requiredIdempotencyKey, requiredTenant
} = require("./developer-api-prototype.js");
const {
  createOpaqueToken, decryptToken, encryptToken, hashToken, normalizeEmail,
  requirePepper, tokenPrefix
} = require("../security/developer-credentials.js");

const PLATFORM_VERSION = "0.2.0";
const API_KEY_SCOPES = Object.freeze(["measurements:read", "measurements:write", "usage:read"]);

function createDeveloperPlatformService(options = {}) {
  const store = requiredStore(options.store);
  const clock = options.now || (() => new Date());
  const schedule = options.schedule || ((task) => setImmediate(task));
  const enqueue = typeof options.enqueue === "function" ? options.enqueue : null;
  const pepper = requirePepper(options.tokenPepper);
  const providers = normalizeProviders(options.providers || []);
  const providerMode = providers[0].adapter.mode;
  const config = normalizeConfig(options);
  const workerId = options.workerId || `worker_${randomUUID()}`;

  async function securityEvent(tenantId, eventType, severity, metadata = {}) {
    return store.recordSecurityEvent({
      eventId: `sec_${randomUUID()}`, tenantId, eventType, severity, metadata,
      now: clock().toISOString()
    });
  }

  async function createInvitation({ email }) {
    const normalizedEmail = normalizeEmail(email);
    if (await store.findVerifiedAccountByEmail(normalizedEmail)) {
      throw new DeveloperApiError("account_exists", "A verified account already exists", 409);
    }
    const token = createOpaqueToken("gci_");
    const createdAt = clock().toISOString();
    const expiresAt = addMilliseconds(createdAt, config.invitationTtlMs);
    await store.insertAuthToken({
      tokenId: `tok_${randomUUID()}`, purpose: "invitation", email: normalizedEmail,
      tokenHash: hashToken(token, pepper), encryptedToken: null, createdAt, expiresAt
    });
    await securityEvent(null, "invitation_created", "info");
    return { verification_token: token, expires_at: expiresAt };
  }

  async function verifyEmail({ token }) {
    const raw = boundedToken(token, "verification token");
    const createdAt = clock().toISOString();
    const sessionToken = createOpaqueToken("gcs_");
    const sessionExpiresAt = addMilliseconds(createdAt, config.sessionTtlMs);
    const consumed = await store.consumeAuthToken({
      purpose: "invitation", tokenHash: hashToken(raw, pepper), now: createdAt,
      tenantId: `tnt_${randomUUID()}`, accountId: `acct_${randomUUID()}`,
      sessionId: `ses_${randomUUID()}`, sessionHash: hashToken(sessionToken, pepper), sessionExpiresAt
    });
    if (!consumed) {
      await securityEvent(null, "verification_failed", "warning");
      throw new DeveloperApiError("invalid_or_expired_token", "Verification token is invalid or expired", 400);
    }
    await securityEvent(consumed.tenantId, "email_verified", "info");
    return {
      account_id: consumed.accountId, tenant_id: consumed.tenantId,
      session_token: sessionToken, session_expires_at: sessionExpiresAt
    };
  }

  async function requestLoginLink({ email }) {
    let normalizedEmail;
    try { normalizedEmail = normalizeEmail(email); } catch { return genericLoginResponse(); }
    const account = await store.findVerifiedAccountByEmail(normalizedEmail);
    if (account) {
      const loginToken = createOpaqueToken("gcl_");
      const createdAt = clock().toISOString();
      await store.insertAuthToken({
        tokenId: `tok_${randomUUID()}`, purpose: "login", email: normalizedEmail,
        tokenHash: hashToken(loginToken, pepper), encryptedToken: encryptToken(loginToken, pepper),
        createdAt, expiresAt: addMilliseconds(createdAt, config.loginTtlMs)
      });
      await securityEvent(account.tenant_id, "login_link_requested", "info");
    }
    return genericLoginResponse();
  }

  async function listAuthOutbox({ limit = 100 } = {}) {
    const rows = await store.listAuthOutbox({ now: clock().toISOString(), limit });
    return rows.map((row) => ({
      token_id: row.token_id, email: row.email_normalized,
      login_token: decryptToken(row.encrypted_token, pepper), expires_at: row.expires_at
    }));
  }

  async function consumeLoginLink({ token }) {
    const raw = boundedToken(token, "login token");
    const createdAt = clock().toISOString();
    const sessionToken = createOpaqueToken("gcs_");
    const sessionExpiresAt = addMilliseconds(createdAt, config.sessionTtlMs);
    const consumed = await store.consumeAuthToken({
      purpose: "login", tokenHash: hashToken(raw, pepper), now: createdAt,
      sessionId: `ses_${randomUUID()}`, sessionHash: hashToken(sessionToken, pepper), sessionExpiresAt
    });
    if (!consumed) {
      await securityEvent(null, "login_failed", "warning");
      throw new DeveloperApiError("invalid_or_expired_token", "Login token is invalid or expired", 400);
    }
    await securityEvent(consumed.tenantId, "login_succeeded", "info");
    return {
      account_id: consumed.accountId, tenant_id: consumed.tenantId,
      session_token: sessionToken, session_expires_at: sessionExpiresAt
    };
  }

  async function authenticateSession(sessionToken) {
    if (!String(sessionToken || "").startsWith("gcs_")) return null;
    return store.authenticateSession({ tokenHash: hashToken(sessionToken, pepper), now: clock().toISOString() });
  }

  async function loginGoogleAccount({ email }) {
    const account = await store.findVerifiedAccountByEmail(normalizeEmail(email));
    if (!account) throw new DeveloperApiError("account_not_authorized", "This Google account is not enabled for the Developer Console", 403);
    const createdAt = clock().toISOString();
    const sessionToken = createOpaqueToken("gcs_");
    const sessionExpiresAt = addMilliseconds(createdAt, config.sessionTtlMs);
    await store.createSession({ sessionId: `ses_${randomUUID()}`, tenantId: account.tenant_id || account.tenantId,
      tokenHash: hashToken(sessionToken, pepper), now: createdAt, sessionExpiresAt });
    return { account_id: account.account_id || account.accountId, tenant_id: account.tenant_id || account.tenantId,
      session_token: sessionToken, session_expires_at: sessionExpiresAt };
  }

  async function requireSession(token) {
    const session = await authenticateSession(token);
    if (!session) throw new DeveloperApiError("auth_required", "A valid management session is required", 401);
    return session;
  }

  async function activateConsole({ sessionToken, plan }) {
    const session = await requireSession(sessionToken);
    const selectedPlan = String(plan || "").trim().toLowerCase();
    if (!new Set(["free", "basic", "premium"]).has(selectedPlan)) {
      throw new DeveloperApiError("invalid_request", "plan must be free, basic, or premium", 400);
    }
    if (selectedPlan !== "free") {
      throw new DeveloperApiError("payment_required", "Paid plans require a confirmed entitlement grant", 402);
    }
    const activatedAt = clock().toISOString();
    const entitlement = await store.activateEntitlement({
      tenantId: session.tenantId, plan: selectedPlan, status: "trialing", activatedAt,
      expiresAt: addMilliseconds(activatedAt, config.trialDays * 86_400_000),
      quotaWindowStrategy: config.quotaWindowStrategy,
      roundsPerWindow: config.freeRoundsPerWindow
    });
    if (!entitlement) throw new DeveloperApiError("forbidden", "Tenant is not active", 403);
    if (entitlement.plan !== selectedPlan) throw new DeveloperApiError("plan_conflict", "A different plan is already active", 409);
    const usage = await usageFor(session.tenantId, entitlement);
    await securityEvent(session.tenantId, "console_activated", "info", { plan: selectedPlan });
    return publicEntitlement(entitlement, usage);
  }

  async function requireEntitlement(tenantId) {
    const entitlement = await store.getEntitlement(tenantId);
    if (!entitlement) throw new DeveloperApiError("trial_not_started", "Console activation is required", 403);
    if (entitlement.expiresAt && entitlement.expiresAt <= clock().toISOString()) {
      throw new DeveloperApiError("trial_expired", "Trial has expired", 403);
    }
    return entitlement;
  }

  async function createApiKey({ sessionToken, name }) {
    const session = await requireSession(sessionToken);
    const entitlement = await requireEntitlement(session.tenantId);
    const keyName = boundedName(name || "Default", 80);
    const apiKey = createOpaqueToken("gck_");
    const createdAt = clock().toISOString();
    const keyId = `key_${randomUUID()}`;
    await store.insertApiKey({
      keyId, tenantId: session.tenantId, name: keyName, keyPrefix: tokenPrefix(apiKey),
      keyHash: hashToken(apiKey, pepper), scopes: [...API_KEY_SCOPES], createdAt
    });
    await securityEvent(session.tenantId, "api_key_created", "info");
    return {
      key_id: keyId, tenant_id: session.tenantId, name: keyName, api_key: apiKey,
      key_prefix: tokenPrefix(apiKey), scopes: [...API_KEY_SCOPES], created_at: createdAt,
      plan: entitlement.plan
    };
  }

  async function listApiKeys({ sessionToken }) {
    const session = await requireSession(sessionToken);
    return store.listApiKeys(session.tenantId);
  }

  async function revokeApiKey({ sessionToken, keyId }) {
    const session = await requireSession(sessionToken);
    const revoked = await store.revokeApiKey({
      tenantId: session.tenantId, keyId: String(keyId || ""), now: clock().toISOString()
    });
    if (!revoked) throw new DeveloperApiError("not_found", "API key not found", 404);
    await securityEvent(session.tenantId, "api_key_revoked", "warning");
    return { revoked: true };
  }

  async function authenticateApiKey(apiKey) {
    if (!String(apiKey || "").startsWith("gck_")) return null;
    return store.authenticateApiKey({ keyHash: hashToken(apiKey, pepper), now: clock().toISOString() });
  }

  async function createMeasurement({ tenantId, idempotencyKey, body }) {
    const tenant = requiredTenant(tenantId);
    const key = requiredIdempotencyKey(idempotencyKey);
    const request = {
      ...normalizeMeasurementRequest(body),
      profile_set_version: providerMode === "official" ? "official-four-v1" : "official-four-fixture-v1"
    };
    const requestHash = hashRequest(request);
    const entitlement = await requireEntitlement(tenant);
    const window = quotaWindow(entitlement, clock());
    const admission = await store.admitJob({
      jobId: `job_${randomUUID()}`, measurementId: `msr_${randomUUID()}`,
      reservationId: `qrs_${randomUUID()}`, tenantId: tenant, idempotencyKey: key,
      requestHash, request, windowStart: window.start, windowEnd: window.end,
      costBudget: providerMode === "official" ? costBudgetWindow(config, clock()) : null,
      now: clock().toISOString()
    });
    if (admission.created === false) {
      if (admission.job.request_hash !== requestHash) {
        throw new DeveloperApiError("idempotency_conflict", "Idempotency-Key was already used with different content", 409);
      }
      await dispatchJob(admission.job);
      return { created: false, job: publicJob(admission.job) };
    }
    if (admission.rejected) throw admissionError(admission.rejected);
    await dispatchJob(admission.job);
    return { created: true, job: publicJob(admission.job) };
  }

  const INTERNAL_TENANTS = Object.freeze({
    dashboard: "tnt_internal_dashboard",
    agent: "tnt_internal_agent"
  });

  async function authenticateInternalCaller(secret) {
    if (typeof store.authenticateInternalCaller !== "function") return null;
    const value = String(secret || "");
    if (value.length < 32) return null;
    return store.authenticateInternalCaller({
      secretHash: hashToken(value, pepper), now: clock().toISOString()
    });
  }

  // Products A and C submit here. They are not customers: no tenant quota is
  // drawn, no customer billing event is produced, and the customer admission
  // switch neither blocks nor permits this path.
  async function createInternalMeasurement({ caller, idempotencyKey, body }) {
    const callerId = String(caller || "");
    if (!Object.hasOwn(INTERNAL_TENANTS, callerId)) {
      throw new DeveloperApiError("internal_caller_unknown", "Unknown internal caller", 403);
    }
    const key = requiredIdempotencyKey(idempotencyKey);
    const request = {
      ...normalizeMeasurementRequest(body),
      profile_set_version: providerMode === "official" ? "official-four-v1" : "official-four-fixture-v1"
    };
    const requestHash = hashRequest(request);
    const admission = await store.admitJob({
      jobId: `job_${randomUUID()}`, measurementId: `msr_${randomUUID()}`,
      reservationId: `qrs_${randomUUID()}`, tenantId: INTERNAL_TENANTS[callerId],
      caller: callerId, idempotencyKey: key, requestHash, request,
      windowStart: null, windowEnd: null,
      costBudget: providerMode === "official" ? costBudgetWindow(config, clock(), "internal") : null,
      now: clock().toISOString()
    });
    if (admission.created === false) {
      if (admission.job.request_hash !== requestHash) {
        throw new DeveloperApiError("idempotency_conflict", "Idempotency-Key was already used with different content", 409);
      }
      await dispatchJob(admission.job);
      return { created: false, job: publicJob(admission.job) };
    }
    if (admission.rejected) throw internalAdmissionError(admission.rejected);
    await dispatchJob(admission.job);
    return { created: true, job: publicJob(admission.job) };
  }

  async function getInternalMeasurement({ caller, measurementId }) {
    const callerId = String(caller || "");
    if (!Object.hasOwn(INTERNAL_TENANTS, callerId)) {
      throw new DeveloperApiError("internal_caller_unknown", "Unknown internal caller", 403);
    }
    return getMeasurement({ tenantId: INTERNAL_TENANTS[callerId], measurementId });
  }

  // The plaintext secret is returned exactly once, like an API key. Only its
  // hash is stored, so a leaked database cannot be used to call the channel.
  async function rotateInternalCallerSecret({ callerId }) {
    const id = String(callerId || "");
    if (!Object.hasOwn(INTERNAL_TENANTS, id)) {
      throw new DeveloperApiError("internal_caller_unknown", "Unknown internal caller", 404);
    }
    if (typeof store.upsertInternalCaller !== "function") {
      throw new DeveloperApiError("not_supported", "This store cannot hold internal callers", 501);
    }
    const secret = createOpaqueToken("gci_int_");
    await store.upsertInternalCaller({
      callerId: id, tenantId: INTERNAL_TENANTS[id],
      secretHash: hashToken(secret, pepper), now: clock().toISOString()
    });
    await securityEvent(INTERNAL_TENANTS[id], "internal_caller_rotated", "info", { caller: id });
    return { caller_id: id, secret, rotated_at: clock().toISOString() };
  }

  async function revokeInternalCallerSecret({ callerId }) {
    const id = String(callerId || "");
    if (!Object.hasOwn(INTERNAL_TENANTS, id)) {
      throw new DeveloperApiError("internal_caller_unknown", "Unknown internal caller", 404);
    }
    const revoked = await store.revokeInternalCaller({ callerId: id, now: clock().toISOString() });
    if (revoked) await securityEvent(INTERNAL_TENANTS[id], "internal_caller_revoked", "warning", { caller: id });
    return { caller_id: id, revoked };
  }

  async function getInternalSpend() {
    if (typeof store.getInternalSpend !== "function") return { windows: [] };
    const window = costBudgetWindow(config, clock(), "internal");
    return {
      windows: await store.getInternalSpend({
        dailyStart: window.dailyStart, monthlyStart: window.monthlyStart
      })
    };
  }

  async function dispatchJob(job) {
    if (enqueue) return enqueue({ jobId: job.job_id, tenantId: job.tenant_id });
    schedule(() => runJob(job.job_id).catch((error) => {
      console.error(JSON.stringify({ event: "developer_job_worker_failed", code: error?.code || "internal_error" }));
    }));
    return undefined;
  }

  async function runJob(jobId) {
    const startedAt = clock();
    const leaseToken = `lease_${randomUUID()}`;
    const job = await store.claimJob({
      jobId, workerId, leaseToken, now: startedAt.toISOString(),
      leaseExpiresAt: addMilliseconds(startedAt.toISOString(), config.leaseTtlMs)
    });
    if (!job) return false;
    try {
      const attempts = await Promise.all(providers.map(async ({ profile, adapter }) => {
      const attemptId = `att_${randomUUID()}`;
      await store.recordAttemptStarted({
        attemptId, jobId: job.job_id, tenantId: job.tenant_id,
        profileId: profile.id, now: clock().toISOString()
      });
      let engine;
      try {
        const response = await adapter.execute({ ...job.request, prompt: job.request.effective_prompt }, {
          attempt_id: attemptId, job_id: job.job_id, profile
        });
        engine = normalizeEngineResult(profile, response);
      } catch (error) {
        engine = failedEngineResult(profile, error);
      }
      await store.recordAttemptFinished({
        jobId: job.job_id, profileId: profile.id, status: engine.status,
        errorCode: engine.error?.code || null, usage: engine.usage, cost: engine.cost,
        now: clock().toISOString()
      });
      return engine;
      }));
      const completedAt = clock().toISOString();
      const succeeded = attempts.every((engine) => engine.status === "succeeded");
      const measurement = buildMeasurement(job, attempts, succeeded, completedAt, providerMode);
      return await store.completeJob({
        jobId: job.job_id, leaseToken, measurement,
        errorCode: succeeded ? null : firstFailureCode(attempts),
        expiresAt: addMilliseconds(completedAt, config.resultRetentionDays * 86_400_000),
        costEventId: `cst_${randomUUID()}`, twdPerUsd: config.twdPerUsd, now: completedAt
      });
    } catch (error) {
      await failUnfinishedJob(job.job_id, leaseToken, error);
      return false;
    }
  }

  async function failUnfinishedJob(jobId, leaseToken, error) {
    return store.failJob({
      jobId, leaseToken, errorCode: error?.code || "internal_error", now: clock().toISOString()
    });
  }

  async function recoverPendingJobs() {
    const stale = await store.expireStaleJobs({ now: clock().toISOString() });
    const queued = await store.listQueuedJobs({ limit: config.recoveryBatchSize });
    for (const job of queued) await dispatchJob(job);
    return { queued: queued.length, ambiguous_failed: stale.length };
  }

  async function getJob({ tenantId, jobId }) {
    const job = await store.getJob({ tenantId: requiredTenant(tenantId), jobId: String(jobId || "") });
    return job ? publicJob(job) : null;
  }

  async function getJobByMeasurement({ tenantId, measurementId }) {
    const job = await store.getJobByMeasurement({
      tenantId: requiredTenant(tenantId), measurementId: String(measurementId || "")
    });
    return job ? publicJob(job) : null;
  }

  async function getMeasurement({ tenantId, measurementId }) {
    return store.getMeasurement({
      tenantId: requiredTenant(tenantId), measurementId: String(measurementId || ""),
      now: clock().toISOString()
    });
  }

  async function deleteMeasurement({ tenantId, measurementId }) {
    const tenant = requiredTenant(tenantId);
    const result = await store.deleteMeasurement({
      tenantId: tenant, measurementId: String(measurementId || ""), now: clock().toISOString()
    });
    if (result.status === "not_found") throw new DeveloperApiError("not_found", "Measurement not found", 404);
    if (result.status === "not_terminal") throw new DeveloperApiError("result_not_ready", "Measurement is still running", 409);
    await securityEvent(tenant, "measurement_deleted", "info");
    return { deleted: true };
  }

  async function usageFor(tenantId, entitlement) {
    const window = quotaWindow(entitlement, clock());
    const usage = await store.getUsage({
      tenantId, windowStart: window.start, windowEnd: window.end,
      roundLimit: entitlement.roundsPerWindow
    });
    return { ...usage, plan: entitlement.plan, entitlement_expires_at: entitlement.expiresAt };
  }

  async function getUsage({ tenantId }) {
    const tenant = requiredTenant(tenantId);
    return usageFor(tenant, await requireEntitlement(tenant));
  }

  async function listJobs({ tenantId, limit }) {
    return (await store.listJobs({ tenantId: requiredTenant(tenantId), limit })).map(publicJob);
  }

  async function setAdmission({ enabled, reason }) {
    const state = await store.setAdmission({
      enabled: Boolean(enabled), reason: boundedName(reason || "manual change", 200),
      now: clock().toISOString()
    });
    await securityEvent(null, "admission_changed", enabled ? "info" : "warning", { enabled: Boolean(enabled) });
    return state;
  }

  return {
    activateConsole, authenticateApiKey, authenticateSession, loginGoogleAccount, consumeLoginLink,
    authenticateInternalCaller, createApiKey, createInvitation, createInternalMeasurement,
    createMeasurement, deleteMeasurement, getInternalMeasurement, getInternalSpend,
    rotateInternalCallerSecret, revokeInternalCallerSecret,
    getAdminOverview: () => store.getAdminOverview(), getJob, getJobByMeasurement,
    getMeasurement, getUsage, listApiKeys, listAuthOutbox, listJobs,
    listSecurityEvents: ({ limit } = {}) => store.listSecurityEvents({ limit }),
    recoverPendingJobs, requestLoginLink, revokeApiKey, runJob, setAdmission,
    state: () => ({
      version: PLATFORM_VERSION, provider_count: providers.length, provider_mode: providerMode,
      quota_window_strategy: config.quotaWindowStrategy,
      result_retention_days: config.resultRetentionDays,
      cost_budget_enabled: providerMode === "official",
      store: store.state?.() || { kind: "custom" }
    }),
    verifyEmail
  };
}

function quotaWindow(entitlement, date) {
  const current = date.getTime();
  let start;
  if (entitlement.quotaWindowStrategy === "rolling_24h") {
    const activated = Date.parse(entitlement.activatedAt);
    const index = Math.max(0, Math.floor((current - activated) / 86_400_000));
    start = new Date(activated + index * 86_400_000);
  } else {
    start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

function normalizeConfig(options) {
  const strategy = String(options.quotaWindowStrategy || "");
  if (!new Set(["rolling_24h", "utc_day"]).has(strategy)) {
    throw new Error("quotaWindowStrategy must be explicitly set to rolling_24h or utc_day");
  }
  const resultRetentionDays = positiveInteger(options.resultRetentionDays, 0);
  if (!resultRetentionDays) throw new Error("resultRetentionDays must be explicitly configured");
  const official = normalizeProviders(options.providers || [])[0]?.adapter?.mode === "official";
  const costLimits = {
    dailyBudgetTwd: positiveNumber(options.dailyBudgetTwd),
    monthlyBudgetTwd: positiveNumber(options.monthlyBudgetTwd),
    maxJobCostTwd: positiveNumber(options.maxJobCostTwd),
    twdPerUsd: positiveNumber(options.twdPerUsd),
    internalDailyBudgetTwd: positiveNumber(options.internalDailyBudgetTwd || options.dailyBudgetTwd),
    internalMonthlyBudgetTwd: positiveNumber(options.internalMonthlyBudgetTwd || options.monthlyBudgetTwd)
  };
  if (official && Object.values(costLimits).some((value) => !value)) {
    throw new Error("Official platform mode requires explicit daily, monthly, per-job TWD budgets and TWD/USD rate");
  }
  return {
    quotaWindowStrategy: strategy, resultRetentionDays,
    ...costLimits,
    trialDays: positiveInteger(options.trialDays, 7),
    freeRoundsPerWindow: positiveInteger(options.freeRoundsPerWindow, 3),
    invitationTtlMs: positiveInteger(options.invitationTtlMs, 86_400_000),
    loginTtlMs: positiveInteger(options.loginTtlMs, 900_000),
    sessionTtlMs: positiveInteger(options.sessionTtlMs, 43_200_000),
    leaseTtlMs: positiveInteger(options.leaseTtlMs, 120_000),
    recoveryBatchSize: positiveInteger(options.recoveryBatchSize, 25)
  };
}

function costBudgetWindow(config, date, scope = "customer") {
  const dailyStart = new Date(date);
  dailyStart.setUTCHours(0, 0, 0, 0);
  const monthlyStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return {
    dailyStart: dailyStart.toISOString(),
    dailyEnd: new Date(dailyStart.getTime() + 86_400_000).toISOString(),
    monthlyStart: monthlyStart.toISOString(),
    monthlyEnd: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString(),
    dailyLimitMicros: Math.floor(
      (scope === "internal" ? config.internalDailyBudgetTwd : config.dailyBudgetTwd) * 1_000_000
    ),
    monthlyLimitMicros: Math.floor(
      (scope === "internal" ? config.internalMonthlyBudgetTwd : config.monthlyBudgetTwd) * 1_000_000
    ),
    jobReserveMicros: Math.floor(config.maxJobCostTwd * 1_000_000)
  };
}

function requiredStore(value) {
  if (!value || typeof value !== "object") throw new TypeError("A durable developer platform store is required");
  return value;
}

function publicJob(job) {
  return {
    job_id: job.job_id, measurement_id: job.measurement_id, status: job.status,
    created_at: job.created_at, completed_at: job.completed_at || null,
    content_deleted_at: job.content_deleted_at || null, error_code: job.error_code || null
  };
}

function publicEntitlement(entitlement, usage) {
  return {
    tenant_id: entitlement.tenantId, plan: entitlement.plan, status: entitlement.status,
    activated_at: entitlement.activatedAt, expires_at: entitlement.expiresAt, ...usage
  };
}

// Internal rejections must read differently from customer ones: an operator
// looking at these needs to know which switch or which budget stopped the call.
function internalAdmissionError(code) {
  const errors = {
    internal_admission_closed: ["internal_admission_closed", "The internal measurement channel is closed", 503],
    internal_caller_revoked: ["internal_caller_revoked", "This internal caller is revoked", 403],
    internal_budget_exhausted: ["internal_budget_exhausted", "The internal spending budget is exhausted", 503]
  };
  return new DeveloperApiError(...(errors[code] || ["internal_error", "Unable to admit internal measurement", 500]));
}

function admissionError(code) {
  const errors = {
    service_unavailable: ["service_unavailable", "New measurements are temporarily paused", 503],
    trial_not_started: ["trial_not_started", "Console activation is required", 403],
    trial_expired: ["trial_expired", "Trial has expired", 403],
    quota_exhausted: ["quota_exhausted", "No rounds remain in the current quota window", 429],
    cost_budget_exhausted: ["service_unavailable", "Provider spending budget is exhausted", 503]
  };
  return new DeveloperApiError(...(errors[code] || ["internal_error", "Unable to admit measurement", 500]));
}

function firstFailureCode(engines) {
  return engines.find((engine) => engine.status === "failed")?.error?.code || "provider_error";
}

function boundedToken(value, label) {
  const token = String(value || "").trim();
  if (token.length < 20 || token.length > 256) {
    throw new DeveloperApiError("invalid_or_expired_token", `${label} is invalid`, 400);
  }
  return token;
}

function boundedName(value, limit) {
  const text = String(value || "").trim();
  if (!text || text.length > limit) {
    throw new DeveloperApiError("invalid_request", `value must be 1 to ${limit} characters`, 400);
  }
  return text;
}

function genericLoginResponse() {
  return { accepted: true, message: "If the account exists, a one-time login link will be prepared" };
}

function addMilliseconds(iso, milliseconds) {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

module.exports = { API_KEY_SCOPES, PLATFORM_VERSION, createDeveloperPlatformService };
