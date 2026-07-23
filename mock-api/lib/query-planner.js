const { callGeminiJson } = require("../providers/gemini");

const QUERY_PLANNER_VERSION = "1.2.0";
const CANDIDATE_QUERY_MIN = 5;
const CANDIDATE_QUERY_MAX = 8;
const SELECTED_QUERY_COUNT = 2;

function buildGeoQueryPlanPrompt({ siteUrl, homepage = {}, representativePages = [], siteType = "organization" } = {}) {
  const metadata = homepage.metadata || {};
  const evidence = {
    url: siteUrl,
    rule_based_site_type_hint: siteType,
    title: metadata.title || "",
    description: metadata.description || "",
    h1: metadata.h1 || "",
    language: metadata.lang || "",
    homepage_text_excerpt: String(homepage.text || "").slice(0, 5000),
    representative_pages: representativePages.slice(0, 3).map((page) => ({
      url: page.url,
      title: page.metadata?.title || "",
      h1: page.metadata?.h1 || "",
      text_excerpt: String(page.text || "").slice(0, 1600)
    }))
  };

  return [
    "你是台灣消費者搜尋意圖研究員。只輸出有效 JSON。",
    "先根據頁面證據辨識網站實體、主要產業、核心商品或服務、服務地區與目標顧客，再設計非品牌搜尋問題。",
    "rule_based_site_type_hint 只是低信任提示；若與頁面主要內容衝突，必須以頁面證據為準。",
    "產生 5 到 8 個候選問題，模擬尚未決定品牌的台灣消費者會實際詢問 AI 的方式。",
    "問題不得出現網站品牌、公司名、網域、指定競品、SEO、GEO、網站設計、列出來源、附上來源或要求回答者列出特定網站，除非網站本業確實是網站設計。",
    "問題必須具備商業意圖，並涵蓋 recommendation、comparison、decision 至少兩種不同意圖；不得把網站頁尾製作商、技術供應商或網站模板文字誤認為本業。consumer_relevance 與 evidence_fit 使用 1–5 整數，5 代表高度符合；不要把 schema 範例值當成固定答案。",
    "不要捏造地址、價格、評價、獎項或服務。證據不足時使用台灣作為地區，並降低 confidence。",
    "同時輸出簡短定位解讀；不要提出優化建議，因為後端會用規則產生建議。",
    "JSON 格式：",
    JSON.stringify({
      entity_name: "string | unknown",
      industry: "string | unknown",
      primary_offering: "string | unknown",
      topic_terms: ["2 到 12 字的產業核心詞"],
      geography: ["string"],
      target_audience: ["string"],
      evidence_basis: ["string"],
      confidence: "low | medium | high",
      positioning: {
        perceived_category_zh: "string | unknown",
        perceived_audience_zh: ["string"],
        perceived_use_cases_zh: ["string"],
        misunderstandings_or_risks_zh: ["string"],
        missing_signals_zh: ["string"]
      },
      query_candidates: [{
        id: "candidate_1",
        text: "繁體中文非品牌問題",
        intent: "recommendation | comparison | decision",
        consumer_relevance: 5,
        evidence_fit: 5,
        rationale_zh: "為何這題符合該產業與顧客意圖"
      }]
    }),
    "網站抓取證據：",
    JSON.stringify(evidence)
  ].join("\n");
}

async function buildGeoQueryPlan(input, options = {}) {
  const result = await callGeminiJson(buildGeoQueryPlanPrompt(input), {
    temperature: 0,
    attempts: options.attempts ?? 2,
    timeoutMs: options.timeoutMs ?? 35_000,
    operation: options.operation || "geo_query_planning"
  });
  const normalized = normalizeGeoQueryPlan(result.json, input);
  return {
    ...normalized,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    latencyMs: result.latencyMs,
    attempts: result.attempts,
    version: QUERY_PLANNER_VERSION,
    source: "gemini_dynamic"
  };
}

async function buildGeoQueryPlanResolved(input, options = {}) {
  const mode = String(options.mode || process.env.GEMINI_EXECUTION_MODE || "auto").toLowerCase();
  if (mode === "proxy") return buildGeoQueryPlanViaProxy(input, options);
  if (mode === "direct") return buildGeoQueryPlan(input, options);
  try {
    return await buildGeoQueryPlan(input, options);
  } catch (error) {
    const locationBlocked = /location is not supported/i.test(String(error?.message || ""));
    if (!locationBlocked || !resolveProxyConfig(options).available) throw error;
    return buildGeoQueryPlanViaProxy(input, { ...options, fallbackReason: "local_location_not_supported" });
  }
}

async function buildGeoQueryPlanViaProxy(input, options = {}) {
  const config = resolveProxyConfig(options);
  if (!config.available) throw new Error("Gemini query-planning proxy is not configured");
  const response = await fetch(`${config.baseUrl}/api/internal/query-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": config.token },
    body: JSON.stringify({ input: compactQueryPlanningInput(input) })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Gemini query-planning proxy error: HTTP ${response.status} ${raw.slice(0, 300)}`);
  const result = JSON.parse(raw);
  return { ...result, source: "gemini_dynamic", execution: options.fallbackReason ? "proxy_fallback" : "proxy", fallbackReason: options.fallbackReason || null };
}

function compactQueryPlanningInput(input = {}) {
  return {
    siteUrl: input.siteUrl,
    siteType: input.siteType,
    homepage: {
      metadata: input.homepage?.metadata || {},
      text: String(input.homepage?.text || "").slice(0, 6000),
      fetchMethod: input.homepage?.fetchMethod || "unknown"
    },
    representativePages: (input.representativePages || []).slice(0, 3).map((page) => ({
      url: page.url,
      metadata: page.metadata || {},
      text: String(page.text || "").slice(0, 1800)
    }))
  };
}

function resolveProxyConfig(options = {}) {
  const baseUrl = String(options.proxyUrl || process.env.GEOCHECK_RESEARCH_API_URL || process.env.SITE_ORIGIN || "").replace(/\/+$/, "");
  const token = String(options.proxyToken || process.env.GEOCHECK_RESEARCH_API_TOKEN || process.env.ADMIN_TOKEN || "");
  return { baseUrl, token, available: Boolean(baseUrl && token) };
}

function normalizeGeoQueryPlan(value, input = {}) {
  const raw = value && typeof value === "object" ? value : {};
  const entityName = cleanText(raw.entity_name, 160) || "unknown";
  const industry = cleanText(raw.industry, 160) || "unknown";
  const primaryOffering = cleanText(raw.primary_offering, 240) || "unknown";
  const confidence = normalizeConfidence(raw.confidence);
  const topicTerms = normalizeTopicTerms(raw.topic_terms);
  const forbiddenTerms = buildForbiddenTerms({
    entityName,
    siteUrl: input.siteUrl,
    title: input.homepage?.metadata?.title,
    h1: input.homepage?.metadata?.h1
  });
  const allowWebsiteDesign = /網站設計|網頁設計|web\s*design/i.test([industry, primaryOffering].join(" "));
  const candidates = (Array.isArray(raw.query_candidates) ? raw.query_candidates : [])
    .map((candidate, index) => normalizeCandidate(candidate, index, forbiddenTerms, topicTerms, allowWebsiteDesign))
    .filter(Boolean)
    .slice(0, CANDIDATE_QUERY_MAX);
  const selectedQueries = selectRepresentativeQueries(candidates);
  const classificationReady = industry !== "unknown" && primaryOffering !== "unknown" && confidence !== "low" && topicTerms.length >= 2;
  const ready = classificationReady && candidates.length >= CANDIDATE_QUERY_MIN && selectedQueries.length === SELECTED_QUERY_COUNT;

  return {
    status: ready ? "ready" : "invalid",
    reason: ready ? null : "Gemini 未產出足夠且通過品牌、產業與搜尋意圖檢查的候選問題",
    entity_name: entityName,
    industry,
    primary_offering: primaryOffering,
    topic_terms: topicTerms,
    geography: stringArray(raw.geography, 8),
    target_audience: stringArray(raw.target_audience, 8),
    evidence_basis: stringArray(raw.evidence_basis, 10),
    confidence,
    positioning: normalizePositioning(raw.positioning, raw.confidence),
    candidates,
    selectedQueries,
    queryPlan: ready ? {
      query_set_version: `dynamic-gemini-${QUERY_PLANNER_VERSION}`,
      queries: selectedQueries.map(({ id, text, intent }) => ({ id, text, intent }))
    } : null
  };
}

function normalizeReviewedQueryPlan(value) {
  const approved = String(value?.review_status || "").toLowerCase() === "approved" && String(value?.reviewed_by || "").trim() && String(value?.reviewed_at || "").trim();
  const queries = (Array.isArray(value?.queries) ? value.queries : [])
    .map((query, index) => {
      const text = cleanQuestion(query?.text ?? query);
      if (!text) return null;
      return {
        id: cleanText(query?.id, 80) || `reviewed_${index + 1}`,
        text,
        intent: normalizeIntent(query?.intent),
        consumer_relevance: 5,
        evidence_fit: 5,
        rationale_zh: "人工審核並凍結的研究題目"
      };
    })
    .filter(Boolean);
  const ready = Boolean(approved) && queries.length >= SELECTED_QUERY_COUNT;
  const selectedQueries = queries.slice(0, Math.max(SELECTED_QUERY_COUNT, queries.length));
  return {
    status: ready ? "ready" : "invalid",
    reason: ready ? null : "人工題庫必須標記 approved、記錄審核者與日期，且至少有兩題有效的非品牌搜尋問題",
    entity_name: "unknown",
    industry: cleanText(value?.industry, 160) || "unknown",
    primary_offering: "unknown",
    topic_terms: [],
    geography: [],
    target_audience: [],
    evidence_basis: ["人工審核凍結題庫"],
    confidence: ready ? "high" : "low",
    positioning: normalizePositioning({}, ready ? "high" : "low"),
    candidates: selectedQueries,
    selectedQueries,
    queryPlan: ready ? {
      query_set_version: cleanText(value?.query_set_version, 120) || "reviewed-custom",
      queries: selectedQueries.map(({ id, text, intent }) => ({ id, text, intent }))
    } : null,
    provider: "human_reviewed",
    model: "frozen-query-set",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    latencyMs: 0,
    attempts: 0,
    version: QUERY_PLANNER_VERSION,
    source: "human_reviewed_frozen"
  };
}

function normalizeCandidate(value, index, forbiddenTerms, topicTerms, allowWebsiteDesign = false) {
  if (!value || typeof value !== "object") return null;
  const text = cleanQuestion(value.text);
  if (!text || containsForbiddenTerm(text, forbiddenTerms) || containsMetaSearchInstruction(text, allowWebsiteDesign)) return null;
  if (!topicTerms.some((term) => normalizeComparable(text).includes(term))) return null;
  // 模型自評只用來排序，不能作為刪題條件；可驗證的品牌、主題、意圖與重複度規則才負責放行。
  const consumerRelevance = Math.max(3, boundedRating(value.consumer_relevance));
  const evidenceFit = Math.max(3, boundedRating(value.evidence_fit));
  return {
    id: cleanText(value.id, 80) || `candidate_${index + 1}`,
    text,
    intent: normalizeIntent(value.intent),
    consumer_relevance: consumerRelevance,
    evidence_fit: evidenceFit,
    rationale_zh: cleanText(value.rationale_zh, 300)
  };
}

function selectRepresentativeQueries(candidates) {
  const ranked = [...candidates].sort((a, b) =>
    (b.consumer_relevance + b.evidence_fit) - (a.consumer_relevance + a.evidence_fit)
  );
  const selected = [];
  for (const candidate of ranked) {
    if (selected.some((item) => querySimilarity(item.text, candidate.text) >= 0.72)) continue;
    if (selected.length === 1 && selected[0].intent === candidate.intent) continue;
    selected.push(candidate);
    if (selected.length === SELECTED_QUERY_COUNT) break;
  }
  if (selected.length < SELECTED_QUERY_COUNT) {
    for (const candidate of ranked) {
      if (selected.includes(candidate)) continue;
      if (selected.some((item) => querySimilarity(item.text, candidate.text) >= 0.72)) continue;
      selected.push(candidate);
      if (selected.length === SELECTED_QUERY_COUNT) break;
    }
  }
  return selected;
}

function buildForbiddenTerms({ entityName, siteUrl, title, h1 }) {
  const host = safeHostname(siteUrl);
  const values = [entityName, host, host.split(".")[0]];
  const titleBrand = cleanText(title, 200).split(/[|｜—–:：\-]/)[0]?.trim();
  const h1Brand = cleanText(h1, 80);
  for (const value of [titleBrand, h1Brand]) {
    if (value && value.length >= 2 && value.length <= 40) values.push(value);
  }
  return [...new Set(values.map((value) => normalizeComparable(value)).filter((value) => {
    if (!value || value === "unknown") return false;
    return /[\u3400-\u9fff]/.test(value) ? value.length >= 2 : value.length >= 3;
  }))];
}

function normalizeTopicTerms(value) {
  const generic = new Set(["服務", "品牌", "公司", "商家", "產品", "台灣", "臺灣", "推薦", "比較"]);
  return [...new Set((Array.isArray(value) ? value : [])
    .map(normalizeComparable)
    .filter((term) => {
      if (!term || generic.has(term)) return false;
      return /[㐀-鿿]/.test(term) ? term.length >= 2 : term.length >= 3;
    }))].slice(0, 10);
}

function containsForbiddenTerm(text, forbiddenTerms) {
  const normalized = normalizeComparable(text);
  return forbiddenTerms.some((term) => normalized.includes(term));
}

function containsMetaSearchInstruction(text, allowWebsiteDesign = false) {
  if (/附上(?:可核對的)?來源|列出(?:具體)?(?:品牌|商家|網站)|\bseo\b|\bgeo\b/i.test(text)) return true;
  return !allowWebsiteDesign && /網站設計|網頁設計/i.test(text);
}

function cleanQuestion(value) {
  let text = cleanText(value, 100);
  if (!text || text.length < 8) return "";
  text = text.replace(/[。！!]+$/, "");
  if (!/[？?]$/.test(text)) text += "？";
  return text;
}

function normalizePositioning(value = {}, confidence = "low") {
  return {
    perceived_category_zh: cleanText(value.perceived_category_zh, 200) || "未知",
    perceived_audience_zh: stringArray(value.perceived_audience_zh, 8),
    perceived_use_cases_zh: stringArray(value.perceived_use_cases_zh, 8),
    misunderstandings_or_risks_zh: stringArray(value.misunderstandings_or_risks_zh, 8),
    missing_signals_zh: stringArray(value.missing_signals_zh, 8),
    confidence: normalizeConfidence(confidence)
  };
}

function normalizeIntent(value) {
  return ["recommendation", "comparison", "decision"].includes(value) ? value : "recommendation";
}

function normalizeConfidence(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}

function boundedRating(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(5, number)) : 1;
}

function querySimilarity(left, right) {
  const a = new Set(normalizeComparable(left).split("").filter(Boolean));
  const b = new Set(normalizeComparable(right).split("").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function normalizeComparable(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function safeHostname(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function cleanText(value, limit) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function stringArray(value, limit) {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return items.map((item) => cleanText(item, 240)).filter(Boolean).slice(0, limit);
}

module.exports = {
  CANDIDATE_QUERY_MAX,
  CANDIDATE_QUERY_MIN,
  QUERY_PLANNER_VERSION,
  SELECTED_QUERY_COUNT,
  buildGeoQueryPlan,
  buildGeoQueryPlanPrompt,
  buildGeoQueryPlanResolved,
  buildGeoQueryPlanViaProxy,
  compactQueryPlanningInput,
  normalizeGeoQueryPlan,
  normalizeReviewedQueryPlan,
  selectRepresentativeQueries
};
