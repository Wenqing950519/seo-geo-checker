const { createHash, timingSafeEqual } = require("node:crypto");
const { createDeveloperApiPrototype, DeveloperApiError, createFixtureProviders } = require("./application/developer-api-prototype.js");
const { createDeveloperPlatformService } = require("./application/developer-platform-service.js");
const { createPrototypeMeasurementResultStore } = require("./storage/developer-measurement-result-store.js");
const { createSqliteDeveloperPlatformStore } = require("./storage/developer-platform-store.js");
const { createD1DeveloperPlatformStore } = require("./storage/developer-platform-d1-store.js");
const { createOfficialProvidersFromEnv, getOfficialProviderReadiness } = require("./application/official-search-providers.js");

function createDeveloperApiHttpHandler(options = {}) {
  const source = options.config || process.env;
  const schedule = options.schedule || ((task) => setImmediate(task));
  const config = normalizeConfig(source, options);
  const providerSource = options.providerConfig || process.env;
  const providers = config.mode === "official"
    ? createOfficialProvidersFromEnv({ config: providerSource })
    : createFixtureProviders();
  const platformStore = config.platformEnabled
    ? options.platformStore || (config.developerD1Enabled
      ? createD1DeveloperPlatformStore({ config: source })
      : createSqliteDeveloperPlatformStore({ filename: config.localDatabasePath }))
    : null;
  const api = options.api || (config.platformEnabled
    ? createDeveloperPlatformService({
        store: platformStore,
        providers,
        tokenPepper: config.tokenPepper,
        quotaWindowStrategy: config.quotaWindowStrategy,
        resultRetentionDays: config.resultRetentionDays,
        trialDays: config.trialDays,
        freeRoundsPerWindow: config.freeRoundsPerWindow,
        dailyBudgetTwd: config.dailyBudgetTwd,
        monthlyBudgetTwd: config.monthlyBudgetTwd,
        maxJobCostTwd: config.maxJobCostTwd,
        twdPerUsd: config.twdPerUsd,
        schedule,
        enqueue: options.enqueue
      })
    : createDeveloperApiPrototype({
        providers: config.mode === "official" ? providers : undefined,
        resultStore: options.resultStore || createPrototypeMeasurementResultStore({ config: options.storageConfig || process.env })
      }));
  const rateLimiter = createRequestRateLimiter();
  if (config.platformEnabled && options.recoverOnStartup !== false) {
    schedule(() => api.recoverPendingJobs().catch((error) => {
      console.error(JSON.stringify({ event: "developer_api_recovery_failed", code: error?.code || "internal_error" }));
    }));
  }

  async function handle({ req, res, url, readJson, sendJson }) {
    if (!url.pathname.startsWith("/v1/")) return false;
    if (!config.enabled) return false;
    const sendPrivateJson = (status, body, headers = {}) => sendJson(res, status, body, {
      "Access-Control-Allow-Origin": null,
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...headers
    });
    if (req.method === "OPTIONS") {
      sendPrivateJson(204, null, { Allow: "GET, POST, DELETE, OPTIONS" });
      return true;
    }
    try {
      if (config.platformEnabled) {
        return await handlePlatform({ req, url, readJson, sendPrivateJson });
      }
      return await handlePrototype({ req, url, readJson, sendPrivateJson });
    } catch (error) {
      const normalized = normalizePublicError(error);
      if (normalized.statusCode >= 500) {
        console.error(JSON.stringify({ event: "developer_api_error", code: error?.code || "internal_error", path: url.pathname }));
      }
      sendPrivateJson(normalized.statusCode, errorBody(normalized.code, normalized.message),
        normalized.statusCode === 429 ? { "Retry-After": "60" } : {});
      return true;
    }
  }

  async function handlePlatform({ req, url, readJson, sendPrivateJson }) {
    const limited = rateLimiter.check({ key: requestRateKey(req, url.pathname), limit: authRateLimit(url.pathname), windowMs: 60_000 });
    if (!limited.allowed) throw new DeveloperApiError("rate_limited", "Too many requests", 429);

    if (req.method === "POST" && url.pathname === "/v1/auth/verify") {
      const body = await readJson(req, 8 * 1024);
      sendPrivateJson(200, await api.verifyEmail({ token: body.token }));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/v1/auth/login-links") {
      const body = await readJson(req, 8 * 1024);
      sendPrivateJson(202, await api.requestLoginLink({ email: body.email }));
      return true;
    }
    if (req.method === "POST" && url.pathname === "/v1/auth/login") {
      const body = await readJson(req, 8 * 1024);
      sendPrivateJson(200, await api.consumeLoginLink({ token: body.token }));
      return true;
    }

    if (url.pathname.startsWith("/v1/admin/")) {
      if (!authenticateAdmin(req, config.adminToken)) {
        sendPrivateJson(401, errorBody("auth_required", "Administrator authentication is required"));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/v1/admin/invitations") {
        const body = await readJson(req, 8 * 1024);
        sendPrivateJson(201, await api.createInvitation({ email: body.email }));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/v1/admin/outbox") {
        sendPrivateJson(200, { data: await api.listAuthOutbox({ limit: url.searchParams.get("limit") }) });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/v1/admin/overview") {
        sendPrivateJson(200, await api.getAdminOverview());
        return true;
      }
      if (req.method === "GET" && url.pathname === "/v1/admin/security-events") {
        sendPrivateJson(200, { data: await api.listSecurityEvents({ limit: url.searchParams.get("limit") }) });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/v1/admin/admission") {
        const body = await readJson(req, 8 * 1024);
        if (typeof body.enabled !== "boolean") throw new DeveloperApiError("invalid_request", "enabled must be boolean", 400);
        sendPrivateJson(200, await api.setAdmission({ enabled: body.enabled, reason: body.reason }));
        return true;
      }
      sendPrivateJson(404, errorBody("not_found", "Not found"));
      return true;
    }

    if (url.pathname.startsWith("/v1/console/")) {
      const sessionToken = bearerToken(req);
      const session = await api.authenticateSession(sessionToken);
      if (!session) {
        sendPrivateJson(401, errorBody("auth_required", "A valid management session is required"));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/v1/console/activation") {
        const body = await readJson(req, 8 * 1024);
        sendPrivateJson(200, await api.activateConsole({ sessionToken, plan: body.plan }));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/v1/console/api-keys") {
        sendPrivateJson(200, { data: await api.listApiKeys({ sessionToken }) });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/v1/console/api-keys") {
        const body = await readJson(req, 8 * 1024);
        sendPrivateJson(201, await api.createApiKey({ sessionToken, name: body.name }));
        return true;
      }
      const keyMatch = url.pathname.match(/^\/v1\/console\/api-keys\/([^/]+)$/);
      if (req.method === "DELETE" && keyMatch) {
        await api.revokeApiKey({ sessionToken, keyId: decodeURIComponent(keyMatch[1]) });
        sendPrivateJson(204, null);
        return true;
      }
      if (req.method === "GET" && url.pathname === "/v1/console/usage") {
        sendPrivateJson(200, await api.getUsage({ tenantId: session.tenantId }));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/v1/console/jobs") {
        sendPrivateJson(200, { data: await api.listJobs({ tenantId: session.tenantId, limit: url.searchParams.get("limit") }) });
        return true;
      }
      sendPrivateJson(404, errorBody("not_found", "Not found"));
      return true;
    }

    const auth = await api.authenticateApiKey(bearerToken(req));
    if (!auth) {
      sendPrivateJson(401, errorBody("auth_required", "A valid Bearer API key is required"));
      return true;
    }
    return handleMeasurementRoutes({ req, url, readJson, sendPrivateJson, tenantId: auth.tenantId });
  }

  async function handlePrototype({ req, url, readJson, sendPrivateJson }) {
    const tenantId = authenticatePrototype(req);
    if (!tenantId) {
      sendPrivateJson(401, errorBody("auth_required", "Bearer API key is required"));
      return true;
    }
    return handleMeasurementRoutes({ req, url, readJson, sendPrivateJson, tenantId });
  }

  async function handleMeasurementRoutes({ req, url, readJson, sendPrivateJson, tenantId }) {
    if (req.method === "POST" && url.pathname === "/v1/measurements") {
      const body = await readJson(req, 32 * 1024);
      const created = await api.createMeasurement({
        tenantId, idempotencyKey: req.headers["idempotency-key"], body
      });
      sendPrivateJson(202, { ...created.job, idempotent_replay: !created.created }, {
        Location: `/v1/jobs/${encodeURIComponent(created.job.job_id)}`
      });
      return true;
    }
    const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = await api.getJob({ tenantId, jobId: decodeURIComponent(jobMatch[1]) });
      if (!job) sendPrivateJson(404, errorBody("not_found", "Job not found"));
      else sendPrivateJson(200, job);
      return true;
    }
    const measurementMatch = url.pathname.match(/^\/v1\/measurements\/([^/]+)$/);
    if (measurementMatch && req.method === "GET") {
      const measurementId = decodeURIComponent(measurementMatch[1]);
      const result = await api.getMeasurement({ tenantId, measurementId });
      if (result) sendPrivateJson(200, publicMeasurement(result));
      else {
        const job = await api.getJobByMeasurement({ tenantId, measurementId });
        if (job?.content_deleted_at) sendPrivateJson(410, errorBody("content_deleted", "Measurement content was deleted"));
        else if (job) sendPrivateJson(409, errorBody("result_not_ready", "Measurement result is not ready"));
        else sendPrivateJson(404, errorBody("not_found", "Measurement not found"));
      }
      return true;
    }
    if (measurementMatch && req.method === "DELETE" && config.platformEnabled) {
      await api.deleteMeasurement({ tenantId, measurementId: decodeURIComponent(measurementMatch[1]) });
      sendPrivateJson(204, null);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/v1/usage") {
      sendPrivateJson(200, await api.getUsage({ tenantId }));
      return true;
    }
    sendPrivateJson(404, errorBody("not_found", "Not found"));
    return true;
  }

  function authenticatePrototype(req) {
    const supplied = bearerToken(req);
    if (!config.apiKey || !supplied) return null;
    return safeSecretEqual(supplied, config.apiKey) ? config.tenantId : null;
  }

  return {
    handle,
    workerApi: api,
    state: () => ({
      enabled: config.enabled,
      platform_enabled: config.platformEnabled,
      mode: config.mode,
      provider_readiness: getOfficialProviderReadiness(providerSource),
      ...api.state()
    })
  };
}

function normalizeConfig(source, options = {}) {
  const platformEnabled = String(source.DEVELOPER_API_PLATFORM_ENABLED || "").toLowerCase() === "true";
  const prototypeEnabled = String(source.DEVELOPER_API_PROTOTYPE_ENABLED || "").toLowerCase() === "true";
  const apiKey = String(source.DEVELOPER_API_PROTOTYPE_KEY || "").trim();
  const mode = String(source.DEVELOPER_API_MODE || "fixture").trim().toLowerCase();
  if (!new Set(["fixture", "official"]).has(mode)) throw new Error("DEVELOPER_API_MODE must be fixture or official");
  if (platformEnabled && prototypeEnabled) throw new Error("Platform and prototype Developer API modes cannot both be enabled");
  if (prototypeEnabled && apiKey.length < 14) {
    throw new Error("DEVELOPER_API_PROTOTYPE_KEY must be at least 14 characters when the API is enabled");
  }
  const config = {
    enabled: platformEnabled || prototypeEnabled,
    platformEnabled,
    apiKey,
    mode,
    tenantId: String(source.DEVELOPER_API_PROTOTYPE_TENANT || "prototype_tenant").trim() || "prototype_tenant",
    adminToken: String(source.ADMIN_TOKEN || ""),
    localDatabasePath: String(source.DEVELOPER_API_LOCAL_DB_PATH || "").trim(),
    tokenPepper: String(source.DEVELOPER_API_TOKEN_PEPPER || ""),
    quotaWindowStrategy: String(source.DEVELOPER_API_QUOTA_WINDOW_STRATEGY || ""),
    resultRetentionDays: Number(source.DEVELOPER_API_RESULT_RETENTION_DAYS || 0),
    trialDays: Number(source.DEVELOPER_API_TRIAL_DAYS || 7),
    freeRoundsPerWindow: Number(source.DEVELOPER_API_FREE_ROUNDS_PER_WINDOW || 3),
    dailyBudgetTwd: Number(source.DEVELOPER_API_DAILY_BUDGET_TWD || 0),
    monthlyBudgetTwd: Number(source.DEVELOPER_API_MONTHLY_BUDGET_TWD || 0),
    maxJobCostTwd: Number(source.DEVELOPER_API_MAX_JOB_COST_TWD || 0),
    twdPerUsd: Number(source.DEVELOPER_API_TWD_PER_USD || 0)
  };
  const d1Values = [
    source.GEOCHECK_DEVELOPER_D1_ACCOUNT_ID,
    source.GEOCHECK_DEVELOPER_D1_DATABASE_ID,
    source.GEOCHECK_DEVELOPER_D1_API_TOKEN
  ].map((value) => String(value || "").trim());
  const configuredD1Values = d1Values.filter(Boolean).length;
  const gatewayValues = [
    source.GEOCHECK_DEVELOPER_D1_GATEWAY_URL,
    source.GEOCHECK_DEVELOPER_D1_GATEWAY_TOKEN
  ].map((value) => String(value || "").trim());
  const configuredGatewayValues = gatewayValues.filter(Boolean).length;
  config.developerD1Enabled = configuredD1Values === 3 || configuredGatewayValues === 2 || options.directD1Binding === true;
  if (platformEnabled) {
    if (configuredD1Values > 0 && configuredD1Values < 3) {
      throw new Error("All three GEOCHECK_DEVELOPER_D1_* values are required together");
    }
    if (configuredGatewayValues === 1) {
      throw new Error("Both GEOCHECK_DEVELOPER_D1_GATEWAY_* values are required together");
    }
    if (configuredD1Values === 3 && configuredGatewayValues === 2) {
      throw new Error("Configure Developer D1 gateway or REST credentials, not both");
    }
    if (config.localDatabasePath && config.developerD1Enabled) {
      throw new Error("Configure either DEVELOPER_API_LOCAL_DB_PATH or Developer D1, not both");
    }
    if (!config.localDatabasePath && !config.developerD1Enabled) {
      throw new Error("Platform mode requires local SQLite, the Developer D1 gateway, or legacy D1 REST credentials");
    }
    if (config.adminToken.length < 20) throw new Error("ADMIN_TOKEN must be at least 20 characters for platform mode");
  }
  return config;
}

function normalizePublicError(error) {
  if (error instanceof DeveloperApiError) return error;
  if (error?.code === "request_too_large") return new DeveloperApiError("request_too_large", "Request body is too large", 413);
  if (error instanceof SyntaxError || error instanceof URIError || error?.code === "invalid_json") {
    return new DeveloperApiError("invalid_request", "Request is not valid JSON or contains invalid encoding", 400);
  }
  return new DeveloperApiError("internal_error", "Internal server error", 500);
}

function publicMeasurement(result) {
  const copy = structuredClone(result);
  delete copy.tenant_id;
  delete copy.provider_cost;
  copy.engines = sanitizeEngines(copy.engines);
  if (Array.isArray(copy.partial_results)) copy.partial_results = sanitizeEngines(copy.partial_results);
  return copy;
}

function sanitizeEngines(engines) {
  return (Array.isArray(engines) ? engines : []).map((engine) => {
    const safe = { ...engine };
    delete safe.usage;
    delete safe.cost;
    delete safe.native_evidence;
    return safe;
  });
}

function bearerToken(req) {
  return String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

function authenticateAdmin(req, expected) {
  return safeSecretEqual(String(req.headers["x-admin-token"] || ""), expected);
}

function safeSecretEqual(supplied, expected) {
  if (!supplied || !expected) return false;
  const expectedBuffer = createHash("sha256").update(expected).digest();
  const suppliedBuffer = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function requestRateKey(req, path) {
  const ip = String(req.socket?.remoteAddress || "unknown").slice(0, 80);
  return `${ip}:${path}`;
}

function authRateLimit(path) {
  return path.startsWith("/v1/auth/") ? 10 : 120;
}

function createRequestRateLimiter() {
  const entries = new Map();
  return {
    check({ key, limit, windowMs }) {
      const current = Date.now();
      const existing = entries.get(key);
      const item = !existing || existing.resetAt <= current ? { count: 0, resetAt: current + windowMs } : existing;
      item.count += 1;
      entries.set(key, item);
      if (entries.size > 10_000) {
        for (const [entryKey, value] of entries) if (value.resetAt <= current) entries.delete(entryKey);
      }
      return { allowed: item.count <= limit };
    }
  };
}

function errorBody(code, message) {
  return { error: { code, message } };
}

module.exports = { createDeveloperApiHttpHandler };
