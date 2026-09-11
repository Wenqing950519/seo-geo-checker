// Internal measurement channel (D-047), driven against the D1 store.
//
// The D1 binding is emulated on real SQLite built from the Developer API
// migrations, so the admission SQL — which is what actually enforces the gates —
// is exercised rather than stubbed.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { createD1DeveloperPlatformStore } = require("../services/api/storage/developer-platform-d1-store.js");
const { createDeveloperPlatformService } = require("../services/api/application/developer-platform-service.js");
const { createFixtureProviders } = require("../services/api/application/developer-api-prototype.js");
const { listOfficialEngineProfiles } = require("../services/api/application/official-engine-profiles.js");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "services/api/developer-api-migrations");
const NOW = new Date("2026-09-11T00:00:00.000Z");
const PEPPER = "internal-channel-test-pepper-with-at-least-thirty-two-bytes";

function createStore() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
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

// Cost budgets only engage in official mode, because fixtures spend nothing.
// These providers answer like fixtures but declare official mode, so the budget
// path under test is the same one production uses.
function createBudgetedProviders() {
  return listOfficialEngineProfiles().map((profile) => ({
    id: profile.id,
    mode: "official",
    async execute(request) {
      return {
        answer: `[test:${profile.provider}] ${request.prompt}`,
        citations: [{ url: "https://brand.example/about", title: "test citation" }],
        searchEvidence: { mode: "native_search", profile_id: profile.id, executed: true },
        usage: { estimated_cost_usd: 0.02 }
      };
    }
  }));
}

function createService(store, overrides = {}) {
  return createDeveloperPlatformService({
    store, tokenPepper: PEPPER, now: () => NOW,
    providers: createFixtureProviders(),
    quotaWindowStrategy: "rolling_24h", resultRetentionDays: 30,
    trialDays: 7, freeRoundsPerWindow: 3,
    dailyBudgetTwd: 60, monthlyBudgetTwd: 600, maxJobCostTwd: 12, twdPerUsd: 31.535,
    internalDailyBudgetTwd: 500, internalMonthlyBudgetTwd: 3000,
    enqueue: async () => {},
    ...overrides
  });
}

const REQUEST = Object.freeze({ input: { type: "prompt", text: "台北有哪些適合工作的咖啡店？" } });

function openInternalChannel(db, value = "true") {
  db.prepare("UPDATE developer_runtime_controls SET control_value = ? WHERE control_key = 'internal_admission_enabled'")
    .run(value);
}

async function main() {
  // ---- the channel ships closed, and both switches are independent ----
  {
    const { db, store } = createStore();
    const service = createService(store);
    const closed = db.prepare("SELECT control_value FROM developer_runtime_controls WHERE control_key = 'internal_admission_enabled'").get();
    assert.equal(closed.control_value, "false", "The internal channel must ship closed");

    const { secret } = await service.rotateInternalCallerSecret({ callerId: "dashboard" });
    const caller = await service.authenticateInternalCaller(secret);
    assert.equal(caller.callerId, "dashboard");
    assert.equal(caller.tenantId, "tnt_internal_dashboard");

    await assert.rejects(
      () => service.createInternalMeasurement({ caller: "dashboard", idempotencyKey: "internal-run-0001", body: REQUEST }),
      (error) => error.code === "internal_admission_closed",
      "A closed internal channel must refuse, and say which switch refused"
    );

    // Customer admission is open by default; it must not open the internal one.
    const customerAdmission = db.prepare("SELECT control_value FROM developer_runtime_controls WHERE control_key = 'admission_enabled'").get();
    assert.equal(customerAdmission.control_value, "true", "Customer admission is unrelated to the internal switch");
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS c FROM developer_jobs").get().c), 0,
      "A refused internal call must leave no job behind"
    );
  }

  // ---- an admitted internal job consumes no customer quota and is attributed ----
  {
    const { db, store } = createStore();
    const service = createService(store, { providers: createBudgetedProviders() });
    const { secret } = await service.rotateInternalCallerSecret({ callerId: "dashboard" });
    openInternalChannel(db);

    const submitted = await service.createInternalMeasurement({
      caller: "dashboard", idempotencyKey: "internal-run-0001", body: REQUEST
    });
    assert.equal(submitted.created, true);
    assert.equal(submitted.job.status, "queued");

    const job = db.prepare("SELECT caller, tenant_id FROM developer_jobs LIMIT 1").get();
    assert.equal(job.caller, "dashboard", "Every internal job must name its caller");
    assert.equal(job.tenant_id, "tnt_internal_dashboard");
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS c FROM developer_quota_windows").get().c), 0,
      "An internal job must not open a customer quota window"
    );
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS c FROM developer_quota_reservations").get().c), 0,
      "An internal job must not reserve customer quota"
    );

    // Spend is reserved against the internal scope only.
    const scopes = db.prepare("SELECT DISTINCT scope FROM developer_cost_budget_windows").all().map((row) => row.scope);
    assert.deepEqual(scopes, ["internal"], "Internal spend must draw from internal budget windows only");
    const reservation = db.prepare("SELECT scope, status FROM developer_cost_reservations LIMIT 1").get();
    assert.equal(reservation.scope, "internal");
    assert.equal(reservation.status, "reserved");

    const spend = await service.getInternalSpend();
    const daily = spend.windows.find((window) => window.window_kind === "daily");
    assert.equal(daily.limit_twd, 500, "The internal daily cap is its own, not the customer one");
    assert.ok(daily.reserved_twd > 0, "A queued internal job must hold a reservation");

    // Idempotency: the same key must not double-spend.
    const replay = await service.createInternalMeasurement({
      caller: "dashboard", idempotencyKey: "internal-run-0001", body: REQUEST
    });
    assert.equal(replay.created, false);
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS c FROM developer_jobs").get().c), 1,
      "A replayed Idempotency-Key must not create a second internal job"
    );
  }

  // ---- the internal budget stops runaway callers before the customer budget ----
  {
    const { db, store } = createStore();
    const service = createService(store, {
      providers: createBudgetedProviders(),
      internalDailyBudgetTwd: 12, internalMonthlyBudgetTwd: 3000
    });
    await service.rotateInternalCallerSecret({ callerId: "dashboard" });
    openInternalChannel(db);

    await service.createInternalMeasurement({ caller: "dashboard", idempotencyKey: "internal-run-0001", body: REQUEST });
    await assert.rejects(
      () => service.createInternalMeasurement({ caller: "dashboard", idempotencyKey: "internal-run-0002", body: REQUEST }),
      (error) => error.code === "internal_budget_exhausted",
      "A caller past its daily cap must be refused, and told why"
    );
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS c FROM developer_jobs").get().c), 1,
      "A budget refusal must not create a job"
    );
    assert.equal(
      Number(db.prepare("SELECT COUNT(*) AS c FROM developer_cost_budget_windows WHERE scope = 'customer'").get().c), 0,
      "Internal spend must never touch the customer budget"
    );
  }

  // ---- a revoked caller loses access immediately ----
  {
    const { db, store } = createStore();
    const service = createService(store);
    const { secret } = await service.rotateInternalCallerSecret({ callerId: "dashboard" });
    openInternalChannel(db);

    await service.revokeInternalCallerSecret({ callerId: "dashboard" });
    assert.equal(await service.authenticateInternalCaller(secret), null, "A revoked secret must not authenticate");
    await assert.rejects(
      () => service.createInternalMeasurement({ caller: "dashboard", idempotencyKey: "internal-run-0001", body: REQUEST }),
      (error) => error.code === "internal_caller_revoked"
    );

    // Rotation restores access with a new secret, and the old one stays dead.
    const rotated = await service.rotateInternalCallerSecret({ callerId: "dashboard" });
    assert.notEqual(rotated.secret, secret, "Rotation must issue a different secret");
    assert.equal(await service.authenticateInternalCaller(secret), null, "The old secret must stay revoked");
    assert.ok(await service.authenticateInternalCaller(rotated.secret));
  }

  // ---- callers are separate identities, and unknown callers are refused ----
  {
    const { db, store } = createStore();
    const service = createService(store);
    const dashboard = await service.rotateInternalCallerSecret({ callerId: "dashboard" });
    const agent = await service.rotateInternalCallerSecret({ callerId: "agent" });
    assert.notEqual(dashboard.secret, agent.secret, "Each product must hold its own secret");
    assert.equal((await service.authenticateInternalCaller(agent.secret)).tenantId, "tnt_internal_agent");

    openInternalChannel(db);
    await service.createInternalMeasurement({ caller: "agent", idempotencyKey: "internal-run-0001", body: REQUEST });
    const job = db.prepare("SELECT caller FROM developer_jobs LIMIT 1").get();
    assert.equal(job.caller, "agent", "Spend must be attributable to the product that caused it");

    await assert.rejects(
      () => service.createInternalMeasurement({ caller: "marketing", idempotencyKey: "internal-run-0003", body: REQUEST }),
      (error) => error.code === "internal_caller_unknown"
    );
    await assert.rejects(
      () => service.rotateInternalCallerSecret({ callerId: "marketing" }),
      (error) => error.code === "internal_caller_unknown"
    );
    assert.equal(await service.authenticateInternalCaller("short"), null);
    assert.equal(await service.authenticateInternalCaller(""), null);
  }

  // ---- internal work stays out of every customer-facing read ----
  {
    const { db, store } = createStore();
    const service = createService(store);
    await service.rotateInternalCallerSecret({ callerId: "dashboard" });
    openInternalChannel(db);
    await service.createInternalMeasurement({ caller: "dashboard", idempotencyKey: "internal-run-0001", body: REQUEST });

    const customer = await service.verifyEmail({
      token: (await service.createInvitation({ email: "customer@example.com" })).verification_token
    });
    assert.deepEqual(
      await service.listJobs({ tenantId: customer.tenant_id }), [],
      "A customer must never see internal jobs"
    );
    const internalTenants = db.prepare("SELECT COUNT(*) AS c FROM developer_tenants WHERE kind = 'internal'").get();
    assert.equal(Number(internalTenants.c), 2, "Internal tenants must be marked, never billable");
  }

  console.log("developer internal channel tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
