import developerApiModule from "../../../api/developer-api-http.js";
import d1StoreModule from "../../../api/storage/developer-platform-d1-store.js";

const { createDeveloperApiHttpHandler } = developerApiModule;
const { createBoundD1DeveloperPlatformStore } = d1StoreModule;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

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
          headers: this.headers || JSON_HEADERS
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

async function handleRequest(request, env) {
  if (!new URL(request.url).pathname.startsWith("/v1/")) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Not found" } }), { status: 404, headers: JSON_HEADERS });
  }
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
}

export default {
  fetch: handleRequest,
  async queue(batch, env) {
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
    const runtime = createRuntime(env);
    ctx.waitUntil(runtime.workerApi.recoverPendingJobs());
  }
};
