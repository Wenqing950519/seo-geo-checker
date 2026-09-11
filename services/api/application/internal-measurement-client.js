// Client for the Developer API internal measurement channel (D-047).
//
// Product A holds one caller secret and reaches B over its public origin. The
// secret is sent as a bearer token and never logged, and no customer-facing
// Developer API surface is used: this client only speaks /internal/v1.

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

class InternalChannelError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function createInternalMeasurementClient(options = {}) {
  const baseUrl = String(options.baseUrl || "").trim().replace(/\/+$/, "");
  const secret = String(options.secret || "");
  const fetchImpl = options.fetch || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  if (!baseUrl) throw new Error("An internal measurement base URL is required");
  if (secret.length < 32) throw new Error("An internal caller secret is required");

  async function request(path, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${secret}` },
        signal: controller.signal
      });
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new InternalChannelError("response_too_large", "Internal channel response exceeded the size limit");
      }
      let body;
      try { body = JSON.parse(text || "{}"); } catch {
        throw new InternalChannelError("invalid_response", "Internal channel returned invalid JSON");
      }
      if (!response.ok) {
        // Surface B's own code, so a closed channel or an exhausted budget is
        // distinguishable from a transport failure in A's logs.
        throw new InternalChannelError(
          body?.error?.code || "internal_channel_error",
          body?.error?.message || "Internal channel request failed",
          response.status
        );
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function submitMeasurement({ idempotencyKey, prompt, locale, target }) {
    return request("/internal/v1/measurements", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": String(idempotencyKey || "") },
      body: JSON.stringify({
        input: { type: "prompt", text: String(prompt || "") },
        locale: locale || "zh-TW",
        target: target?.name || target?.url ? { name: target.name || null, url: target.url || null } : undefined
      })
    });
  }

  async function getMeasurement(measurementId) {
    try {
      return await request(`/internal/v1/measurements/${encodeURIComponent(measurementId)}`, { method: "GET" });
    } catch (error) {
      // A measurement that is still running is not an error worth retrying on;
      // the caller simply checks again next tick.
      if (error.statusCode === 404) return null;
      throw error;
    }
  }

  async function getSpend() {
    return request("/internal/v1/spend", { method: "GET" });
  }

  return { submitMeasurement, getMeasurement, getSpend };
}

module.exports = { createInternalMeasurementClient, InternalChannelError };
