const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createD1DashboardStore } = require("../services/api/storage/dashboard-d1-store.js");
const { createDashboardService } = require("../services/api/application/dashboard-service.js");
const { createDashboardTruthService } = require("../services/api/application/dashboard-truth-service.js");

const ROOT = path.resolve(__dirname, "..");

function createStore() {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(ROOT, "services/cloudflare/dashboard/migrations");
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  const run = (sql, params) => ({ success: true, results: db.prepare(sql).all(...params), meta: { changes: Number(db.prepare("SELECT changes() AS c").get().c) } });
  return { db, store: createD1DashboardStore({ execute: async (payload) => Array.isArray(payload.batch) ? payload.batch.map(({ sql, params }) => run(sql, params)) : [run(payload.sql, payload.params)] }) };
}

async function main() {
  const { store } = createStore();
  const dashboard = createDashboardService({ store, tokenPepper: "d1-truth-test-pepper-with-at-least-thirty-two-bytes", now: () => new Date("2026-09-13T00:00:00Z") });
  const invitation = await dashboard.createInvitation({ email: "d1-truth@example.com" });
  const user = await dashboard.verifyInvitation({ token: invitation.invitation_token });
  const project = await dashboard.createProject({ sessionToken: user.session_token, name: "D1 Truth", siteUrl: "https://d1.example", timezone: "Asia/Taipei" });
  const truth = createDashboardTruthService({
    store, dashboardApi: dashboard,
    sourceFetcher: { fetchSource: async (source) => ({ canonicalUrl: source.url, status: "partial", fetchedAt: "2026-09-13T00:00:00Z", contentHash: "b".repeat(64), metadata: {}, snippets: [], candidateFields: {} }) },
    now: () => new Date("2026-09-13T00:00:00Z")
  });
  const sources = await truth.addTruthSources({ sessionToken: user.session_token, projectId: project.projectId, sources: [{ kind: "website", url: "https://d1.example" }] });
  assert.equal(sources[0].status, "partial");
  const baseline = await truth.confirmTruthBaseline({ sessionToken: user.session_token, projectId: project.projectId, fields: { address: "台北市信義區 1 號" }, sourceIds: [sources[0].source_id] });
  assert.equal(baseline.version, 1);
  const check = await truth.startTruthCheck({ sessionToken: user.session_token, projectId: project.projectId, engineIds: ["gemini"] });
  assert.equal(check.status, "queued");
  assert.equal((await store.getTruthCheck(check.check_id)).engineIds[0], "gemini");
  console.log("dashboard truth D1 store tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
