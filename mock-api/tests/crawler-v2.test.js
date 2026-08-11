const assert = require("node:assert/strict");
const { assessCrawlQuality, chooseBetterResult, shouldRenderWithBrowser } = require("../lib/crawl-quality");
const { extractInternalLinks } = require("../lib/html-v2");
const { looksLikeBotChallenge, waitForBotChallengeToClear } = require("../lib/browser-fetch-v2");
const { buildGoogleTranslateUrl, fetchHomepageWithGoogleTranslate } = require("../lib/google-translate-fetch");
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

(async () => {
  const challengePage = fakePage([
    { html: "<html>Checking your browser</html>", title: "Just a moment", bodyTextLength: 20 },
    { html: "<html>Checking your browser</html>", title: "Just a moment", bodyTextLength: 20 },
    { html: "<html><body>正常網站內容</body></html>", title: "正常網站", bodyTextLength: 1500 }
  ]);
  const settled = await waitForBotChallengeToClear(challengePage, { maxAttempts: 3, intervalMs: 10 });
  assert.equal(settled.title, "正常網站");
  assert.equal(settled.challengeWaitMs, 20);
  assert.equal(challengePage.waits, 2);

  assert.equal(buildGoogleTranslateUrl("https://buna.com.tw/menu?store=1"), "https://buna-com-tw.translate.goog/menu?store=1&_x_tr_sl=auto&_x_tr_tl=zh-TW&_x_tr_hl=zh-TW");
  const translated = await fetchHomepageWithGoogleTranslate("https://buna.com.tw/", {
    requestImpl: async (url) => {
      assert.match(url, /^https:\/\/buna-com-tw\.translate\.goog\//);
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === "content-type" ? "text/html; charset=utf-8" : "" },
        text: "<html><head><title>BUNA CAF'E 布納咖啡館</title></head><body>布納咖啡館首頁內容</body></html>"
      };
    }
  });
  assert.equal(translated.fetchMethod, "google-translate");
  assert.match(translated.html, /布納咖啡館/);
  console.log("crawler v2 tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function fakePage(states) {
  let index = 0;
  return {
    waits: 0,
    async content() { return states[index].html; },
    async title() { return states[index].title; },
    locator() { return { innerText: async () => "x".repeat(states[index].bodyTextLength) }; },
    async waitForTimeout() {
      this.waits += 1;
      index = Math.min(index + 1, states.length - 1);
    }
  };
}
