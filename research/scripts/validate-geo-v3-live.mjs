import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvFiles } = require("../../packages/shared/env.js");
const { fetchHomepage, fetchRepresentativePages } = require("../../packages/crawler/html-v2.js");
const { fetchTechnicalSignals } = require("../../packages/crawler/technical-signals.js");
const { collectScoringSignals, computeScoreV2, ALGORITHM_VERSION } = require("../../packages/geo-core/scoring/scoring-v2.js");
const { classifySite } = require("../../packages/geo-core/site-analyzer/site-type.js");
const { getPerplexityGeoEvidence } = require("../../packages/ai-providers/perplexity.js");
const { evaluatePerplexityVisibility } = require("../../packages/geo-core/evidence/perplexity-visibility.js");
const { computeGeoAssessment } = require("../../packages/geo-core/scoring/geo-assessment.js");

loadEnvFiles();
const sites = ["https://hunterest.co/", "https://www.sushiro.com.tw/"];
const output = [];

for (const siteUrl of sites) {
  try {
    const homepage = await fetchHomepage(siteUrl);
    const siteType = classifySite({ url: homepage.finalUrl || siteUrl, metadata: homepage.metadata, text: homepage.text });
    const technical = await fetchTechnicalSignals(siteUrl, homepage);
    const representativePages = await fetchRepresentativePages(technical.representativeUrls || [], 3);
    const signals = collectScoringSignals({ homepage, technical, representativePages });
    const readiness = computeScoreV2(signals);
    const evidence = await getPerplexityGeoEvidence({
      siteUrl: homepage.finalUrl || siteUrl,
      title: homepage.metadata?.title,
      description: homepage.metadata?.description,
      siteType,
      text: homepage.text
    });
    const observation = evaluatePerplexityVisibility({ siteUrl: homepage.finalUrl || siteUrl, metadata: homepage.metadata, searchEvidence: evidence });
    const geo = computeGeoAssessment(readiness, observation);
    output.push({
      site: siteUrl,
      finalUrl: homepage.finalUrl,
      siteType,
      algorithmVersion: ALGORITHM_VERSION,
      siteReadiness: readiness.score,
      geoScore: geo.score,
      geoRawScore: geo.rawScore,
      geoCaps: geo.caps,
      perplexityScore: observation.score,
      mentionRate: observation.mentionRate,
      officialCitationRate: observation.citationRate,
      measuredQueries: observation.measuredQueryCount,
      entityGrounded: observation.authority?.entityGrounded,
      matchedExternalDomains: observation.authority?.matchedExternalDomains || [],
      rejectedExternalDomains: observation.authority?.unmatchedExternalDomains || [],
      observations: observation.observations
    });
  } catch (error) {
    output.push({ site: siteUrl, error: error.message, stage: error.stage || "unknown" });
  }
}

console.log(JSON.stringify(output, null, 2));
