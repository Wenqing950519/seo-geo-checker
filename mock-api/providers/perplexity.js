const { AppError } = require("../lib/errors");
const { recordAiUsage } = require("../lib/usage-meter");
const { buildDiscoveryQueries } = require("../lib/geo-probes");

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
  const attempts = Math.max(1, Number(options.attempts || 3));
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await request(config, {
        model: config.model,
        messages: [
          { role: "system", content: "Answer only with factual, concise information. Cite available sources. Mark missing evidence as unknown and never infer facts from the domain name alone." },
          { role: "user", content: query }
        ],
        max_tokens: options.maxTokens || 700,
        temperature: 0,
        search_language_filter: ["zh", "en"],
        return_related_questions: false
      }, options.timeoutMs || 30_000);
      const latencyMs = Date.now() - started;
      const usage = normalizeUsage(response.usage);
      recordAiUsage({ provider: "perplexity", model: response.model || config.model, operation: options.operation || "web_search", status: "success", ...usage, latencyMs });
      return {
        enabled: true, provider: "perplexity", model: response.model || config.model, query,
        answer: response.choices?.[0]?.message?.content || "", citations: response.citations || [],
        searchResults: response.search_results || [], usage, latencyMs, attempts: attempt
      };
    } catch (error) {
      lastError = normalizePerplexityError(error);
      if (!lastError.retryable || attempt === attempts) break;
      const retryAfterMs = Number(lastError.details?.retryAfterMs) || 0;
      const baseDelayMs = Math.max(1, Number(options.retryBaseMs || 800));
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs || Math.min(baseDelayMs * 2 ** (attempt - 1), 4000)));
    }
  }

  recordAiUsage({ provider: "perplexity", model: config.model, operation: options.operation || "web_search", status: "error", latencyMs: Date.now() - started, errorStage: lastError?.stage });
  throw lastError;
}
async function getPerplexityGeoEvidence({ siteUrl, title, description, siteType, text }) {
  if (!isPerplexityConfigured()) {
    return { enabled: false, provider: "perplexity", reason: "PERPLEXITY_API_KEY is not configured", authority: { enabled: false }, discovery: [] };
  }
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  const plan = buildDiscoveryQueries({ siteType, text });
  const authorityQuery = "Verify the exact entity represented by website " + host + " (title: " + (title || "unknown") + "). Find only public sources that clearly refer to this exact website or brand. Exclude similarly named but unrelated entities. Return unknown if entity alignment cannot be verified. Cite every retained source. Start with exactly ALIASES: name1 | name2 using only names supported by the official site or corroborating sources; otherwise write ALIASES: UNKNOWN.";
  const tasks = [
    safeGeoSearch(authorityQuery, { operation: "geo_authority", maxTokens: 260 }),
    ...plan.queries.map((query, index) => safeGeoSearch(query, { operation: "geo_discovery_" + (index + 1), maxTokens: 260 }))
  ];
  const [authority, ...discovery] = await Promise.all(tasks);
  return {
    enabled: authority.enabled || discovery.some((item) => item.enabled),
    provider: "perplexity",
    plan,
    authority,
    discovery
  };
}

async function safeGeoSearch(query, options) {
  try {
    return await searchPerplexity(query, { ...options, attempts: 2, timeoutMs: 30_000 });
  } catch (error) {
    const normalized = normalizePerplexityError(error);
    return { enabled: false, provider: "perplexity", query, error: { message: normalized.message, stage: normalized.stage, retryable: normalized.retryable } };
  }
}

async function getPerplexityAuditContext({ siteUrl, title, description }) {
  if (!isPerplexityConfigured()) return { enabled: false, provider: "perplexity", reason: "PERPLEXITY_API_KEY is not configured" };
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  const query = "For the Taiwan business website " + host + ", find only publicly verifiable brand, service, location, reputation and citation context. Site title: " + (title || "unknown") + ". Description: " + (description || "unknown") + ". Return unknown when reliable public evidence is unavailable.";
  try { return await searchPerplexity(query, { operation: "site_context", maxTokens: 360, attempts: 3, timeoutMs: 30_000 }); } catch (error) {
    const normalized = normalizePerplexityError(error);
    return { enabled: false, provider: "perplexity", query, error: { message: normalized.message, stage: normalized.stage, retryable: normalized.retryable, details: normalized.details } };
  }
}

async function testPerplexityProvider() {
  return searchPerplexity("In one Traditional Chinese sentence, describe a factual SEO/GEO check for a Taiwan small-business website.", { maxTokens: 80, timeoutMs: 20_000, attempts: 2, operation: "provider_test" });
}

function normalizeUsage(usage = {}) { return { inputTokens: Number(usage.prompt_tokens || usage.input_tokens) || 0, outputTokens: Number(usage.completion_tokens || usage.output_tokens) || 0, totalTokens: Number(usage.total_tokens) || 0 }; }
function isPerplexityConfigured() { return Boolean(process.env.PERPLEXITY_API_KEY); }
function requireEnv(name) { if (!process.env[name]) throw new Error(name + " is not configured"); return process.env[name]; }
async function request(config, payload, timeoutMs) {
  const response = await fetchWithTimeout(config.baseUrl + config.endpoint, { method: "POST", headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(payload) }, timeoutMs);
  const raw = await response.text();
  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    throw new AppError("Perplexity API error: HTTP " + response.status + " " + extractApiError(raw), {
      statusCode: response.status >= 500 || response.status === 429 ? 503 : response.status,
      stage: "perplexity_api", retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      details: { httpStatus: response.status, retryAfterMs: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0 }
    });
  }
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

module.exports = { getPerplexityAuditContext, getPerplexityConfig, getPerplexityGeoEvidence, isPerplexityConfigured, searchPerplexity, testPerplexityProvider };
