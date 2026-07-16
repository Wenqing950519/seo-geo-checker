const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ALGORITHM_VERSION, collectScoringSignals, computeScoreV2 } = require("../lib/scoring-v2");
const { applyV2Audit } = require("../lib/real-lite-audit-v2-core");

function fixture({ robotsKnown = true, searchContext = null } = {}) {
  const text = "Example Service serves Taipei. Price and contact information. FAQ. What does it cost? How long does it take? Licensed team. Case study result improved 25%. ".repeat(20);
  const homepage = {
    url: "https://example.com/", finalUrl: "https://example.com/", statusCode: 200,
    text, initialTextLength: text.length, headers: {},
    metadata: {
      title: "Example Service Taiwan", description: "Professional local service in Taipei.", h1: "Example Service",
      canonical: "https://example.com/", robots: "", googlebot: "", ogTitle: "Example Service Taiwan",
      ogDescription: "Professional local service in Taipei.", imageCount: 1, imagesWithAlt: 1,
      headingLevels: [1, 2], jsonLd: { validCount: 1, types: ["LocalBusiness"] }
    }
  };
  const allowed = robotsKnown ? true : null;
  const technical = {
    robots: { readable: robotsKnown, sitemaps: ["https://example.com/sitemap.xml"], botAccess: {
      Googlebot: { allowed }, "OAI-SearchBot": { allowed }, "Claude-SearchBot": { allowed }
    } },
    sitemap: { valid: true, homepageIncluded: true }
  };
  return { homepage, technical, representativePages: [], searchContext };
}

function measuredSearch() {
  return {
    enabled: true,
    authority: { enabled: true, citations: ["https://example.com/", "https://news.example.org/example-service"], searchResults: [
      { title: "Example Service profile", snippet: "Example Service in Taipei", url: "https://news.example.org/example-service" }
    ] },
    discovery: [
      { enabled: true, query: "Taipei local service recommendations", answer: "Example Service is one option.", citations: ["https://example.com/"], searchResults: [] },
      { enabled: true, query: "Taipei service comparison", answer: "Example Service provides local service.", citations: ["https://example.com/about"], searchResults: [] }
    ]
  };
}

function maliciousAudit() {
  return {
    score: { value: 100, label: "Strong", summary_zh: "模型聲稱滿分" },
    positioning: { perceived_category_zh: "虛構分類", perceived_audience_zh: [], perceived_use_cases_zh: [], misunderstandings_or_risks_zh: [], missing_signals_zh: [], confidence: "high" },
    technical_seo: { issues: [{ severity: "high", check: "Invented", detail_zh: "虛構問題", impact_zh: "虛構影響" }] },
    geo_questions: [], content_citeability: { strengths_zh: ["虛構優點"], gaps_zh: ["虛構缺口"] },
    priority_actions: [{ priority: "P1", type: "content", target_zh: "虛構目標", recommendation_zh: "虛構建議", reason_zh: "虛構", expected_impact_zh: "虛構" }],
    limitations_zh: []
  };
}

assert.equal(ALGORITHM_VERSION, "3.0.0");

const unavailable = fixture();
const unavailableResult = applyV2Audit(maliciousAudit(), unavailable);
const readiness = computeScoreV2(collectScoringSignals(unavailable));
assert.equal(unavailableResult.score.value, null, "missing Perplexity evidence must not be replaced by readiness");
assert.equal(unavailableResult.score.site_readiness_value, readiness.score);
assert.equal(unavailableResult.score.evidence_status, "insufficient_evidence");

const measured = fixture({ searchContext: measuredSearch() });
const resultA = applyV2Audit(maliciousAudit(), measured);
const resultB = applyV2Audit(maliciousAudit(), measured);
assert.notEqual(resultA.score.value, 100, "model score must not alter GEO score");
assert.ok(Number.isFinite(resultA.score.value));
assert.equal(resultA.score.algorithm_version, ALGORITHM_VERSION);
assert.equal(resultA.score.evidence_status, "measured");
assert.equal(resultA.score.evidence_confidence, "medium");
assert.equal(resultA.technical_seo.issues.some((item) => item.check === "Invented"), false);
assert.equal(resultA.priority_actions.some((item) => item.recommendation_zh === "虛構建議"), false);
assert.equal(resultA.content_citeability.strengths_zh.includes("虛構優點"), false);
assert.deepEqual(resultA.score, resultB.score, "same evidence must yield the same score object");

const unknownRobots = applyV2Audit(maliciousAudit(), fixture({ robotsKnown: false, searchContext: measuredSearch() }));
assert.ok(unknownRobots.score.evidence_coverage < 100);
for (const id of ["googlebot_access", "oai_search_access", "claude_search_access"]) {
  assert.equal(unknownRobots.score.rules.find((item) => item.id === id).status, "unknown");
}

const batchScript = fs.readFileSync(path.join(__dirname, "../../.agents/skills/geo-whitepaper-research/scripts/run-rules-batch.mjs"), "utf8");
assert.doesNotMatch(batchScript, /callGeminiJson|getPerplexityAuditContext|getPerplexityGeoEvidence|providers[\/](?:gemini|perplexity)/, "rules-only batch must not import paid AI providers");
assert.match(batchScript, /paid_ai_calls:\s*0/, "rules-only methodology must declare zero paid AI calls");

console.log(JSON.stringify({ passed: true, algorithmVersion: ALGORITHM_VERSION, geoScore: resultA.score.value, siteReadiness: resultA.score.site_readiness_value, unavailableGeoScore: unavailableResult.score.value }, null, 2));
