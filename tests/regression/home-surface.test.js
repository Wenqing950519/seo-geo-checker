const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { computeAiTrustIndex } = require("../../packages/geo-core/scoring/ai-trust-index.js");

// The GeoCheck home page shows a sample result slip. Every number on it must be one
// the Classic pipeline could produce, and the sample must not be attributed to a
// real business.
const home = fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/home.html"), "utf8");
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// 1. The sample is labelled and anonymous.
const slip = home.match(/<article class="slip"[\s\S]*?<\/article>/);
assert.ok(slip, "home must show the sample result slip");
assert.match(slip[0], /class="flag flag--sample">範例</, "the sample slip must carry the 範例 flag");
assert.doesNotMatch(home, /艾朋|À Point|real-site-apoint/, "the sample must not borrow a real business");

// 2. Classic plans four questions per site (query-planner SELECTED_QUERY_COUNT), so a
//    rate is a whole number of questions out of the valid ones, and the score is what
//    AI Trust Index v1 computes from those rates.
const rows = Object.fromEntries(
  [...slip[0].matchAll(/<th scope="row">([^<]*)[\s\S]*?<\/th>\s*<td class="slip-value">([\s\S]*?)<\/td>/g)]
    .map(([, label, value]) => [label.trim(), strip(value)])
);
const observed = Number(strip(slip[0]).match(/觀測題數 (\d+)/)?.[1]);
const unknown = Number(rows["沒拿到回答的題目"]?.match(/^(\d+) 題$/)?.[1]);
assert.ok(observed >= 1 && observed <= 4, "the sample must observe between one and four questions");
assert.ok(Number.isInteger(unknown) && unknown < observed, "the sample must state how many questions had no answer");
const valid = observed - unknown;
const rate = (label) => {
  const match = rows[label]?.match(/^(\d+)% (\d+) \/ (\d+) 題$/);
  assert.ok(match, `${label} must show a rate with its question count, e.g. "50% 2 / 4 題"`);
  const [percent, hits, of] = match.slice(1).map(Number);
  assert.equal(of, valid, `${label} must be counted over the ${valid} valid questions`);
  assert.equal(percent, Math.round((hits / of) * 100), `${label}: ${hits}/${of} is not ${percent}%`);
  return percent;
};
const index = computeAiTrustIndex({
  measuredQueryCount: valid,
  queryCount: observed,
  mentionRate: rate("AI 有沒有提到你"),
  citationRate: rate("AI 有沒有引用你的官網")
});
assert.equal(rows["AI 信任值"], `${index.value} / 100`, "the sample score must follow AI Trust Index v1");

// 3. Claims the page cannot back: a trend chart for a one-off snapshot, an unsourced
//    site count, and a link into the paused Dashboard (D-051).
assert.doesNotMatch(home, /Top Position Trend|semrush-section/, "a snapshot tool must not draw a trend chart");
assert.doesNotMatch(home, />50\+</, "the checked-site count has no source");
assert.doesNotMatch(home, /app\.lslabs\.tw/, "the paused Dashboard must not be linked");

// 4. GA4 CTA names feed existing funnels; a redesign keeps them.
for (const name of ["nav_start_audit", "hero_start_audit", "report_preview_start_audit", "final_research_open", "final_recheck"]) {
  assert.match(home, new RegExp(`data-track-cta="${name}"`), `home must keep the ${name} CTA event`);
}

// 5. Fonts never block the first paint. The Google Fonts stylesheets load as preloads
//    (a <noscript> copy is allowed), and the hero headline's subset carries every
//    character of the headline, or a renamed headline silently falls back.
const outsideNoscript = home.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
for (const tag of outsideNoscript.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) || []) {
  assert.match(tag, /rel="preload"/, `render-blocking font stylesheet: ${tag}`);
  assert.match(tag, /as="style"/, `font preload must be a style preload: ${tag}`);
}
const subset = outsideNoscript.match(/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+TC:wght@900&amp;text=([^&"]+)/);
assert.ok(subset, "the hero headline needs its own weight-900 subset");
const subsetChars = new Set(decodeURIComponent(subset[1]));
const headline = strip(home.replace(/<!--[\s\S]*?-->/g, "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]).replace(/\s/g, "");
for (const char of headline) assert.ok(subsetChars.has(char), `headline character "${char}" is missing from the font subset`);

console.log("home surface tests passed");
