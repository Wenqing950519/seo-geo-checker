#!/usr/bin/env node
// Regenerates apps/web/public/demo.html: a sample GeoCheck report rendered by
// the same reportHtml() the live /report route uses, so the demo cannot drift
// from the real report layout. Every value below is synthetic and the page
// says so; rerun this after changing realLiteReportHtml in services/api/server.js.
//
//   node scripts/maintenance/render-demo-report.cjs

const fs = require("node:fs");
const path = require("node:path");
const { reportHtml } = require("../../services/api/server.js");

const sample = {
  id: "sample-report",
  url: "https://example.com/",
  createdAt: "2026-09-25T06:00:00Z",
  homepage: { crawlQuality: { status: "partial", robotsReadable: true } },
  representativePages: [{ crawlQuality: { scorable: true } }, { crawlQuality: { scorable: true } }],
  audit: {
    score: {
      evidence_status: "measured",
      value: 44,
      label: "待改善",
      site_readiness_value: 62,
      breakdown: { answer_adoption: { value: 40 }, source_evidence: { value: 50 } },
      denominator: { total_runs: 4, valid_runs: 4 }
    },
    technical_seo: {
      issues: [
        { check: "Structured data", detail_zh: "首頁沒有 LocalBusiness 結構化資料。", impact_zh: "AI 比對店名、地址與營業時間時缺少可直接讀取的依據。" },
        { check: "Sitemap", detail_zh: "找不到 sitemap.xml。", impact_zh: "內頁較難被完整發現。" }
      ]
    },
    content_citeability: { gaps_zh: ["缺少常見問答段落", "價格以圖片呈現"] },
    priority_actions: [
      { type: "technical", target_zh: "補齊 LocalBusiness 標記", recommendation_zh: "在首頁加入店名、地址、營業時間與訂位連結的結構化資料。" },
      { type: "content", target_zh: "把常見問題寫成文字", recommendation_zh: "把招牌餐點、低消與停車說明寫成一問一答。" },
      { type: "technical", target_zh: "提供網站地圖", recommendation_zh: "產生 sitemap.xml 並在 robots.txt 中宣告。" }
    ],
    perplexity_observation: {
      observations: [
        { query: "台北約會牛排餐酒館推薦？", brandMentioned: true, firstPartyCited: true, answer: "（範例回答）如果重視氣氛與餐點完整度，可以考慮範例餐酒館：主打熟成牛排與自然酒，鄰近捷運站，可線上訂位。", sourceDomains: ["example.com", "food-blog.example"] },
        { query: "大安區適合慶生的餐酒館", brandMentioned: true, firstPartyCited: false, answer: "（範例回答）幾家常被提到的選擇包括範例餐酒館與其他兩間同業，多數資訊來自食記整理。", sourceDomains: ["food-blog.example"] },
        { query: "信義區有包場服務的餐廳", brandMentioned: false, firstPartyCited: true, answer: "（範例回答）提供包場的餐廳多半會在官網寫明人數與低消。", sourceDomains: ["example.com", "venue-guide.example"] },
        { query: "台北有自然酒的小酒館", brandMentioned: false, firstPartyCited: false, answer: "（範例回答）以自然酒聞名的小酒館集中在中山與大安一帶。", sourceDomains: ["wine-notes.example"] }
      ]
    },
    authority_evidence: { matchedExternalDomains: [] },
    limitations_zh: ["這是一份範例報告，所有網站、問題、回答與數字都是示範資料。"]
  }
};

let html = reportHtml(sample);
const replaceOnce = (from, to) => {
  if (!html.includes(from)) throw new Error(`demo template anchor missing: ${from.slice(0, 60)}`);
  html = html.replace(from, to);
};

replaceOnce("<title>GeoCheck — AI 信任值報告</title>", "<title>範例報告｜GeoCheck AI 搜尋能見度觀測鏡</title>\n<link rel=\"stylesheet\" href=\"/assets/tokens.css\">");
replaceOnce("<h1>AI 信任值檢測單</h1>", "<h1>AI 信任值檢測單 <span class=\"sample-flag\">範例</span></h1>");
replaceOnce("<main class=\"sheet\">", `<p class="sample-note">這是 GeoCheck（AI 搜尋能見度觀測鏡）報告的<strong>範例</strong>：網站、問題、回答與數字皆為示範資料。<a href="/#top">檢測你自己的網站</a></p>
<main class="sheet">`);
replaceOnce("</style>", `.head{position:relative}
.sample-flag{display:inline-block;margin-left:8px;padding:0 8px;border:1px solid var(--ink);border-radius:4px;font:700 .8rem/1.8 var(--sans);letter-spacing:.12em;vertical-align:.3em}
.sample-note{width:min(100% - 32px,880px);margin:24px auto 0;padding:12px 16px;border:1px solid #C7D7FE;border-radius:6px;background:#EFF6FF;color:var(--ink);font-size:.9rem}
.sample-note a{margin-left:8px;font-weight:700}
</style>`);
replaceOnce(`href="/report/sample-report/markdown" data-track-action="download_report">下載這份報告</a>`, `href="/#top" data-track-action="run_another_analysis">檢測你自己的網站</a>`);

const out = path.resolve(__dirname, "../../apps/web/public/demo.html");
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
process.exit(0);
