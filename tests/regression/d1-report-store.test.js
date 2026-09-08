const assert = require("node:assert/strict");
const {
  buildAuditCacheKey,
  createD1ReportStore
} = require("../../services/api/storage/d1-report-store.js");

const clock = 1_700_000_000_000;
const config = {
  accountId: "account-id",
  databaseId: "database-id",
  apiToken: "token",
  ttlMs: 60_000
};
const report = {
  id: "real_lite_1",
  url: "https://example.com/",
  createdAt: new Date(clock).toISOString(),
  pipelineVersion: "pipeline-v1",
  queryPlanning: { queryPlan: { query_set_version: "dynamic-v1" } },
  audit: { score: { algorithm_version: "ai-trust-1.0.0" }, query_planning: { entity_name: "Example" } },
  homepage: { fetchBlocked: false },
  model: "sonar"
};

const automaticKey = buildAuditCacheKey({
  siteUrl: report.url,
  pipelineVersion: "pipeline-v1"
});
const customKey = buildAuditCacheKey({
  siteUrl: report.url,
  pipelineVersion: "pipeline-v1",
  customQueries: ["題目一", "題目二", "題目三", "題目四"]
});
assert.notEqual(automaticKey, customKey, "custom questions must never reuse an automatic-query report");

async function main() {
const requests = [];
const store = createD1ReportStore({
  config,
  now: () => clock,
  fetch: async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    if (request.sql.startsWith("SELECT report_json")) {
      return Response.json({ success: true, result: [{ success: true, results: [{
        report_json: JSON.stringify(report),
        stored_at: new Date(clock).toISOString(),
        expires_at: new Date(clock + 60_000).toISOString()
      }] }] });
    }
    return Response.json({ success: true, result: [{ success: true, results: [] }] });
  }
});

assert.equal(store.state().enabled, true);
await store.set(automaticKey, report);
const cached = await store.getByCacheKey(automaticKey);
assert.equal(cached.report.id, report.id);
assert.equal(cached.cache.hit, true);
assert.equal(requests[0].sql.includes("INSERT INTO audit_reports"), true);
assert.equal(requests.every((request) => Array.isArray(request.params)), true, "D1 requests must bind parameters rather than interpolate report data");

const disabled = createD1ReportStore({ config: {} });
assert.equal(disabled.state().enabled, false);
assert.equal(await disabled.getByCacheKey(automaticKey), null);

console.log("D1 report-store tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
