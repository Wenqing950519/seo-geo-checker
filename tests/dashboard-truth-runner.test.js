const assert = require("node:assert/strict");
const { createDashboardService } = require("../services/api/application/dashboard-service.js");
const { createDashboardTruthService } = require("../services/api/application/dashboard-truth-service.js");
const { createDashboardTruthRunner } = require("../services/api/application/dashboard-truth-runner.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");

const NOW = new Date("2026-09-13T00:00:00.000Z");

async function main() {
  const store = createSqliteDashboardStore();
  const dashboard = createDashboardService({ store, tokenPepper: "runner-test-pepper-with-at-least-thirty-two-bytes", now: () => NOW });
  const invitation = await dashboard.createInvitation({ email: "runner@example.com" });
  const user = await dashboard.verifyInvitation({ token: invitation.invitation_token });
  const project = await dashboard.createProject({ sessionToken: user.session_token, name: "Runner 餐廳", siteUrl: "https://runner.example", timezone: "Asia/Taipei" });
  const truth = createDashboardTruthService({
    store, dashboardApi: dashboard,
    sourceFetcher: { fetchSource: async (source) => ({ canonicalUrl: source.url, status: "succeeded", fetchedAt: NOW.toISOString(), contentHash: "a".repeat(64), metadata: {}, snippets: [], candidateFields: {} }) },
    now: () => NOW
  });
  const sources = await truth.addTruthSources({ sessionToken: user.session_token, projectId: project.projectId, sources: [{ kind: "website", url: "https://runner.example" }] });
  await truth.confirmTruthBaseline({ sessionToken: user.session_token, projectId: project.projectId,
    fields: { phone: { value: "02-1234-5678" } }, sourceIds: [sources[0].source_id] });
  const check = await truth.startTruthCheck({ sessionToken: user.session_token, projectId: project.projectId, engineIds: ["openai", "perplexity"] });
  let submitted;
  const runner = createDashboardTruthRunner({
    store, truthApi: truth,
    client: {
      submitMeasurement: async (input) => { submitted = input; return { job: { measurement_id: "m_truth_1" } }; },
      getMeasurement: async () => ({ status: "succeeded", engines: [
        { profile_id: "openai-web", model: "fixture-openai", status: "succeeded", answer: "電話 02-1234-5678" },
        { profile_id: "perplexity-sonar", model: "fixture-perplexity", status: "succeeded", answer: "電話 02-9999-9999" }
      ] })
    }, now: () => NOW, pollIntervalMs: 1
  });
  const outcome = await runner.tick();
  assert.deepEqual(outcome, { claimed: 1, completed: 1, failed: 0 });
  assert.deepEqual(submitted.engineIds, ["openai", "perplexity"]);
  const done = await truth.getTruthCheck({ sessionToken: user.session_token, projectId: project.projectId, checkId: check.check_id });
  assert.equal(done.status, "succeeded");
  assert.equal(done.findings.some((finding) => finding.severity === "red"), true);
  store.close();
  console.log("dashboard truth runner tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
