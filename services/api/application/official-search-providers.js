const { defineSearchProvider } = require("../ports/search-provider.js");
const { listOfficialEngineProfiles } = require("./official-engine-profiles.js");
const { estimateProviderCost } = require("./provider-costs.js");

const PROVIDER_TIMEOUT_MS = 45_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;

function createOfficialProvidersFromEnv(options = {}) {
  const config = options.config || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  const keys = requiredKeys(config);
  return listOfficialEngineProfiles().map((profile) => createAdapter(profile, keys, fetchImpl));
}

function getOfficialProviderReadiness(config = process.env) {
  const names = {
    "openai-web": "OPENAI_API_KEY",
    "google-web": "GEMINI_API_KEY",
    "perplexity-sonar": "PERPLEXITY_API_KEY",
    "anthropic-web": "ANTHROPIC_API_KEY"
  };
  return Object.fromEntries(Object.entries(names).map(([profileId, env]) => [profileId, {
    env,
    configured: Boolean(String(config[env] || "").trim())
  }]));
}

function requiredKeys(config) {
  const readiness = getOfficialProviderReadiness(config);
  const missing = Object.values(readiness).filter((entry) => !entry.configured).map((entry) => entry.env);
  if (missing.length) {
    const error = new Error(`Official provider mode requires: ${missing.join(", ")}`);
    error.code = "missing_provider_api_keys";
    throw error;
  }
  return {
    openai: String(config.OPENAI_API_KEY).trim(),
    google: String(config.GEMINI_API_KEY).trim(),
    anthropic: String(config.ANTHROPIC_API_KEY).trim(),
    perplexity: String(config.PERPLEXITY_API_KEY).trim()
  };
}

function createAdapter(profile, keys, fetchImpl) {
  const execute = {
    openai: (request) => executeOpenAi(profile, keys.openai, fetchImpl, request),
    google: (request) => executeGemini(profile, keys.google, fetchImpl, request),
    anthropic: (request) => executeAnthropic(profile, keys.anthropic, fetchImpl, request),
    perplexity: (request) => executePerplexity(profile, keys.perplexity, fetchImpl, request)
  }[profile.provider];
  if (!execute) throw new Error(`No official adapter for ${profile.provider}`);
  return defineSearchProvider({ id: profile.id, mode: "official", execute });
}

async function executeOpenAi(profile, apiKey, fetchImpl, request) {
  const maxOutputTokens = optionalPositiveInteger(request.maxOutputTokens, 4_096);
  const maxSearchRequests = optionalPositiveInteger(request.maxSearchRequests, 10);
  const timeoutMs = optionalPositiveInteger(request.timeoutMs, PROVIDER_TIMEOUT_MS) || PROVIDER_TIMEOUT_MS;
  const { body: response, requestId } = await postJson(fetchImpl, "https://api.openai.com/v1/responses", {
    Authorization: `Bearer ${apiKey}`
  }, {
    model: profile.model,
    input: request.prompt,
    tools: [{ type: "web_search" }],
    store: false,
    ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
    ...(maxSearchRequests ? { max_tool_calls: maxSearchRequests } : {})
  }, timeoutMs);
  const answer = String(response.output_text || firstText(response.output) || "").trim();
  const citations = citationsFromOpenAi(response.output);
  const searchRequests = countType(response.output, "web_search_call");
  const usage = normalizeUsage(response.usage, { input: "input_tokens", output: "output_tokens", total: "total_tokens", searchRequests });
  return {
    answer,
    citations,
    searchEvidence: {
      mode: "openai_web_search",
      executed: searchRequests > 0 || citations.length > 0
    },
    usage,
    cost: estimateProviderCost(profile.id, usage),
    nativeEvidence: nativeEvidence(response, requestId, { search_requests: searchRequests })
  };
}

async function executeGemini(profile, apiKey, fetchImpl, request) {
  const maxOutputTokens = optionalPositiveInteger(request.maxOutputTokens, 4_096);
  const timeoutMs = optionalPositiveInteger(request.timeoutMs, PROVIDER_TIMEOUT_MS) || PROVIDER_TIMEOUT_MS;
  const { body: response, requestId } = await postJson(fetchImpl, "https://generativelanguage.googleapis.com/v1beta/interactions", {
    "x-goog-api-key": apiKey
  }, {
    model: profile.model,
    input: request.prompt,
    tools: [{ type: "google_search" }],
    store: false,
    ...(maxOutputTokens ? { generation_config: { max_output_tokens: maxOutputTokens } } : {})
  }, timeoutMs);
  const output = response.output || response;
  const answer = String(response.output_text || firstText(output.content || output.steps || output) || "").trim();
  const citations = citationsFromGemini(output);
  const searchRequests = geminiSearchCount(response, output);
  const usage = normalizeGeminiUsage(response.usage || response.usage_metadata || response.usageMetadata, searchRequests);
  return {
    answer,
    citations,
    searchEvidence: {
      mode: "google_search_grounding",
      executed: searchRequests > 0 || citations.length > 0
    },
    usage,
    cost: estimateProviderCost(profile.id, usage),
    nativeEvidence: nativeEvidence(response, requestId, { search_requests: searchRequests, status: response.status || null })
  };
}

async function executeAnthropic(profile, apiKey, fetchImpl, request) {
  const maxOutputTokens = optionalPositiveInteger(request.maxOutputTokens, 4_096) || 1_024;
  const maxSearchRequests = optionalPositiveInteger(request.maxSearchRequests, 10) || 1;
  const timeoutMs = optionalPositiveInteger(request.timeoutMs, PROVIDER_TIMEOUT_MS) || PROVIDER_TIMEOUT_MS;
  const { body: response, requestId } = await postJson(fetchImpl, "https://api.anthropic.com/v1/messages", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01"
  }, {
    model: profile.model,
    max_tokens: maxOutputTokens,
    messages: [{ role: "user", content: request.prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearchRequests }]
  }, timeoutMs);
  const answer = String(firstText(response.content) || "").trim();
  const citations = citationsFromAnthropic(response.content);
  const searchRequests = finiteCount(response.usage?.server_tool_use?.web_search_requests) ?? countSuccessfulAnthropicSearches(response.content);
  const usage = normalizeUsage(response.usage, { input: "input_tokens", output: "output_tokens", searchRequests });
  return {
    answer,
    citations,
    searchEvidence: {
      mode: "anthropic_web_search",
      executed: searchRequests > 0 || citations.length > 0
    },
    usage,
    cost: estimateProviderCost(profile.id, usage),
    nativeEvidence: nativeEvidence(response, requestId, { search_requests: searchRequests, stop_reason: response.stop_reason || null })
  };
}

async function executePerplexity(profile, apiKey, fetchImpl, request) {
  const maxOutputTokens = optionalPositiveInteger(request.maxOutputTokens, 4_096);
  const timeoutMs = optionalPositiveInteger(request.timeoutMs, PROVIDER_TIMEOUT_MS) || PROVIDER_TIMEOUT_MS;
  const { body: response, requestId } = await postJson(fetchImpl, "https://api.perplexity.ai/v1/sonar", {
    Authorization: `Bearer ${apiKey}`
  }, {
    model: profile.model,
    messages: [{ role: "user", content: request.prompt }],
    ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {})
  }, timeoutMs);
  const answer = String(response.choices?.[0]?.message?.content || "").trim();
  const citations = citationObjects(response.citations, response.search_results);
  const usage = normalizeUsage(response.usage, {
    input: "prompt_tokens",
    output: "completion_tokens",
    total: "total_tokens",
    searchRequests: finiteCount(response.usage?.num_search_queries),
    providerReportedCostUsd: finiteNumber(response.usage?.cost?.total_cost)
  });
  return {
    answer,
    citations,
    searchEvidence: {
      mode: "perplexity_native_search",
      executed: citations.length > 0 || Number(usage.search_requests || 0) > 0
    },
    usage,
    cost: estimateProviderCost(profile.id, usage),
    nativeEvidence: nativeEvidence(response, requestId, { search_requests: usage.search_requests, finish_reason: response.choices?.[0]?.finish_reason || null })
  };
}

async function postJson(fetchImpl, url, headers, body, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const requestId = response.headers.get("x-request-id") || response.headers.get("request-id") || null;
    let json;
    try { json = await readJsonBounded(response, controller); } catch (error) {
      if (error?.code === "provider_response_too_large") throw error;
      json = null;
    }
    if (!response.ok) throw providerHttpError(response.status);
    if (!json || typeof json !== "object") throw providerError("provider_invalid_response", "Provider did not return JSON");
    return { body: json, requestId };
  } catch (error) {
    if (error?.name === "AbortError") throw providerError("provider_timeout", "Provider request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonBounded(response, controller) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_RESPONSE_BYTES) {
    controller.abort();
    throw providerError("provider_response_too_large", "Provider response exceeded the safety limit");
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      controller.abort();
      throw providerError("provider_response_too_large", "Provider response exceeded the safety limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function providerHttpError(status) {
  if (status === 401 || status === 403) return providerError("provider_auth", "Provider authentication failed");
  if (status === 429) return providerError("provider_rate_limited", "Provider rate limited this request");
  if (status >= 500) return providerError("provider_unavailable", "Provider is unavailable");
  return providerError("provider_invalid_response", "Provider rejected the request");
}

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function firstText(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstText(item);
      if (text) return text;
    }
  } else if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.output_text === "string") return value.output_text;
    if (Array.isArray(value.content)) return firstText(value.content);
  }
  return "";
}

function hasOutputType(value, type) {
  return Array.isArray(value) && value.some((item) => item?.type === type);
}

function hasType(value, type) {
  if (Array.isArray(value)) return value.some((item) => hasType(item, type));
  if (value && typeof value === "object") return value.type === type || Object.values(value).some((item) => hasType(item, type));
  return false;
}

function countType(value, type) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countType(item, type), 0);
  if (!value || typeof value !== "object") return 0;
  return (value.type === type ? 1 : 0) + Object.values(value).reduce((sum, item) => sum + countType(item, type), 0);
}

function countSuccessfulAnthropicSearches(content) {
  return (Array.isArray(content) ? content : []).filter((block) => {
    if (block?.type !== "web_search_tool_result") return false;
    return block.content?.type !== "web_search_tool_result_error";
  }).length;
}

function geminiSearchCount(response, output) {
  const usage = response.usage || response.usage_metadata || response.usageMetadata || {};
  const counts = usage.grounding_tool_count || usage.groundingToolCount || [];
  const reported = (Array.isArray(counts) ? counts : []).filter((item) => item?.type === "google_search").reduce((sum, item) => sum + (finiteCount(item.count) || 0), 0);
  return reported || countType(output.steps || output, "google_search_call");
}

function normalizeGeminiUsage(source = {}, searchRequests) {
  return normalizeUsage(source, {
    input: firstExistingKey(source, ["input_tokens", "prompt_token_count", "promptTokenCount"]),
    output: firstExistingKey(source, ["output_tokens", "candidates_token_count", "candidatesTokenCount"]),
    total: firstExistingKey(source, ["total_tokens", "total_token_count", "totalTokenCount"]),
    searchRequests
  }, true);
}

function normalizeUsage(source = {}, mapping = {}, mappingContainsValues = false) {
  const input = mappingContainsValues ? mapping.input : source?.[mapping.input];
  const output = mappingContainsValues ? mapping.output : source?.[mapping.output];
  const total = mappingContainsValues ? mapping.total : source?.[mapping.total];
  const inputTokens = finiteCount(input);
  const outputTokens = finiteCount(output);
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: finiteCount(total) ?? (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null),
    search_requests: finiteCount(mapping.searchRequests),
    provider_reported_cost_usd: finiteNumber(mapping.providerReportedCostUsd)
  };
}

function firstExistingKey(source, keys) {
  for (const key of keys) if (source?.[key] != null) return source[key];
  return null;
}

function nativeEvidence(response, requestId, extra) {
  return {
    response_id: response.id || requestId || null,
    reported_model: response.model || null,
    ...extra
  };
}

function finiteCount(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function optionalPositiveInteger(value, maximum) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > maximum) {
    throw providerError("invalid_budget_limit", `Provider budget limits must be integers from 1 to ${maximum}`);
  }
  return number;
}

function citationsFromOpenAi(output) {
  return citationsFromAnnotations(flattenObjects(output));
}

function citationsFromGemini(output) {
  return citationsFromAnnotations(flattenObjects(output));
}

function citationsFromAnthropic(content) {
  const citations = [];
  for (const block of Array.isArray(content) ? content : []) {
    for (const citation of Array.isArray(block?.citations) ? block.citations : []) {
      if (citation?.url) citations.push({ url: citation.url, title: citation.title || null });
    }
  }
  return dedupeCitations(citations);
}

function citationsFromAnnotations(items) {
  const citations = [];
  for (const item of items) {
    for (const annotation of Array.isArray(item?.annotations) ? item.annotations : []) {
      if (annotation?.url && /citation/i.test(String(annotation.type || "url_citation"))) {
        citations.push({ url: annotation.url, title: annotation.title || null });
      }
    }
  }
  return dedupeCitations(citations);
}

function citationObjects(urls, results) {
  const titles = new Map((Array.isArray(results) ? results : []).map((item) => [item?.url, item?.title || null]));
  return dedupeCitations((Array.isArray(urls) ? urls : []).map((url) => ({ url, title: titles.get(url) || null })));
}

function flattenObjects(value, out = []) {
  if (Array.isArray(value)) value.forEach((item) => flattenObjects(item, out));
  else if (value && typeof value === "object") {
    out.push(value);
    Object.values(value).forEach((item) => flattenObjects(item, out));
  }
  return out;
}

function dedupeCitations(citations) {
  const seen = new Set();
  return citations.filter((citation) => {
    try {
      const url = new URL(citation.url).toString();
      if (seen.has(url)) return false;
      seen.add(url);
      citation.url = url;
      return true;
    } catch { return false; }
  });
}

module.exports = {
  MAX_PROVIDER_RESPONSE_BYTES,
  createOfficialProvidersFromEnv,
  getOfficialProviderReadiness
};
