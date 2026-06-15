const { AppError } = require("../lib/errors");

const DEFAULT_BASE_URL = "https://api.search.brave.com/res/v1";

function getBraveConfig({ required = true } = {}) {
  return {
    apiKey: required ? requireEnvAny(["BRAVE_API_KEY", "Brave_API_KEY"]) : getEnvAny(["BRAVE_API_KEY", "Brave_API_KEY"]),
    baseUrl: normalizeBaseUrl(getEnvAny(["BRAVE_SEARCH_BASE_URL", "BRAVE_BASE_URL"]) || DEFAULT_BASE_URL),
    country: getEnvAny(["BRAVE_COUNTRY"]) || "TW",
    searchLang: getEnvAny(["BRAVE_SEARCH_LANG"]) || "zh-hant",
    uiLang: getEnvAny(["BRAVE_UI_LANG"]) || "zh-TW",
    safesearch: getEnvAny(["BRAVE_SAFESEARCH"]) || "moderate"
  };
}

function isBraveConfigured() {
  return Boolean(getEnvAny(["BRAVE_API_KEY", "Brave_API_KEY"]));
}

async function braveWebSearch(query, options = {}) {
  const config = getBraveConfig();
  const started = Date.now();
  const params = new URLSearchParams({
    q: query,
    count: String(clampInteger(options.count ?? 10, 1, 20)),
    country: options.country || config.country,
    search_lang: options.searchLang || config.searchLang,
    ui_lang: options.uiLang || config.uiLang,
    safesearch: options.safesearch || config.safesearch
  });

  if (options.freshness) params.set("freshness", options.freshness);
  if (options.extraSnippets ?? true) params.set("extra_snippets", "true");
  if (options.offset !== undefined) params.set("offset", String(clampInteger(options.offset, 0, 9)));

  const data = await requestBraveJson(`${config.baseUrl}/web/search?${params.toString()}`, {
    apiKey: config.apiKey,
    attempts: options.attempts,
    timeoutMs: options.timeoutMs ?? 20_000
  });

  return {
    provider: "brave",
    type: "web_search",
    query,
    latencyMs: Date.now() - started,
    moreResultsAvailable: Boolean(data.query?.more_results_available),
    results: normalizeWebResults(data.web?.results || [])
  };
}

async function braveLlmContext(query, options = {}) {
  const config = getBraveConfig();
  const started = Date.now();
  const body = {
    q: query,
    country: options.country || config.country,
    search_lang: options.searchLang || config.searchLang,
    count: clampInteger(options.count ?? 10, 1, 50),
    maximum_number_of_urls: clampInteger(options.maximumNumberOfUrls ?? 8, 1, 50),
    maximum_number_of_tokens: clampInteger(options.maximumNumberOfTokens ?? 4096, 1024, 32768),
    maximum_number_of_snippets: clampInteger(options.maximumNumberOfSnippets ?? 24, 1, 100),
    maximum_number_of_tokens_per_url: clampInteger(options.maximumNumberOfTokensPerUrl ?? 1024, 512, 8192),
    maximum_number_of_snippets_per_url: clampInteger(options.maximumNumberOfSnippetsPerUrl ?? 6, 1, 100),
    context_threshold_mode: options.contextThresholdMode || "balanced"
  };

  if (options.freshness) body.freshness = options.freshness;
  if (options.enableLocal !== undefined) body.enable_local = options.enableLocal;
  if (options.goggles) body.goggles = options.goggles;

  const data = await requestBraveJson(`${config.baseUrl}/llm/context`, {
    method: "POST",
    apiKey: config.apiKey,
    body,
    attempts: options.attempts,
    timeoutMs: options.timeoutMs ?? 30_000
  });

  return {
    provider: "brave",
    type: "llm_context",
    query,
    latencyMs: Date.now() - started,
    grounding: data.grounding || {},
    sources: data.sources || {},
    results: normalizeContextResults(data.grounding?.generic || [])
  };
}

async function getBraveAuditContext({ siteUrl, title, description }) {
  if (!isBraveConfigured()) {
    return {
      enabled: false,
      provider: "brave",
      reason: "BRAVE_API_KEY is not configured"
    };
  }

  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  const brandSeed = String(title || "").split(/[|｜\-—–:：]/)[0].trim() || host;
  const query = `site:${host} ${brandSeed} SEO GEO AI search visibility`;

  try {
    const [webResult, contextResult] = await Promise.allSettled([
      braveWebSearch(query, { count: 10, attempts: 1, timeoutMs: 12_000 }),
      braveLlmContext(query, {
        count: 10,
        maximumNumberOfUrls: 8,
        maximumNumberOfTokens: 4096,
        maximumNumberOfTokensPerUrl: 1024,
        contextThresholdMode: "balanced",
        attempts: 1,
        timeoutMs: 18_000
      })
    ]);

    if (webResult.status === "rejected" && contextResult.status === "rejected") {
      throw webResult.reason;
    }

    return {
      enabled: true,
      provider: "brave",
      query,
      targetHost: host,
      brandSeed,
      web: webResult.status === "fulfilled" ? webResult.value : null,
      context: contextResult.status === "fulfilled" ? contextResult.value : null,
      warnings: [
        webResult.status === "rejected" ? formatProviderWarning("web_search", webResult.reason) : null,
        contextResult.status === "rejected" ? formatProviderWarning("llm_context", contextResult.reason) : null
      ].filter(Boolean),
      inputSignals: {
        title: title || "",
        description: description || ""
      }
    };
  } catch (error) {
    const normalized = normalizeBraveError(error);
    return {
      enabled: false,
      provider: "brave",
      query,
      targetHost: host,
      error: {
        message: normalized.message,
        stage: normalized.stage,
        retryable: normalized.retryable,
        details: normalized.details
      }
    };
  }
}

function formatProviderWarning(type, error) {
  const normalized = normalizeBraveError(error);
  return {
    type,
    message: normalized.message,
    stage: normalized.stage,
    retryable: normalized.retryable,
    details: normalized.details
  };
}

async function testBraveProvider() {
  const web = await braveWebSearch("site:example.com example domain", { count: 3, timeoutMs: 20_000 });
  return {
    ok: true,
    provider: "brave",
    message: "search api works",
    latencyMs: web.latencyMs,
    resultCount: web.results.length,
    sample: web.results[0] || null
  };
}

module.exports = {
  braveLlmContext,
  braveWebSearch,
  getBraveAuditContext,
  getBraveConfig,
  isBraveConfigured,
  testBraveProvider
};

async function requestBraveJson(url, options) {
  const attempts = options.attempts ?? 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        method: options.method || "GET",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "Content-Type": "application/json",
          "X-Subscription-Token": options.apiKey
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      }, options.timeoutMs ?? 20_000);

      const raw = await response.text();
      if (!response.ok) {
        throw new AppError(`Brave API error: HTTP ${response.status} ${extractApiError(raw)}`, {
          statusCode: response.status >= 500 || response.status === 429 ? 503 : response.status,
          stage: "brave_api",
          retryable: isRetryableStatus(response.status),
          details: {
            httpStatus: response.status,
            attempt,
            retryAfter: response.headers.get("retry-after") || undefined
          }
        });
      }

      try {
        return JSON.parse(raw);
      } catch {
        throw new AppError("Brave API response was not valid JSON", {
          statusCode: 502,
          stage: "brave_api",
          retryable: true,
          details: { rawPreview: raw.slice(0, 500), attempt }
        });
      }
    } catch (error) {
      lastError = normalizeBraveError(error);
      if (!lastError.retryable || attempt === attempts) break;
      await sleep(retryDelayMs(lastError, attempt));
    }
  }

  throw lastError;
}

function normalizeWebResults(results) {
  return results.slice(0, 20).map((result, index) => ({
    rank: index + 1,
    title: result.title || "",
    url: result.url || "",
    description: result.description || "",
    extraSnippets: Array.isArray(result.extra_snippets) ? result.extra_snippets.slice(0, 5) : []
  }));
}

function normalizeContextResults(results) {
  return results.slice(0, 20).map((result, index) => ({
    rank: index + 1,
    title: result.title || "",
    url: result.url || "",
    snippets: Array.isArray(result.snippets) ? result.snippets.slice(0, 8) : []
  }));
}

function getEnvAny(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

function requireEnvAny(names) {
  const value = getEnvAny(names);
  if (!value) throw new Error(`${names[0]} is not configured`);
  return value;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function extractApiError(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed.error?.message || parsed.message || raw;
  } catch {
    return String(raw).slice(0, 1000);
  }
}

function normalizeBraveError(error) {
  if (error instanceof AppError) return error;
  if (error.name === "AbortError") {
    return new AppError("Brave API request timed out", {
      statusCode: 504,
      stage: "brave_api",
      retryable: true
    });
  }
  if (/BRAVE_API_KEY/.test(error.message)) {
    return new AppError(error.message, {
      statusCode: 500,
      stage: "config",
      retryable: false
    });
  }
  return new AppError(error.message || "Brave API request failed", {
    statusCode: 502,
    stage: "brave_api",
    retryable: true
  });
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryDelayMs(error, attempt) {
  const retryAfter = Number(error.details?.retryAfter);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 15_000);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(750 * 2 ** (attempt - 1) + jitter, 6_000);
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
