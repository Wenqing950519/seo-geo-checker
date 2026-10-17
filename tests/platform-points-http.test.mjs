// Route wiring for Platform prepaid points: the public Portaly callback on the
// Worker, and the session-only Console endpoints on the shared HTTP handler.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import worker from "../services/cloudflare/developer-api/src/worker.js";

const require = createRequire(import.meta.url);
const { createDeveloperApiHttpHandler } = require("../services/api/developer-api-http.js");

const CALLBACK = "https://platform.lslabs.tw/v1/payments/portaly/callback";
const untouchableDb = {
  prepare() { throw new Error("database must not be touched"); },
  batch() { throw new Error("database must not be touched"); }
};

// Callback: closed without Portaly secrets, method- and host-restricted, and an
// unsigned body is rejected before any database access.
{
  const closed = await worker.fetch(new Request(CALLBACK, { method: "POST", body: "{}" }), { DEVELOPER_DB: untouchableDb });
  assert.equal(closed.status, 503);
  assert.equal((await closed.json()).error.code, "payment_unavailable");

  const env = {
    DEVELOPER_DB: untouchableDb,
    PORTALY_API_KEY: "pcs_test_itg_fixture",
    PORTALY_CALLBACK_SECRET: "fixture-callback-secret"
  };
  const get = await worker.fetch(new Request(CALLBACK), env);
  assert.equal(get.status, 405);
  const otherHost = await worker.fetch(new Request("https://api.geocheck.lisheng.cv/v1/payments/portaly/callback", { method: "POST", body: "{}" }), env);
  assert.equal(otherHost.status, 404);
  const unsigned = await worker.fetch(new Request(CALLBACK, {
    method: "POST", body: JSON.stringify({ event: "creator_subscription.checkout.completed", sessionId: "s" }),
    headers: { "x-portaly-event": "creator_subscription.checkout.completed", "x-portaly-timestamp": new Date().toISOString(), "x-portaly-signature": "00" }
  }), env);
  assert.equal(unsigned.status, 401);
  const tooLarge = await worker.fetch(new Request(CALLBACK, { method: "POST", body: "x".repeat(70 * 1024) }), env);
  assert.equal(tooLarge.status, 413);
}

// Console endpoints: management session required; payment closed answers 503.
{
  const calls = [];
  const points = {
    async getBalance({ tenantId }) { calls.push(["balance", tenantId]); return { mode: "test", balance_points: 0, ledger: [] }; },
    async listTopUpPlans() { calls.push(["plans"]); return { mode: "test", data: [] }; },
    async createTopUpCheckout(input) { calls.push(["checkout", input]); return { checkout_url: "https://portaly.ai/checkout/subscription/s1" }; },
    async listPromotions(input) { calls.push(["promotions", input]); return { mode: "test", data: [] }; },
    async claimPromotion(input) { calls.push(["claim", input]); return { promotion_id: input.promotionId, points: 1 }; }
  };
  const api = { authenticateSession: async (token) => (token === "gcs_valid" ? { tenantId: "tenant_a" } : null) };
  const config = {
    DEVELOPER_API_PLATFORM_ENABLED: "true", DEVELOPER_API_MODE: "fixture",
    ADMIN_TOKEN: "admin-token-with-enough-length", DEVELOPER_API_QUOTA_WINDOW_STRATEGY: "rolling_24h"
  };
  const handler = (pointsService) => createDeveloperApiHttpHandler({
    config, api, platformStore: {}, directD1Binding: true, recoverOnStartup: false, points: pointsService
  });
  async function call(h, method, pathname, { token, body } = {}) {
    let captured;
    const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, socket: { remoteAddress: "127.0.0.1" } };
    const res = {};
    await h.handle({
      req, res, url: new URL(`https://platform.lslabs.tw${pathname}`),
      readJson: async () => body || {},
      sendJson: (_res, status, payload) => { captured = { status, body: payload }; }
    });
    return captured;
  }
  const h = handler(points);
  assert.equal((await call(h, "GET", "/v1/console/points")).status, 401);
  assert.equal((await call(h, "POST", "/v1/console/points/checkout", { body: { plan_id: "p" } })).status, 401);
  assert.equal(calls.length, 0);

  const balance = await call(h, "GET", "/v1/console/points", { token: "gcs_valid" });
  assert.equal(balance.status, 200);
  assert.deepEqual(calls.at(-1), ["balance", "tenant_a"]);
  assert.equal((await call(h, "GET", "/v1/console/points/plans", { token: "gcs_valid" })).status, 200);
  const checkout = await call(h, "POST", "/v1/console/points/checkout", { token: "gcs_valid", body: { plan_id: "plan_300", amount: 500, tenant_id: "tenant_b" } });
  assert.equal(checkout.status, 201);
  assert.deepEqual(calls.at(-1), ["checkout", { tenantId: "tenant_a", planId: "plan_300", amount: 500 }],
    "tenant comes from the session, never the request body");

  // Promotions: listing and claiming need a management session, and the claim
  // is for the session's tenant whatever the body says.
  const before = calls.length;
  assert.equal((await call(h, "GET", "/v1/console/points/promotions")).status, 401);
  assert.equal((await call(h, "POST", "/v1/console/points/promotions/launch-test/claim")).status, 401);
  assert.equal(calls.length, before, "no promotion call without a session");
  assert.equal((await call(h, "GET", "/v1/console/points/promotions", { token: "gcs_valid" })).status, 200);
  assert.deepEqual(calls.at(-1), ["promotions", { tenantId: "tenant_a" }]);
  const claim = await call(h, "POST", "/v1/console/points/promotions/launch-test/claim", { token: "gcs_valid", body: { tenant_id: "tenant_b" } });
  assert.equal(claim.status, 201);
  assert.deepEqual(calls.at(-1), ["claim", { tenantId: "tenant_a", promotionId: "launch-test" }]);
  assert.equal((await call(h, "GET", "/v1/console/points/promotions/launch-test/claim", { token: "gcs_valid" })).status, 404,
    "claiming is POST only");

  const closed = handler(null);
  const unavailable = await call(closed, "GET", "/v1/console/points/plans", { token: "gcs_valid" });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error.code, "payment_unavailable");
}

// Console UI: hidden unless the API answers, Portaly text never becomes HTML,
// and the browser only ever leaves for Portaly's hosted checkout.
{
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../apps/web/public/developers-console.html", import.meta.url), "utf8");
  assert.match(page, /<section id="points-panel"[^>]*\shidden[\s>]/);
  const script = page.slice(page.indexOf("async function loadPointsPanel"), page.indexOf("function announceTopUpReturn"));
  assert.ok(script.length > 500);
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /checkout_url\.startsWith\('https:\/\/portaly\.ai\/'\)/);
  assert.match(page, /href="\/terms#points"/);
  // Gifts and their expiry show inside the same panel.
  assert.match(page, /id="points-promo"/);
  assert.match(script, /promo_grants/);
  assert.match(script, /expires_at/);
  assert.match(page, /href="\/promotions"/);
}

// Promotions page: noindex, session-only API calls, text never becomes HTML,
// and the worker serves it on the Platform origin.
{
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../apps/web/public/platform/promotions.html", import.meta.url), "utf8");
  assert.match(page, /<meta name="robots" content="noindex/);
  assert.match(page, /\/v1\/console\/points\/promotions/);
  assert.match(page, /\/claim'/);
  assert.match(page, /gc_developer_session/);
  assert.doesNotMatch(page, /innerHTML/);
  assert.match(page, /href="\/terms#points"/);
  assert.match(page, /不得退款/);
  const sitemap = readFileSync(new URL("../apps/web/public/platform-sitemap.xml", import.meta.url), "utf8");
  assert.doesNotMatch(sitemap, /promotions/, "a campaign page is not published to the sitemap by this change");

  let fetched;
  const env = { ASSETS: { fetch: async (request) => { fetched = new URL(request.url).pathname; return new Response("ok"); } } };
  await worker.fetch(new Request("https://platform.lslabs.tw/promotions"), env);
  assert.equal(fetched, "/platform/promotions");
}

// Points billing is its own explicit switch, separate from opening checkout,
// and reaches the platform service through the shared HTTP handler.
{
  const { readFileSync } = await import("node:fs");
  const workerSource = readFileSync(new URL("../services/cloudflare/developer-api/src/worker.js", import.meta.url), "utf8");
  assert.match(workerSource, /env\.DEVELOPER_API_BILLING/);
  assert.match(workerSource, /pointsBilling: pointsBillingConfig\(env\)/);
  assert.match(workerSource, /throw new Error\("Points billing requires the Portaly API key and callback secret"\)/);
  const httpSource = readFileSync(new URL("../services/api/developer-api-http.js", import.meta.url), "utf8");
  assert.match(httpSource, /pointsBilling: options\.pointsBilling \|\| null/);
  const wrangler = JSON.parse(readFileSync(new URL("../services/cloudflare/developer-api/wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(wrangler.vars.DEVELOPER_API_BILLING, undefined, "points billing is never switched on by a deploy");
}

console.log("platform points HTTP tests passed");
