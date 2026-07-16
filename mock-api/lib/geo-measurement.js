const { fetchHomepage, fetchRepresentativePages } = require("./html-v2");
const { fetchTechnicalSignals } = require("./technical-signals");
const { ALGORITHM_VERSION, collectScoringSignals, computeScoreV2 } = require("./scoring-v2");
const { classifySite } = require("./site-type");
const { getPerplexityGeoEvidence } = require("../providers/perplexity");
const { evaluatePerplexityVisibility } = require("./perplexity-visibility");
const { computeGeoAssessment } = require("./geo-assessment");

const GEO_PIPELINE_VERSION = `${ALGORITHM_VERSION}-perplexity`;
const PERPLEXITY_CALLS_PER_SITE = 3;

async function measureGeoSite(siteUrl, options = {}) {
  const representativePageLimit = boundedInt(options.representativePageLimit, 3, 0, 5);
  const homepage = await fetchHomepage(siteUrl);
  const finalUrl = homepage.finalUrl || homepage.url || siteUrl;
  const siteType = classifySite({ url: finalUrl, metadata: homepage.metadata, text: homepage.text });
  const [technical, searchEvidence] = await Promise.all([
    fetchTechnicalSignals(siteUrl, homepage),
    getPerplexityGeoEvidence({
      siteUrl: finalUrl,
      title: homepage.metadata?.title,
      description: homepage.metadata?.description,
      siteType,
      text: homepage.text
    })
  ]);
  const representativePages = await fetchRepresentativePages(
    technical.representativeUrls || [],
    representativePageLimit
  );
  const signals = collectScoringSignals({ homepage, technical, representativePages });
  const siteReadiness = computeScoreV2(signals);
  const perplexityObservation = evaluatePerplexityVisibility({
    siteUrl: finalUrl,
    metadata: homepage.metadata,
    searchEvidence
  });
  const geoAssessment = computeGeoAssessment(siteReadiness, perplexityObservation);

  return {
    algorithmVersion: ALGORITHM_VERSION,
    pipelineVersion: GEO_PIPELINE_VERSION,
    siteUrl,
    finalUrl,
    siteType,
    homepage,
    technical,
    representativePages,
    signals,
    siteReadiness,
    searchEvidence,
    perplexityObservation,
    geoAssessment
  };
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
  PERPLEXITY_CALLS_PER_SITE,
  conciseGeoComment,
  measureGeoSite
};
