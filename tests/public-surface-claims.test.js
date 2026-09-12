const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Public marketing and documentation surfaces after the lslabs.tw brand migration.
// These pages carry claims a visitor cannot verify, so the checks here are about
// what the HTML is allowed to say - not about how it looks.

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "apps/web/public");
const read = (rel) => fs.readFileSync(path.join(publicDir, rel), "utf8");

const home = read("home.html");
const developers = read("developers.html");
const console_ = read("developers-console.html");
const docs = read("developers/docs.html");
const surfaces = { home, developers, console: console_, docs };

// 1. One brand spelling. "LS Labs" and "LS Labs Dashboard" are the pre-migration
//    names and must not reappear anywhere a visitor can read them.
for (const [name, html] of Object.entries(surfaces)) {
  assert.doesNotMatch(html, /LS Labs/, `${name}: the brand is written LS-Labs, never "LS Labs"`);
  assert.doesNotMatch(html, /LS-Labs Dashboard/, `${name}: the product is GeoCheck Track, not a Dashboard`);
}

// 2. Business-outcome claims need a source. GeoCheck observes citations; it does
//    not measure conversion, traffic, or advantage over competitors.
for (const [name, html] of Object.entries(surfaces)) {
  assert.doesNotMatch(html, /轉換率高出|高出同業|[0-9]+\s*倍以上/,
    `${name}: unsourced business-outcome claims must not ship`);
}

// 3. Illustrative interface cards must be labelled where they are shown.
assert.match(home, /介面示意/, "GeoCheck home must label its specimen cards as illustrative");

// 4. Developer API is Private Beta: no public tiers, prices, or self-service trials
//    anywhere in the Console or the documentation.
for (const [name, html] of [["console", console_], ["docs", docs]]) {
  assert.doesNotMatch(html, /NT\$ 660|NT\$ 1,390/, `${name}: no public pricing during Private Beta`);
  assert.doesNotMatch(html, /開通免費試用|7 天免費試用/, `${name}: no self-service trial activation`);
  assert.doesNotMatch(html, /每日 3 輪|10 RPM|30 RPM|60 RPM/, `${name}: quota tiers come from the account, not from copy`);
}

// 5. Retention was stated as 30 days on one page and 7 days on another. Neither
//    number may be re-asserted by the frontend; the contract decides it.
for (const [name, html] of Object.entries(surfaces)) {
  assert.doesNotMatch(html, /保存\s*30 天|保留\s*30 天|保存\s*7 天|保留\s*7 天/,
    `${name}: data retention must not be asserted by page copy`);
}

// 6. Static provider cards are not a live health check, and one run is not a P95.
assert.doesNotMatch(developers, /LIVE/, "Platform must not label static provider cards LIVE");
assert.doesNotMatch(developers, /P95/, "Platform must not present a single run as a latency percentile");

// 7. Every JSON sample in the docs must actually parse - a reader copies these.
const jsonBlocks = [...docs.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)]
  .map((m) => m[1].replace(/<[^>]+>/g, ""))
  .map((t) => t.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim())
  .filter((t) => t.startsWith("{"));
assert.ok(jsonBlocks.length >= 4, "the docs should still contain JSON examples");
for (const [i, block] of jsonBlocks.entries()) {
  assert.doesNotThrow(() => JSON.parse(block), `docs JSON example #${i + 1} must be valid JSON`);
}

// 8. Runnable samples need a timeout and a non-2xx branch, or a reader's first
//    integration hangs on a stalled socket and retries a 401 forever.
assert.match(docs, /timeout=30/, "docs Python samples must pass a request timeout");
assert.match(docs, /--max-time 30/, "docs cURL samples must bound the request");
assert.match(docs, /--fail-with-body/, "docs cURL samples must surface the error body");
assert.match(docs, /status_code != 202/, "docs Python samples must handle a non-2xx create");
assert.match(docs, /time\.monotonic\(\) \+ 600/, "docs polling loops must have a deadline");

// 9. Packages that are not on npm must not be presented as installable.
assert.match(docs, /尚未發佈到 npm registry/, "the SDK section must state that the package is unpublished");
assert.match(docs, /官方 MCP server 尚未發佈/, "the MCP section must state that the server is unpublished");

// 10. Percentages need a stated sample and method, or no percentage at all.
assert.doesNotMatch(docs, /20%~30%/, "the crawler guide must not cite a blocking rate without a source");

// 11. Deep links into the docs must land on the section and highlight it. The
//     browser's own anchor jump fired before layout settled on a page this long,
//     so /docs#data-retention opened at the top under "首次呼叫 API".
assert.match(docs, /function scrollToHash/, "docs must scroll to an incoming hash itself");
assert.match(docs, /addEventListener\('hashchange'/, "docs must react to hash navigation");
assert.match(docs, /HEADER_OFFSET/, "docs anchor scrolling must clear the sticky header");

// 12. Every sidebar link must point at a section that exists on the page.
const sidebarHrefs = [...docs.matchAll(/<a href="#([a-z0-9-]+)"/g)].map((m) => m[1]);
assert.ok(sidebarHrefs.length > 10, "the docs sidebar should still have links");
for (const id of new Set(sidebarHrefs)) {
  assert.ok(docs.includes(`id="${id}"`), `docs sidebar links to #${id}, which has no section`);
}

console.log("public surface claim tests passed");
