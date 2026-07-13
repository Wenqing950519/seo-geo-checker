const assert = require("node:assert/strict");
const { AppError } = require("../lib/errors");
const { createFetchLimitedReport, applyV2Audit } = require("../lib/real-lite-audit-v2-core");

const fetchLimited = createFetchLimitedReport(
  "https://example.com/",
  new AppError("Failed to fetch homepage: timeout", { stage: "fetch_homepage", retryable: true })
);

assert.equal(fetchLimited.audit.score.value, null, "fetch failure must not masquerade as a zero score");
assert.equal(fetchLimited.audit.score.label, "無法評估");
assert.equal(fetchLimited.audit.score.evidence_status, "unavailable");
assert.equal(fetchLimited.audit.ai_validation.status, "unavailable");

const measured = applyV2Audit(
  { score: {}, positioning: {}, technical_seo: { issues: [] }, content_citeability: {}, priority_actions: [], limitations_zh: [] },
  {
    homepage: {
      url: "https://example.com/", statusCode: 200, text: "測試服務 常見問題 服務對象".repeat(100), initialTextLength: 2000,
      metadata: { title: "測試服務", description: "服務介紹", h1: "測試服務", canonical: "https://example.com/", ogTitle: "測試服務", ogDescription: "服務介紹", imageCount: 0, imagesWithAlt: 0, headingLevels: [1, 2], jsonLd: { validCount: 1, types: ["Organization"] } }
    },
    technical: { robots: { readable: true, sitemaps: [], botAccess: { Googlebot: { allowed: true }, "OAI-SearchBot": { allowed: true }, "Claude-SearchBot": { allowed: true } } }, sitemap: { valid: false, homepageIncluded: false } }
  }
);

assert.equal(measured.score.label, "技術與內容準備度");
assert.equal(measured.score.value, measured.score.technical_value);
assert.equal(measured.score.evidence_status, "measured");
assert.equal(measured.site_type, "organization");

console.log("report state tests passed");
