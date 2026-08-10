const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const old = { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY };
process.env.DEEPSEEK_API_KEY = "deepseek-test";
process.env.OPENAI_API_KEY = "openai-test";
process.env.GEMINI_API_KEY = "gemini-test";
const { callStructuredJson } = require("../providers/structured-router");

(async () => {
  let requests = [];
  global.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).includes("deepseek")) return new Response(JSON.stringify({ error: { message: "busy" } }), { status: 503 });
    return new Response(JSON.stringify({ model: "gpt-5.6-luna", output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true}" }] }], usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } }), { status: 200 });
  };
  try {
    const result = await callStructuredJson('{"task":"json"}', { attempts: 1, timeoutMs: 1000 });
    assert.equal(result.provider, "openai");
    assert.equal(result.fallbackUsed, true);
    assert.deepEqual(result.failedProviders, [{ provider: "deepseek", stage: "deepseek_api" }]);
    assert.equal(requests.length, 2);
    requests = [];
    await assert.rejects(() => callStructuredJson('{"task":"json"}', { allowFallback: false, timeoutMs: 1000 }));
    assert.equal(requests.length, 1);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  console.log("structured router tests passed");
})().catch((error) => { global.fetch = originalFetch; console.error(error); process.exitCode = 1; });
