const assert = require("node:assert/strict");
const { evaluatePerplexityVisibility } = require("../lib/perplexity-visibility");
const { computeGeoAssessment } = require("../lib/geo-assessment");

function scored(siteReadiness, technical, citeability) {
  return {
    score: siteReadiness,
    cap: 100,
    caps: [],
    breakdown: {
      crawl_access: { points: technical * 0.3, max: 30 },
      discoverability: { points: 15, max: 15 },
      semantic_clarity: { points: 19, max: 19 },
      content_readability: { points: citeability * 0.2, max: 20 },
      citeability: { points: citeability * 0.15, max: 15 }
    }
  };
}

const superficialObservation = evaluatePerplexityVisibility({
  siteUrl: "https://hunterest.co/",
  metadata: { title: "Hunterest | Local service", h1: "Hunterest" },
  searchEvidence: {
    authority: {
      enabled: true,
      citations: ["https://clutch.co/profile/hunter-branding"],
      searchResults: [{ title: "Hunter Branding Agency", url: "https://hunterbranding.com/" }]
    },
    discovery: [
      { enabled: true, query: "台灣網站設計推薦", answer: "推薦其他設計公司。", citations: ["https://other.example/"], searchResults: [] },
      { enabled: true, query: "台灣網站設計比較", answer: "以下是數家設計公司。", citations: ["https://agency.example/"], searchResults: [] }
    ]
  }
});
assert.equal(superficialObservation.authority.entityGrounded, false);
assert.equal(superficialObservation.mentionRate, 0);
assert.equal(superficialObservation.citationRate, 0);

const matureObservation = evaluatePerplexityVisibility({
  siteUrl: "https://www.sushiro.com.tw/",
  metadata: { title: "首頁｜台灣壽司郎", h1: "台灣壽司郎" },
  searchEvidence: {
    authority: {
      enabled: true,
      answer: "ALIASES: 壽司郎 | Sushiro | スシロー\nVerified entity.",
      citations: ["https://www.sushiro.com.tw/", "https://job.taiwanjobs.gov.tw/sushiro"],
      searchResults: [
        { title: "台灣壽司郎招募", snippet: "台灣壽司郎公司資料", url: "https://job.taiwanjobs.gov.tw/sushiro" },
        { title: "壽司郎品牌介紹", snippet: "壽司郎在台灣的營運資訊", url: "https://example-news.tw/sushiro" }
      ]
    },
    discovery: [
      { enabled: true, query: "台灣壽司品牌推薦", answer: "可考慮壽司郎與其他品牌。", citations: ["https://www.sushiro.com.tw/"], searchResults: [] },
      { enabled: true, query: "台灣壽司品牌比較", answer: "壽司郎是常見選項之一。", citations: ["https://www.sushiro.com.tw/store"], searchResults: [] }
    ]
  }
});
assert.ok(matureObservation.authorityAliases.includes("壽司郎"));
assert.equal(matureObservation.mentionRate, 100);
assert.equal(matureObservation.citationRate, 100);
assert.ok(matureObservation.score >= 85);

const superficialOverall = computeGeoAssessment(scored(94, 100, 85), superficialObservation);
const matureOverall = computeGeoAssessment(scored(66, 100, 72), matureObservation);
assert.ok(superficialOverall.score <= 59, `unobserved site must be capped, got ${superficialOverall.score}`);
assert.ok(matureOverall.score > superficialOverall.score, `${matureOverall.score} should exceed ${superficialOverall.score}`);

const unknown = computeGeoAssessment(scored(94, 100, 85), { status: "unknown", score: null });
assert.equal(unknown.score, null);
assert.equal(unknown.status, "insufficient_evidence");

console.log(JSON.stringify({
  passed: true,
  superficial: { perplexity: superficialObservation.score, geo: superficialOverall.score },
  mature: { perplexity: matureObservation.score, geo: matureOverall.score },
  unavailableGeoScore: unknown.score
}, null, 2));
