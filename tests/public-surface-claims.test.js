const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Public marketing surfaces after the lslabs.tw brand migration.
// These pages carry claims a visitor cannot verify, so the checks here are about
// what the HTML is allowed to say - not about how it looks.
//
// The Platform pages (developers, console, docs) and their assertions moved to ls-labs
// tests/platform/public-surface.test.js with the pages (LSL-D-009, 2026-10-21); only the
// GeoCheck Classic pages are checked here.

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "apps/web/public");
const read = (rel) => fs.readFileSync(path.join(publicDir, rel), "utf8");

const home = read("home.html");
const surfaces = { home };

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

// 5. Retention was stated as 30 days on one page and 7 days on another. Neither
//    number may be re-asserted by the frontend; the contract decides it.
for (const [name, html] of Object.entries(surfaces)) {
  assert.doesNotMatch(html, /保存\s*30 天|保留\s*30 天|保存\s*7 天|保留\s*7 天/,
    `${name}: data retention must not be asserted by page copy`);
}

// 13. GeoCheck Track is paused (D-051) and nothing is sold on geocheck.lslabs.tw, so the
//     Track plans, prices, checkout and refund pages are gone (2026-10-19). Platform's
//     own pricing and legal pages now live in ls-labs (products/platform/public).
for (const page of ["pricing.html", "refund.html", "demo.html"]) {
  assert.ok(!fs.existsSync(path.join(publicDir, page)), `${page} must not be published on GeoCheck`);
}
const geocheckPages = ["home.html", "terms.html", "privacy.html", "whitepaper.html", "404.html"];
for (const page of geocheckPages) {
  const html = read(page);
  assert.doesNotMatch(html, /href="(?:https:\/\/geocheck\.lslabs\.tw)?\/(?:pricing|refund)"/, `${page} must not link to removed sales pages`);
  assert.doesNotMatch(html, /GeoCheck Track 標準方案|NT\$\s?330|藍新金流|定期定額/, `${page} must not describe a Track sale`);
}
assert.doesNotMatch(read("sitemap.xml"), /geocheck\.lslabs\.tw\/(?:pricing|refund)</, "removed sales pages must leave the sitemap");

console.log("public surface claim tests passed");
