const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return json({ ok: true, admission_enabled: env.DASHBOARD_ADMISSION_ENABLED === "true" });
    if (url.pathname === "/app-api/v1/billing/newebpay/notify" && request.method === "POST") {
      if (env.DASHBOARD_PAYMENT_MODE !== "sandbox" || !env.NEWEBPAY_MERCHANT_ID || !env.NEWEBPAY_HASH_KEY || !env.NEWEBPAY_HASH_IV) {
        return json({ error: { code: "configuration_incomplete", message: "Dashboard payment sandbox is not configured" } }, 503);
      }
      // Callback parsing and entitlement mutation are intentionally admission-gated until
      // the dedicated D1 migrations and merchant sandbox credentials are provisioned.
      return json({ error: { code: "admission_closed", message: "Dashboard payment admission is closed" } }, 503);
    }
    return json({ error: { code: "not_found", message: "Not found" } }, 404);
  },
  async scheduled(_event, env) {
    if (env.DASHBOARD_ADMISSION_ENABLED !== "true") return;
    // The deployed runner will atomically claim due dashboard_tracking_jobs here.
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
}
