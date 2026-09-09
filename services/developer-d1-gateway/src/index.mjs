const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_STATEMENTS = 64;
const MAX_PARAMS_PER_STATEMENT = 100;
const MAX_SQL_BYTES = 64 * 1024;

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer"
};

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json(200, { ok: true, service: "geocheck-developer-d1-gateway" });
      }
      if (url.pathname !== "/v1/query") return json(404, errorBody("not_found", "Not found"));
      if (request.method !== "POST") return json(405, errorBody("method_not_allowed", "POST required"), { Allow: "POST" });
      if (!env.DB || !env.GATEWAY_TOKEN || String(env.GATEWAY_TOKEN).length < 32) {
        console.error(JSON.stringify({ event: "gateway_misconfigured", request_id: requestId }));
        return json(503, errorBody("service_unavailable", "Gateway is not configured"));
      }
      const supplied = bearerToken(request.headers.get("authorization"));
      if (!supplied || !(await safeSecretEqual(supplied, String(env.GATEWAY_TOKEN)))) {
        return json(401, errorBody("auth_required", "Valid gateway authentication is required"));
      }

      const payload = await readJsonBody(request, MAX_REQUEST_BYTES);
      const statements = normalizePayload(payload);
      const prepared = statements.map(({ sql, params }) => env.DB.prepare(sql).bind(...params));
      const result = prepared.length === 1 && !payload.batch
        ? [await prepared[0].all()]
        : await env.DB.batch(prepared);
      return boundedJson(200, { success: true, result }, MAX_RESPONSE_BYTES);
    } catch (error) {
      const known = normalizeError(error);
      if (known.status >= 500) {
        console.error(JSON.stringify({ event: "gateway_query_failed", request_id: requestId, code: known.code }));
      }
      return json(known.status, errorBody(known.code, known.message));
    }
  }
};

export function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw gatewayError(400, "invalid_request", "JSON object required");
  }
  const raw = Array.isArray(payload.batch) ? payload.batch : [payload];
  if (raw.length < 1 || raw.length > MAX_BATCH_STATEMENTS) {
    throw gatewayError(400, "invalid_request", `Between 1 and ${MAX_BATCH_STATEMENTS} statements are required`);
  }
  return raw.map((statement) => normalizeStatement(statement));
}

function normalizeStatement(statement) {
  if (!statement || typeof statement !== "object" || Array.isArray(statement)) {
    throw gatewayError(400, "invalid_request", "Each statement must be an object");
  }
  const sql = String(statement.sql || "").trim().replace(/;\s*$/, "");
  if (!sql || utf8Bytes(sql) > MAX_SQL_BYTES) {
    throw gatewayError(400, "invalid_sql", "SQL is missing or too large");
  }
  if (/\b(PRAGMA|ATTACH|DETACH|CREATE|DROP|ALTER|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql)) {
    throw gatewayError(400, "invalid_sql", "Schema and transaction statements are not allowed through the gateway");
  }
  if (sql.includes(";") || !/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) {
    throw gatewayError(400, "invalid_sql", "Only one parameterized data statement is allowed");
  }
  const params = statement.params == null ? [] : statement.params;
  if (!Array.isArray(params) || params.length > MAX_PARAMS_PER_STATEMENT) {
    throw gatewayError(400, "invalid_request", `params must contain at most ${MAX_PARAMS_PER_STATEMENT} values`);
  }
  for (const value of params) {
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      throw gatewayError(400, "invalid_request", "params may only contain scalar JSON values");
    }
  }
  return { sql, params };
}

async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw gatewayError(413, "request_too_large", "Request body is too large");
  if (!request.body) throw gatewayError(400, "invalid_request", "JSON body required");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw gatewayError(413, "request_too_large", "Request body is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw gatewayError(400, "invalid_json", "Request body is not valid JSON");
  }
}

async function safeSecretEqual(left, right) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right))
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < av.length; index += 1) difference |= av[index] ^ bv[index];
  return difference === 0;
}

function bearerToken(value) {
  return String(value || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

function boundedJson(status, body, maxBytes) {
  const text = JSON.stringify(body);
  if (utf8Bytes(text) > maxBytes) throw gatewayError(502, "response_too_large", "Database response is too large");
  return new Response(text, { status, headers: BASE_HEADERS });
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

function errorBody(code, message) {
  return { success: false, error: { code, message } };
}

function gatewayError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function normalizeError(error) {
  if (Number.isInteger(error?.status) && error?.code) return error;
  return gatewayError(502, "database_error", "Database request failed");
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}
