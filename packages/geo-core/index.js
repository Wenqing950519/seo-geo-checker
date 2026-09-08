const aiTrustIndex = require("./scoring/ai-trust-index.js");
const geoAssessment = require("./scoring/geo-assessment.js");
const scoringV2 = require("./scoring/scoring-v2.js");
const authorityEvidence = require("./evidence/authority-evidence.js");
const brandMatch = require("./evidence/brand-match.js");
const perplexityVisibility = require("./evidence/perplexity-visibility.js");
const geoProbes = require("./query-generator/geo-probes.js");
const contentEvidence = require("./site-analyzer/content-evidence.js");
const crawlQuality = require("./site-analyzer/crawl-quality.js");
const siteType = require("./site-analyzer/site-type.js");

module.exports = {
  evidence: {
    authority: authorityEvidence,
    brandMatch,
    visibility: perplexityVisibility
  },
  queryGenerator: geoProbes,
  scoring: {
    aiTrustIndex,
    geoAssessment,
    siteReadiness: scoringV2
  },
  siteAnalyzer: {
    contentEvidence,
    crawlQuality,
    siteType
  }
};
