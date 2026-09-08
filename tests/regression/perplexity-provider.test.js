const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.PERPLEXITY_API_KEY = "test-key";
process.env.PERPLEXITY_MODEL = "sonar";
process.env.PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
process.env.PERPLEXITY_ENDPOINT = "/chat/completions";
process.env.PERPLEXITY_MIN_INTERVAL_MS = "0";

const ledger = path.resolve(__dirname, "../../mock-api/usage-events.jsonl");
const backup = fs.existsSync(ledger) ? fs.readFileSync(ledger) : null;
const originalFetch = global.fetch;
const { getPerplexityGeoEvidence, searchPerplexity } = require("../../packages/ai-providers/perplexity.js");

(async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429, headers: { "retry-after": "0" } });
    return new Response(JSON.stringify({
      model: "sonar",
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await searchPerplexity("test", { attempts: 2, retryBaseMs: 1, timeoutMs: 1000, operation: "test_retry" });
  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.usage.totalTokens, 15);

  calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "invalid request" } }), { status: 422 });
  };
  await assert.rejects(() => searchPerplexity("bad", { attempts: 3, retryBaseMs: 1, timeoutMs: 1000, operation: "test_no_retry" }), /HTTP 422/);
  assert.equal(calls, 1, "non-retryable 422 must not be retried");

  calls = 0;
  let activeCalls = 0;
  let maxActiveCalls = 0;
  global.fetch = async () => {
    calls += 1;
    activeCalls += 1;
    maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeCalls -= 1;
    return new Response(JSON.stringify({
      model: "sonar",
      choices: [{ message: { content: "ok" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await Promise.all([
    searchPerplexity("parallel-a", { attempts: 1, minIntervalMs: 0, timeoutMs: 1000, operation: "test_queue_a" }),
    searchPerplexity("parallel-b", { attempts: 1, minIntervalMs: 0, timeoutMs: 1000, operation: "test_queue_b" })
  ]);
  assert.equal(calls, 2);
  assert.equal(maxActiveCalls, 1, "shared queue must serialize requests from concurrent callers");

  calls = 0;
  activeCalls = 0;
  maxActiveCalls = 0;
  const requestedQueries = [];
  global.fetch = async (_url, options) => {
    calls += 1;
    activeCalls += 1;
    maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
    requestedQueries.push(JSON.parse(options.body).messages[1].content);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeCalls -= 1;
    return new Response(JSON.stringify({
      model: "sonar",
      choices: [{ message: { content: "Example Service" } }],
      citations: ["https://example.com/"],
      search_results: [{ title: "Example Service", snippet: "Example Service Taiwan", url: "https://example.com/" }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const evidence = await getPerplexityGeoEvidence({
    siteUrl: "https://example.com/", title: "Example Service", description: "Taipei service", siteType: "local_service", text: "Taipei local service repair quote",
    queryPlan: {
      query_set_version: "test-v1",
      queries: [
        { id: "q1", text: "台北居家維修服務推薦？", intent: "recommendation" },
        { id: "q2", text: "台北居家維修報價怎麼比較？", intent: "comparison" }
      ]
    }
  });
  assert.equal(calls, 3, "GEO evidence should use one entity query and two discovery queries");
  assert.equal(maxActiveCalls, 1, "GEO evidence requests must be serialized to avoid Perplexity bursts");
  assert.match(requestedQueries[0], /Verify the exact entity/);
  assert.deepEqual(requestedQueries.slice(1), ["台北居家維修服務推薦？", "台北居家維修報價怎麼比較？"]);
  assert.equal(evidence.authority.enabled, true);
  assert.equal(evidence.discovery.length, 2);
  assert.equal(evidence.discovery.every((item) => item.enabled), true);
  assert.deepEqual(evidence.discovery.map((item) => item.queryIntent), ["recommendation", "comparison"]);

  calls = 0;
  const rejected = await getPerplexityGeoEvidence({
    siteUrl: "https://example.com/", title: "Example Service", description: "Taipei service", siteType: "local_service", text: "Taipei local service repair quote"
  });
  assert.equal(calls, 0, "Perplexity must not run without a validated query plan");
  assert.equal(rejected.enabled, false);
  assert.match(rejected.reason, /validated DeepSeek or human-reviewed query plan/);

  global.fetch = originalFetch;
  fs.rmSync(ledger, { force: true });
  if (backup) fs.writeFileSync(ledger, backup);
  console.log("perplexity provider tests passed");
})().catch((error) => {
  global.fetch = originalFetch;
  fs.rmSync(ledger, { force: true });
  if (backup) fs.writeFileSync(ledger, backup);
  console.error(error);
  process.exitCode = 1;
});
