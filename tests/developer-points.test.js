// Platform prepaid points over Portaly Payment (LSL-D-003), driven against the
// points D1 store emulated on real SQLite built from the Developer API migrations.
// Portaly itself is a stub: no network, no real key, no money moves.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const {
  signPortalyCallback, stableJson, verifyPortalyCallback
} = require("../services/api/payments/portaly-callback-signature.js");
const { createPortalyClient } = require("../services/api/payments/portaly-client.js");
const { createDeveloperPointsD1Store } = require("../services/api/storage/developer-points-d1-store.js");
const { createDeveloperPointsService } = require("../services/api/application/developer-points-service.js");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "services/api/developer-api-migrations");
const VECTORS = require("./fixtures/portaly/callback-signature-v1-vectors.json");
const SECRET = "points-test-callback-secret";
const NOW = new Date("2026-10-17T02:00:00.000Z");
const TENANT = "tenant_points";

function createStore() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  db.prepare("INSERT INTO developer_tenants (tenant_id, status, created_at) VALUES (?, 'active', ?)").run(TENANT, NOW.toISOString());
  db.prepare("INSERT INTO developer_tenants (tenant_id, status, created_at) VALUES (?, 'active', ?)").run("tenant_other", NOW.toISOString());
  const run = (sql, params) => {
    const results = db.prepare(sql).all(...params);
    return { success: true, results, meta: { changes: Number(db.prepare("SELECT changes() AS c").get().c) } };
  };
  const store = createDeveloperPointsD1Store({
    execute: async (payload) => {
      if (Array.isArray(payload.batch)) {
        db.exec("BEGIN");
        try {
          const out = payload.batch.map(({ sql, params }) => run(sql, params));
          db.exec("COMMIT");
          return out;
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
      }
      return [run(payload.sql, payload.params)];
    }
  });
  return { db, store };
}

const PLANS = [
  { id: "plan_300", name: "儲值 300 點", description: "", amount: 300, currency: "TWD", billingPeriod: "one-time", pricingType: "fixed", status: "active", wavePricing: null },
  { id: "plan_dyn", name: "自訂金額儲值", description: "", amount: 100, currency: "TWD", billingPeriod: "one-time", pricingType: "dynamic", status: "active", wavePricing: null },
  { id: "plan_monthly", name: "月訂閱", amount: 299, currency: "TWD", billingPeriod: "monthly", pricingType: "fixed", status: "active" },
  { id: "plan_off", name: "下架", amount: 500, currency: "TWD", billingPeriod: "one-time", pricingType: "fixed", status: "inactive" },
  { id: "plan_usd", name: "USD", amount: 10, currency: "USD", billingPeriod: "one-time", pricingType: "fixed", status: "active" }
];

function createPortalyStub({ key = "pcs_test_itg_fixture" } = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    const { pathname } = new URL(url);
    if (pathname === "/api/creator-subscription/plans") {
      return new Response(JSON.stringify({ data: PLANS }), { status: 200 });
    }
    if (pathname === "/api/creator-subscription/checkout-sessions" && options.method === "POST") {
      const body = JSON.parse(options.body);
      const plan = PLANS.find((item) => item.id === body.planId);
      const sessionId = `sess_${calls.length}`;
      return new Response(JSON.stringify({ data: {
        sessionId, status: "checkout_ready",
        checkoutUrl: `https://portaly.ai/checkout/subscription/${sessionId}`,
        checkoutToken: "token_not_for_clients", expiresAt: "2026-10-17T02:30:00.000Z",
        amount: plan.pricingType === "dynamic" ? body.amount : plan.amount
      } }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };
  return { calls, client: createPortalyClient({ apiKey: key, fetch }) };
}

function createService(overrides = {}) {
  const { store, db } = createStore();
  const portaly = createPortalyStub(overrides.portaly);
  let counter = 0;
  const service = createDeveloperPointsService({
    store,
    client: portaly.client,
    clock: () => overrides.now || NOW,
    randomId: () => `id${++counter}`,
    config: {
      checkoutEnabled: overrides.checkoutEnabled ?? true,
      callbackSecret: SECRET,
      callbackUrl: "https://platform.lslabs.tw/v1/payments/portaly/callback",
      successUrl: "https://platform.lslabs.tw/console?topup=success",
      cancelUrl: "https://platform.lslabs.tw/console?topup=cancel",
      ...overrides.config
    }
  });
  return { service, store, db, portaly };
}

async function signedCallback(payload, { timestamp = NOW.toISOString(), secret = SECRET, event = payload.event } = {}) {
  const rawBody = JSON.stringify(payload);
  const signature = await signPortalyCallback({ secret, payload, timestamp });
  return {
    headers: { "x-portaly-event": event, "x-portaly-timestamp": timestamp, "x-portaly-signature": signature },
    rawBody
  };
}

function completed(sessionId, overrides = {}) {
  return {
    event: "creator_subscription.checkout.completed",
    sessionId, subscriptionId: sessionId, profileId: "profile_ls", planId: "plan_300",
    mode: "test", status: "completed", merchantOrderNumber: "pts_id1",
    amount: 300, currency: "TWD", customerEmail: "dev@example.com",
    completedAt: NOW.toISOString(), metadata: { source: "platform-console" },
    paymentReference: "txn_1", paymentMethod: "tappay", ...overrides
  };
}

async function main() {
  // Signature: Portaly's production-derived vectors, not self-signed fixtures.
  for (const vector of VECTORS.vectors) {
    assert.equal(stableJson(vector.payload), vector.stableJson, `${vector.id} stableJson`);
    assert.equal(await signPortalyCallback(vector), vector.signature, `${vector.id} signature`);
    assert.equal(await verifyPortalyCallback(vector), true, `${vector.id} verifies`);
    assert.equal(await verifyPortalyCallback({ ...vector, secret: "wrong" }), false, `${vector.id} wrong secret`);
    assert.equal(await verifyPortalyCallback({ ...vector, timestamp: "2026-07-01T07:00:01.000Z" }), false, `${vector.id} timestamp bound`);
    assert.equal(await verifyPortalyCallback({ ...vector, payload: { ...vector.payload, tampered: true } }), false, `${vector.id} payload bound`);
  }

  // Client: mode comes from the key; the key never leaves the Authorization header.
  assert.throws(() => createPortalyClient({ apiKey: "sk_live_other", fetch }), /Portaly API key/);
  assert.equal(createPortalyClient({ apiKey: "pcs_live_itg_x", fetch }).mode, "live");
  {
    const { service, portaly } = createService();
    const plans = await service.listTopUpPlans();
    assert.deepEqual(plans.data.map((plan) => plan.plan_id), ["plan_300", "plan_dyn"],
      "only active one-time TWD plans are offered");
    assert.deepEqual(plans.data[0], { plan_id: "plan_300", name: "儲值 300 點", description: "", pricing: "fixed", amount_twd: 300, points: 300 });
    assert.deepEqual(plans.data[1], { plan_id: "plan_dyn", name: "自訂金額儲值", description: "", pricing: "dynamic", min_amount_twd: 100, max_amount_twd: 10000 });
    assert.equal(plans.mode, "test");
    assert.equal(plans.points_per_observation, 8);
    assert.equal(portaly.calls[0].url, "https://portaly.ai/api/creator-subscription/plans?status=active");
    assert.equal(portaly.calls[0].options.headers.authorization, "Bearer pcs_test_itg_fixture");
  }

  // Payment stays closed unless explicitly enabled.
  {
    const { service, portaly } = createService({ checkoutEnabled: false });
    await assert.rejects(service.listTopUpPlans(), (error) => error.code === "payment_unavailable" && error.statusCode === 503);
    await assert.rejects(service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId: "plan_300" }),
      (error) => error.code === "payment_unavailable");
    assert.equal(portaly.calls.length, 0);
    const balance = await service.getBalance({ tenantId: TENANT });
    assert.equal(balance.checkout_enabled, false);
    assert.equal(balance.balance_points, 0);
  }

  // Checkout: fixed plans ignore a client amount; dynamic plans enforce NT$100–10,000 integers.
  {
    const { service, portaly, db } = createService();
    const fixed = await service.createTopUpCheckout({ tenantId: TENANT, email: "Dev@Example.com", planId: "plan_300", amount: 1 });
    assert.equal(fixed.checkout_url, "https://portaly.ai/checkout/subscription/sess_2");
    assert.equal(fixed.amount_twd, 300);
    assert.equal(fixed.points, 300);
    assert.equal("checkout_token" in fixed, false, "the checkout token stays server-side");
    const sent = portaly.calls.at(-1).body;
    assert.equal(sent.planId, "plan_300");
    assert.equal("amount" in sent, false, "no self-computed price for a fixed plan");
    assert.equal(sent.callbackUrl, "https://platform.lslabs.tw/v1/payments/portaly/callback");
    assert.equal(sent.customerEmail, "dev@example.com");
    assert.equal(sent.emailVerified, true);
    assert.equal(sent.merchantOrderNumber, "pts_id1");
    assert.deepEqual(sent.metadata, { source: "platform-console" });
    const order = db.prepare("SELECT * FROM developer_point_orders WHERE session_id = 'sess_2'").get();
    assert.equal(order.tenant_id, TENANT);
    assert.equal(order.status, "created");
    assert.equal(order.amount_twd, 300);
    assert.equal(order.mode, "test");

    const dynamic = await service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId: "plan_dyn", amount: 1500 });
    assert.equal(dynamic.amount_twd, 1500);
    assert.equal(portaly.calls.at(-1).body.amount, 1500);
    for (const amount of [99, 10001, 150.5, "500", undefined]) {
      await assert.rejects(service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId: "plan_dyn", amount }),
        (error) => error.code === "invalid_request" && error.statusCode === 400, `amount ${amount}`);
    }
    for (const planId of ["plan_monthly", "plan_off", "plan_usd", "missing"]) {
      await assert.rejects(service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId }),
        (error) => error.code === "plan_unavailable" && error.statusCode === 422, planId);
    }
  }

  // Callback: only a verified, matching completion credits points, exactly once.
  {
    const { service, db } = createService();
    await service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId: "plan_300" });
    const payload = completed("sess_2");

    const forged = await signedCallback(payload, { secret: "attacker" });
    assert.equal((await service.handleCallback(forged)).status, 401);
    const stale = await signedCallback(payload, { timestamp: new Date(NOW.getTime() - 6 * 60_000).toISOString() });
    assert.equal((await service.handleCallback(stale)).status, 401);
    const future = await signedCallback(payload, { timestamp: new Date(NOW.getTime() + 6 * 60_000).toISOString() });
    assert.equal((await service.handleCallback(future)).status, 401);
    const skewed = await signedCallback(payload, { event: "creator_subscription.checkout.failed" });
    assert.equal((await service.handleCallback(skewed)).status, 401, "header event must match the signed body");
    assert.equal((await service.handleCallback({ headers: {}, rawBody: "{}" })).status, 401);
    assert.equal((await service.getBalance({ tenantId: TENANT })).balance_points, 0);

    const ok = await service.handleCallback(await signedCallback(payload));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.outcome, "credited");
    // Redelivery re-signs headers with a new timestamp; the payload decides identity.
    const replay = await service.handleCallback(await signedCallback(payload, { timestamp: new Date(NOW.getTime() + 60_000).toISOString() }));
    assert.equal(replay.status, 200);
    assert.equal(replay.body.outcome, "duplicate");
    const balance = await service.getBalance({ tenantId: TENANT });
    assert.equal(balance.balance_points, 300);
    assert.equal(balance.mode, "test");
    assert.equal(balance.ledger.length, 1);
    assert.equal(balance.ledger[0].kind, "purchase");
    assert.equal(balance.ledger[0].points, 300);
    assert.equal((await service.getBalance({ tenantId: "tenant_other" })).balance_points, 0, "points stay with the buying tenant");
    assert.equal(db.prepare("SELECT status FROM developer_point_orders WHERE session_id = 'sess_2'").get().status, "completed");
  }

  // Mismatched amount, currency, plan or mode never credits.
  for (const [label, override] of [
    ["amount", { amount: 3000 }], ["currency", { currency: "USD" }],
    ["plan", { planId: "plan_dyn" }], ["mode", { mode: "live" }]
  ]) {
    const { service, db } = createService();
    await service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId: "plan_300" });
    const result = await service.handleCallback(await signedCallback(completed("sess_2", override)));
    assert.equal(result.status, 200, label);
    assert.equal(result.body.outcome, "rejected", label);
    assert.equal((await service.getBalance({ tenantId: TENANT })).balance_points, 0, label);
    assert.equal(db.prepare("SELECT status FROM developer_point_orders WHERE session_id = 'sess_2'").get().status, "review", label);
  }

  // Unknown sessions and failed checkouts are acknowledged without credit.
  {
    const { service, db } = createService();
    const unknown = await service.handleCallback(await signedCallback(completed("sess_missing")));
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.outcome, "unknown_session");
    await service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId: "plan_300" });
    const failedPayload = {
      event: "creator_subscription.checkout.failed", sessionId: "sess_2", profileId: "profile_ls",
      planId: "plan_300", planName: "儲值 300 點", mode: "test", amount: 300, currency: "TWD",
      customerEmail: "dev@example.com", failureReason: "card_declined", failedAt: NOW.toISOString(),
      metadata: { source: "platform-console" }
    };
    const failed = await service.handleCallback(await signedCallback(failedPayload));
    assert.equal(failed.body.outcome, "failed");
    assert.equal(db.prepare("SELECT status, failure_reason FROM developer_point_orders WHERE session_id = 'sess_2'").get().failure_reason, "card_declined");
    const late = await service.handleCallback(await signedCallback(completed("sess_2")));
    assert.equal(late.body.outcome, "rejected", "a failed order is not silently re-opened");
    assert.equal((await service.getBalance({ tenantId: TENANT })).balance_points, 0);
    const other = await service.handleCallback(await signedCallback({ event: "creator_subscription.active", sessionId: "sess_2", mode: "test" }));
    assert.equal(other.status, 200);
    assert.equal(other.body.outcome, "ignored");
  }

  // Test-mode points never count toward a live balance.
  {
    const { service, store } = createService();
    await service.createTopUpCheckout({ tenantId: TENANT, email: "dev@example.com", planId: "plan_300" });
    await service.handleCallback(await signedCallback(completed("sess_2")));
    assert.equal((await service.getBalance({ tenantId: TENANT })).balance_points, 300);
    const live = createPortalyStub({ key: "pcs_live_itg_fixture" });
    const liveStoreBalance = await createDeveloperPointsService({
      store, client: live.client, clock: () => NOW,
      config: { checkoutEnabled: true, callbackSecret: SECRET, callbackUrl: "https://platform.lslabs.tw/v1/payments/portaly/callback" }
    }).getBalance({ tenantId: TENANT });
    assert.equal(liveStoreBalance.mode, "live");
    assert.equal(liveStoreBalance.balance_points, 0);
  }

  // Misconfiguration fails closed.
  assert.throws(() => createService({ config: { callbackUrl: "http://platform.lslabs.tw/cb" } }), /HTTPS/);
  assert.throws(() => createService({ config: { callbackSecret: "" } }), /callback secret/);

  console.log("developer points tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
