// Prepaid points for LS-Labs Platform, sold through Portaly Payment (LSL-D-003).
//
// 1 point = NT$1. Points are credited only from a verified Portaly callback
// whose amount, currency, plan and mode match the order this service created;
// browser redirects never grant anything. Plans are read from Portaly at
// runtime, so whether the merchant offers fixed amounts or one dynamic plan is
// decided in the Portaly dashboard, not here.

const { randomUUID } = require("node:crypto");
const { DeveloperApiError } = require("./developer-api-prototype.js");
const { verifyPortalyCallback } = require("../payments/portaly-callback-signature.js");

const POINTS_PER_OBSERVATION = 8;
const CALLBACK_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EVENTS = {
  completed: "creator_subscription.checkout.completed",
  failed: "creator_subscription.checkout.failed"
};

function createDeveloperPointsService({ store, client, config = {}, clock = () => new Date(), randomId = randomUUID } = {}) {
  if (!store || !client) throw new TypeError("Points store and Portaly client are required");
  const settings = normalizeConfig(config);

  function requireCheckout() {
    if (!settings.checkoutEnabled) {
      throw new DeveloperApiError("payment_unavailable", "Point purchases are not open yet", 503);
    }
  }

  async function offeredPlans() {
    const plans = await client.listActivePlans();
    return plans.filter((plan) => plan?.status === "active" && plan.billingPeriod === "one-time"
      && plan.currency === "TWD" && (plan.pricingType === "fixed" || plan.pricingType === "dynamic"));
  }

  function publicPlan(plan) {
    const base = { plan_id: plan.id, name: plan.name, description: plan.description || "", pricing: plan.pricingType };
    if (plan.pricingType === "dynamic") {
      return { ...base, min_amount_twd: settings.minAmountTwd, max_amount_twd: settings.maxAmountTwd };
    }
    const amount = Number(plan.wavePricing?.price ?? plan.amount);
    return { ...base, amount_twd: amount, points: amount };
  }

  async function listTopUpPlans() {
    requireCheckout();
    return {
      mode: client.mode,
      points_per_observation: POINTS_PER_OBSERVATION,
      data: (await offeredPlans()).map(publicPlan)
    };
  }

  async function createTopUpCheckout({ tenantId, email, planId, amount }) {
    requireCheckout();
    if (!tenantId) throw new DeveloperApiError("auth_required", "A valid management session is required", 401);
    const plan = (await offeredPlans()).find((item) => item.id === planId);
    if (!plan) throw new DeveloperApiError("plan_unavailable", "This top-up option is not available", 422);
    const dynamic = plan.pricingType === "dynamic";
    if (dynamic && !(Number.isInteger(amount) && amount >= settings.minAmountTwd && amount <= settings.maxAmountTwd)) {
      throw new DeveloperApiError("invalid_request",
        `amount must be a whole number of TWD from ${settings.minAmountTwd} to ${settings.maxAmountTwd}`, 400);
    }
    const merchantOrderNumber = `pts_${randomId()}`;
    const customerEmail = String(email || "").trim().toLowerCase();
    let session;
    try {
      session = await client.createCheckoutSession({
        planId: plan.id,
        ...(dynamic ? { amount } : {}),
        callbackUrl: settings.callbackUrl,
        ...(settings.successUrl ? { successRedirectUrl: settings.successUrl } : {}),
        ...(settings.cancelUrl ? { cancelRedirectUrl: settings.cancelUrl } : {}),
        merchantOrderNumber,
        // Platform accounts are verified by sign-in link or Google before they exist.
        ...(customerEmail ? { customerEmail, emailVerified: true } : {}),
        metadata: { source: "platform-console" }
      });
    } catch (error) {
      if (error?.portalyCode === "PLAN_INACTIVE" || error?.portalyCode === "PLAN_NOT_FOUND") {
        throw new DeveloperApiError("plan_unavailable", "This top-up option is not available", 422);
      }
      throw new DeveloperApiError("payment_provider_error", "The payment page could not be opened", 502);
    }
    const amountTwd = Number(session?.amount ?? (dynamic ? amount : plan.amount));
    if (!session?.sessionId || !session?.checkoutUrl || !Number.isInteger(amountTwd) || amountTwd <= 0) {
      throw new DeveloperApiError("payment_provider_error", "The payment page could not be opened", 502);
    }
    await store.createOrder({
      sessionId: session.sessionId, tenantId, mode: client.mode, merchantOrderNumber,
      planId: plan.id, planName: plan.name, amountTwd,
      createdAt: clock().toISOString(), expiresAt: session.expiresAt || null
    });
    return {
      session_id: session.sessionId, checkout_url: session.checkoutUrl, expires_at: session.expiresAt || null,
      amount_twd: amountTwd, points: amountTwd, mode: client.mode
    };
  }

  async function handleCallback({ headers = {}, rawBody = "" } = {}) {
    const header = (name) => {
      if (typeof headers.get === "function") return headers.get(name) || "";
      return String(headers[name] ?? headers[name.toLowerCase()] ?? "");
    };
    const event = header("x-portaly-event");
    const timestamp = header("x-portaly-timestamp");
    const signature = header("x-portaly-signature");
    const unauthorized = { status: 401, body: { error: { code: "invalid_signature" } } };
    if (!event || !timestamp || !signature) return unauthorized;
    const sentAt = Date.parse(timestamp);
    if (!Number.isFinite(sentAt) || Math.abs(clock().getTime() - sentAt) > CALLBACK_SKEW_MS) return unauthorized;
    let payload;
    try { payload = JSON.parse(rawBody); } catch { return unauthorized; }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return unauthorized;
    if (!(await verifyPortalyCallback({ secret: settings.callbackSecret, payload, timestamp, signature }))) return unauthorized;
    if (payload.event !== event) return unauthorized;

    const now = clock().toISOString();
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
    const respond = (outcome) => ({ status: 200, body: { received: true, outcome } });
    if (event !== EVENTS.completed && event !== EVENTS.failed) return respond("ignored");
    if (!sessionId) return respond("ignored");

    const eventKey = `${event}:${sessionId}`;
    const base = { eventKey, event, sessionId, mode: payload.mode, now };
    const order = await store.getOrder(sessionId);
    if (!order) {
      await store.recordEvent({ ...base, outcome: "unknown_session" });
      return respond("unknown_session");
    }

    if (event === EVENTS.failed) {
      if (order.status !== "created") {
        await store.recordEvent({ ...base, outcome: "ignored" });
        return respond("ignored");
      }
      await store.markOrder({ ...base, status: "failed", reason: String(payload.failureReason || "failed").slice(0, 120), outcome: "failed" });
      return respond("failed");
    }

    if (order.status === "completed") return respond("duplicate");
    if (order.status !== "created") {
      await store.recordEvent({ ...base, outcome: "rejected" });
      return respond("rejected");
    }
    const matches = payload.mode === client.mode && payload.mode === order.mode
      && payload.currency === "TWD" && payload.planId === order.planId
      && Number(payload.amount) === order.amountTwd && payload.status === "completed";
    if (!matches) {
      await store.markOrder({ ...base, status: "review", reason: "callback_mismatch", outcome: "rejected" });
      console.error(JSON.stringify({ event: "portaly_callback_mismatch", session_id: sessionId }));
      return respond("rejected");
    }
    const credited = await store.creditOrder({
      ...base, amountTwd: order.amountTwd, mode: order.mode, entryId: randomId(),
      paymentReference: typeof payload.paymentReference === "string" ? payload.paymentReference.slice(0, 120) : null,
      completedAt: typeof payload.completedAt === "string" ? payload.completedAt : now
    });
    return respond(credited ? "credited" : "duplicate");
  }

  // Paid points (the ledger) are refundable; gifts are not, and count only
  // until they expire. balance_points is what a measurement can spend now.
  async function getBalance({ tenantId }) {
    const mode = client.mode;
    const now = clock().toISOString();
    const [paid, ledger, grants] = await Promise.all([
      store.getBalance({ tenantId, mode }),
      store.listLedger({ tenantId, mode, limit: 50 }),
      store.listGrants({ tenantId, mode })
    ]);
    const usable = grants.filter((item) => item.expires_at > now && item.remaining_points > 0);
    const promo = usable.reduce((sum, item) => sum + item.remaining_points, 0);
    return {
      mode, balance_points: paid + promo, paid_points: paid, promo_points: promo,
      refundable_points: Math.max(0, paid), points_per_observation: POINTS_PER_OBSERVATION,
      checkout_enabled: settings.checkoutEnabled, ledger,
      promo_grants: usable.map((item) => ({
        promotion_id: item.promotion_id, title: promotionTitle(item.promotion_id),
        points: item.points, remaining_points: item.remaining_points,
        granted_at: item.granted_at, expires_at: item.expires_at
      }))
    };
  }

  function promotionTitle(id) {
    return settings.promotions.find((item) => item.id === id)?.title || "贈送點數";
  }

  function promotionStatus(promotion, claims, now) {
    if (now < promotion.startsAt) return "upcoming";
    if (now >= promotion.endsAt) return "ended";
    if (claims >= promotion.capacity) return "full";
    return "open";
  }

  async function listPromotions({ tenantId }) {
    const mode = client.mode;
    const now = clock().toISOString();
    const [claims, grants] = await Promise.all([
      store.countClaims({ mode }),
      tenantId ? store.listGrants({ tenantId, mode }) : []
    ]);
    return {
      mode,
      data: settings.promotions.map((promotion) => {
        const count = claims[promotion.id] || 0;
        const own = grants.find((item) => item.promotion_id === promotion.id);
        return {
          promotion_id: promotion.id, title: promotion.title, points: promotion.points,
          valid_days: promotion.validDays, starts_at: promotion.startsAt, ends_at: promotion.endsAt,
          capacity: promotion.capacity, remaining_slots: Math.max(0, promotion.capacity - count),
          status: promotionStatus(promotion, count, now),
          claimed: Boolean(own), claimed_at: own?.granted_at || null, expires_at: own?.expires_at || null
        };
      })
    };
  }

  async function claimPromotion({ tenantId, promotionId }) {
    if (!tenantId) throw new DeveloperApiError("auth_required", "A valid management session is required", 401);
    const promotion = settings.promotions.find((item) => item.id === promotionId);
    if (!promotion) throw new DeveloperApiError("promotion_not_found", "This promotion does not exist", 404);
    const granted = clock();
    const now = granted.toISOString();
    if (now < promotion.startsAt) throw new DeveloperApiError("promotion_not_started", "This promotion has not started yet", 409);
    if (now >= promotion.endsAt) throw new DeveloperApiError("promotion_ended", "This promotion has ended", 409);
    const expiresAt = new Date(granted.getTime() + promotion.validDays * DAY_MS).toISOString();
    const result = await store.claimGrant({
      grantId: `ptg_${randomId()}`, tenantId, mode: client.mode, promotionId: promotion.id,
      points: promotion.points, capacity: promotion.capacity, grantedAt: now, expiresAt
    });
    if (!result.claimed && result.reason === "already_claimed") {
      throw new DeveloperApiError("promotion_already_claimed", "This account has already claimed this promotion", 409);
    }
    if (!result.claimed) throw new DeveloperApiError("promotion_full", "This promotion has no places left", 409);
    return { promotion_id: promotion.id, points: promotion.points, granted_at: now, expires_at: expiresAt, mode: client.mode };
  }

  return { claimPromotion, createTopUpCheckout, getBalance, handleCallback, listPromotions, listTopUpPlans };
}

// Campaigns are operator settings, not code: id, title, points, validDays
// (counted from the claim), capacity (total claims per mode) and the open
// window [startsAt, endsAt). Anything malformed refuses to start.
function normalizePromotions(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error("Point promotions must be a list");
  const seen = new Set();
  return list.map((raw) => {
    const item = {
      id: String(raw?.id ?? ""), title: String(raw?.title ?? "").trim(),
      points: raw?.points, validDays: raw?.validDays ?? raw?.valid_days,
      capacity: raw?.capacity, startsAt: raw?.startsAt ?? raw?.starts_at, endsAt: raw?.endsAt ?? raw?.ends_at
    };
    const fail = (reason) => { throw new Error(`Point promotion "${item.id}" ${reason}`); };
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id)) fail("needs an id of lowercase letters, digits and hyphens");
    if (seen.has(item.id)) fail("is a duplicate id");
    seen.add(item.id);
    if (!item.title) fail("needs a title");
    for (const key of ["points", "validDays", "capacity"]) {
      if (!Number.isInteger(item[key]) || item[key] <= 0) fail(`needs a positive whole number for ${key}`);
    }
    for (const key of ["startsAt", "endsAt"]) {
      const time = Date.parse(item[key]);
      if (typeof item[key] !== "string" || !Number.isFinite(time)) fail(`needs an ISO time for ${key}`);
      item[key] = new Date(time).toISOString();
    }
    if (item.endsAt <= item.startsAt) fail("must end after it starts");
    return item;
  });
}

function normalizeConfig(config) {
  const callbackSecret = String(config.callbackSecret || "");
  if (!callbackSecret) throw new Error("A Portaly callback secret is required");
  const callbackUrl = String(config.callbackUrl || "");
  if (!/^https:\/\//.test(callbackUrl)) throw new Error("The Portaly callback URL must use HTTPS");
  return {
    checkoutEnabled: config.checkoutEnabled === true,
    callbackSecret,
    callbackUrl,
    successUrl: config.successUrl || "",
    cancelUrl: config.cancelUrl || "",
    minAmountTwd: Number(config.minAmountTwd || 100),
    maxAmountTwd: Number(config.maxAmountTwd || 10_000),
    promotions: normalizePromotions(config.promotions)
  };
}

module.exports = { POINTS_PER_OBSERVATION, createDeveloperPointsService, normalizePromotions };
