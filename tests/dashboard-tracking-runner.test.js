// Product A tracking runner (D-047 phase 2), end to end against the D1 store.
//
// The Developer API is stubbed at the client boundary, so this exercises the
// real dispatch SQL, the real observation mapping and the real Run assembly —
// everything except the paid call itself.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { createBoundD1DashboardStore } = require("../services/api/storage/dashboard-d1-store.js");
const { createDashboardService } = require("../services/api/application/dashboard-service.js");
const { createDashboardTrackingRunner } = require("../services/api/application/dashboard-tracking-runner.js");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "services/cloudflare/dashboard/migrations");
const NOW = "2026-09-11T00:00:00.000Z";
const PEPPER = "tracking-runner-test-pepper-with-at-least-thirty-two-bytes";

function createD1() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  const run = (sql, params) => {
    const results = db.prepare(sql).all(...params);
    return { success: true, results, meta: { changes: Number(db.prepare("SELECT changes() AS c").get().c) } };
  };
  return {
    db,
    binding: {
      prepare(sql) {
        return { bind: (...params) => ({ all: async () => run(sql, params), __run: () => run(sql, params) }) };
      },
      batch: async (statements) => {
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

// Mirrors a real Developer API measurement: four engines plus the analysis the
// Dashboard reads its mention and first-party citation from.
function measurement(measurementId, { failing = [], status = "succeeded" } = {}) {
  const profiles = [
    ["openai-gpt", "openai"],
    ["gemini-flash", "google"],
    ["claude-haiku", "anthropic"],
    ["sonar", "perplexity"]
  ];
  const engines = profiles.map(([profileId, provider]) => (failing.includes(provider) ? {
    profile_id: profileId, provider, model: `${provider}-model`, status: "failed",
    error: { code: "provider_timeout" }
  } : {
    profile_id: profileId, provider, model: `${provider}-model`, status: "succeeded",
    answer: `${provider} 建議 Brand 與其他選擇`,
    citations: [
      { url: "https://brand.example/about", title: "Brand 官網" },
      { url: "https://guide.example/list", title: "第三方名單" }
    ]
  }));
  return {
    measurement_id: measurementId,
    status,
    engines,
    analysis: {
      target_observation: engines
        .filter((engine) => engine.status === "succeeded")
        .map((engine) => ({
          profile_id: engine.profile_id,
          mentioned: true,
          first_party_citation: engine.provider === "perplexity"
        }))
    }
  };
}

function createClient(behaviour = {}) {
  const submitted = [];
  const store = new Map();
  return {
    submitted,
    store,
    async submitMeasurement(input) {
      submitted.push(input);
      if (behaviour.failSubmit) throw new Error("submit unavailable");
      const measurementId = `msr_${submitted.length}`;
      store.set(measurementId, behaviour.pending ? null : measurement(measurementId, behaviour));
      return { created: true, job: { measurement_id: measurementId, status: "queued" } };
    },
    async getMeasurement(measurementId) {
      return store.get(measurementId) ?? null;
    }
  };
}

async function seed(db, binding, { questions = 2, dueAt = "2026-09-01T00:00:00.000Z" } = {}) {
  const store = createBoundD1DashboardStore({ db: binding });
  const service = createDashboardService({ store, tokenPepper: PEPPER, now: () => new Date(NOW) });
  const invitation = await service.createInvitation({ email: "owner@example.com" });
  const session = await service.verifyInvitation({ token: invitation.invitation_token });
  const project = await service.createProject({
    sessionToken: session.session_token, name: "Brand", siteUrl: "https://brand.example", timezone: "Asia/Taipei"
  });
  await service.createQuestionSet({
    sessionToken: session.session_token, projectId: project.projectId, locale: "zh-TW",
    questions: Array.from({ length: questions }, (_, index) => ({
      text: `測試問題 ${index + 1}`, intent: "discovery", tags: ["test"]
    }))
  });
  // Make the plan due.
  db.prepare("UPDATE dashboard_tracking_plans SET next_run_at = ? WHERE project_id = ?")
    .run(dueAt, project.projectId);
  return { store, service, session, project };
}

function createRunner(store, service, client) {
  return createDashboardTrackingRunner({
    store, client, now: () => new Date(NOW),
    onRunRecorded: (input) => service.recordTrackingRun(input)
  });
}

async function main() {
  assert.throws(() => createDashboardTrackingRunner({ store: {}, client: {} }), /Dashboard store/);

  // ---- a closed channel spends nothing at all ----
  {
    const { db, binding } = createD1();
    const { store, service } = await seed(db, binding);
    const client = createClient();
    const outcome = await createRunner(store, service, client).tick({ admissionEnabled: false });
    assert.equal(outcome.skipped, "admission_closed");
    assert.deepEqual(
      [outcome.started, outcome.submitted], [0, 0],
      "A closed tick must not create or submit anything"
    );
    assert.equal(client.submitted.length, 0, "A closed tick must never reach the paid channel");
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS c FROM dashboard_tracking_jobs").get().c), 0);
  }

  // ---- one full pass: due plan to a Run the Dashboard can read ----
  {
    const { db, binding } = createD1();
    const { store, service, session, project } = await seed(db, binding);
    const client = createClient();
    const runner = createRunner(store, service, client);

    const outcome = await runner.tick({ admissionEnabled: true });
    assert.deepEqual(
      [outcome.started, outcome.submitted, outcome.collected, outcome.assembled], [1, 2, 2, 1],
      "One tick must carry a due plan all the way to an assembled Run"
    );

    // Each tracked question became exactly one measurement, carrying the target.
    assert.equal(client.submitted.length, 2);
    assert.equal(client.submitted[0].target.url, "https://brand.example/");
    assert.equal(client.submitted[0].locale, "zh-TW");
    assert.match(client.submitted[0].idempotencyKey, /^dtj_[0-9a-f-]+:dqu_[0-9a-f-]+$/);

    // Two questions times four engines, all measured.
    const overview = await service.getOverview({
      sessionToken: session.session_token, projectId: project.projectId
    });
    assert.equal(overview.summary.metrics.brand_mention_rate.denominator, 8);
    assert.equal(overview.summary.metrics.brand_mention_rate.numerator, 8);
    assert.equal(
      overview.summary.metrics.official_citation_rate.numerator, 2,
      "Only the engine that cited the official site counts as a first-party citation"
    );
    assert.equal(overview.data_freshness_at, NOW);

    const job = db.prepare("SELECT status, run_id FROM dashboard_tracking_jobs LIMIT 1").get();
    assert.equal(job.status, "succeeded");
    assert.ok(job.run_id, "The job must record the Run it produced");

    // The plan moved a week out, so the next tick does nothing.
    const plan = db.prepare("SELECT next_run_at FROM dashboard_tracking_plans LIMIT 1").get();
    assert.equal(plan.next_run_at, "2026-09-18T00:00:00.000Z");
    const second = await runner.tick({ admissionEnabled: true });
    assert.deepEqual([second.started, second.submitted, second.assembled], [0, 0, 0]);
    assert.equal(client.submitted.length, 2, "A settled plan must not be measured twice");
  }

  // ---- a failing engine is recorded as failed, never as a zero ----
  {
    const { db, binding } = createD1();
    const { store, service, session, project } = await seed(db, binding, { questions: 1 });
    const client = createClient({ failing: ["anthropic"] });
    await createRunner(store, service, client).tick({ admissionEnabled: true });

    const quality = await service.getDataQuality({
      sessionToken: session.session_token, projectId: project.projectId
    });
    const failed = db.prepare("SELECT COUNT(*) AS c FROM dashboard_observations WHERE status = 'failed'").get();
    assert.equal(Number(failed.c), 1, "The failing engine must be stored as failed");
    const measured = db.prepare("SELECT COUNT(*) AS c FROM dashboard_observations WHERE status = 'measured'").get();
    assert.equal(Number(measured.c), 3);
    const zeroed = db.prepare(`SELECT COUNT(*) AS c FROM dashboard_observations
      WHERE status = 'failed' AND (brand_mentioned = 0 OR official_citation = 0)`).get();
    assert.equal(Number(zeroed.c), 0, "A failed observation must stay null, never be written as 0");
    assert.ok(quality, "Data quality must render with a partial run");
  }

  // ---- work already in flight is never resubmitted ----
  {
    const { db, binding } = createD1();
    const { store, service } = await seed(db, binding, { questions: 2 });
    const client = createClient({ pending: true });
    const runner = createRunner(store, service, client);

    await runner.tick({ admissionEnabled: true });
    assert.equal(client.submitted.length, 2);
    await runner.tick({ admissionEnabled: true });
    assert.equal(
      client.submitted.length, 2,
      "A dispatch awaiting its result must not be submitted again and charged twice"
    );
    const job = db.prepare("SELECT status, run_id FROM dashboard_tracking_jobs LIMIT 1").get();
    assert.equal(job.run_id, null, "A Run must not be assembled while dispatches are outstanding");
    assert.equal(job.status, "queued");
  }

  // ---- a submission that cannot be delivered is retried, then given up on ----
  {
    const { db, binding } = createD1();
    const { store, service } = await seed(db, binding, { questions: 1 });
    const client = createClient({ failSubmit: true });
    const runner = createRunner(store, service, client);

    for (let tick = 0; tick < 4; tick += 1) await runner.tick({ admissionEnabled: true });
    const dispatch = db.prepare("SELECT status, attempts, error_code FROM dashboard_tracking_dispatches LIMIT 1").get();
    assert.equal(dispatch.status, "failed");
    assert.equal(dispatch.error_code, "submit_attempts_exhausted");
    assert.equal(Number(dispatch.attempts), 3, "Retries must be bounded, not endless");

    // The Run is still written, so the Dashboard shows a failed observation
    // rather than silently missing a week.
    const run = db.prepare("SELECT state, expected_observations, failed_observations FROM dashboard_tracking_runs LIMIT 1").get();
    assert.equal(run.state, "failed");
    assert.equal(
      Number(run.expected_observations), 4,
      "A question that never reached the channel still owes four observations"
    );
    assert.equal(Number(run.failed_observations), 4);
  }

  // ---- a measurement that failed at the Developer API is settled, not polled forever ----
  {
    const { db, binding } = createD1();
    const { store, service } = await seed(db, binding, { questions: 1 });
    const client = createClient({ status: "failed", failing: ["openai", "google", "anthropic", "perplexity"] });
    await createRunner(store, service, client).tick({ admissionEnabled: true });

    const dispatch = db.prepare("SELECT status, error_code FROM dashboard_tracking_dispatches LIMIT 1").get();
    assert.equal(dispatch.status, "failed");
    assert.equal(dispatch.error_code, "measurement_failed");
    const run = db.prepare("SELECT state FROM dashboard_tracking_runs LIMIT 1").get();
    assert.equal(run.state, "failed");
  }

  console.log("dashboard tracking runner tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
