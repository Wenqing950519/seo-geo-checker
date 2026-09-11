const { createHash, timingSafeEqual } = require("node:crypto");
const { createDashboardService, DashboardError } = require("./application/dashboard-service.js");

function createDashboardApiHttpHandler(options = {}) {
  const config = normalizeConfig(options.config || process.env, options);
  if (!config.enabled) return { handle: async () => false, state: () => ({ enabled: false }) };
  const store = options.store || createLocalStore(options, config);
  const api = options.api || createDashboardService({ store, tokenPepper: config.tokenPepper, googleTokenKey: config.gscTokenEncryptionKey, gscClient: options.gscClient, now: options.now });

  async function handle({ req, res, url, readJson, sendJson }) {
    if (!url.pathname.startsWith("/app-api/v1/")) return false;
    const sendPrivate = (status, body, headers = {}) => sendJson(res, status, body, {
      "Access-Control-Allow-Origin": null,
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...headers
    });
    if (req.method === "OPTIONS") {
      sendPrivate(204, null, { Allow: "GET, POST, OPTIONS" });
      return true;
    }
    try {
      if (req.method === "POST" && url.pathname === "/app-api/v1/admin/invitations") {
        if (!safeSecretEqual(req.headers["x-dashboard-admin-token"], config.adminToken)) {
          sendPrivate(401, errorBody("auth_required", "Dashboard administrator authentication is required"));
          return true;
        }
        const body = await readJson(req, 8 * 1024);
        sendPrivate(201, await api.createInvitation({ email: body.email }));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/app-api/v1/auth/verify") {
        const body = await readJson(req, 8 * 1024);
        sendPrivate(200, await api.verifyInvitation({ token: body.token }));
        return true;
      }
      const sessionToken = bearerToken(req);
      if (!await api.authenticateSession(sessionToken)) {
        sendPrivate(401, errorBody("auth_required", "A valid Dashboard session is required"));
        return true;
      }
      if (req.method === "GET" && url.pathname === "/app-api/v1/projects") {
        sendPrivate(200, { data: await api.listProjects({ sessionToken }) });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/app-api/v1/billing/entitlement") {
        sendPrivate(200, await api.getEntitlement({ sessionToken }));
        return true;
      }
      if (req.method === "POST" && url.pathname === "/app-api/v1/projects") {
        const body = await readJson(req, 16 * 1024);
        sendPrivate(201, await api.createProject({ sessionToken, name: body.name, siteUrl: body.site_url, timezone: body.timezone }));
        return true;
      }
      const questionMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/question-sets$/);
      const manualRunMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/manual-runs$/);
      if (manualRunMatch && req.method === "POST") {
        await readJson(req, 1024);
        sendPrivate(202, await api.requestManualTrackingRun({ sessionToken, projectId: decodeURIComponent(manualRunMatch[1]) }));
        return true;
      }
      if (questionMatch && req.method === "POST") {
        const body = await readJson(req, 64 * 1024);
        sendPrivate(201, await api.createQuestionSet({
          sessionToken, projectId: decodeURIComponent(questionMatch[1]), locale: body.locale, questions: body.questions
        }));
        return true;
      }
      if (questionMatch && req.method === "GET") {
        sendPrivate(200, { data: await api.listTrackedQuestions({ sessionToken, projectId: decodeURIComponent(questionMatch[1]) }) });
        return true;
      }
      const overviewMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/overview$/);
      if (overviewMatch && req.method === "GET") {
        sendPrivate(200, await api.getOverview({ sessionToken, projectId: decodeURIComponent(overviewMatch[1]), weeks: url.searchParams.get("weeks") || 12 }));
        return true;
      }
      const performanceMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/performance$/);
      if (performanceMatch && req.method === "GET") {
        sendPrivate(200, await api.getPerformance({ sessionToken, projectId: decodeURIComponent(performanceMatch[1]), weeks: url.searchParams.get("weeks") || 12 }));
        return true;
      }
      const citationsMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/citations$/);
      if (citationsMatch && req.method === "GET") {
        sendPrivate(200, await api.getCitations({ sessionToken, projectId: decodeURIComponent(citationsMatch[1]), weeks: url.searchParams.get("weeks") || 12 }));
        return true;
      }
      const qualityMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/data-quality$/);
      if (qualityMatch && req.method === "GET") {
        sendPrivate(200, await api.getDataQuality({ sessionToken, projectId: decodeURIComponent(qualityMatch[1]), weeks: url.searchParams.get("weeks") || 12 }));
        return true;
      }
      const annotationMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/annotations$/);
      if (annotationMatch && req.method === "POST") {
        const body = await readJson(req, 8 * 1024);
        sendPrivate(201, await api.createAnnotation({
          sessionToken, projectId: decodeURIComponent(annotationMatch[1]), occurredAt: body.occurred_at, note: body.note
        }));
        return true;
      }
      const evidenceMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/evidence\/([^/]+)$/);
      if (evidenceMatch && req.method === "GET") {
        sendPrivate(200, await api.getEvidence({
          sessionToken, projectId: decodeURIComponent(evidenceMatch[1]), observationId: decodeURIComponent(evidenceMatch[2])
        }));
        return true;
      }
      const gscMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/gsc$/);
      if (gscMatch && req.method === "GET") {
        sendPrivate(200, await api.getGscSummary({ sessionToken, projectId: decodeURIComponent(gscMatch[1]), from: url.searchParams.get("from"), to: url.searchParams.get("to") }));
        return true;
      }
      if (gscMatch && req.method === "POST") {
        const body = await readJson(req, 16 * 1024);
        sendPrivate(201, await api.connectGoogleSearchConsole({ sessionToken, projectId: decodeURIComponent(gscMatch[1]), googleEmail: body.google_email, propertyUri: body.property_uri, refreshToken: body.refresh_token, scopes: body.scopes }));
        return true;
      }
      if (gscMatch && req.method === "DELETE") {
        sendPrivate(200, await api.disconnectGoogleSearchConsole({ sessionToken, projectId: decodeURIComponent(gscMatch[1]) }));
        return true;
      }
      const gscSyncMatch = url.pathname.match(/^\/app-api\/v1\/projects\/([^/]+)\/gsc\/sync$/);
      if (gscSyncMatch && req.method === "POST") {
        const body = await readJson(req, 8 * 1024);
        sendPrivate(200, await api.syncGoogleSearchConsole({ sessionToken, projectId: decodeURIComponent(gscSyncMatch[1]), from: body.from, to: body.to }));
        return true;
      }
      sendPrivate(404, errorBody("not_found", "Not found"));
      return true;
    } catch (error) {
      const normalized = normalizeError(error);
      sendPrivate(normalized.statusCode, errorBody(normalized.code, normalized.message));
      return true;
    }
  }

  return { handle, workerApi: api, state: () => ({ enabled: true }) };
}

function normalizeConfig(source, options) {
  const enabled = String(source.DASHBOARD_API_ENABLED || "").toLowerCase() === "true";
  if (!enabled) return { enabled: false };
  const tokenPepper = String(source.DASHBOARD_TOKEN_PEPPER || options.tokenPepper || "");
  const adminToken = String(source.DASHBOARD_ADMIN_TOKEN || options.adminToken || "");
  const databasePath = String(source.DASHBOARD_DATABASE_PATH || options.databasePath || "").trim();
  const gscTokenEncryptionKey = String(source.GSC_TOKEN_ENCRYPTION_KEY || options.gscTokenEncryptionKey || "").trim();
  // A caller that injects its own store (the Cloudflare Worker passes a D1-backed
  // one) never opens a local SQLite file, so it needs no database path.
  if (!databasePath && !options.store) throw new Error("DASHBOARD_DATABASE_PATH is required when Dashboard API is enabled");
  if (Buffer.byteLength(tokenPepper, "utf8") < 32) throw new Error("DASHBOARD_TOKEN_PEPPER must be at least 32 bytes");
  if (Buffer.byteLength(adminToken, "utf8") < 20) throw new Error("DASHBOARD_ADMIN_TOKEN must be at least 20 bytes");
  return { enabled, tokenPepper, adminToken, databasePath, gscTokenEncryptionKey };
}

function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  return /^Bearer\s+(.+)$/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : "";
}

function safeSecretEqual(supplied, expected) {
  const left = createHash("sha256").update(String(supplied || "")).digest();
  const right = createHash("sha256").update(String(expected || "")).digest();
  return timingSafeEqual(left, right) && Boolean(expected);
}

function errorBody(code, message) {
  return { error: { code, message } };
}

function normalizeError(error) {
  if (error instanceof DashboardError) return error;
  if (error?.code === "request_too_large") return new DashboardError("request_too_large", "Request body is too large", 413);
  if (error instanceof SyntaxError || error?.code === "invalid_json") return new DashboardError("invalid_json", "Request body must be valid JSON", 400);
  return new DashboardError("internal_error", "Dashboard request failed", 500);
}

// The local SQLite store is injected rather than required here: this module is
// bundled into the Cloudflare Worker, which has no `node:sqlite` runtime.
function createLocalStore(options, config) {
  if (typeof options.createSqliteDashboardStore !== "function") {
    throw new Error("Local Dashboard storage requires createSqliteDashboardStore");
  }
  return options.createSqliteDashboardStore({ filename: config.databasePath });
}

module.exports = { createDashboardApiHttpHandler };
