const { callGeminiJson } = require("../providers/gemini");

const RESEARCH_PROFILE_VERSION = "1.0.0";
const GEMINI_CALLS_PER_SITE = 1;

function buildResearchProfilePrompt(measurement) {
  const homepage = measurement?.homepage || {};
  const signals = measurement?.signals || {};
  const technical = measurement?.technical || {};
  const pages = (measurement?.representativePages || []).map((page) => ({
    url: page.url,
    title: page.metadata?.title || "",
    h1: page.metadata?.h1 || "",
    text_excerpt: String(page.text || "").slice(0, 1200)
  }));
  const evidence = {
    url: measurement?.finalUrl || measurement?.siteUrl,
    detected_site_type: measurement?.siteType,
    title: homepage.metadata?.title || "",
    description: homepage.metadata?.description || "",
    h1: homepage.metadata?.h1 || "",
    language: homepage.metadata?.lang || "",
    text_excerpt: String(homepage.text || "").slice(0, 3500),
    representative_pages: pages,
    observed_structure: {
      title_present: Boolean(signals.title),
      h1_present: Boolean(signals.h1),
      description_present: Boolean(signals.description),
      readable_text_length: Number(signals.textLength) || 0,
      schema_types: technical.schema?.types || [],
      sitemap_status: technical.sitemap?.status || "unknown",
      crawl_method: homepage.fetchMethod || "unknown"
    }
  };

  return [
    "你是研究資料標註員，只能根據提供的網站證據輸出 JSON。",
    "任務是標準化基本資訊、產業分類、網站結構與內容特徵；不是提出優化建議。",
    "不得產出 recommendation、action、improvement、rewrite、expected impact 或任何行銷建議。",
    "證據不足時填 unknown，並降低 confidence；不得從網域名稱猜測。",
    "輸出格式：",
    JSON.stringify({
      entity_name: "string | unknown",
      industry: "string | unknown",
      business_scope: "string | unknown",
      geography: ["string"],
      primary_language: "string | unknown",
      page_purpose: "string | unknown",
      structure_summary: {
        information_architecture: "string | unknown",
        content_format: ["string"],
        schema_types: ["string"],
        js_dependency: "low | medium | high | unknown"
      },
      observed_content_topics: ["string"],
      evidence_basis: ["string"],
      confidence: "low | medium | high"
    }),
    "網站證據：",
    JSON.stringify(evidence)
  ].join("\n");
}

async function buildResearchProfile(measurement, options = {}) {
  const result = await callGeminiJson(buildResearchProfilePrompt(measurement), {
    temperature: 0,
    attempts: options.attempts ?? 2,
    timeoutMs: options.timeoutMs ?? 35_000,
    operation: options.operation || "whitepaper_research_profile"
  });
  assertNoAdviceFields(result.json);
  return {
    profile: normalizeResearchProfile(result.json),
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    latencyMs: result.latencyMs,
    attempts: result.attempts,
    version: RESEARCH_PROFILE_VERSION,
    execution: "direct"
  };
}

async function buildResearchProfileResolved(measurement, options = {}) {
  const mode = String(options.mode || process.env.GEMINI_EXECUTION_MODE || "auto").toLowerCase();
  if (mode === "proxy") return buildResearchProfileViaProxy(measurement, options);
  if (mode === "direct") return buildResearchProfile(measurement, options);
  try {
    return await buildResearchProfile(measurement, options);
  } catch (error) {
    const locationBlocked = /location is not supported/i.test(String(error?.message || ""));
    if (!locationBlocked || !resolveProxyConfig(options).available) throw error;
    return buildResearchProfileViaProxy(measurement, { ...options, fallbackReason: "local_location_not_supported" });
  }
}

async function buildResearchProfileViaProxy(measurement, options = {}) {
  const config = resolveProxyConfig(options);
  if (!config.available) throw new Error("Gemini research proxy is not configured");
  const response = await fetch(`${config.baseUrl}/api/internal/research-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": config.token },
    body: JSON.stringify({ measurement: compactResearchMeasurement(measurement) })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Gemini research proxy error: HTTP ${response.status} ${raw.slice(0, 300)}`);
  const result = JSON.parse(raw);
  assertNoAdviceFields(result.profile);
  return { ...result, execution: options.fallbackReason ? "proxy_fallback" : "proxy", fallbackReason: options.fallbackReason || null };
}

function compactResearchMeasurement(measurement = {}) {
  return {
    siteUrl: measurement.siteUrl,
    finalUrl: measurement.finalUrl,
    siteType: measurement.siteType,
    homepage: {
      metadata: measurement.homepage?.metadata || {},
      text: String(measurement.homepage?.text || "").slice(0, 5000),
      fetchMethod: measurement.homepage?.fetchMethod || "unknown"
    },
    signals: measurement.signals || {},
    technical: { schema: measurement.technical?.schema || {}, sitemap: measurement.technical?.sitemap || {} },
    representativePages: (measurement.representativePages || []).slice(0, 3).map((page) => ({
      url: page.url, metadata: page.metadata || {}, text: String(page.text || "").slice(0, 1500)
    }))
  };
}

function resolveProxyConfig(options = {}) {
  const baseUrl = String(options.proxyUrl || process.env.GEOCHECK_RESEARCH_API_URL || process.env.SITE_ORIGIN || "").replace(/\/+$/, "");
  const token = String(options.proxyToken || process.env.GEOCHECK_RESEARCH_API_TOKEN || process.env.ADMIN_TOKEN || "");
  return { baseUrl, token, available: Boolean(baseUrl && token) };
}

function normalizeResearchProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  return {
    entity_name: textOrUnknown(profile.entity_name),
    industry: textOrUnknown(profile.industry),
    business_scope: textOrUnknown(profile.business_scope),
    geography: stringArray(profile.geography, 8),
    primary_language: textOrUnknown(profile.primary_language),
    page_purpose: textOrUnknown(profile.page_purpose),
    structure_summary: {
      information_architecture: textOrUnknown(profile.structure_summary?.information_architecture),
      content_format: stringArray(profile.structure_summary?.content_format, 10),
      schema_types: stringArray(profile.structure_summary?.schema_types, 12),
      js_dependency: ["low", "medium", "high", "unknown"].includes(profile.structure_summary?.js_dependency)
        ? profile.structure_summary.js_dependency
        : "unknown"
    },
    observed_content_topics: stringArray(profile.observed_content_topics, 12),
    evidence_basis: stringArray(profile.evidence_basis, 10),
    confidence: ["low", "medium", "high"].includes(profile.confidence) ? profile.confidence : "low"
  };
}

function assertNoAdviceFields(value, path = "profile") {
  if (!value || typeof value !== "object") return;
  const forbidden = /(recommend|suggest|improv|action|rewrite|impact|優化|建議|改善|改寫)/i;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) throw new Error(`Gemini research profile contains forbidden advice field: ${path}.${key}`);
    assertNoAdviceFields(child, `${path}.${key}`);
  }
}

function textOrUnknown(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 500) : "unknown";
}

function stringArray(value, limit) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

module.exports = {
  GEMINI_CALLS_PER_SITE,
  RESEARCH_PROFILE_VERSION,
  assertNoAdviceFields,
  buildResearchProfile,
  buildResearchProfilePrompt,
  buildResearchProfileResolved,
  buildResearchProfileViaProxy,
  compactResearchMeasurement,
  normalizeResearchProfile
};
