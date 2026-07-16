const assert = require("node:assert/strict");
const { assessCrawlQuality, chooseBetterResult, shouldRenderWithBrowser } = require("../lib/crawl-quality");
const { extractInternalLinks } = require("../lib/html-v2");
const { looksLikeBotChallenge } = require("../lib/browser-fetch-v2");
const { chooseRepresentativeUrls } = require("../lib/technical-signals");
const { collectScoringSignals } = require("../lib/scoring-v2");

function result(overrides = {}) {
  return {
    statusCode: 200,
    text: "網站服務內容".repeat(150),
    html: "<html><body>網站服務內容</body></html>",
    metadata: { title: "測試網站", description: "網站服務說明", h1: "測試網站", canonical: "https://example.com/" },
    fetchMethod: "http",
    ...overrides
  };
}

assert.equal(assessCrawlQuality(result()).status, "complete");
assert.equal(assessCrawlQuality(result({ text: "短內容", metadata: {} })).scorable, false);
assert.equal(shouldRenderWithBrowser(result({ text: "短內容", metadata: {}, html: '<div id="root"></div><script src="app.js"></script>' })), true);

const http = result({ text: "首頁內容".repeat(30), metadata: { title: "首頁" }, fetchMethod: "http" });
const browser = result({ fetchMethod: "browser" });
assert.equal(chooseBetterResult(http, browser).fetchMethod, "browser");

assert.deepEqual(extractInternalLinks(`
  <a href="/about">About</a><a href="https://example.com/menu">Menu</a>
  <a href="https://other.example/store">External</a><a href="mailto:test@example.com">Mail</a>
`, "https://example.com/"), ["https://example.com/about", "https://example.com/menu"]);

assert.deepEqual(chooseRepresentativeUrls([
  "https://example.com/blog/1", "https://example.com/store", "https://example.com/about", "https://example.com/menu"
], "https://example.com/"), [
  "https://example.com/about", "https://example.com/menu", "https://example.com/store"
]);

assert.equal(looksLikeBotChallenge("<html>cloudflare analytics script</html>", "正常網站", 2000), false);
assert.equal(looksLikeBotChallenge("<html>Checking your browser</html>", "Just a moment", 20), true);

const restaurantSignals = collectScoringSignals({
  homepage: result({
    finalUrl: "https://restaurant.example/",
    text: "餐廳提供訂位、外帶與外送服務",
    metadata: { title: "測試餐廳", description: "台灣料理餐廳", h1: "", canonical: "", jsonLd: { validCount: 0, types: [] } }
  }),
  technical: { robots: { readable: true, botAccess: {} }, sitemap: {} },
  representativePages: [
    { url: "https://restaurant.example/menu", text: "完整菜單與料理介紹", metadata: { jsonLd: { validCount: 1, types: ["Restaurant"] } }, crawlQuality: { scorable: true } },
    { url: "https://restaurant.example/store", text: "店鋪地址、電話與營業時間", metadata: {}, crawlQuality: { scorable: true } },
    { url: "https://restaurant.example/about", text: "品牌故事、創立沿革與最新消息", metadata: {}, crawlQuality: { scorable: true } }
  ]
});
assert.equal(restaurantSignals.siteType, "restaurant");
assert.equal(restaurantSignals.representativePageCount, 3);
assert.equal(restaurantSignals.geoSignals.cases, false, "menu pages alone are not case evidence");
assert.equal(restaurantSignals.geoSignals.comparisons, false, "store pages alone are not comparison evidence");
assert.equal(restaurantSignals.geoSignals.proof, false, "about pages alone are not authority evidence");

console.log("crawler v2 tests passed");
