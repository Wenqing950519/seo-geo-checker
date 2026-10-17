// Promotional (gifted) points for LS-Labs Platform, following the points rules
// in apps/web/public/platform/terms.html#points: a gift carries an expiry when
// it is granted, expires unused, is never refundable, and is spent before paid
// points, soonest-expiring first.
//
// Both D1 stores run on one real SQLite database built from the Developer API
// migrations, so the claim uniqueness and the admission split are the SQL that
// production runs. Portaly is a stub; nothing leaves the process.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { createD1DeveloperPlatformStore } = require("../services/api/storage/developer-platform-d1-store.js");
const { createDeveloperPointsD1Store } = require("../services/api/storage/developer-points-d1-store.js");
const { createDeveloperPlatformService } = require("../services/api/application/developer-platform-service.js");
const { createDeveloperPointsService } = require("../services/api/application/developer-points-service.js");
const { createFixtureProviders } = require("../services/api/application/developer-api-prototype.js");

const MIGRATIONS = path.resolve(__dirname, "../services/api/developer-api-migrations");
const NOW = new Date("2026-10-20T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const PEPPER = "promotion-test-pepper-with-at-least-thirty-two-bytes";
const TENANT = "tnt_promo_customer";
const OTHER = "tnt_promo_other";
const REQUEST = Object.freeze({ input: { type: "prompt", text: "台北有哪些適合工作的咖啡店？" } });

// Values here are test fixtures only; the real campaign size is the operator's call.
const CAMPAIGN = Object.freeze({
  id: "launch-test", title: "測試活動", points: 20, validDays: 30, capacity: 2,
  startsAt: "2026-10-18T00:00:00.000Z", endsAt: "2026-10-31T16:00:00.000Z"
});

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const tenant of [TENANT, OTHER, "tnt_promo_third"]) {
    db.prepare("INSERT INTO developer_tenants (tenant_id, status, created_at) VALUES (?, 'active', ?)").run(tenant, NOW.toISOString());
  }
  const run = (sql, params) => {
    const results = db.prepare(sql).all(...params);
    return { success: true, results, meta: { changes: Number(db.prepare("SELECT changes() AS c").get().c) } };
  };
  const execute = async (payload) => {
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
  };
  return {
    db,
    platformStore: createD1DeveloperPlatformStore({ execute }),
    pointsStore: createDeveloperPointsD1Store({ execute })
  };
}

function createPoints(store, { clock = () => NOW, promotions = [CAMPAIGN], mode = "test" } = {}) {
  let sequence = 0;
  return createDeveloperPointsService({
    store,
    client: { mode, async listActivePlans() { return []; } },
    clock,
    randomId: () => `id_${++sequence}`,
    config: { callbackSecret: "promo-callback-secret", callbackUrl: "https://platform.lslabs.tw/v1/payments/portaly/callback", promotions }
  });
}

function createPlatform(store, { now = NOW, providers = createFixtureProviders() } = {}) {
  return createDeveloperPlatformService({
    store, tokenPepper: PEPPER, now: () => now, providers,
    quotaWindowStrategy: "rolling_24h", resultRetentionDays: 30,
    trialDays: 7, freeRoundsPerWindow: 3,
    dailyBudgetTwd: 60, monthlyBudgetTwd: 600, maxJobCostTwd: 12, twdPerUsd: 31.535,
    enqueue: async () => {},
    pointsBilling: { mode: "test", costPoints: 8 }
  });
}

function buyPoints(db, points, tenant = TENANT) {
  db.prepare(`INSERT INTO developer_point_ledger (entry_id, tenant_id, mode, kind, points, reference, created_at)
    VALUES (?, ?, 'test', 'purchase', ?, ?, ?)`).run(`pt_${tenant}_${points}`, tenant, points, `sess_${tenant}_${points}`, NOW.toISOString());
}

function grant(db, { id, points, expiresAt, tenant = TENANT }) {
  db.prepare(`INSERT INTO developer_point_grants
    (grant_id, tenant_id, mode, promotion_id, points, remaining_points, granted_at, expires_at)
    VALUES (?, ?, 'test', ?, ?, ?, ?, ?)`).run(id, tenant, id, points, points, NOW.toISOString(), expiresAt);
}

function paid(db, tenant = TENANT) {
  return Number(db.prepare("SELECT COALESCE(SUM(points), 0) AS b FROM developer_point_ledger WHERE tenant_id = ? AND mode = 'test'")
    .get(tenant).b);
}

function remaining(db, grantId) {
  return Number(db.prepare("SELECT remaining_points AS r FROM developer_point_grants WHERE grant_id = ?").get(grantId).r);
}

async function rejectsWith(promise, code, statusCode, message) {
  await assert.rejects(promise, (error) => error.code === code && error.statusCode === statusCode, message);
}

async function main() {
  // ---- a tenant claims once; the grant carries its expiry and is not refundable ----
  {
    const { db, pointsStore } = createDatabase();
    const points = createPoints(pointsStore);
    const listed = await points.listPromotions({ tenantId: TENANT });
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0].status, "open");
    assert.equal(listed.data[0].claimed, false);
    assert.equal(listed.data[0].points, 20);

    const claim = await points.claimPromotion({ tenantId: TENANT, promotionId: "launch-test" });
    assert.equal(claim.points, 20);
    assert.equal(claim.expires_at, new Date(NOW.getTime() + 30 * DAY).toISOString(), "expiry is fixed at the moment of the grant");
    assert.equal(claim.mode, "test");

    const balance = await points.getBalance({ tenantId: TENANT });
    assert.equal(balance.balance_points, 20);
    assert.equal(balance.paid_points, 0);
    assert.equal(balance.promo_points, 20);
    assert.equal(balance.refundable_points, 0, "gifted points are never refundable");
    assert.deepEqual(balance.promo_grants.map((item) => [item.promotion_id, item.remaining_points, item.expires_at]),
      [["launch-test", 20, claim.expires_at]]);
    assert.equal(paid(db), 0, "a gift never enters the paid ledger");

    await rejectsWith(points.claimPromotion({ tenantId: TENANT, promotionId: "launch-test" }),
      "promotion_already_claimed", 409, "a second claim by the same tenant is refused");
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM developer_point_grants").get().c), 1);
    assert.equal((await points.listPromotions({ tenantId: TENANT })).data[0].claimed, true);
  }

  // ---- the database, not the caller, enforces one claim per tenant and campaign ----
  {
    const { db } = createDatabase();
    grant(db, { id: "g1", points: 5, expiresAt: "2026-11-01T00:00:00.000Z" });
    db.prepare("UPDATE developer_point_grants SET promotion_id = 'launch-test' WHERE grant_id = 'g1'").run();
    assert.throws(() => db.prepare(`INSERT INTO developer_point_grants
      (grant_id, tenant_id, mode, promotion_id, points, remaining_points, granted_at, expires_at)
      VALUES ('g2', ?, 'test', 'launch-test', 5, 5, ?, ?)`).run(TENANT, NOW.toISOString(), "2026-11-01T00:00:00.000Z"),
    /UNIQUE/);
  }

  // ---- concurrent claims cannot exceed one per tenant or the campaign's capacity ----
  {
    const { pointsStore } = createDatabase();
    const points = createPoints(pointsStore);
    const results = await Promise.allSettled([
      points.claimPromotion({ tenantId: TENANT, promotionId: "launch-test" }),
      points.claimPromotion({ tenantId: TENANT, promotionId: "launch-test" })
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    await points.claimPromotion({ tenantId: OTHER, promotionId: "launch-test" });
    await rejectsWith(points.claimPromotion({ tenantId: "tnt_promo_third", promotionId: "launch-test" }),
      "promotion_full", 409, "capacity 2 is reached");
    const listed = await points.listPromotions({ tenantId: "tnt_promo_third" });
    assert.equal(listed.data[0].status, "full");
    assert.equal(listed.data[0].remaining_slots, 0);
  }

  // ---- closed campaigns answer with explicit errors ----
  {
    const { pointsStore } = createDatabase();
    const early = createPoints(pointsStore, { clock: () => new Date("2026-10-17T23:59:59.000Z") });
    await rejectsWith(early.claimPromotion({ tenantId: TENANT, promotionId: "launch-test" }), "promotion_not_started", 409);
    assert.equal((await early.listPromotions({ tenantId: TENANT })).data[0].status, "upcoming");
    const late = createPoints(pointsStore, { clock: () => new Date(CAMPAIGN.endsAt) });
    await rejectsWith(late.claimPromotion({ tenantId: TENANT, promotionId: "launch-test" }), "promotion_ended", 409);
    assert.equal((await late.listPromotions({ tenantId: TENANT })).data[0].status, "ended");
    await rejectsWith(late.claimPromotion({ tenantId: TENANT, promotionId: "no-such" }), "promotion_not_found", 404);
    await rejectsWith(late.claimPromotion({ tenantId: "", promotionId: "launch-test" }), "auth_required", 401);
  }

  // ---- campaign settings are validated; a bad setting refuses to start ----
  {
    const { pointsStore } = createDatabase();
    for (const bad of [
      { ...CAMPAIGN, points: 0 }, { ...CAMPAIGN, points: 2.5 }, { ...CAMPAIGN, validDays: 0 },
      { ...CAMPAIGN, capacity: -1 }, { ...CAMPAIGN, startsAt: "soon" }, { ...CAMPAIGN, endsAt: CAMPAIGN.startsAt },
      { ...CAMPAIGN, id: "Bad Id" }
    ]) {
      assert.throws(() => createPoints(pointsStore, { promotions: [bad] }), /promotion/i, JSON.stringify(bad));
    }
    assert.throws(() => createPoints(pointsStore, { promotions: [CAMPAIGN, CAMPAIGN] }), /duplicate/i);
    assert.deepEqual((await createPoints(pointsStore, { promotions: [] }).listPromotions({ tenantId: TENANT })).data, []);
  }

  // ---- admission spends gifted points first, soonest expiry first, then paid points ----
  {
    const { db, platformStore, pointsStore } = createDatabase();
    const platform = createPlatform(platformStore);
    buyPoints(db, 20);
    grant(db, { id: "late", points: 10, expiresAt: "2026-12-31T00:00:00.000Z" });
    grant(db, { id: "soon", points: 5, expiresAt: "2026-11-01T00:00:00.000Z" });

    const first = await platform.createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0001", body: REQUEST });
    assert.equal(first.created, true);
    assert.equal(remaining(db, "soon"), 0, "the soonest-expiring gift is used first");
    assert.equal(remaining(db, "late"), 7, "the rest of the 8 points comes from the next gift");
    assert.equal(paid(db), 20, "paid points are untouched while gifts cover the charge");

    await platform.createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0002", body: REQUEST });
    assert.equal(remaining(db, "late"), 0);
    assert.equal(paid(db), 19, "only the uncovered 1 point is charged to paid points");

    const replay = await platform.createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0002", body: REQUEST });
    assert.equal(replay.created, false);
    assert.equal(paid(db), 19, "a replayed Idempotency-Key spends nothing");

    const balance = await createPoints(pointsStore).getBalance({ tenantId: TENANT });
    assert.equal(balance.balance_points, 19);
    assert.equal(balance.promo_points, 0);
    assert.equal(balance.refundable_points, 19);
  }

  // ---- a failed observation gives back exactly what it took from each source, once ----
  {
    const { db, platformStore } = createDatabase();
    const platform = createPlatform(platformStore, { providers: createFixtureProviders({ failProfileId: "anthropic-web" }) });
    buyPoints(db, 10);
    grant(db, { id: "gift", points: 3, expiresAt: "2026-11-01T00:00:00.000Z" });
    const { job } = await platform.createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0001", body: REQUEST });
    assert.equal(remaining(db, "gift"), 0);
    assert.equal(paid(db), 5);
    await platform.runJob(job.job_id);
    assert.equal(db.prepare("SELECT status FROM developer_jobs WHERE job_id = ?").get(job.job_id).status, "failed");
    assert.equal(remaining(db, "gift"), 3, "the gift portion returns to its grant");
    assert.equal(paid(db), 10, "the paid portion returns to the paid ledger");
    assert.equal(await platformStore.failJob({ jobId: job.job_id, errorCode: "provider_timeout", now: NOW.toISOString() }), false);
    assert.equal(remaining(db, "gift"), 3, "a repeated settlement does not return it twice");
    assert.equal(paid(db), 10);
  }

  // ---- expired gifts cannot pay, and drop out of the balance ----
  {
    const { db, platformStore, pointsStore } = createDatabase();
    grant(db, { id: "old", points: 50, expiresAt: "2026-10-20T02:59:59.000Z" });
    const platform = createPlatform(platformStore);
    await rejectsWith(platform.createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0001", body: REQUEST }),
      "points_insufficient", 402, "an expired gift does not admit a measurement");
    assert.equal(remaining(db, "old"), 50);

    buyPoints(db, 8);
    await platform.createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0002", body: REQUEST });
    assert.equal(remaining(db, "old"), 50, "expired gifts are skipped when splitting the charge");
    assert.equal(paid(db), 0);

    const balance = await createPoints(pointsStore).getBalance({ tenantId: TENANT });
    assert.equal(balance.promo_points, 0);
    assert.equal(balance.balance_points, 0);
    assert.deepEqual(balance.promo_grants, [], "only usable gifts are listed");
  }

  // ---- a claimed gift really funds a measurement, until it expires ----
  {
    const { db, platformStore, pointsStore } = createDatabase();
    const claim = await createPoints(pointsStore).claimPromotion({ tenantId: TENANT, promotionId: "launch-test" });
    await createPlatform(platformStore).createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0001", body: REQUEST });
    assert.equal((await createPoints(pointsStore).getBalance({ tenantId: TENANT })).promo_points, 12);
    const afterExpiry = new Date(Date.parse(claim.expires_at));
    await rejectsWith(createPlatform(platformStore, { now: afterExpiry })
      .createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0002", body: REQUEST }), "points_insufficient", 402);
    assert.equal((await createPoints(pointsStore, { clock: () => afterExpiry }).getBalance({ tenantId: TENANT })).balance_points, 0);
    assert.equal(paid(db), 0);
  }

  // ---- test-mode gifts never fund live-mode billing ----
  {
    const { db, platformStore, pointsStore } = createDatabase();
    await createPoints(pointsStore).claimPromotion({ tenantId: TENANT, promotionId: "launch-test" });
    const live = createDeveloperPlatformService({
      store: platformStore, tokenPepper: PEPPER, now: () => NOW, providers: createFixtureProviders(),
      quotaWindowStrategy: "rolling_24h", resultRetentionDays: 30, trialDays: 7, freeRoundsPerWindow: 3,
      dailyBudgetTwd: 60, monthlyBudgetTwd: 600, maxJobCostTwd: 12, twdPerUsd: 31.535,
      enqueue: async () => {}, pointsBilling: { mode: "live", costPoints: 8 }
    });
    await rejectsWith(live.createMeasurement({ tenantId: TENANT, idempotencyKey: "promo-run-0001", body: REQUEST }),
      "points_insufficient", 402);
    assert.equal((await createPoints(pointsStore, { mode: "live" }).getBalance({ tenantId: TENANT })).promo_points, 0);
    assert.equal(Number(db.prepare("SELECT remaining_points AS r FROM developer_point_grants").get().r), 20);
  }

  console.log("developer points promotions tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
