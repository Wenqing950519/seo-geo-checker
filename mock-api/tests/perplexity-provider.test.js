const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.PERPLEXITY_API_KEY = "test-key";
process.env.PERPLEXITY_MODEL = "sonar";
process.env.PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
process.env.PERPLEXITY_ENDPOINT = "/chat/completions";

const ledger = path.resolve(__dirname, "..", "usage-events.jsonl");
const backup = fs.existsSync(ledger) ? fs.readFileSync(ledger) : null;
const originalFetch = global.fetch;
const { getPerplexityGeoEvidence, searchPerplexity } = require("../providers/perplexity");

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
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      model: "sonar",
      choices: [{ message: { content: "Example Service" } }],
      citations: ["https://example.com/"],
      search_results: [{ title: "Example Service", snippet: "Example Service Taiwan", url: "https://example.com/" }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const evidence = await getPerplexityGeoEvidence({
    siteUrl: "https://example.com/", title: "Example Service", description: "Taipei service", siteType: "local_service", text: "Taipei local service repair quote"
  });
  assert.equal(calls, 3, "GEO evidence should use one entity query and two discovery queries");
  assert.equal(evidence.authority.enabled, true);
  assert.equal(evidence.discovery.length, 2);
  assert.equal(evidence.discovery.every((item) => item.enabled), true);

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
