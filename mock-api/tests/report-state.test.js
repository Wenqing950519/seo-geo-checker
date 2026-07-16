const assert = require("node:assert/strict");
const { AppError } = require("../lib/errors");
const { createFetchLimitedReport, applyV2Audit } = require("../lib/real-lite-audit-v2-core");

const fetchLimited = createFetchLimitedReport("https://example.com/", new AppError("Failed to fetch homepage: timeout", { stage: "fetch_homepage", retryable: true }));
assert.equal(fetchLimited.audit.score.value, null);
assert.equal(fetchLimited.audit.score.site_readiness_value, null);
assert.equal(fetchLimited.audit.score.evidence_status, "unavailable");

const input = {
  homepage: {
    url: "https://example.com/", finalUrl: "https://example.com/", statusCode: 200,
    text: "Example Service Taipei. Contact and pricing. What is the price? How to book? Licensed service result 20%. ".repeat(30),
    initialTextLength: 2000, headers: {},
    metadata: { title: "Example Service", description: "Taipei service", h1: "Example Service", canonical: "https://example.com/", ogTitle: "Example Service", ogDescription: "Taipei service", imageCount: 0, imagesWithAlt: 0, headingLevels: [1, 2], jsonLd: { validCount: 1, types: ["Organization"] } }
  },
  technical: { robots: { readable: true, sitemaps: [], botAccess: { Googlebot: { allowed: true }, "OAI-SearchBot": { allowed: true }, "Claude-SearchBot": { allowed: true } } }, sitemap: { valid: false, homepageIncluded: false } }
};
const audit = { score: {}, positioning: {}, technical_seo: { issues: [] }, content_citeability: {}, priority_actions: [], limitations_zh: [] };
const unavailable = applyV2Audit(structuredClone(audit), input);
assert.equal(unavailable.score.value, null);
assert.ok(Number.isFinite(unavailable.score.site_readiness_value));
assert.equal(unavailable.score.label, "GEO 證據不足");

input.searchContext = {
  enabled: true,
  authority: { enabled: true, citations: ["https://example.com/"], searchResults: [] },
  discovery: [
    { enabled: true, query: "Taipei service", answer: "Example Service", citations: ["https://example.com/"], searchResults: [] },
    { enabled: true, query: "Taipei service comparison", answer: "Example Service", citations: ["https://example.com/about"], searchResults: [] }
  ]
};
const measured = applyV2Audit(structuredClone(audit), input);
assert.equal(measured.score.label, "Perplexity GEO 實測");
assert.ok(Number.isFinite(measured.score.value));
assert.equal(measured.score.evidence_status, "measured");
console.log("report state tests passed");
