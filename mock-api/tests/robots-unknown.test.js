const assert = require("node:assert/strict");
const { collectScoringSignals, computeScoreV2 } = require("../lib/scoring-v2");

const text = "服務 流程 適合對象 常見問題 客戶案例 比較 數據 來源 ".repeat(60);
const homepage = {
  statusCode: 200,
  text,
  initialTextLength: text.length,
  headers: {},
  metadata: {
    title: "範例商家", description: "服務摘要", h1: "主要服務",
    canonical: "https://example.com/", robots: "", googlebot: "",
    ogTitle: "範例商家", ogDescription: "服務摘要",
    imageCount: 0, imagesWithAlt: 0, headingLevels: [1, 2],
    jsonLd: { validCount: 1, types: ["LocalBusiness"] }
  }
};
const technical = {
  robots: {
    readable: false,
    sitemaps: [],
    botAccess: {
      Googlebot: { allowed: null, status: "unknown" },
      "OAI-SearchBot": { allowed: null, status: "unknown" },
      "Claude-SearchBot": { allowed: null, status: "unknown" }
    }
  },
  sitemap: { valid: false, homepageIncluded: false }
};

const result = computeScoreV2(collectScoringSignals({ homepage, technical }));
assert.equal(result.cap, 100, "unknown robots state must not trigger a blocked-site cap");
for (const id of ["googlebot_access", "oai_search_access", "claude_search_access"]) {
  const check = result.checks.find((item) => item.id === id);
  assert.equal(check.status, "unknown", `${id} must be explicitly marked unknown`);
  assert.match(check.evidence, /未知/);
}
console.log("robots unknown-state tests passed");
