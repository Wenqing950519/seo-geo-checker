const assert = require("node:assert/strict");
const { getDeepSeekConfig } = require("../providers/deepseek");
const { getPerplexityConfig } = require("../providers/perplexity");

const old = { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY };
process.env.DEEPSEEK_API_KEY = "test-deepseek";
process.env.PERPLEXITY_API_KEY = "test-perplexity";
assert.equal(getDeepSeekConfig().model, "deepseek-v4-flash");
assert.equal(getDeepSeekConfig().modelRelease, "unrecorded");
assert.equal(getPerplexityConfig().model, "sonar");
assert.equal(getPerplexityConfig().endpoint, "/chat/completions");
if (old.DEEPSEEK_API_KEY === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = old.DEEPSEEK_API_KEY;
if (old.PERPLEXITY_API_KEY === undefined) delete process.env.PERPLEXITY_API_KEY; else process.env.PERPLEXITY_API_KEY = old.PERPLEXITY_API_KEY;
console.log("model config tests passed");
