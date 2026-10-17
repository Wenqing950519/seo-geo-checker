// Portaly Payment integration-scope client (pcs_test_itg_ / pcs_live_itg_ keys).
// Contract: portaly-ai/portaly-skills skills/portaly-payment-integration/
// references/api-contract.md. Plans and prices are read at runtime; mode is
// derived from the key, never passed per request.

const DEFAULT_HOST = "https://portaly.ai";

function createPortalyClient({ apiKey, host = DEFAULT_HOST, fetch: fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const key = String(apiKey || "").trim();
  const mode = /^pcs_test_/.test(key) ? "test" : /^pcs_live_/.test(key) ? "live" : null;
  if (!mode) throw new Error("A Portaly API key (pcs_test_… or pcs_live_…) is required");
  const base = String(host).replace(/\/+$/, "");

  async function call(pathname, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${pathname}`, {
        method,
        headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      let parsed = null;
      try { parsed = await response.json(); } catch { parsed = null; }
      if (!response.ok) {
        const error = new Error("Portaly request failed");
        error.code = "portaly_error";
        error.status = response.status;
        error.portalyCode = parsed?.code || null;
        throw error;
      }
      return parsed?.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    mode,
    listActivePlans: async () => (await call("/api/creator-subscription/plans?status=active")) || [],
    createCheckoutSession: (input) => call("/api/creator-subscription/checkout-sessions", { method: "POST", body: input })
  };
}

module.exports = { createPortalyClient };
