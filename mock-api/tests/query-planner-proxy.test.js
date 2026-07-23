const assert = require("node:assert/strict");
const { buildGeoQueryPlanViaProxy } = require("../lib/query-planner");

const originalFetch = global.fetch;

(async () => {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      status: "ready",
      entity_name: "測試餐廳",
      industry: "餐飲",
      primary_offering: "壽司",
      geography: ["台北"],
      confidence: "high",
      candidates: Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`, text: `台北壽司測試問題${index + 1}？`, intent: index % 2 ? "comparison" : "recommendation" })),
      selectedQueries: [
        { id: "q1", text: "台北壽司餐廳推薦？", intent: "recommendation" },
        { id: "q2", text: "台北壽司套餐比較？", intent: "comparison" }
      ],
      queryPlan: { query_set_version: "dynamic-test", queries: [] },
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
      version: "1.0.0"
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await buildGeoQueryPlanViaProxy({
    siteUrl: "https://example.com/",
    siteType: "restaurant",
    homepage: { metadata: { title: "測試餐廳" }, text: "壽司餐廳內容" },
    representativePages: []
  }, { proxyUrl: "https://geocheck.example", proxyToken: "secret" });

  assert.equal(request.url, "https://geocheck.example/api/internal/query-plan");
  assert.equal(request.options.headers["X-Admin-Token"], "secret");
  assert.equal(result.status, "ready");
  assert.equal(result.execution, "proxy");

  global.fetch = originalFetch;
  console.log("query planner proxy tests passed");
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
