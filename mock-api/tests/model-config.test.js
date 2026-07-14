const assert = require("node:assert/strict");
const { getGeminiConfig } = require("../providers/gemini");
const { getPerplexityConfig } = require("../providers/perplexity");

const old = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY };
process.env.GEMINI_API_KEY = "test-gemini";
process.env.PERPLEXITY_API_KEY = "test-perplexity";
assert.equal(getGeminiConfig().model, "gemini-3.1-flash-lite");
assert.equal(getPerplexityConfig().model, "sonar");
assert.equal(getPerplexityConfig().endpoint, "/chat/completions");
if (old.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old.GEMINI_API_KEY;
if (old.PERPLEXITY_API_KEY === undefined) delete process.env.PERPLEXITY_API_KEY; else process.env.PERPLEXITY_API_KEY = old.PERPLEXITY_API_KEY;
console.log("model config tests passed");
