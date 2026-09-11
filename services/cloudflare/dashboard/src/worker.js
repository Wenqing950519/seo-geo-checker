// Product A Dashboard Worker.
//
// It mounts the same `/app-api/v1` handler the Node server uses, backed by the
// isolated `geocheck-dashboard` D1 database. It shares nothing with the
// Developer API: no tenants, API keys, quota or cost ledger.
//
// It fails closed. Without the Dashboard runtime secrets every `/app-api/v1`
// route answers 503 `configuration_incomplete`, and admission stays closed
// until it is explicitly opened.

import dashboardApiModule from "../../../api/dashboard-api-http.js";
import d1StoreModule from "../../../api/storage/dashboard-d1-store.js";
import oauthModule from "../../../api/google-oauth-http.js";
import runnerModule from "../../../api/application/dashboard-tracking-runner.js";
import internalClientModule from "../../../api/application/internal-measurement-client.js";
import gscClientModule from "../../../api/google-search-console-client.js";
import gscPendingStoreModule from "../../../api/storage/dashboard-gsc-pending-store.js";

const { createDashboardApiHttpHandler } = dashboardApiModule;
const { createBoundD1DashboardStore } = d1StoreModule;
const { createGoogleOAuthHttpHandler } = oauthModule;
const { createDashboardTrackingRunner } = runnerModule;
const { createInternalMeasurementClient } = internalClientModule;
const { createGoogleSearchConsoleClient } = gscClientModule;
const { createD1GscPendingStore } = gscPendingStoreModule;

const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

const REQUIRED_RUNTIME_SECRETS = ["DASHBOARD_TOKEN_PEPPER", "DASHBOARD_ADMIN_TOKEN"];
// Google sign-in readiness is tracked separately from the API's: the Dashboard
// API must keep serving invitation-based sessions when OAuth is not configured.
const REQUIRED_OAUTH_SECRETS = [
  ...REQUIRED_RUNTIME_SECRETS,
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "DASHBOARD_GOOGLE_OAUTH_STATE_KEY"
];

function missingRuntimeSecrets(env) {
  return REQUIRED_RUNTIME_SECRETS.filter((name) => !String(env[name] || "").trim());
}

function missingOAuthSecrets(env) {
  return REQUIRED_OAUTH_SECRETS.filter((name) => !String(env[name] || "").trim());
}

// Tracking requires the internal caller secret as well as the switch: without a
// secret the runner could never submit, and a tick that half-runs would strand
// paid work. Reported separately so /healthz explains which piece is missing.
const REQUIRED_TRACKING_SECRETS = ["DASHBOARD_INTERNAL_CALLER_SECRET"];
// Connecting Search Console stores a Google refresh token, so it stays
// unavailable until there is a key to encrypt it with.
const REQUIRED_GSC_SECRETS = [...REQUIRED_OAUTH_SECRETS, "GSC_TOKEN_ENCRYPTION_KEY"];

function missingGscSecrets(env) {
  return REQUIRED_GSC_SECRETS.filter((name) => !String(env[name] || "").trim());
}

function missingTrackingSecrets(env) {
  return [...REQUIRED_RUNTIME_SECRETS, ...REQUIRED_TRACKING_SECRETS]
    .filter((name) => !String(env[name] || "").trim());
}

function admissionEnabled(env) {
  return String(env.DASHBOARD_ADMISSION_ENABLED || "") === "true";
}

function json(body, status = 200, extraHeaders = {}) {
  const headers = { ...SECURITY_HEADERS, ...extraHeaders };
  for (const [key, value] of Object.entries(headers)) if (value == null) delete headers[key];
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

async function healthResponse(env) {
  const missing = missingRuntimeSecrets(env);
  let d1 = false;
  try {
    await env.DASHBOARD_DB.prepare("SELECT 1 AS ok").first();
    d1 = true;
  } catch { /* readiness stays false */ }
  const ok = d1 && missing.length === 0;
  return json({
    ok,
    d1,
    configuration_ready: missing.length === 0,
    google_sign_in_ready: missingOAuthSecrets(env).length === 0,
    tracking_ready: missingTrackingSecrets(env).length === 0,
    search_console_ready: missingGscSecrets(env).length === 0,
    admission_enabled: admissionEnabled(env),
    missing
  }, ok ? 200 : 503);
}

// `dashboard-api-http.js` speaks the Node `req`/`res` shape. Adapt the Fetch
// request into it rather than maintaining a second copy of the routing table.
function createResponseCapture() {
  let resolve;
  const completed = new Promise((done) => { resolve = done; });
  return {
    response: {
      writeHead(status, headers = {}) {
        this.status = status;
        this.headers = headers;
      },
      end(body = "") {
        resolve(new Response(this.status === 204 ? null : body, {
          status: this.status || 200,
          headers: cleanHeaders({ ...SECURITY_HEADERS, ...(this.headers || {}) })
        }));
      }
    },
    completed
  };
}

function cleanHeaders(headers) {
  const cleaned = { ...headers };
  for (const [key, value] of Object.entries(cleaned)) if (value == null) delete cleaned[key];
  return cleaned;
}

function nodeRequest(request) {
  const headers = {};
  for (const [key, value] of request.headers) headers[key.toLowerCase()] = value;
  return {
    method: request.method,
    headers,
    socket: { remoteAddress: request.headers.get("CF-Connecting-IP") || "cloudflare" }
  };
}

async function readJsonRequest(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    const error = new Error("Request body is too large");
    error.code = "request_too_large";
    throw error;
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    const error = new Error("Request body is too large");
    error.code = "request_too_large";
    throw error;
  }
  return JSON.parse(text || "{}");
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, cleanHeaders({ ...SECURITY_HEADERS, ...extraHeaders }));
  res.end(status === 204 ? "" : JSON.stringify(body));
}

// PKCE state must survive across Worker isolates, so it lives in Dashboard D1
// rather than in memory. Consuming a state deletes it, so it is single-use.
function createD1OAuthStateStore(db) {
  return {
    async put(record) {
      await db.batch([
        db.prepare("DELETE FROM dashboard_google_oauth_states WHERE expires_at <= ?").bind(Date.now()),
        db.prepare(`INSERT INTO dashboard_google_oauth_states (
          state_id, audience, verifier, nonce, session_token, project_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            record.id, record.audience, record.verifier, record.nonce,
            record.sessionToken || null, record.projectId || null,
            record.expiresAt, Date.now()
          )
      ]);
    },
    async consume({ id, audience, nonce, now }) {
      return db.prepare(`DELETE FROM dashboard_google_oauth_states
        WHERE state_id = ? AND audience = ? AND nonce = ? AND expires_at > ?
        RETURNING state_id AS id, audience, verifier, nonce,
                  session_token AS sessionToken, project_id AS projectId,
                  expires_at AS expiresAt`)
        .bind(id, audience, nonce, now).first();
    }
  };
}

function createGscClient(env) {
  if (missingGscSecrets(env).length) return null;
  return createGoogleSearchConsoleClient({
    clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET
  });
}

function createOAuthRuntime(env) {
  const gscClient = createGscClient(env);
  return createGoogleOAuthHttpHandler({
    config: { ...env, DASHBOARD_ORIGIN: env.DASHBOARD_ORIGIN || "https://app.lslabs.tw" },
    dashboardApi: createRuntime(env),
    gscClient,
    stateStore: createD1OAuthStateStore(env.DASHBOARD_DB),
    pendingStore: gscClient
      ? createD1GscPendingStore({ db: env.DASHBOARD_DB, encryptionKey: env.GSC_TOKEN_ENCRYPTION_KEY })
      : undefined
  });
}

function createRuntime(env) {
  return createDashboardApiHttpHandler({
    config: {
      ...env,
      DASHBOARD_API_ENABLED: "true",
      // The D1 binding replaces the local SQLite file entirely.
      DASHBOARD_DATABASE_PATH: ""
    },
    store: createBoundD1DashboardStore({ db: env.DASHBOARD_DB }),
    gscClient: createGscClient(env)
  });
}

function createTrackingRunner(env) {
  const runtime = createRuntime(env);
  return createDashboardTrackingRunner({
    store: createBoundD1DashboardStore({ db: env.DASHBOARD_DB }),
    client: createInternalMeasurementClient({
      baseUrl: env.DEVELOPER_API_ORIGIN || "https://platform.lslabs.tw",
      secret: env.DASHBOARD_INTERNAL_CALLER_SECRET
    }),
    // Writing the Run goes through the Dashboard service so the observation
    // normalisation, run-state derivation and question-set checks are the same
    // ones the rest of the product uses.
    onRunRecorded: async (input) => runtime.workerApi.recordTrackingRun(input)
  });
}

async function runTrackingTick(env) {
  try {
    const outcome = await createTrackingRunner(env).tick({ admissionEnabled: admissionEnabled(env) });
    console.log(JSON.stringify({ event: "dashboard_tracking_tick", ...outcome }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "dashboard_tracking_tick_failed", code: error?.code || "tick_failed"
    }));
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);

  // `/healthz` stays for the workers.dev origin; `/app-api/v1/healthz` is the one
  // reachable through the production route, which only covers /app-api/*.
  if (request.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/app-api/v1/healthz")) {
    return healthResponse(env);
  }

  if (url.pathname === "/app-api/v1/billing/newebpay/notify" && request.method === "POST") {
    if (env.DASHBOARD_PAYMENT_MODE !== "sandbox" || !env.NEWEBPAY_MERCHANT_ID || !env.NEWEBPAY_HASH_KEY || !env.NEWEBPAY_HASH_IV) {
      return json({ error: { code: "configuration_incomplete", message: "Dashboard payment sandbox is not configured" } }, 503);
    }
    // Callback parsing and entitlement mutation stay admission-gated until the
    // merchant sandbox credentials are provisioned and verified by a human.
    return json({ error: { code: "admission_closed", message: "Dashboard payment admission is closed" } }, 503);
  }

  if (!url.pathname.startsWith("/app-api/v1/")) {
    return json({ error: { code: "not_found", message: "Not found" } }, 404);
  }

  const isGscPath = url.pathname.startsWith("/app-api/v1/projects/google/gsc/")
    || url.pathname.startsWith("/app-api/v1/auth/google/gsc/");
  if (url.pathname.startsWith("/app-api/v1/auth/google/")
    || url.pathname.startsWith("/app-api/v1/projects/google/gsc/")) {
    // Search Console needs the encryption key on top of sign-in, so each path
    // reports the readiness that actually applies to it.
    const missing = isGscPath ? missingGscSecrets(env) : missingOAuthSecrets(env);
    if (missing.length) {
      return json({
        error: {
          code: "configuration_incomplete",
          message: isGscPath ? "Search Console connection is not ready" : "Google sign-in is not ready"
        }
      }, 503);
    }
    const captured = createResponseCapture();
    const handled = await createOAuthRuntime(env).handle({
      req: nodeRequest(request), res: captured.response, url, sendJson,
      readJson: (_req, maxBytes) => readJsonRequest(request.clone(), maxBytes)
    });
    return handled ? await captured.completed : json({ error: { code: "not_found", message: "Not found" } }, 404);
  }

  const missing = missingRuntimeSecrets(env);
  if (missing.length) {
    return json({ error: { code: "configuration_incomplete", message: "Dashboard API is not ready" } }, 503);
  }

  try {
    const captured = createResponseCapture();
    const handled = await createRuntime(env).handle({
      req: nodeRequest(request),
      res: captured.response,
      url,
      readJson: (_req, maxBytes) => readJsonRequest(request.clone(), maxBytes),
      sendJson
    });
    return handled ? await captured.completed : json({ error: { code: "not_found", message: "Not found" } }, 404);
  } catch (error) {
    console.error(JSON.stringify({ event: "dashboard_worker_error", code: error?.code || "runtime_unavailable" }));
    return json({ error: { code: "service_unavailable", message: "Dashboard API is temporarily unavailable" } }, 503);
  }
}

export default {
  fetch: handleRequest,
  async scheduled(_event, env, ctx) {
    // Fail closed on every path: no secret, no switch, no spending.
    if (missingTrackingSecrets(env).length) return;
    if (!admissionEnabled(env)) return;
    ctx.waitUntil(runTrackingTick(env));
  }
};
