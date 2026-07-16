const assert = require("node:assert/strict");
const { classifySite, questionsForSite } = require("../lib/site-type");
const { collectScoringSignals } = require("../lib/scoring-v2");

const cases = [
  ["restaurant", "restaurant sushi menu reservation"],
  ["hospitality", "hotel room booking check-in"],
  ["local_service", "home repair service area quote"],
  ["professional_service", "law firm accounting professional service"],
  ["retail", "retail store product pickup"],
  ["ecommerce", "online shop ecommerce checkout"],
  ["saas_tool", "SaaS dashboard API subscription"],
  ["media", "news article magazine"],
  ["organization", "organization foundation association"]
];
for (const [expected, text] of cases) {
  const actual = classifySite({ text });
  assert.equal(actual, expected, text + " should classify as " + expected + ", got " + actual);
  assert.equal(questionsForSite(actual).length, 3);
}

const text = "Home repair service in Taipei. Location Taipei. Pricing and quote available. Contact us for an appointment. FAQ. What is the price? How long does repair take? Licensed contractor certificate. Case study result improved 25%.";
const localSignals = collectScoringSignals({
  homepage: { statusCode: 200, finalUrl: "https://service.example/", text, initialTextLength: text.length, headers: {}, metadata: { headingLevels: [1, 2], imageCount: 0, imagesWithAlt: 0, jsonLd: { validCount: 1, types: ["LocalBusiness"] } } },
  technical: { robots: { readable: true, botAccess: {} }, sitemap: {} },
  representativePages: [{ url: "https://service.example/portfolio", text: "Case study before and after result 25%", html: "", metadata: {}, crawlQuality: { scorable: true } }]
});
assert.equal(localSignals.siteType, "local_service");
assert.deepEqual(localSignals.geoSignals, { faq: true, cases: true, comparisons: false, proof: true, serviceClarity: true });
assert.ok(localSignals.contentEvidence.numericEvidenceCount > 0);
console.log("site type tests passed");
