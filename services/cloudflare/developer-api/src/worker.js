import developerApiModule from "../../../api/developer-api-http.js";
import d1StoreModule from "../../../api/storage/developer-platform-d1-store.js";
import oauthModule from "../../../api/google-oauth-http.js";

const { createDeveloperApiHttpHandler } = developerApiModule;
const { createBoundD1DeveloperPlatformStore } = d1StoreModule;
const { createGoogleOAuthHttpHandler } = oauthModule;
let cachedGoogleOAuth;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000"
};

const REQUIRED_PLATFORM_SECRETS = [
  "ADMIN_TOKEN",
  "DEVELOPER_API_TOKEN_PEPPER"
];
const REQUIRED_PROVIDER_SECRETS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "PERPLEXITY_API_KEY",
  "ANTHROPIC_API_KEY"
];

function missingRuntimeSecrets(env) {
  return [...REQUIRED_PLATFORM_SECRETS, ...REQUIRED_PROVIDER_SECRETS]
    .filter((name) => !String(env[name] || "").trim());
}

function missingOAuthSecrets(env) {
  return [...REQUIRED_PLATFORM_SECRETS, "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "DEVELOPER_GOOGLE_OAUTH_STATE_KEY"]
    .filter((name) => !String(env[name] || "").trim());
}

async function healthResponse(env) {
  const missing = missingRuntimeSecrets(env);
  let d1 = false;
  try {
    await env.DEVELOPER_DB.prepare("SELECT 1 AS ok").first();
    d1 = true;
  } catch { /* readiness stays false */ }
  const queue = Boolean(env.DEVELOPER_MEASUREMENTS);
  const ok = d1 && queue && missing.length === 0;
  return new Response(JSON.stringify({ ok, d1, queue, configuration_ready: missing.length === 0, missing }), {
    status: ok ? 200 : 503,
    headers: JSON_HEADERS
  });
}

function workerConfig(env) {
  return {
    ...env,
    DEVELOPER_API_PLATFORM_ENABLED: "true",
    DEVELOPER_API_PROTOTYPE_ENABLED: "false",
    DEVELOPER_API_MODE: "official"
  };
}

function createResponseCapture() {
  let response;
  let resolve;
  const completed = new Promise((done) => { resolve = done; });
  return {
    response: {
      writeHead(status, headers = {}) {
        this.status = status;
        this.headers = headers;
      },
      end(body = "") {
        response = new Response(body == null ? null : body, {
          status: this.status || 200,
          headers: { ...JSON_HEADERS, ...(this.headers || {}) }
        });
        resolve(response);
      }
    },
    completed,
    result: () => response
  };
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
  const headers = { ...JSON_HEADERS, ...extraHeaders };
  for (const [key, value] of Object.entries(headers)) if (value == null) delete headers[key];
  res.writeHead(status, headers);
  res.end(status === 204 ? "" : JSON.stringify(body));
}

function createRuntime(env) {
  const store = createBoundD1DeveloperPlatformStore({ db: env.DEVELOPER_DB });
  let runtime;
  const enqueue = async ({ jobId }) => env.DEVELOPER_MEASUREMENTS.send({ job_id: jobId });
  runtime = createDeveloperApiHttpHandler({
    config: workerConfig(env),
    providerConfig: env,
    platformStore: store,
    directD1Binding: true,
    enqueue,
    recoverOnStartup: false
  });
  return runtime;
}

function createD1OAuthStateStore(db) {
  return {
    async put(record) {
      await db.batch([
        db.prepare("DELETE FROM developer_google_oauth_states WHERE expires_at <= ?").bind(Date.now()),
        db.prepare(`INSERT INTO developer_google_oauth_states (
          state_id, audience, verifier, nonce, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(record.id, record.audience, record.verifier, record.nonce, record.expiresAt, Date.now())
      ]);
    },
    async consume({ id, audience, nonce, now }) {
      return db.prepare(`DELETE FROM developer_google_oauth_states
        WHERE state_id = ? AND audience = ? AND nonce = ? AND expires_at > ?
        RETURNING state_id AS id, audience, verifier, nonce, expires_at AS expiresAt`)
        .bind(id, audience, nonce, now).first();
    }
  };
}

function createOAuthRuntime(env) {
  if (!cachedGoogleOAuth) {
    const runtime = createRuntime(env);
    cachedGoogleOAuth = createGoogleOAuthHttpHandler({
      config: workerConfig(env), developerApi: runtime,
      stateStore: createD1OAuthStateStore(env.DEVELOPER_DB)
    });
  }
  return cachedGoogleOAuth;
}

async function handleRequest(request, env) {
  const pathname = new URL(request.url).pathname;
  if (request.method === "GET" && pathname === "/healthz") return healthResponse(env);
  if (request.method === "GET" && pathname === "/developers-console") {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = "/developers-console.html";
    return env.ASSETS.fetch(new Request(assetUrl, request));
  }
  if (pathname === "/v1/auth/google/start" || pathname === "/v1/auth/google/callback") {
    if (missingOAuthSecrets(env).length) {
      return new Response(JSON.stringify({ error: { code: "configuration_incomplete", message: "Google sign-in is not ready" } }), { status: 503, headers: JSON_HEADERS });
    }
    const captured = createResponseCapture();
    const handled = await createOAuthRuntime(env).handle({
      req: nodeRequest(request), res: captured.response, url: new URL(request.url), sendJson
    });
    return handled ? await captured.completed : new Response(null, { status: 404, headers: JSON_HEADERS });
  }
  if (!pathname.startsWith("/v1/")) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Not found" } }), { status: 404, headers: JSON_HEADERS });
  }
  if (missingRuntimeSecrets(env).length) {
    return new Response(JSON.stringify({ error: { code: "configuration_incomplete", message: "Developer API is not ready" } }), {
      status: 503,
      headers: JSON_HEADERS
    });
  }
  try {
    const runtime = createRuntime(env);
    const captured = createResponseCapture();
    const handled = await runtime.handle({
      req: nodeRequest(request),
      res: captured.response,
      url: new URL(request.url),
      readJson: (_req, maxBytes) => readJsonRequest(request.clone(), maxBytes),
      sendJson
    });
    return handled ? await captured.completed : new Response(null, { status: 404, headers: JSON_HEADERS });
  } catch (error) {
    console.error(JSON.stringify({ event: "developer_worker_error", code: error?.code || "runtime_unavailable" }));
    return new Response(JSON.stringify({ error: { code: "service_unavailable", message: "Developer API is temporarily unavailable" } }), {
      status: 503,
      headers: JSON_HEADERS
    });
  }
}

export default {
  fetch: handleRequest,
  async queue(batch, env) {
    if (missingRuntimeSecrets(env).length) {
      for (const message of batch.messages) message.retry({ delaySeconds: 300 });
      return;
    }
    const runtime = createRuntime(env);
    for (const message of batch.messages) {
      const jobId = String(message.body?.job_id || "");
      if (!jobId) {
        message.ack();
        continue;
      }
      await runtime.workerApi.runJob(jobId);
      message.ack();
    }
  },
  async scheduled(_event, env, ctx) {
    if (missingRuntimeSecrets(env).length) return;
    const runtime = createRuntime(env);
    ctx.waitUntil(runtime.workerApi.recoverPendingJobs());
  }
};
