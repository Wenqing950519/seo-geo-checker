const { fetchHomepage, fetchRepresentativePages } = require("./html-v2");
const { fetchTechnicalSignals } = require("./technical-signals");
const { ALGORITHM_VERSION, collectScoringSignals, computeScoreV2 } = require("./scoring-v2");
const { classifySite } = require("./site-type");
const { getPerplexityGeoEvidence } = require("../providers/perplexity");
const { evaluatePerplexityVisibility } = require("./perplexity-visibility");
const { SCORING_VERSION, computeGeoAssessment } = require("./geo-assessment");
const { AI_TRUST_INDEX_VERSION, computeAiTrustIndex } = require("./ai-trust-index");
const { PARSER_VERSION } = require("./brand-match");
const { resolveCitationRedirects } = require("./citation-resolve");
const {
  QUERY_PLANNER_VERSION,
  buildGeoQueryPlanResolved,
  normalizeReviewedQueryPlan
} = require("./query-planner");

// parser 或 scoring 版本變更會改變 pipeline 版本，讓批次自動重測舊資料列。
const GEO_PIPELINE_VERSION = `${ALGORITHM_VERSION}-query${QUERY_PLANNER_VERSION}-perplexity-p${PARSER_VERSION}-s${SCORING_VERSION}-trust${AI_TRUST_INDEX_VERSION}`;
const PERPLEXITY_CALLS_PER_SITE = 3;

async function measureGeoSite(siteUrl, options = {}) {
  const representativePageLimit = boundedInt(options.representativePageLimit, 3, 0, 5);
  const homepage = await fetchHomepage(siteUrl);
  const finalUrl = homepage.finalUrl || homepage.url || siteUrl;
  const siteType = classifySite({ url: finalUrl, metadata: homepage.metadata, text: homepage.text });
  const technical = await fetchTechnicalSignals(siteUrl, homepage);
  const representativePages = await fetchRepresentativePages(
    technical.representativeUrls || [],
    representativePageLimit
  );
  const signals = collectScoringSignals({ homepage, technical, representativePages });
  const siteReadiness = computeScoreV2(signals);
  const queryPlanning = await resolveQueryPlanning({
    siteUrl: finalUrl,
    homepage,
    representativePages,
    siteType
  }, options);
  const entityProfile = options.entityProfile || null;
  const searchEvidence = queryPlanning.status === "ready"
    ? await getPerplexityGeoEvidence({
        siteUrl: finalUrl,
        title: homepage.metadata?.title,
        description: homepage.metadata?.description,
        siteType,
        text: homepage.text,
        queryPlan: queryPlanning.queryPlan
      })
    : {
        enabled: false,
        provider: "perplexity",
        reason: "No validated DeepSeek or human-reviewed query plan is available",
        authority: { enabled: false },
        discovery: [],
        plan: null
      };
  const citationResolution = await safeResolveCitations(searchEvidence);
  const perplexityObservation = evaluatePerplexityVisibility({
    siteUrl: finalUrl,
    metadata: homepage.metadata,
    searchEvidence,
    entityProfile,
    citationResolution
  });
  const geoAssessment = computeGeoAssessment(siteReadiness, perplexityObservation);
  const aiTrustIndex = computeAiTrustIndex(perplexityObservation);

  return {
    algorithmVersion: ALGORITHM_VERSION,
    pipelineVersion: GEO_PIPELINE_VERSION,
    parserVersion: PARSER_VERSION,
    scoringVersion: SCORING_VERSION,
    queryPlannerVersion: QUERY_PLANNER_VERSION,
    siteUrl,
    finalUrl,
    siteType,
    entityProfile,
    homepage,
    technical,
    representativePages,
    signals,
    siteReadiness,
    queryPlanning,
    searchEvidence,
    citationResolution,
    perplexityObservation,
    geoAssessment,
    aiTrustIndex
  };
}

async function resolveQueryPlanning(input, options = {}) {
  if (options.queryPlan) return normalizeReviewedQueryPlan(options.queryPlan);
  try {
    const planner = typeof options.queryPlanner === "function" ? options.queryPlanner : buildGeoQueryPlanResolved;
    return await planner(input, options.queryPlannerOptions || {});
  } catch (error) {
    return {
      status: "unavailable",
      reason: String(error?.message || "DeepSeek query planning failed").slice(0, 300),
      entity_name: "unknown",
      industry: "unknown",
      primary_offering: "unknown",
      topic_terms: [],
      geography: [],
      target_audience: [],
      evidence_basis: [],
      confidence: "low",
      positioning: { perceived_category_zh: "未知", perceived_audience_zh: [], perceived_use_cases_zh: [], misunderstandings_or_risks_zh: [], missing_signals_zh: [], confidence: "low" },
      candidates: [],
      selectedQueries: [],
      queryPlan: null,
      provider: "deepseek",
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      version: QUERY_PLANNER_VERSION,
      source: "unavailable"
    };
  }
}

// citation 重導向解析失敗不得影響量測；原始 citations 不改寫，只回傳對照表。
async function safeResolveCitations(searchEvidence = {}) {
  try {
    const results = [searchEvidence.authority, ...(searchEvidence.discovery || [])].filter((item) => item?.enabled);
    const urls = results.flatMap((result) => [
      ...(Array.isArray(result.citations) ? result.citations : []),
      ...(Array.isArray(result.searchResults) ? result.searchResults.map((item) => item?.url) : [])
    ]).filter(Boolean);
    return await resolveCitationRedirects(urls);
  } catch {
    return {};
  }
}

function conciseGeoComment(measurement) {
  const trust = measurement?.aiTrustIndex;
  const observation = measurement?.perplexityObservation;
  if (!trust || trust.status !== "measured" || !Number.isFinite(trust.value)) {
    return "AI Trust Index 為 unknown；沒有可用的可見回答 query-run，不以 0 分處理。";
  }
  return `AI Trust Index ${trust.value} 分；答案採用率 ${observation.mentionRate}%、已驗證官方 URL 引用率 ${observation.citationRate}%。`;
}

function boundedInt(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

module.exports = {
  GEO_PIPELINE_VERSION,
  AI_TRUST_INDEX_VERSION,
  PARSER_VERSION,
  PERPLEXITY_CALLS_PER_SITE,
  QUERY_PLANNER_VERSION,
  SCORING_VERSION,
  conciseGeoComment,
  measureGeoSite
};
