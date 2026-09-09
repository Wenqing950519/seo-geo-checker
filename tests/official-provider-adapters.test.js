const assert = require("node:assert/strict");
const { createOfficialProvidersFromEnv, getOfficialProviderReadiness, MAX_PROVIDER_RESPONSE_BYTES } = require("../services/api/application/official-search-providers.js");
const { estimateProviderCost } = require("../services/api/application/provider-costs.js");
const { createD1MeasurementResultStore, MAX_RESULT_BYTES } = require("../services/api/storage/developer-measurement-result-store.js");

const config = { OPENAI_API_KEY: "openai-test-key", GEMINI_API_KEY: "gemini-test-key", ANTHROPIC_API_KEY: "anthropic-test-key", PERPLEXITY_API_KEY: "perplexity-test-key" };

async function main() {
  assert.deepEqual(Object.values(getOfficialProviderReadiness({})).map((entry) => entry.configured), [false, false, false, false]);
  assert.throws(() => createOfficialProvidersFromEnv({ config: {} }), /OPENAI_API_KEY/);
  const calls = [];
  const providers = createOfficialProvidersFromEnv({
    config,
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (url.includes("openai.com")) return Response.json({ id: "resp_openai", model: "gpt-5.6-luna-2026-08-01", output_text: "OpenAI answer", output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "OpenAI answer", annotations: [{ type: "url_citation", url: "https://openai.example/source", title: "OpenAI source" }] }] }], usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } });
      if (url.includes("googleapis.com")) return Response.json({ id: "int_google", model: "gemini-3.5-flash-lite", output_text: "Gemini answer", steps: [{ type: "google_search_call" }, { type: "model_output", content: [{ type: "text", text: "Gemini answer", annotations: [{ type: "url_citation", url: "https://gemini.example/source", title: "Gemini source" }] }] }], usage: { input_tokens: 80, output_tokens: 25, total_tokens: 105, grounding_tool_count: [{ type: "google_search", count: 1 }] } });
      if (url.includes("anthropic.com")) return Response.json({ id: "msg_anthropic", model: "claude-haiku-4-5-20251001", stop_reason: "end_turn", content: [{ type: "web_search_tool_result", content: [] }, { type: "text", text: "Claude answer", citations: [{ type: "web_search_result_location", url: "https://claude.example/source", title: "Claude source" }] }], usage: { input_tokens: 90, output_tokens: 30, server_tool_use: { web_search_requests: 1 } } });
      return Response.json({ id: "pplx_result", model: "sonar", choices: [{ message: { content: "Perplexity answer" } }], citations: ["https://perplexity.example/source"], search_results: [{ url: "https://perplexity.example/source", title: "Perplexity source" }], usage: { prompt_tokens: 70, completion_tokens: 35, total_tokens: 105, num_search_queries: 1, cost: { total_cost: 0.005105 } } });
    }
  });
  const results = await Promise.all(providers.map((provider) => provider.execute({
    prompt: "What is the current answer?",
    maxOutputTokens: 1024,
    maxSearchRequests: 2
  })));
  assert.deepEqual(results.map((result) => result.searchEvidence.executed), [true, true, true, true]);
  assert.deepEqual(results.map((result) => result.citations[0].url), ["https://openai.example/source", "https://gemini.example/source", "https://perplexity.example/source", "https://claude.example/source"]);
  assert.equal(calls.length, 4);
  const [openai, gemini, perplexity, anthropic] = calls;
  assert.equal(openai.body.model, "gpt-5.6-luna"); assert.equal(openai.body.tools[0].type, "web_search"); assert.equal(openai.body.store, false); assert.equal(openai.body.max_output_tokens, 1024); assert.equal(openai.body.max_tool_calls, 2);
  assert.equal(gemini.body.model, "gemini-3.5-flash-lite"); assert.equal(gemini.body.tools[0].type, "google_search"); assert.equal(gemini.body.store, false); assert.equal(gemini.body.generation_config.max_output_tokens, 1024);
  assert.equal(perplexity.body.model, "sonar"); assert.equal(perplexity.body.messages[0].role, "user"); assert.equal(perplexity.body.max_tokens, 1024);
  assert.equal(anthropic.body.model, "claude-haiku-4-5-20251001"); assert.equal(anthropic.body.max_tokens, 1024); assert.equal(anthropic.body.tools[0].type, "web_search_20250305"); assert.equal(anthropic.body.tools[0].max_uses, 2);
  assert.deepEqual(results.map((result) => result.usage.input_tokens), [100, 80, 70, 90]);
  assert.deepEqual(results.map((result) => result.usage.search_requests), [1, 1, 1, 1]);
  assert.equal(results[2].usage.provider_reported_cost_usd, 0.005105);
  assert.equal(results[0].cost.status, "estimated_list_price");
  assert.equal(results[1].cost.status, "estimated_range_free_allowance_unknown");
  assert.equal(results[2].cost.status, "provider_reported");
  assert.equal(results[3].cost.status, "estimated_list_price");
  assert.equal(results[0].nativeEvidence.response_id, "resp_openai");
  assert.equal(results[1].nativeEvidence.response_id, "int_google");
  assert.equal(results[3].nativeEvidence.response_id, "msg_anthropic");
  assert.deepEqual(
    estimateProviderCost("google-web", {
      input_tokens: null,
      output_tokens: null,
      total_tokens: 144,
      search_requests: 3,
      provider_reported_cost_usd: null
    }),
    {
      status: "estimated_range_free_allowance_unknown",
      pricing_version: "2026-09-09",
      estimated_usd: 0.04236,
      estimated_min_usd: 0.0000432,
      estimated_max_usd: 0.04236,
      token_cost_usd: null,
      token_cost_min_usd: 0.0000432,
      token_cost_max_usd: 0.00036,
      search_cost_usd: 0.042
    }
  );
  const oversizedProviders = createOfficialProvidersFromEnv({
    config,
    fetch: async () => new Response(JSON.stringify({ output_text: "x".repeat(MAX_PROVIDER_RESPONSE_BYTES) }))
  });
  await assert.rejects(
    oversizedProviders[0].execute({ prompt: "bounded response" }),
    /response exceeded/
  );
  const d1Calls = [];
  const resultStore = createD1MeasurementResultStore({
    config: { accountId: "account", databaseId: "developer-db", apiToken: "token" },
    fetch: async (_url, options) => {
      const request = JSON.parse(options.body); d1Calls.push(request);
      if (request.sql.startsWith("SELECT")) return Response.json({ success: true, result: [{ success: true, results: [{ result_json: JSON.stringify({ measurement_id: "m1", tenant_id: "t1" }) }] }] });
      return Response.json({ success: true, result: [{ success: true, results: [] }] });
    }
  });
  assert.equal(resultStore.state().enabled, true);
  await resultStore.put({ measurement_id: "m1", tenant_id: "t1", status: "succeeded", created_at: "2026-01-01T00:00:00.000Z", completed_at: "2026-01-01T00:00:01.000Z" });
  assert.match(d1Calls[0].sql, /INSERT INTO developer_measurement_results/);
  assert.deepEqual(await resultStore.get({ tenantId: "t1", measurementId: "m1" }), { measurement_id: "m1", tenant_id: "t1" });
  await assert.rejects(resultStore.put({ measurement_id: "large", tenant_id: "t1", value: "x".repeat(MAX_RESULT_BYTES) }), /exceeds/);
  console.log("official provider adapter and D1 result-store tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
