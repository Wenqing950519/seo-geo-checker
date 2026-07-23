const { fetchHomepage, fetchRepresentativePages } = require("./html-v2");
const { fetchTechnicalSignals } = require("./technical-signals");
const { ALGORITHM_VERSION, collectScoringSignals, computeScoreV2 } = require("./scoring-v2");
const { classifySite } = require("./site-type");
const { getPerplexityGeoEvidence } = require("../providers/perplexity");
const { evaluatePerplexityVisibility } = require("./perplexity-visibility");
const { SCORING_VERSION, computeGeoAssessment } = require("./geo-assessment");
const { PARSER_VERSION } = require("./brand-match");
const { resolveCitationRedirects } = require("./citation-resolve");
const {
  QUERY_PLANNER_VERSION,
  buildGeoQueryPlanResolved,
  normalizeReviewedQueryPlan
} = require("./query-planner");

// parser 或 scoring 版本變更會改變 pipeline 版本，讓批次自動重測舊資料列。
const GEO_PIPELINE_VERSION = `${ALGORITHM_VERSION}-query${QUERY_PLANNER_VERSION}-perplexity-p${PARSER_VERSION}-s${SCORING_VERSION}`;
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
        reason: "No validated Gemini or human-reviewed query plan is available",
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
    geoAssessment
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
      reason: String(error?.message || "Gemini query planning failed").slice(0, 300),
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
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
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
  const geo = measurement?.geoAssessment;
  const observation = measurement?.perplexityObservation;
  const readiness = measurement?.siteReadiness;
  if (!geo || geo.status !== "measured" || !Number.isFinite(geo.score)) {
    return `Perplexity 搜尋證據不足；站內準備度 ${readiness?.score ?? "未知"} 分，未產生 GEO 分數。`;
  }
  const entity = observation.authority?.entityGrounded ? "已完成實體對齊" : "外部實體證據不足";
  return `GEO ${geo.score} 分；非品牌搜尋提及率 ${observation.mentionRate}%、官網引用率 ${observation.citationRate}%；${entity}。`;
}

function boundedInt(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

module.exports = {
  GEO_PIPELINE_VERSION,
  PARSER_VERSION,
  PERPLEXITY_CALLS_PER_SITE,
  QUERY_PLANNER_VERSION,
  SCORING_VERSION,
  conciseGeoComment,
  measureGeoSite
};
