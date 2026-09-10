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

const { createDashboardApiHttpHandler } = dashboardApiModule;
const { createBoundD1DashboardStore } = d1StoreModule;

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

function missingRuntimeSecrets(env) {
  return REQUIRED_RUNTIME_SECRETS.filter((name) => !String(env[name] || "").trim());
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

function createRuntime(env) {
  return createDashboardApiHttpHandler({
    config: {
      ...env,
      DASHBOARD_API_ENABLED: "true",
      // The D1 binding replaces the local SQLite file entirely.
      DASHBOARD_DATABASE_PATH: ""
    },
    store: createBoundD1DashboardStore({ db: env.DASHBOARD_DB })
  });
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
  async scheduled(_event, env) {
    if (!admissionEnabled(env)) return;
    if (missingRuntimeSecrets(env).length) return;
    // The deployed runner will atomically claim due dashboard_tracking_jobs here.
  }
};
