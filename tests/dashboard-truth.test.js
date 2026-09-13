const assert = require("node:assert/strict");
const { createDashboardService, ENGINE_IDS } = require("../services/api/application/dashboard-service.js");
const { createDashboardTruthService } = require("../services/api/application/dashboard-truth-service.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");
const { createTruthSourceFetcher } = require("../services/api/application/dashboard-truth-source-fetcher.js");

const NOW = "2026-09-13T00:00:00.000Z";
const PEPPER = "dashboard-truth-test-pepper-with-at-least-thirty-two-bytes";

function fixtureFetcher() {
  return createTruthSourceFetcher({
    fetch: async (url) => new Response(`<!doctype html><html><head><title>示範餐廳</title>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org", "@type": "Restaurant", telephone: "02-1234-5678",
        address: { "@type": "PostalAddress", streetAddress: "台北市信義區信義路 1 號" },
        openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday"], opens: "11:00", closes: "21:00" }]
      })}</script></head><body><h1>示範餐廳</h1><p>週一至週二 11:00-21:00</p></body></html>`, {
      status: 200, headers: { "content-type": "text/html; charset=utf-8" }
    })
  });
}

async function dashboardUser(service, email) {
  const invitation = await service.createInvitation({ email });
  return service.verifyInvitation({ token: invitation.invitation_token });
}

async function main() {
  const store = createSqliteDashboardStore();
  const service = createDashboardService({
    store, tokenPepper: PEPPER, now: () => new Date(NOW)
  });
  const truth = createDashboardTruthService({ store, dashboardApi: service, sourceFetcher: fixtureFetcher(), now: () => new Date(NOW) });
  const owner = await dashboardUser(service, "owner@example.com");
  const project = await service.createProject({
    sessionToken: owner.session_token, name: "示範餐廳", siteUrl: "https://brand.example", timezone: "Asia/Taipei"
  });
  assert.equal(project.truthReadiness, "sources_pending");

  const sources = await truth.addTruthSources({
    sessionToken: owner.session_token, projectId: project.projectId,
    sources: [
      { kind: "website", url: "https://brand.example/" },
      { kind: "google_maps", url: "https://maps.google.com/?cid=123" }
    ]
  });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].status, "succeeded");
  assert.equal(sources[0].candidate_fields.phone.value, "02-1234-5678");
  assert.match(sources[0].content_hash, /^[a-f0-9]{64}$/);
  assert.equal(sources[0].raw_html, undefined, "source responses must not expose full HTML");

  const initialBaseline = await truth.getTruthBaseline({ sessionToken: owner.session_token, projectId: project.projectId });
  assert.equal(initialBaseline, null);
  const baseline = await truth.confirmTruthBaseline({
    sessionToken: owner.session_token, projectId: project.projectId,
    fields: {
      address: { value: "台北市信義區信義路 1 號" },
      phone: { value: "02-1234-5678" },
      hours: { value: "週一至週二 11:00-21:00" }
    },
    sourceIds: sources.map((source) => source.source_id)
  });
  assert.equal(baseline.status, "confirmed");
  assert.equal(baseline.version, 1);

  const check = await truth.startTruthCheck({
    sessionToken: owner.session_token, projectId: project.projectId,
    engineIds: ["openai", "perplexity"]
  });
  assert.equal(check.status, "queued");
  assert.deepEqual(check.engine_ids, ["openai", "perplexity"]);

  const completed = await truth.recordTruthCheck({
    checkId: check.check_id,
    results: [
      { engine: "openai", model: "fixture-openai", status: "measured", rawAnswer: "地址是台北市信義區信義路 1 號，電話 02-1234-5678，週一至週二 11:00-21:00。", claims: [
        { field: "address", value: "台北市信義區信義路 1 號", entity_match: "same" },
        { field: "phone", value: "02-1234-5678", entity_match: "same" },
        { field: "hours", value: "週一至週二 11:00-21:00", entity_match: "same" }
      ] },
      { engine: "perplexity", model: "fixture-perplexity", status: "measured", rawAnswer: "電話 02-9999-9999。", claims: [
        { field: "phone", value: "02-9999-9999", entity_match: "same" }
      ] }
    ]
  });
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.findings.some((finding) => finding.severity === "green"), true);
  const red = completed.findings.find((finding) => finding.severity === "red");
  assert.ok(red, "a clear contradiction must be red");
  assert.equal(red.status, "contradiction");
  assert.equal(red.review_status, "pending");
  assert.equal(red.evidence.baseline_version, 1);
  assert.equal(red.evidence.parser_version, "truth-parser-v1");
  assert.equal(Array.isArray(red.evidence.source_snapshots), true);

  const reviewed = await truth.reviewTruthFinding({
    sessionToken: owner.session_token, projectId: project.projectId,
    findingId: red.finding_id, decision: "accepted", reason: "已確認為錯誤電話"
  });
  assert.equal(reviewed.review_status, "accepted");

  const nextBaseline = await truth.confirmTruthBaseline({
    sessionToken: owner.session_token, projectId: project.projectId,
    fields: { address: { value: "台北市信義區信義路 1 號" }, phone: { value: "02-1234-5678" }, hours: { value: "週一至週二 11:00-21:00" } },
    sourceIds: sources.map((source) => source.source_id)
  });
  assert.equal(nextBaseline.version, 2, "a new confirmation must create an immutable baseline version");
  const historical = await truth.getTruthCheck({ sessionToken: owner.session_token, projectId: project.projectId, checkId: check.check_id });
  assert.equal(historical.baseline_version, 1, "historical checks stay bound to their original baseline");

  const viewer = await dashboardUser(service, "viewer@example.com");
  await assert.rejects(
    truth.reviewTruthFinding({ sessionToken: viewer.session_token, projectId: project.projectId, findingId: red.finding_id, decision: "rejected", reason: "no" }),
    (error) => error.code === "project_access_denied"
  );

  assert.deepEqual(ENGINE_IDS, ["openai", "gemini", "anthropic", "perplexity"]);
  store.close();
  console.log("dashboard truth tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
