// Contract test for the Cloudflare D1 Dashboard store.
//
// The D1 binding is emulated on top of a real in-memory SQLite database that is
// built from the *Cloudflare* migration files, so this exercises the actual SQL
// (including the conditional writes that replace `BEGIN IMMEDIATE`) rather than
// asserting against a stub. It then drives the unchanged `dashboard-service`
// through the D1 store and compares its output with the Node SQLite store.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { createD1DashboardStore, createBoundD1DashboardStore } = require("../services/api/storage/dashboard-d1-store.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");
const { createDashboardService, ENGINE_IDS } = require("../services/api/application/dashboard-service.js");

const ROOT = path.resolve(__dirname, "..");
const CLOUDFLARE_MIGRATIONS = path.join(ROOT, "services/cloudflare/dashboard/migrations");
const NOW = "2026-09-10T00:00:00.000Z";
const PEPPER = "dashboard-d1-test-pepper-with-at-least-thirty-two-bytes";

// ---- D1 binding emulator ----------------------------------------------------

function createD1Emulator() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(CLOUDFLARE_MIGRATIONS).sort()) {
    db.exec(fs.readFileSync(path.join(CLOUDFLARE_MIGRATIONS, file), "utf8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");

  function run(sql, params) {
    const results = db.prepare(sql).all(...params);
    const changed = Number(db.prepare("SELECT changes() AS c").get().c);
    return { success: true, results, meta: { changes: changed } };
  }

  return {
    db,
    binding: {
      prepare(sql) {
        return {
          bind(...params) {
            return { sql, params, all: async () => run(sql, params), __run: () => run(sql, params) };
          }
        };
      },
      async batch(statements) {
        db.exec("BEGIN");
        try {
          const out = statements.map((statement) => statement.__run());
          db.exec("COMMIT");
          return out;
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
      }
    }
  };
}

function observationsFor(questionSet) {
  return questionSet.questions.flatMap((question, questionIndex) => ENGINE_IDS.map((engine) => ({
    questionId: question.questionId, engine, model: `${engine}-fixture`, status: "measured",
    brandMentioned: questionIndex === 0, officialCitation: engine === "perplexity",
    rawAnswer: `Observed ${question.text} on ${engine}`,
    citations: [{ url: "https://brand.example/about", isOfficial: engine === "perplexity" }]
  })));
}

async function seedProject(service) {
  const invitation = await service.createInvitation({ email: "d1@example.com" });
  const session = await service.verifyInvitation({ token: invitation.invitation_token });
  const project = await service.createProject({
    sessionToken: session.session_token, name: "D1 project",
    siteUrl: "https://brand.example", timezone: "Asia/Taipei"
  });
  const questionSet = await service.createQuestionSet({
    sessionToken: session.session_token, projectId: project.projectId, locale: "zh-TW",
    questions: [
      { text: "台北咖啡店推薦", intent: "discovery", tags: ["local"] },
      { text: "適合工作的咖啡店", intent: "consideration", tags: ["work"] }
    ]
  });
  await service.recordTrackingRun({
    projectId: project.projectId, questionSetId: questionSet.questionSetId,
    scheduledAt: "2026-09-03T00:00:00.000Z", observedAt: "2026-09-03T01:00:00.000Z",
    observations: observationsFor(questionSet)
  });
  return { session, project, questionSet };
}

async function main() {
  assert.throws(() => createBoundD1DashboardStore({ db: {} }), /D1 binding is required/);
  assert.throws(() => createD1DashboardStore({}), /execute function is required/);
  const source = fs.readFileSync(path.join(ROOT, "services/api/storage/dashboard-d1-store.js"), "utf8");
  assert.doesNotMatch(
    source, /require\(["']node:sqlite["']\)/,
    "The D1 store must not depend on the Node SQLite runtime"
  );

  const { db, binding } = createD1Emulator();
  const store = createBoundD1DashboardStore({ db: binding });
  assert.equal(store.state().kind, "d1-binding");
  const service = createDashboardService({ store, tokenPepper: PEPPER, now: () => new Date(NOW) });

  // ---- an invitation is consumable exactly once ----
  const invitation = await service.createInvitation({ email: "once@example.com" });
  const verified = await service.verifyInvitation({ token: invitation.invitation_token });
  assert.match(verified.session_token, /^gds_/);
  await assert.rejects(
    () => service.verifyInvitation({ token: invitation.invitation_token }),
    /invalid|expired|invitation/i,
    "A consumed invitation must not mint a second session"
  );
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_sessions").get().c), 1,
    "A replayed invitation must not leave a second session behind"
  );
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_accounts").get().c), 1,
    "A replayed invitation must not create a second account"
  );

  // ---- an expired invitation is refused and consumes nothing ----
  const expiredStore = createBoundD1DashboardStore({ db: createD1Emulator().binding });
  await expiredStore.insertInvitation({
    tokenId: "dat_expired", email: "expired@example.com", tokenHash: "hash-expired",
    createdAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-02T00:00:00.000Z"
  });
  assert.equal(await expiredStore.consumeInvitation({
    tokenHash: "hash-expired", accountId: "dacc_x", sessionId: "dses_x",
    sessionHash: "session-hash", now: NOW, sessionExpiresAt: "2026-10-10T00:00:00.000Z"
  }), null, "An expired invitation must not be consumable");

  // ---- manual-run quota is enforced by the atomic write, not by a prior read ----
  const seeded = await seedProject(service);
  const accountRow = db.prepare("SELECT account_id FROM dashboard_accounts WHERE email_normalized = ?").get("d1@example.com");
  const accountId = accountRow.account_id;

  await store.createSubscriptionPeriod({
    periodId: "dsp_test", accountId, startsAt: NOW, endsAt: "2026-10-10T00:00:00.000Z",
    manualRunLimit: 2, now: NOW
  });

  const reservationInput = (index, dayTaipei = "2026-09-10") => ({
    jobId: `dtj_${index}`, reservationId: `dmr_${index}`, accountId, projectId: seeded.project.projectId,
    periodId: "dsp_test", dayTaipei, dailyLimit: 6, dedupeKey: `manual:${index}`, now: NOW
  });

  const firstReservation = await store.reserveManualTrackingJob(reservationInput(1));
  assert.equal(firstReservation.job.status, "queued");
  assert.equal(firstReservation.reservationId, "dmr_1");
  const secondReservation = await store.reserveManualTrackingJob(reservationInput(2));
  assert.equal(secondReservation.job.status, "queued");

  const overQuota = await store.reserveManualTrackingJob(reservationInput(3));
  assert.equal(overQuota.rejected, "manual_quota_exhausted");
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_tracking_jobs").get().c), 2,
    "A rejected reservation must not leave an orphan Tracking Job"
  );
  assert.equal(
    Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_manual_run_reservations").get().c), 2,
    "A rejected reservation must not consume quota"
  );
  assert.equal(await store.manualUsage("dsp_test"), 2);

  const unknownPeriod = await store.reserveManualTrackingJob({ ...reservationInput(4), periodId: "dsp_missing" });
  assert.equal(unknownPeriod.rejected, "entitlement_required");

  // ---- the Asia/Taipei daily cap is enforced independently of the period cap ----
  const dailyEmulator = createD1Emulator();
  const dailyStore = createBoundD1DashboardStore({ db: dailyEmulator.binding });
  const dailyService = createDashboardService({ store: dailyStore, tokenPepper: PEPPER, now: () => new Date(NOW) });
  const dailySeed = await seedProject(dailyService);
  const dailyAccount = dailyEmulator.db.prepare(
    "SELECT account_id FROM dashboard_accounts WHERE email_normalized = ?"
  ).get("d1@example.com").account_id;
  await dailyStore.createSubscriptionPeriod({
    periodId: "dsp_daily", accountId: dailyAccount, startsAt: NOW,
    endsAt: "2026-10-10T00:00:00.000Z", manualRunLimit: 24, now: NOW
  });
  for (let index = 0; index < 2; index += 1) {
    const reserved = await dailyStore.reserveManualTrackingJob({
      jobId: `dtj_day_${index}`, reservationId: `dmr_day_${index}`, accountId: dailyAccount,
      projectId: dailySeed.project.projectId, periodId: "dsp_daily", dayTaipei: "2026-09-10",
      dailyLimit: 2, dedupeKey: `manual:day:${index}`, now: NOW
    });
    assert.ok(reserved.job, "Reservations below the daily cap must succeed");
  }
  const overDaily = await dailyStore.reserveManualTrackingJob({
    jobId: "dtj_day_over", reservationId: "dmr_day_over", accountId: dailyAccount,
    projectId: dailySeed.project.projectId, periodId: "dsp_daily", dayTaipei: "2026-09-10",
    dailyLimit: 2, dedupeKey: "manual:day:over", now: NOW
  });
  assert.equal(overDaily.rejected, "daily_manual_limit");
  const nextDay = await dailyStore.reserveManualTrackingJob({
    jobId: "dtj_day_next", reservationId: "dmr_day_next", accountId: dailyAccount,
    projectId: dailySeed.project.projectId, periodId: "dsp_daily", dayTaipei: "2026-09-11",
    dailyLimit: 2, dedupeKey: "manual:day:next", now: NOW
  });
  assert.ok(nextDay.job, "The daily cap must reset on the next Asia/Taipei day");

  // ---- settling a job is idempotent and charges its reservation once ----
  assert.equal(await store.settleTrackingJob({ jobId: "dtj_1", state: "complete", now: NOW }), true);
  assert.equal(
    await store.settleTrackingJob({ jobId: "dtj_1", state: "failed", now: "2026-09-10T02:00:00.000Z" }), false,
    "A terminal Tracking Job must not be settled twice"
  );
  const settledJob = await store.getTrackingJob("dtj_1");
  assert.equal(settledJob.status, "succeeded");
  assert.equal(
    db.prepare("SELECT status FROM dashboard_manual_run_reservations WHERE reservation_id = ?").get("dmr_1").status,
    "charged"
  );
  assert.equal(await store.settleTrackingJob({ jobId: "dtj_2", state: "failed", now: NOW }), true);
  assert.equal(
    db.prepare("SELECT status FROM dashboard_manual_run_reservations WHERE reservation_id = ?").get("dmr_2").status,
    "released",
    "A failed manual run must release its reservation"
  );
  assert.equal(await store.manualUsage("dsp_test"), 1, "A released reservation must not keep consuming quota");
  assert.equal(await store.settleTrackingJob({ jobId: "dtj_missing", state: "complete", now: NOW }), false);

  // ---- a duplicate payment event is ignored exactly once ----
  const paymentInput = {
    paymentEventId: "dpe_1", accountId, providerTransactionId: "newebpay-tx-1",
    providerPeriodId: null, eventType: "periodic_payment", status: "succeeded",
    occurredAt: NOW, now: NOW
  };
  assert.equal(await store.insertPaymentEvent(paymentInput), true);
  assert.equal(
    await store.insertPaymentEvent({ ...paymentInput, paymentEventId: "dpe_2" }), false,
    "A replayed NewebPay callback must not be applied twice"
  );

  // ---- Google Search Console connection lifecycle ----
  const connection = await store.upsertGoogleConnection({
    connectionId: "dgsc_1", projectId: seeded.project.projectId, accountId,
    googleEmail: "owner@example.com", propertyUri: "sc-domain:brand.example",
    ciphertext: "cipher", iv: "iv", tag: "tag", scopes: ["https://www.googleapis.com/auth/webmasters.readonly"], now: NOW
  });
  assert.equal(connection.propertyUri, "sc-domain:brand.example");
  await store.upsertGscDailyMetrics(seeded.project.projectId, "sc-domain:brand.example", [
    { date: "2026-09-01", clicks: 10, impressions: 100, ctr: 0.1, position: 4.5 },
    { date: "2026-09-02", clicks: 12, impressions: 90, ctr: 0.13, position: 4.1 }
  ], NOW);
  assert.equal((await store.listGscDailyMetrics(seeded.project.projectId, "2026-09-01", "2026-09-30")).length, 2);
  assert.equal(await store.revokeGoogleConnection(seeded.project.projectId, NOW), true);
  assert.equal(await store.getGoogleConnection(seeded.project.projectId), null);
  assert.equal(
    (await store.listGscDailyMetrics(seeded.project.projectId, "2026-09-01", "2026-09-30")).length, 0,
    "Revoking a Google connection must delete its imported metrics"
  );
  assert.equal(await store.revokeGoogleConnection(seeded.project.projectId, NOW), false);

  // ---- the D1 store and the Node SQLite store produce the same read models ----
  const sqliteStore = createSqliteDashboardStore();
  const sqliteService = createDashboardService({ store: sqliteStore, tokenPepper: PEPPER, now: () => new Date(NOW) });
  const sqliteSeed = await seedProject(sqliteService);
  const parityEmulator = createD1Emulator();
  const parityStore = createBoundD1DashboardStore({ db: parityEmulator.binding });
  const parityService = createDashboardService({ store: parityStore, tokenPepper: PEPPER, now: () => new Date(NOW) });
  const paritySeed = await seedProject(parityService);

  for (const view of ["getOverview", "getPerformance", "getCitations", "getDataQuality"]) {
    const expected = await sqliteService[view]({
      sessionToken: sqliteSeed.session.session_token, projectId: sqliteSeed.project.projectId
    });
    const actual = await parityService[view]({
      sessionToken: paritySeed.session.session_token, projectId: paritySeed.project.projectId
    });
    assert.deepEqual(
      stripIdentifiers(actual), stripIdentifiers(expected),
      `${view} must return the same read model on D1 as on SQLite`
    );
  }
  sqliteStore.close();
  await store.close();

  console.log("dashboard D1 store tests passed");
}

// Project, run, question and observation IDs are random per store; normalise every
// generated identifier so the comparison is about the read model, not the UUIDs.
const GENERATED_ID = /^d[a-z]{2,4}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function stripIdentifiers(value) {
  return JSON.parse(JSON.stringify(value), (_key, entry) => (
    typeof entry === "string" && GENERATED_ID.test(entry) ? "<generated-id>" : entry
  ));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
