const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { computeAiTrustIndex } = require("../../packages/geo-core/scoring/ai-trust-index.js");

// The GeoCheck home page shows a sample report. Every number on it must be one the
// Classic pipeline could produce, the sample must not be attributed to a real
// business, and the copy must not contradict LS-Labs' own research.
const home = fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/home.html"), "utf8");
const visible = home.replace(/<!--[\s\S]*?-->/g, "");

// 1. The sample is labelled and anonymous.
const sample = visible.match(/<section id="report"[\s\S]*?<\/section>/);
assert.ok(sample, "home must show the sample report");
assert.match(sample[0], /範例/, "the sample report must be labelled 範例");
assert.doesNotMatch(home, /艾朋|À Point|real-site-apoint/, "the sample must not borrow a real business");

// 2. Classic plans four questions per site (query-planner SELECTED_QUERY_COUNT), so a
//    rate is a whole number of questions, and the score is what AI Trust Index v1
//    computes from those rates. The gauge animation must land on the same score.
const metric = (name) => {
  const match = sample[0].match(new RegExp(`data-sample-metric="${name}" data-hits="(\\d+)" data-n="(\\d+)"[^>]*>([^<]*)<`));
  assert.ok(match, `the sample must mark its ${name} rate with data-hits and data-n`);
  const [hits, of] = [Number(match[1]), Number(match[2])];
  assert.ok(of >= 1 && of <= 4 && hits <= of, `${name}: ${hits}/${of} is not a four-question result`);
  const percent = Math.round((hits / of) * 100);
  assert.match(match[3], new RegExp(`${hits}\\s*/\\s*${of} 題.*${percent}%`), `${name} must read "${hits}/${of} 題 · ${percent}%"`);
  return { percent, of };
};
const mention = metric("mention");
const citation = metric("citation");
const index = computeAiTrustIndex({
  measuredQueryCount: mention.of, queryCount: mention.of,
  mentionRate: mention.percent, citationRate: citation.percent
});
assert.match(sample[0], new RegExp(`<span id="scoreVal">${index.value}</span>`), "the sample score must follow AI Trust Index v1");
assert.match(home, new RegExp(`const target = ${index.value},`), "the gauge animation must end on the sample score");

// 3. Claims the page cannot back, or that LS-Labs' 2026-09-18 retrieval report
//    (AI 搜尋時代的檢索機制報告) contradicts: one run is not reproducible, a citation
//    list is not a trust weight, a website is not required to be mentioned, and no
//    conversion was measured.
assert.doesNotMatch(home, /Top Position Trend|Jan 01/, "a snapshot tool must not draw a trend chart");
assert.doesNotMatch(home, />50\+</, "the checked-site count has no source");
assert.doesNotMatch(home, /app\.lslabs\.tw/, "the paused Dashboard must not be linked");
assert.doesNotMatch(home, /找得到你 ✓/, "Google indexing is not measured, so it cannot be ticked");
for (const phrase of ["可重現", "科學維度", "心智第一指名率", "不可撼動", "權威依據", "截流", "能得幾分", "秒懂", "真實反映", "決策清單", "盲測", "雙軌"]) {
  assert.ok(!visible.includes(phrase), `home must not claim "${phrase}"`);
}
assert.match(visible, /https:\/\/lslabs\.tw\/blog\/AI搜尋時代的檢索機制報告\//, "the method section must point to the retrieval report");

// 4. GA4 CTA names feed existing funnels; content edits keep them.
for (const name of ["nav_start_audit", "hero_start_audit", "report_preview_start_audit", "final_research_open", "final_recheck"]) {
  assert.match(home, new RegExp(`data-track-cta="${name}"`), `home must keep the ${name} CTA event`);
}

// 5. Fonts never block the first paint: Google Fonts stylesheets load as style
//    preloads (a <noscript> copy is allowed).
const outsideNoscript = visible.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
const fontLinks = outsideNoscript.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) || [];
assert.ok(fontLinks.length > 0, "home still loads its web fonts");
for (const tag of fontLinks) {
  assert.match(tag, /rel="preload"/, `render-blocking font stylesheet: ${tag}`);
  assert.match(tag, /as="style"/, `font preload must be a style preload: ${tag}`);
}

console.log("home surface tests passed");
