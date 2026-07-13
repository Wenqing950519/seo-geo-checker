const assert = require("node:assert/strict");
const { extractMetadata, looksClientRendered } = require("../lib/html-v2");
const { parseRobotsTxt, evaluateRobotsAccess } = require("../lib/technical-signals");
const { collectScoringSignals, computeScoreV2, WEIGHTS } = require("../lib/scoring-v2");

function baseHomepage(overrides = {}) {
  return {
    statusCode: 200,
    text: "",
    initialTextLength: 0,
    headers: {},
    metadata: {
      title: "", description: "", h1: "", canonical: "", robots: "", googlebot: "",
      ogTitle: "", ogDescription: "", imageCount: 0, imagesWithAlt: 0,
      headingLevels: [], jsonLd: { validCount: 0, types: [] }
    },
    ...overrides
  };
}

function baseTechnical(botAllowed = true) {
  return {
    robots: {
      readable: true,
      sitemaps: [],
      botAccess: {
        Googlebot: { allowed: botAllowed },
        "OAI-SearchBot": { allowed: botAllowed },
        "Claude-SearchBot": { allowed: botAllowed }
      }
    },
    sitemap: { valid: false, homepageIncluded: false }
  };
}

assert.equal(Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0), 100, "V2 weights must total 100");

const metadata = extractMetadata(`<!doctype html><html><head>
  <meta content="店家摘要" name="description">
  <meta content="分享標題" property="og:title"><meta property="og:description" content="分享摘要">
  <link href="https://example.com/" rel="canonical"><title>店家名稱</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"店家"}</script>
  </head><body><h1>主要服務</h1><img src="shop.jpg" alt="店面外觀"></body></html>`);
assert.equal(metadata.description, "店家摘要");
assert.equal(metadata.canonical, "https://example.com/");
assert.equal(metadata.jsonLd.validCount, 1);
assert.deepEqual(metadata.jsonLd.types, ["LocalBusiness"]);
assert.equal(metadata.imagesWithAlt, 1);

assert.equal(looksClientRendered({ text: "", html: '<div id="root"></div><script src="app.js"></script>' }), true);

const robots = parseRobotsTxt(`
User-agent: *
Allow: /
Sitemap: https://example.com/sitemap.xml

User-agent: GPTBot
Disallow: /

User-agent: OAI-SearchBot
Allow: /
`);
assert.equal(evaluateRobotsAccess(robots, "GPTBot", "/").allowed, false);
assert.equal(evaluateRobotsAccess(robots, "OAI-SearchBot", "/").allowed, true);
assert.equal(evaluateRobotsAccess(robots, "Googlebot", "/").allowed, true);
assert.deepEqual(robots.sitemaps, ["https://example.com/sitemap.xml"]);

// A: image-only cafe. It must not receive a healthy score merely because fetching works.
const caseA = computeScoreV2(collectScoringSignals({
  homepage: baseHomepage({ metadata: { ...baseHomepage().metadata, imageCount: 1, imagesWithAlt: 0 } }),
  technical: baseTechnical(true)
}));
assert.ok(caseA.score <= 42, `image-only case should be critical, got ${caseA.score}`);

// B: SPA with good rendered content but an empty initial shell. It passes content quality but loses render-safety points.
const spaText = "服務流程 常見問題 適合對象 客戶案例 數據來源 ".repeat(50);
const caseB = computeScoreV2(collectScoringSignals({
  homepage: baseHomepage({
    text: spaText,
    initialTextLength: 40,
    metadata: {
      ...baseHomepage().metadata,
      title: "山海民宿｜花蓮住宿", description: "花蓮在地民宿", h1: "花蓮山海民宿",
      canonical: "https://example.com/", ogTitle: "山海民宿", ogDescription: "花蓮住宿",
      headingLevels: [1, 2, 2], jsonLd: { validCount: 1, types: ["LocalBusiness"] }
    }
  }),
  technical: {
    ...baseTechnical(true),
    robots: { ...baseTechnical(true).robots, sitemaps: ["https://example.com/sitemap.xml"] },
    sitemap: { valid: true, homepageIncluded: true }
  }
}));
assert.ok(caseB.score >= 70 && caseB.score < 95, `SPA case should be decent but not perfect, got ${caseB.score}`);
assert.equal(caseB.checks.find((check) => check.id === "initial_html_text").status, "fail");
assert.equal(caseB.checks.find((check) => check.id === "render_consistency").status, "fail");

// C: complete content with Disallow: /. Strong content cannot hide a sitewide crawl block.
const blockedTechnical = baseTechnical(false);
blockedTechnical.robots.sitemaps = ["https://example.com/sitemap.xml"];
blockedTechnical.sitemap = { valid: true, homepageIncluded: true };
const fullText = "服務 方案 流程 適合對象 常見問題 客戶案例 比較 數據 研究 來源 ".repeat(60);
const caseC = computeScoreV2(collectScoringSignals({
  homepage: baseHomepage({
    text: fullText,
    initialTextLength: fullText.length,
    metadata: {
      ...baseHomepage().metadata,
      title: "完整店家官網", description: "完整服務摘要", h1: "店家服務",
      canonical: "https://example.com/", ogTitle: "完整店家", ogDescription: "完整摘要",
      imageCount: 2, imagesWithAlt: 2, headingLevels: [1, 2, 2],
      jsonLd: { validCount: 1, types: ["LocalBusiness"] }
    }
  }),
  technical: blockedTechnical
}));
assert.equal(caseC.cap, 35);
assert.equal(caseC.score, 35);

console.log(JSON.stringify({
  passed: true,
  cases: { imageOnlyCafe: caseA.score, spaGuesthouse: caseB.score, robotsBlockedStore: caseC.score }
}, null, 2));
