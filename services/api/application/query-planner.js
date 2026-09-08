const { callStructuredJson } = require("../../../packages/ai-providers/structured-router.js");

const QUERY_PLANNER_VERSION = "1.5.0";
const CANDIDATE_QUERY_MIN = 5;
const CANDIDATE_QUERY_MAX = 8;
// Four independent discovery queries make a product score less sensitive to a
// single answer. Frozen research query sets retain their own approved size.
const SELECTED_QUERY_COUNT = 4;
const MIN_REVIEWED_QUERY_COUNT = 2;

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
    "問題不得出現網站品牌、公司名、網域、指定競品、列出來源、附上來源或要求回答者列出特定網站。SEO、GEO、網站設計等詞只有在它們確實是網站本業時才能出現，且仍不得把問題寫成要求列出特定網站或來源。",
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
  const requestOptions = {
    temperature: 0,
    attempts: options.attempts ?? 2,
    timeoutMs: options.timeoutMs ?? 35_000,
    operation: options.operation || "geo_query_planning",
    allowFallback: options.allowFallback !== false
  };
  let result = await callStructuredJson(buildGeoQueryPlanPrompt(input), requestOptions);
  let normalized = normalizeGeoQueryPlan(result.json, input);
  let semanticAttempts = 1;
  if (normalized.status !== "ready" && options.allowSemanticRetry !== false) {
    result = await callStructuredJson(buildGeoQueryPlanCorrectionPrompt(input, normalized), {
      ...requestOptions,
      attempts: 1,
      operation: `${requestOptions.operation}_semantic_retry`
    });
    normalized = normalizeGeoQueryPlan(result.json, input);
    semanticAttempts = 2;
  }
  return {
    ...normalized,
    provider: result.provider,
    model: result.model,
    modelRelease: result.modelRelease,
    usage: result.usage,
    latencyMs: result.latencyMs,
    attempts: result.attempts,
    semanticAttempts,
    version: QUERY_PLANNER_VERSION,
    source: "deepseek_dynamic"
  };
}

function buildGeoQueryPlanCorrectionPrompt(input, failedPlan) {
  return [
    buildGeoQueryPlanPrompt(input),
    "上一輪結果不能用於量測，因為它沒有通過候選題數量、非品牌或意圖多樣性檢查。請從頭重做。",
    `上一輪通過規則的候選題只有 ${failedPlan.candidates.length} 題；這次必須輸出 5 到 8 題可通過的非品牌問題，並至少涵蓋兩種 intent。`,
    "先自行檢查每一題：不得含品牌、網域、指定競品、列出來源或列出特定網站；每題必須包含至少一個 topic_terms 的核心詞。只有屬於網站實際本業的 SEO、GEO 或網站設計詞可出現。"
  ].join("\n");
}

async function buildGeoQueryPlanResolved(input, options = {}) {
  const plan = await buildGeoQueryPlan(input, options);
  return mergePreferredQueries(plan, input, options.preferredQueries);
}

function mergePreferredQueries(plan, input, preferredQueries = []) {
  const rawPreferred = Array.isArray(preferredQueries) ? preferredQueries : [];
  if (!rawPreferred.length || plan.status !== "ready") return plan;
  const forbiddenTerms = buildForbiddenTerms({
    entityName: plan.entity_name,
    siteUrl: input.siteUrl,
    title: input.homepage?.metadata?.title,
    h1: input.homepage?.metadata?.h1
  });
  const preferred = rawPreferred.map((value, index) => {
    const text = cleanQuestion(value);
    if (!text || containsForbiddenTerm(text, forbiddenTerms)) return null;
    return {
      id: `custom_${index + 1}`,
      text,
      intent: ["recommendation", "comparison", "decision"][index % 3],
      consumer_relevance: 5,
      evidence_fit: 5,
      rationale_zh: "使用者於檢測前置自選之顧客探索情境題"
    };
  });
  if (preferred.some((query) => !query)) {
    return { ...plan, status: "invalid", reason: "自訂觀測題不可包含品牌、網域或無效文字；請改成顧客尚未認識品牌時會問的問題。", selectedQueries: [], queryPlan: null };
  }
  const selected = preferred;
  const candidates = [...plan.selectedQueries, ...plan.candidates];
  for (const candidate of candidates) {
    if (selected.length >= SELECTED_QUERY_COUNT) break;
    if (selected.some((item) => querySimilarity(item.text, candidate.text) >= 0.72)) continue;
    selected.push(candidate);
  }
  if (selected.length !== SELECTED_QUERY_COUNT) {
    return { ...plan, status: "invalid", reason: "系統無法補足四個彼此不同的非品牌觀測題。", selectedQueries: [], queryPlan: null };
  }
  return {
    ...plan,
    selectedQueries: selected,
    queryPlan: {
      query_set_version: `${plan.queryPlan.query_set_version}+user-input-v1`,
      queries: selected.map(({ id, text, intent }) => ({ id, text, intent }))
    },
    source: "deepseek_dynamic_with_user_queries"
  };
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
  const serviceDescription = [industry, primaryOffering].join(" ");
  const allowedServiceTerms = {
    websiteDesign: /網站設計|網頁設計|web\s*design/i.test(serviceDescription),
    aiSearchVisibility: /\bseo\b|\bgeo\b|ai\s*搜尋|生成式搜尋|搜尋能見度|search\s*visibility/i.test(serviceDescription)
  };
  const candidates = (Array.isArray(raw.query_candidates) ? raw.query_candidates : [])
    .map((candidate, index) => normalizeCandidate(candidate, index, forbiddenTerms, topicTerms, allowedServiceTerms))
    .filter(Boolean)
    .slice(0, CANDIDATE_QUERY_MAX);
  const selectedQueries = selectRepresentativeQueries(candidates);
  const classificationReady = industry !== "unknown" && primaryOffering !== "unknown" && confidence !== "low" && topicTerms.length >= 2;
  const ready = classificationReady && candidates.length >= CANDIDATE_QUERY_MIN && selectedQueries.length === SELECTED_QUERY_COUNT;

  return {
    status: ready ? "ready" : "invalid",
    reason: ready ? null : "DeepSeek 未產出足夠且通過品牌、產業與搜尋意圖檢查的候選問題",
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
      query_set_version: `dynamic-deepseek-${QUERY_PLANNER_VERSION}`,
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
  const ready = Boolean(approved) && queries.length >= MIN_REVIEWED_QUERY_COUNT;
  const selectedQueries = queries.slice();
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
    semanticAttempts: 0,
    version: QUERY_PLANNER_VERSION,
    source: "human_reviewed_frozen"
  };
}

function normalizeCandidate(value, index, forbiddenTerms, topicTerms, allowedServiceTerms = {}) {
  if (!value || typeof value !== "object") return null;
  const text = cleanQuestion(value.text);
  if (!text || containsForbiddenTerm(text, forbiddenTerms) || containsMetaSearchInstruction(text, allowedServiceTerms)) return null;
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

function containsMetaSearchInstruction(text, allowedServiceTerms = {}) {
  if (/附上(?:可核對的)?來源|列出(?:具體)?(?:品牌|商家|網站)/i.test(text)) return true;
  if (!allowedServiceTerms.aiSearchVisibility && /\bseo\b|\bgeo\b/i.test(text)) return true;
  return !allowedServiceTerms.websiteDesign && /網站設計|網頁設計/i.test(text);
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
  MIN_REVIEWED_QUERY_COUNT,
  SELECTED_QUERY_COUNT,
  buildGeoQueryPlan,
  buildGeoQueryPlanCorrectionPrompt,
  buildGeoQueryPlanPrompt,
  buildGeoQueryPlanResolved,
  mergePreferredQueries,
  normalizeGeoQueryPlan,
  normalizeReviewedQueryPlan,
  selectRepresentativeQueries
};
