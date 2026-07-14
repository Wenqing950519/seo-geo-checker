const { AppError } = require("../lib/errors");
const { recordAiUsage } = require("../lib/usage-meter");

const DEFAULT_BASE_URL = "https://api.perplexity.ai";
const DEFAULT_MODEL = "sonar";

function getPerplexityConfig() {
  return {
    apiKey: requireEnv("PERPLEXITY_API_KEY"),
    model: process.env.PERPLEXITY_MODEL || DEFAULT_MODEL,
    baseUrl: String(process.env.PERPLEXITY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    endpoint: process.env.PERPLEXITY_ENDPOINT || "/chat/completions"
  };
}

async function searchPerplexity(query, options = {}) {
  let config;
  try { config = getPerplexityConfig(); } catch (error) { throw normalizePerplexityError(error); }
  const started = Date.now();
  try {
    const response = await request(config, {
      model: config.model,
      messages: [
        { role: "system", content: "Answer only with factual, concise information. Cite available sources. Do not invent missing facts." },
        { role: "user", content: query }
      ],
      max_tokens: options.maxTokens || 700,
      temperature: 0,
      search_language_filter: ["zh", "en"],
      return_related_questions: false
    }, options.timeoutMs || 25_000);
    const latencyMs = Date.now() - started;
    const usage = normalizeUsage(response.usage);
    recordAiUsage({ provider: "perplexity", model: response.model || config.model, operation: options.operation || "web_search", status: "success", ...usage, latencyMs });
    return {
      enabled: true, provider: "perplexity", model: response.model || config.model, query,
      answer: response.choices?.[0]?.message?.content || "", citations: response.citations || [],
      searchResults: response.search_results || [], usage, latencyMs
    };
  } catch (error) {
    const normalized = normalizePerplexityError(error);
    recordAiUsage({ provider: "perplexity", model: config.model, operation: options.operation || "web_search", status: "error", latencyMs: Date.now() - started, errorStage: normalized.stage });
    throw normalized;
  }
}

async function getPerplexityAuditContext({ siteUrl, title, description }) {
  if (!isPerplexityConfigured()) return { enabled: false, provider: "perplexity", reason: "PERPLEXITY_API_KEY is not configured" };
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  const query = "For the Taiwan website " + host + ", identify publicly verifiable brand, service, location and citation context. Site title: " + (title || "unknown") + ". Description: " + (description || "unknown") + ". Mark unknown information as unknown.";
  try { return await searchPerplexity(query, { operation: "site_context" }); } catch (error) {
    const normalized = normalizePerplexityError(error);
    return { enabled: false, provider: "perplexity", query, error: { message: normalized.message, stage: normalized.stage, retryable: normalized.retryable, details: normalized.details } };
  }
}

async function testPerplexityProvider() {
  return searchPerplexity("In one Traditional Chinese sentence, describe a factual SEO/GEO check for a Taiwan restaurant website.", { maxTokens: 80, timeoutMs: 20_000, operation: "provider_test" });
}

function normalizeUsage(usage = {}) { return { inputTokens: Number(usage.prompt_tokens || usage.input_tokens) || 0, outputTokens: Number(usage.completion_tokens || usage.output_tokens) || 0, totalTokens: Number(usage.total_tokens) || 0 }; }
function isPerplexityConfigured() { return Boolean(process.env.PERPLEXITY_API_KEY); }
function requireEnv(name) { if (!process.env[name]) throw new Error(name + " is not configured"); return process.env[name]; }
async function request(config, payload, timeoutMs) {
  const response = await fetchWithTimeout(config.baseUrl + config.endpoint, { method: "POST", headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(payload) }, timeoutMs);
  const raw = await response.text();
  if (!response.ok) throw new AppError("Perplexity API error: HTTP " + response.status + " " + extractApiError(raw), { statusCode: response.status >= 500 || response.status === 429 ? 503 : response.status, stage: "perplexity_api", retryable: response.status === 408 || response.status === 429 || response.status >= 500, details: { httpStatus: response.status } });
  try { return JSON.parse(raw); } catch { throw new AppError("Perplexity response was not valid JSON", { statusCode: 502, stage: "perplexity_api", retryable: true }); }
}
function extractApiError(raw) { try { const data = JSON.parse(raw); return data.error?.message || data.message || raw; } catch { return String(raw).slice(0, 500); } }
function normalizePerplexityError(error) {
  if (error instanceof AppError) return error;
  if (error.name === "AbortError") return new AppError("Perplexity API request timed out", { statusCode: 504, stage: "perplexity_api", retryable: true });
  if (/PERPLEXITY_API_KEY/.test(error.message || "")) return new AppError(error.message, { statusCode: 500, stage: "config", retryable: false });
  return new AppError(error.message || "Perplexity API request failed", { statusCode: 502, stage: "perplexity_api", retryable: true });
}
function fetchWithTimeout(url, options, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer)); }

module.exports = { getPerplexityAuditContext, getPerplexityConfig, isPerplexityConfigured, searchPerplexity, testPerplexityProvider };
