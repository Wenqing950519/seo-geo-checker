const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const originalFetch = global.fetch;
const old = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  thinking: process.env.DEEPSEEK_THINKING
};
process.env.DEEPSEEK_API_KEY = "test-deepseek";
process.env.DEEPSEEK_BASE_URL = "https://deepseek.example";
process.env.DEEPSEEK_THINKING = "disabled";

const { callDeepSeekJson } = require("../providers/deepseek");

(async () => {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await callDeepSeekJson('{"task":"return json"}', { attempts: 1, timeoutMs: 1000 });
    const payload = JSON.parse(request.options.body);
    assert.equal(request.url, "https://deepseek.example/chat/completions");
    assert.equal(request.options.headers.Authorization, "Bearer test-deepseek");
    assert.deepEqual(payload.response_format, { type: "json_object" });
    assert.deepEqual(payload.thinking, { type: "disabled" });
    assert.equal(payload.temperature, 0);
    assert.deepEqual(result.json, { ok: true });
    assert.equal(result.provider, "deepseek");
    assert.equal(result.modelRelease, "unrecorded");
    assert.equal(result.usage.totalTokens, 16);
    const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.doesNotMatch(serverSource, /\/api\/internal\/(?:query-plan|research-profile)/, "DeepSeek must not retain the retired Gemini proxy routes");
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(old)) {
      const envKey = key === "apiKey" ? "DEEPSEEK_API_KEY" : key === "baseUrl" ? "DEEPSEEK_BASE_URL" : "DEEPSEEK_THINKING";
      if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
    }
  }
  console.log("deepseek provider tests passed");
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
