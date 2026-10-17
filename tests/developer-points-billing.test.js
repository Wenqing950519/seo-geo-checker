// Per-observation point charges (LSL-D-003): with points billing on, a customer
// measurement holds 8 points at admission and gives them back if the job does
// not finish with all four engines. Trial quota is not used at all.
//
// The D1 binding is emulated on real SQLite built from the Developer API
// migrations, so the admission SQL that enforces the balance is exercised.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { createD1DeveloperPlatformStore } = require("../services/api/storage/developer-platform-d1-store.js");
const { createSqliteDeveloperPlatformStore } = require("../services/api/storage/developer-platform-store.js");
const { createDeveloperPlatformService } = require("../services/api/application/developer-platform-service.js");
const { createFixtureProviders } = require("../services/api/application/developer-api-prototype.js");

const MIGRATIONS = path.resolve(__dirname, "../services/api/developer-api-migrations");
const NOW = new Date("2026-10-17T03:00:00.000Z");
const PEPPER = "points-billing-test-pepper-with-at-least-thirty-two-bytes";
const TENANT = "tnt_points_customer";
const REQUEST = Object.freeze({ input: { type: "prompt", text: "台北有哪些適合工作的咖啡店？" } });

function createStore() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  db.prepare("INSERT INTO developer_tenants (tenant_id, status, created_at) VALUES (?, 'active', ?)").run(TENANT, NOW.toISOString());
  const run = (sql, params) => {
    const results = db.prepare(sql).all(...params);
    return { success: true, results, meta: { changes: Number(db.prepare("SELECT changes() AS c").get().c) } };
  };
  const store = createD1DeveloperPlatformStore({
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

function createService(store, overrides = {}) {
  return createDeveloperPlatformService({
    store, tokenPepper: PEPPER, now: () => NOW,
    providers: createFixtureProviders(),
    quotaWindowStrategy: "rolling_24h", resultRetentionDays: 30,
    trialDays: 7, freeRoundsPerWindow: 3,
    dailyBudgetTwd: 60, monthlyBudgetTwd: 600, maxJobCostTwd: 12, twdPerUsd: 31.535,
    enqueue: async () => {},
    pointsBilling: { mode: "test", costPoints: 8 },
    ...overrides
  });
}

function buyPoints(db, points, { mode = "test", reference = `sess_${points}_${mode}` } = {}) {
  db.prepare(`INSERT INTO developer_point_ledger (entry_id, tenant_id, mode, kind, points, reference, created_at)
    VALUES (?, ?, ?, 'purchase', ?, ?, ?)`).run(`pt_${reference}`, TENANT, mode, points, reference, NOW.toISOString());
}

function balance(db, mode = "test") {
  return Number(db.prepare("SELECT COALESCE(SUM(points), 0) AS b FROM developer_point_ledger WHERE tenant_id = ? AND mode = ?")
    .get(TENANT, mode).b);
}

function entries(db, jobId) {
  return db.prepare("SELECT kind, points FROM developer_point_ledger WHERE reference = ? ORDER BY kind").all(jobId)
    .map((row) => `${row.kind}:${row.points}`);
}

async function main() {
  // ---- admission holds 8 points without any trial entitlement; success keeps the charge ----
  {
    const { db, store } = createStore();
    const service = createService(store);
    buyPoints(db, 20);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM developer_entitlements").get().c, 0, "no trial activation is needed");

    const first = await service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0001", body: REQUEST });
    assert.equal(first.created, true);
    const jobId = first.job.job_id;
    assert.deepEqual(entries(db, jobId), ["charge:-8"], "admission writes exactly one 8-point charge");
    assert.equal(balance(db), 12);

    const replay = await service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0001", body: REQUEST });
    assert.equal(replay.created, false);
    assert.equal(balance(db), 12, "a replayed Idempotency-Key is not charged twice");

    assert.equal(await service.runJob(jobId), true);
    assert.equal(db.prepare("SELECT status FROM developer_jobs WHERE job_id = ?").get(jobId).status, "succeeded");
    assert.deepEqual(entries(db, jobId), ["charge:-8"], "a four-engine success keeps the charge");
    assert.equal(balance(db), 12);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM developer_quota_windows").get().c, 0, "trial quota is not used");
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM developer_quota_reservations").get().c, 0);

    await service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0002", body: REQUEST });
    assert.equal(balance(db), 4);
    await assert.rejects(
      () => service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0003", body: REQUEST }),
      (error) => error.code === "points_insufficient" && error.statusCode === 402,
      "fewer than 8 points refuses the measurement"
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM developer_jobs").get().c, 2, "a refused measurement leaves no job");
    assert.equal(balance(db), 4, "a refusal charges nothing");
  }

  // ---- a partial result (one engine failed) gives the 8 points back ----
  {
    const { db, store } = createStore();
    const service = createService(store, { providers: createFixtureProviders({ failProfileId: "anthropic-web" }) });
    buyPoints(db, 8);
    const { job } = await service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0001", body: REQUEST });
    assert.equal(balance(db), 0);
    await service.runJob(job.job_id);
    assert.equal(db.prepare("SELECT status FROM developer_jobs WHERE job_id = ?").get(job.job_id).status, "failed");
    assert.deepEqual(entries(db, job.job_id), ["adjustment:8", "charge:-8"]);
    assert.equal(balance(db), 8, "a failed observation costs nothing");
  }

  // ---- a job failed or expired before completion also gives the points back, once ----
  {
    const { db, store } = createStore();
    const service = createService(store);
    buyPoints(db, 16);
    const queued = await service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0001", body: REQUEST });
    assert.equal(await store.failJob({ jobId: queued.job.job_id, errorCode: "provider_timeout", now: NOW.toISOString() }), true);
    assert.equal(await store.failJob({ jobId: queued.job.job_id, errorCode: "provider_timeout", now: NOW.toISOString() }), false);
    assert.deepEqual(entries(db, queued.job.job_id), ["adjustment:8", "charge:-8"], "released exactly once");

    const running = await service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0002", body: REQUEST });
    db.prepare("UPDATE developer_jobs SET status = 'running', lease_token = 'lease_x', lease_expires_at = ? WHERE job_id = ?")
      .run("2026-10-17T02:00:00.000Z", running.job.job_id);
    assert.deepEqual(await store.expireStaleJobs({ now: NOW.toISOString() }), [running.job.job_id]);
    assert.deepEqual(entries(db, running.job.job_id), ["adjustment:8", "charge:-8"]);
    assert.equal(balance(db), 16);
  }

  // ---- test-mode points never fund live-mode billing, and vice versa ----
  {
    const { db, store } = createStore();
    buyPoints(db, 100, { mode: "test" });
    const live = createService(store, { pointsBilling: { mode: "live", costPoints: 8 } });
    await assert.rejects(
      () => live.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0001", body: REQUEST }),
      (error) => error.code === "points_insufficient"
    );
    buyPoints(db, 8, { mode: "live" });
    await live.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0002", body: REQUEST });
    assert.equal(balance(db, "live"), 0);
    assert.equal(balance(db, "test"), 100);
  }

  // ---- the customer admission switch still closes the door ----
  {
    const { db, store } = createStore();
    const service = createService(store);
    buyPoints(db, 80);
    db.prepare("UPDATE developer_runtime_controls SET control_value = 'false' WHERE control_key = 'admission_enabled'").run();
    await assert.rejects(
      () => service.createMeasurement({ tenantId: TENANT, idempotencyKey: "points-run-0001", body: REQUEST }),
      (error) => error.code === "service_unavailable"
    );
    assert.equal(balance(db), 80);
  }

  // ---- misconfiguration fails closed ----
  {
    const { store } = createStore();
    assert.throws(() => createService(store, { pointsBilling: { mode: "sandbox", costPoints: 8 } }), /points billing mode/);
    assert.throws(() => createService(store, { pointsBilling: { mode: "test", costPoints: 0 } }), /costPoints/);
    assert.throws(
      () => createService(createSqliteDeveloperPlatformStore({ filename: ":memory:" })),
      /points billing/,
      "the local SQLite store has no points ledger, so points billing must refuse to start rather than run free"
    );
  }

  console.log("developer points billing tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
