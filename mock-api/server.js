const http = require("http");
const { randomUUID, timingSafeEqual } = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadEnvFiles } = require("./lib/env");
const { toClientError } = require("./lib/errors");
const {
  checkAuditLimit,
  getRateLimitState,
  recordAuditEnd,
  recordAuditStart
} = require("./lib/rate-limit");
const { runRealLiteAudit } = require("./lib/real-lite-audit");
const { createAuditCache } = require("./lib/audit-cache");
const { createFunnelRecorder } = require("./lib/funnel-events");
const { assertSafePublicUrl } = require("./lib/url-safety");
const { testGeminiProvider } = require("./providers/gemini");
const { searchPerplexity, testPerplexityProvider } = require("./providers/perplexity");
const { getUsageSummary } = require("./lib/usage-meter");
const { buildResearchProfile } = require("./lib/research-profile");
const { buildGeoQueryPlan } = require("./lib/query-planner");

loadEnvFiles();

const PORT = Number(process.env.PORT || 8787);
const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN || "https://geocheck.lisheng.cv");
const LEGACY_HOST = String(process.env.LEGACY_HOST || "geocheck.tungowo.com").toLowerCase();

const jobs = new Map();
const reports = new Map();
const leads = [];
const auditCache = createAuditCache();
const funnel = createFunnelRecorder();
const TALLY_FORM_URL = "https://tally.so/r/obxVMX";
const GA_TAG_HTML = `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-CBTTKVLT82"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-CBTTKVLT82');
  </script>`;

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token"
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(html);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

function sendHealth(res) {
  const body = '{"ok":true,"service":"geocheck"}\n';
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function sendMarkdown(res, filename, markdown) {
  res.writeHead(200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(markdown);
}

function getAdminPathToken() {
  const token = String(process.env.ADMIN_PATH_TOKEN || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : "";
}

function isValidAdminToken(req) {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = String(req.headers["x-admin-token"] || "");
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function requestHost(req) {
  return String(req.headers.host || "").split(":")[0].toLowerCase();
}

function maybeRedirectLegacyHost(req, res, url) {
  if (!LEGACY_HOST || requestHost(req) !== LEGACY_HOST) return false;
  res.writeHead(301, {
    "Location": `${SITE_ORIGIN}${url.pathname}${url.search}`,
    "Cache-Control": "public, max-age=3600"
  });
  res.end();
  return true;
}

// 內容實際更新日:改版時手動更新,不要用當天日期(lastmod 天天變會失去搜尋引擎信任)
const CONTENT_LASTMOD = "2026-07-18";

function robotsTxt() {
  return [
    "# GEOCheck 歡迎搜尋引擎與 AI 爬蟲。",
    "# 注意:若 Cloudflare 開啟了「Block AI bots / managed robots.txt」,會覆蓋此檔案並封鎖",
    "# GPTBot、ClaudeBot、PerplexityBot 等,請務必在 Cloudflare 後台關閉該設定。",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# 明確允許主要 AI 爬蟲(GEO 必要條件)",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: Claude-SearchBot",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "User-agent: CCBot",
    "Allow: /",
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    ""
  ].join("\n");
}

function sitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <lastmod>${CONTENT_LASTMOD}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

function llmsTxt() {
  return `# GEOCheck — AI 搜尋能見度健檢

> GEOCheck(${SITE_ORIGIN})是免費的 SEO/GEO 健檢工具,輸入網址即可在約 60 秒內,
> 透過 Brave Search、Perplexity Sonar 與 Gemini 檢查網站在 Google 與 AI 搜尋引擎
> (ChatGPT、Perplexity、Gemini)中的能見度,並提供三個優先修正方向。免費、無需註冊。

## 品牌定義

- GEOCheck 是台灣的 AI 搜尋能見度健檢工具與 SEO/GEO 顧問服務,服務對象為想在
  AI 搜尋時代被看見的中小企業、B2B 品牌與行銷團隊。
- 健檢包含五大模組:AI 眼中定位、技術 SEO 健檢(12 項檢查)、內容可引用性、
  GEO 能見度實測(Gemini 產 5–8 題候選並選 2 題交由 Perplexity)、優先修正方向(P1–P3)。

## 主要頁面

- [首頁與免費健檢](${SITE_ORIGIN}/): 輸入網址開始 60 秒免費健檢
- [健檢五大模組](${SITE_ORIGIN}/#modules): 健檢涵蓋的檢查範圍
- [報告範例](${SITE_ORIGIN}/#report): 健檢報告的實際內容與格式
- [服務方案](${SITE_ORIGIN}/#services): GEO 優化、SEO 顧問、技術 SEO 健檢三種服務
- [學習資源](${SITE_ORIGIN}/#resources): GEO 是什麼、AI 搜尋能見度、llms.txt、schema 說明

## 常見問題

- GEO(Generative Engine Optimization)是讓品牌更容易被 ChatGPT、Perplexity 等
  生成式 AI 引用與推薦的優化方法;SEO 競爭排名,GEO 競爭「被 AI 選進答案」。
- AI 沒提到你的品牌,通常是定位訊號不清楚、內容缺乏可引用段落或缺少權威佐證,
  而不是運氣問題。
`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("URL is required");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http(s) URLs are supported");
  return parsed.toString();
}

function createMockReport(reportId, siteUrl) {
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  return {
    id: reportId,
    url: siteUrl,
    createdAt: new Date().toISOString(),
    score: {
      value: 62,
      label: "Needs Work",
      summary: `${host} 的技術 SEO 基礎大致可被搜尋引擎讀取，但 AI 對品牌定位的理解仍偏模糊。下一步應優先補強首頁定義、結構化資料與決策型 FAQ。`
    },
    positioning: {
      perceivedCategory: "可能被理解為一般服務型網站",
      perceivedAudience: ["正在比較解決方案的潛在客戶", "需要快速判斷可信度的決策者"],
      gaps: ["首頁缺少清楚的一句話品牌定義", "服務對象與使用情境不夠明確", "缺少可被 AI 摘錄的 FAQ 或比較段落"]
    },
    seoIssues: [
      { severity: "high", check: "Organization schema", detail: "尚未偵測到清楚的 Organization schema。" },
      { severity: "medium", check: "Meta description", detail: "部分描述偏行銷口吻，缺少具體搜尋意圖。" },
      { severity: "low", check: "llms.txt", detail: "尚未偵測到 llms.txt，可作為 AI 內容導覽補充。" }
    ],
    geo: {
      measurementType: "mock_source_visibility_proxy",
      questions: [
        { question: `什麼是 ${host}？`, cited: false, competitors: ["competitor-a.com"] },
        { question: "有哪些適合中小企業的 SEO/GEO 優化服務？", cited: false, competitors: ["competitor-b.com"] },
        { question: "如何讓網站更容易被 AI 搜尋引用？", cited: false, competitors: ["competitor-c.com"] }
      ]
    },
    actions: [
      {
        priority: "P1",
        type: "AI Positioning",
        target: "首頁 Hero / About",
        recommendation: "補上一段清楚定義品牌、服務對象與核心使用情境的文字，讓 AI 能判斷網站屬於哪個品類。"
      },
      {
        priority: "P2",
        type: "Technical SEO",
        target: "全站",
        recommendation: "新增 Organization、WebSite、Service schema，提高搜尋引擎與 AI 對品牌實體的辨識。"
      },
      {
        priority: "P3",
        type: "Content",
        target: "服務頁 / FAQ",
        recommendation: "建立決策型 FAQ 與比較段落，回答「適合誰、和競品差在哪、需要多久」等高意圖問題。"
      }
    ]
  };
}

function reportHtml(report) {
  if (report.audit) return realLiteReportHtml(report);

  const issueRows = report.seoIssues.map((issue) => `
    <tr>
      <td>${issue.severity}</td>
      <td>${issue.check}</td>
      <td>${issue.detail}</td>
    </tr>
  `).join("");
  const actionRows = report.actions.map((action) => `
    <tr>
      <td>${action.priority}</td>
      <td>${action.type}</td>
      <td>${action.target}</td>
      <td>${action.recommendation}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  ${GA_TAG_HTML}
  <title>SEO/GEO 健檢報告 - ${escapeHtml(report.url)}</title>
  <style>
    body{font-family:system-ui,"Noto Sans TC",sans-serif;margin:0;background:#f7f9fc;color:#1e2a38;line-height:1.7}
    main{max-width:960px;margin:0 auto;padding:48px 20px}
    .card{background:#fff;border:1px solid #e5edf5;border-radius:12px;padding:24px;margin:18px 0;box-shadow:0 8px 24px rgba(11,59,111,.08)}
    h1,h2{color:#0b3b6f;line-height:1.3}
    .score{font-size:56px;font-weight:800;color:#00a99b}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;border-bottom:1px solid #e5edf5;padding:10px;vertical-align:top}
    .badge{display:inline-block;padding:4px 12px;border-radius:999px;background:#fff4e0;color:#9a6500;font-weight:700}
    .report-nav{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
    a.button{display:inline-block;background:#00b8a9;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700}
    a.button.secondary{background:#fff;color:#0b3b6f;border:1px solid #cdd9e5}
    @media(max-width:640px){
      main{padding:30px 14px}
      .card{padding:18px;border-radius:10px}
      h1{font-size:1.65rem}
      h2{font-size:1.2rem}
      .score{font-size:48px}
      table{display:block;overflow-x:auto;white-space:nowrap}
      th,td{padding:8px}
      .report-nav a.button{width:100%;text-align:center}
    }
  </style>
</head>
<body>
  <main>
    ${reportTopNavHtml()}
    <h1>SEO/GEO 網站健檢報告</h1>
    <p>${escapeHtml(report.url)}</p>
    <section class="card">
      <h2>整體健康度</h2>
      <div class="score">${report.score.value}</div>
      <p><span class="badge">${escapeHtml(report.score.label)}</span></p>
      <p>${escapeHtml(report.score.summary)}</p>
    </section>
    <section class="card">
      <h2>AI 眼中定位</h2>
      <p><strong>可能分類：</strong>${escapeHtml(report.positioning.perceivedCategory)}</p>
      <ul>${report.positioning.gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>
    </section>
    <section class="card">
      <h2>技術 SEO 問題</h2>
      <table><thead><tr><th>嚴重度</th><th>檢查項目</th><th>說明</th></tr></thead><tbody>${issueRows}</tbody></table>
    </section>
    <section class="card">
      <h2>建議優先處理的 3 件事</h2>
      <table><thead><tr><th>優先級</th><th>類型</th><th>目標</th><th>建議方向</th></tr></thead><tbody>${actionRows}</tbody></table>
    </section>
    <section class="card">
      <h2>想知道這些問題該怎麼修？</h2>
      <p>這是 mock 報告。下一步可以把 mock analyzer 換成真實 crawler、SEO analyzer 與 AI positioning。</p>
      <a class="button secondary" href="/report/${encodeURIComponent(report.id)}/markdown">下載健檢報告</a>
      <a class="button" href="${TALLY_FORM_URL}" target="_blank" rel="noopener">預約報告解讀</a>
    </section>
  </main>
</body>
</html>`;
}

function realLiteReportHtml(report) {
  const audit = report.audit || {};
  const issues = audit.technical_seo?.issues || [];
  const actions = audit.priority_actions || [];
  const questions = audit.geo_questions || [];
  const gaps = audit.content_citeability?.gaps_zh || [];
  const score = audit.score || {};
  const observation = audit.perplexity_observation || {};
  const authority = audit.authority_evidence || {};
  const aiValidation = audit.ai_validation || {};
  const queryPlanning = audit.query_planning || {};
  const scoreValue = Number.isFinite(score.value) ? score.value : "—";
  const readinessValue = Number.isFinite(score.site_readiness_value) ? score.site_readiness_value : "—";
  const scoreContext = score.evidence_status === "measured"
    ? "此分數以 Perplexity 的實際搜尋提及與官網引用為主，不等同傳統 SEO 分數。"
    : "Perplexity 搜尋證據不足，因此不顯示整體 GEO 分數；站內準備度仍可單獨參考。";
  const crawlQuality = report.homepage?.crawlQuality || {};
  const representativeSuccess = (report.representativePages || []).filter((page) => page.crawlQuality?.scorable).length;
  const breakdownLabels = { technical_access: "必要技術存取", content_citeability: "內容可引用性", perplexity_observation: "Perplexity 搜尋實測" };
  const breakdownRows = Object.entries(score.breakdown || {}).map(([key, value]) =>     `<tr><td>${escapeHtml(breakdownLabels[key] || key)}</td><td>${escapeHtml(value.score ?? "—")}</td><td>${escapeHtml(value.weight ?? "—")}%</td></tr>`
  ).join("");
  const matchedDomains = authority.matchedExternalDomains || [];
  const observationRows = (observation.observations || []).map((item) =>     `<tr><td>${escapeHtml(item.query || "")}</td><td>${item.brandMentioned ? "是" : "否"}</td><td>${item.firstPartyCited ? "是" : "否"}</td><td>${escapeHtml((item.sourceDomains || []).join(", ") || "—")}</td></tr>`
  ).join("");
  const issueRows = issues.map((issue) => `<tr><td>${escapeHtml(issue.severity || "")}</td><td>${escapeHtml(issue.check || "")}</td><td>${escapeHtml(issue.detail_zh || "")}</td><td>${escapeHtml(issue.impact_zh || "")}</td></tr>`).join("");
  const actionRows = actions.map((action) => `<tr><td>${escapeHtml(action.priority || "")}</td><td>${escapeHtml(action.type || "")}</td><td>${escapeHtml(action.target_zh || "")}</td><td>${escapeHtml(action.recommendation_zh || "")}</td></tr>`).join("");
  const selectedQueryIds = new Set((queryPlanning.selected_queries || []).map((item) => item.id));
  const candidateRows = (queryPlanning.candidates || []).map((item) => `<tr><td>${escapeHtml(item.text || "")}</td><td>${escapeHtml(item.intent || "")}</td><td>${selectedQueryIds.has(item.id) ? "已選入實測" : "候選"}</td></tr>`).join("");

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>${GA_TAG_HTML}
<title>GeoCheck GEO 健檢報告 - ${escapeHtml(report.url)}</title>
<style>
body{font-family:system-ui,"Noto Sans TC",sans-serif;margin:0;background:#f7f9fc;color:#1e2a38;line-height:1.7}main{max-width:1040px;margin:0 auto;padding:48px 20px}.card{background:#fff;border:1px solid #e5edf5;border-radius:12px;padding:24px;margin:18px 0;box-shadow:0 8px 24px rgba(11,59,111,.08)}h1,h2,h3{color:#0b3b6f;line-height:1.3}.score{font-size:56px;font-weight:800;color:#00a99b}.readiness{font-size:28px;font-weight:750;color:#0b3b6f}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #e5edf5;padding:10px;vertical-align:top}.badge{display:inline-block;padding:4px 12px;border-radius:999px;background:#fff4e0;color:#9a6500;font-weight:700}.meta{color:#5a6b7e;font-size:.92rem}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.metric{background:#f4f8fc;border-radius:10px;padding:14px}.report-nav{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}a.button{display:inline-block;background:#00b8a9;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700}a.button.secondary{background:#fff;color:#0b3b6f;border:1px solid #cdd9e5}@media(max-width:640px){main{padding:30px 14px}.card{padding:18px}.metrics{grid-template-columns:1fr}.score{font-size:48px}table{display:block;overflow-x:auto;white-space:nowrap}.report-nav a.button{width:100%;text-align:center}}
</style></head><body><main>
${reportTopNavHtml()}
<h1>GeoCheck GEO 網站健檢報告</h1><p>${escapeHtml(report.url)}</p>
<p class="meta">Provider: ${escapeHtml(displayProvider(report.provider))} / Model: ${escapeHtml(displayModel(report.model))} / Attempts: ${escapeHtml(report.attempts || 1)} / Latency: ${escapeHtml(report.latencyMs)}ms</p>
<section class="card"><h2>Perplexity GEO 實測分數</h2><div class="score">${escapeHtml(scoreValue)}</div><p><span class="badge">${escapeHtml(score.label || "GEO 證據不足")}</span></p><p>${scoreContext}</p><p>${escapeHtml(score.summary_zh || "")}</p><hr/><h3>站內準備度</h3><div class="readiness">${escapeHtml(readinessValue)} / 100</div><p class="meta">此數字只衡量網站可抓取與內容準備，不代表已被 AI 搜尋看見。</p></section>
<section class="card"><h2>GEO 三層計分</h2><table><thead><tr><th>層級</th><th>分數</th><th>權重</th></tr></thead><tbody>${breakdownRows}</tbody></table></section>
<section class="card"><h2>搜尋問題設計</h2><p><strong>Gemini 判定產業：</strong>${escapeHtml(queryPlanning.industry || "未知")}；<strong>主要商品／服務：</strong>${escapeHtml(queryPlanning.primary_offering || "未知")}；<strong>信心：</strong>${escapeHtml(queryPlanning.confidence || "low")}。</p><p class="meta">先由 Gemini 依網站內容產生 ${escapeHtml(queryPlanning.candidate_count ?? 0)} 題候選，再由後端排除品牌詞、技術製作商、低相關與重複問題，選出代表題交給 Perplexity。Gemini 不參與分數。</p><table><thead><tr><th>候選非品牌問題</th><th>意圖</th><th>狀態</th></tr></thead><tbody>${candidateRows}</tbody></table></section>
<section class="card"><h2>Perplexity 搜尋觀測</h2><div class="metrics"><div class="metric"><strong>有效查詢</strong><br/>${escapeHtml(observation.measuredQueryCount ?? 0)} / ${escapeHtml(observation.queryCount ?? 0)}</div><div class="metric"><strong>品牌提及率</strong><br/>${escapeHtml(observation.mentionRate ?? "—")}%</div><div class="metric"><strong>官網引用率</strong><br/>${escapeHtml(observation.citationRate ?? "—")}%</div></div><p><strong>實體對齊：</strong>${authority.entityGrounded ? "已找到同一品牌的外部證據" : "未找到足夠的同一實體證據"}</p><p><strong>相符外部來源：</strong>${escapeHtml(matchedDomains.join(", ") || "無")}</p><table><thead><tr><th>非品牌搜尋題</th><th>提及品牌</th><th>引用官網</th><th>來源網域</th></tr></thead><tbody>${observationRows}</tbody></table></section>
<section class="card"><h2>資料抓取狀態</h2><p>抓取品質：${escapeHtml(crawlQuality.status || "unknown")}；方式：${escapeHtml(report.homepage?.fetchMethod || "unknown")}；覆蓋率：${escapeHtml(crawlQuality.coverage ?? 0)}%；成功代表頁：${escapeHtml(representativeSuccess)}。</p></section>
<section class="card"><h2>Gemini 產業與問題規劃（不參與計分）</h2><p class="meta">${escapeHtml(aiValidation.message_zh || "AI 解讀暫時無法使用")}</p><p><strong>可能分類：</strong>${escapeHtml(audit.positioning?.perceived_category_zh || "未知")}</p><p><strong>信心等級：</strong>${escapeHtml(audit.positioning?.confidence || "low")}</p></section>
<section class="card"><h2>技術與抓取問題</h2><table><thead><tr><th>嚴重度</th><th>檢查</th><th>問題</th><th>影響</th></tr></thead><tbody>${issueRows}</tbody></table></section>
<section class="card"><h2>本次選入實測的 GEO 問題</h2><ul>${questions.map((q) => `<li>${escapeHtml(q.question_zh)} <span class="meta">(${escapeHtml(q.intent)}, value ${escapeHtml(q.business_value)})</span></li>`).join("")}</ul></section>
<section class="card"><h2>內容可引用性缺口</h2><ul>${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul></section>
<section class="card"><h2>優先修正的 3 件事</h2><table><thead><tr><th>優先級</th><th>類型</th><th>目標</th><th>怎麼做</th></tr></thead><tbody>${actionRows}</tbody></table></section>
<section class="card"><h2>資料限制</h2><ul>${(audit.limitations_zh || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
<section class="card"><a class="button secondary" href="/report/${encodeURIComponent(report.id)}/markdown">下載健檢報告</a> <a class="button" href="${TALLY_FORM_URL}" target="_blank" rel="noopener">預約報告解讀</a></section>
</main></body></html>`;
}

function reportTopNavHtml() {
  return `
    <nav class="report-nav" aria-label="報告操作">
      <a class="button secondary" href="/home">← 回到主頁</a>
    </nav>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayProvider(provider) {
  const value = String(provider || "").trim();
  const legacyProvider = ["ge", "mini"].join("");
  if (value.toLowerCase() === legacyProvider) return "agnes";
  return value || "agnes";
}

function displayModel(model) {
  const value = String(model || "").trim();
  const legacyProvider = ["ge", "mini"].join("");
  if (value.toLowerCase().startsWith(legacyProvider)) return "agnes-2.0-flash";
  return value || "agnes-2.0-flash";
}

function normalizeReportForClient(report) {
  if (!report || typeof report !== "object") return report;
  return {
    ...report,
    provider: displayProvider(report.provider),
    model: displayModel(report.model)
  };
}

function reportMarkdown(report) {
  return report.audit ? realLiteReportMarkdown(report) : mockReportMarkdown(report);
}

function mockReportMarkdown(report) {
  return `# SEO/GEO 網站健檢報告

- URL: ${report.url}
- Report ID: ${report.id}
- Created At: ${report.createdAt}

## 整體健康度

- Score: ${report.score.value}
- Label: ${report.score.label}

${report.score.summary}

## AI 眼中定位

- 可能分類: ${report.positioning.perceivedCategory}

${report.positioning.gaps.map((gap) => `- ${gap}`).join("\n")}

## 技術 SEO 問題

${report.seoIssues.map((issue) => `- [${issue.severity}] ${issue.check}: ${issue.detail}`).join("\n")}

## GEO 測試問題

${report.geo.questions.map((q) => `- ${q.question} / cited: ${q.cited} / competitors: ${(q.competitors || []).join(", ")}`).join("\n")}

## 建議優先處理的 3 件事

${report.actions.map((action) => `### ${action.priority} ${action.type}

- Target: ${action.target}
- Recommendation: ${action.recommendation}
`).join("\n")}

## 給 AI 協作的提示

請根據以上 SEO/GEO 健檢結果，協助我把每一個 P1-P3 建議拆成可執行的修復任務，並指出需要修改的頁面、文案、schema 或內容區塊。
`;
}

function realLiteReportMarkdown(report) {
  const audit = report.audit || {};
  const score = audit.score || {};
  const observation = audit.perplexity_observation || {};
  const authority = audit.authority_evidence || {};
  const queryPlanning = audit.query_planning || {};
  return `# GeoCheck GEO 網站健檢報告

- URL: ${report.url}
- Report ID: ${report.id}
- Created At: ${report.createdAt}
- Algorithm: ${score.algorithm_version || report.algorithmVersion || ""}

## 核心分數

- Perplexity GEO 實測：${score.value ?? "未知"}
- 站內準備度：${score.site_readiness_value ?? "未知"}
- 狀態：${score.evidence_status || "unknown"}

${score.summary_zh || ""}

## 搜尋問題設計

- Gemini 判定產業：${queryPlanning.industry || "未知"}
- 主要商品／服務：${queryPlanning.primary_offering || "未知"}
- 候選題數：${queryPlanning.candidate_count ?? 0}
- 選入實測：${(queryPlanning.selected_queries || []).map((item) => item.text).join("；") || "無"}

## Perplexity 搜尋觀測

- 有效查詢：${observation.measuredQueryCount ?? 0} / ${observation.queryCount ?? 0}
- 品牌提及率：${observation.mentionRate ?? "未知"}%
- 官網引用率：${observation.citationRate ?? "未知"}%
- 實體對齊：${authority.entityGrounded ? "是" : "否"}
- 相符外部來源：${(authority.matchedExternalDomains || []).join(", ") || "無"}

${(observation.observations || []).map((item) => `- ${item.query}: 品牌提及=${item.brandMentioned ? "是" : "否"}；官網引用=${item.firstPartyCited ? "是" : "否"}`).join("\n")}

## 技術與抓取問題

${(audit.technical_seo?.issues || []).map((issue) => `- [${issue.severity}] ${issue.check}: ${issue.detail_zh}`).join("\n")}

## 內容可引用性

${(audit.content_citeability?.gaps_zh || []).map((item) => `- ${item}`).join("\n")}

## 優先修正

${(audit.priority_actions || []).map((action) => `- ${action.priority} ${action.target_zh}: ${action.recommendation_zh}`).join("\n")}

## 資料限制

${(audit.limitations_zh || []).map((item) => `- ${item}`).join("\n")}
`;
}

function markdownFilename(report) {
  const host = (() => {
    try {
      return new URL(report.url).hostname.replace(/^www\./, "");
    } catch {
      return "seo-geo-report";
    }
  })();
  const date = new Date().toISOString().slice(0, 10);
  return `${host}-seo-geo-report-${date}.md`.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (maybeRedirectLegacyHost(req, res, url)) return;

  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    return sendHealth(res);
  }

  if (req.method === "GET" && url.pathname === "/robots.txt") {
    return sendText(res, 200, robotsTxt());
  }

  if (req.method === "GET" && url.pathname === "/sitemap.xml") {
    return sendText(res, 200, sitemapXml(), "application/xml; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/llms.txt") {
    return sendText(res, 200, llmsTxt(), "text/plain; charset=utf-8");
  }

  // 正典 URL 統一為 /:根路徑直接以 200 回傳首頁(canonical/og:url/schema 均指向 /)
  if (req.method === "GET" && url.pathname === "/") {
    const prototypePath = path.resolve(__dirname, "public", "home.html");
    if (!fs.existsSync(prototypePath)) {
      return sendHtml(res, 404, "<h1>Prototype HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(prototypePath, "utf8"));
  }

  // 靜態資產:og-image 與 favicon(缺檔時回 404,不再讓 meta 指向不存在的資源)
  if (req.method === "GET" && (url.pathname === "/og-image.png" || url.pathname === "/favicon.png" || url.pathname === "/favicon.ico")) {
    const assetName = url.pathname === "/og-image.png" ? "og-image.png" : "favicon.png";
    const assetPath = path.resolve(__dirname, "public", assetName);
    if (!fs.existsSync(assetPath)) return sendText(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end(fs.readFileSync(assetPath));
  }

  const adminPathToken = getAdminPathToken();
  const privateAdminPath = adminPathToken ? `/${adminPathToken}` : "";
  if (privateAdminPath && req.method === "GET" && url.pathname === privateAdminPath) {
    const adminPath = path.resolve(__dirname, "public", "admin.html");
    if (!fs.existsSync(adminPath)) return sendHtml(res, 404, "<h1>Not found</h1>");
    return sendHtml(res, 200, fs.readFileSync(adminPath, "utf8"));
  }

  // 舊路徑 /home 以 301 併入正典 /
  if (req.method === "GET" && url.pathname === "/home") {
    res.writeHead(301, {
      "Location": "/",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end();
  }

  if (privateAdminPath && req.method === "GET" && url.pathname === `${privateAdminPath}/usage`) {
    if (!isValidAdminToken(req)) return sendJson(res, 401, { error: "Unauthorized" });
    return sendJson(res, 200, getUsageSummary({ limit: url.searchParams.get("limit") }));
  }

  if (req.method === "POST" && url.pathname === "/api/internal/query-plan") {
    if (!isValidAdminToken(req)) return sendJson(res, 401, { error: "Unauthorized" });
    try {
      const body = await readJson(req);
      if (!body.input || typeof body.input !== "object") return sendJson(res, 400, { error: "input is required" });
      const result = await buildGeoQueryPlan(body.input, { operation: "geo_query_planning_proxy" });
      return sendJson(res, 200, result);
    } catch (error) {
      console.error("query-plan proxy failed", error);
      return sendJson(res, error.statusCode || 500, toClientError(error));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/internal/research-profile") {
    if (!isValidAdminToken(req)) return sendJson(res, 401, { error: "Unauthorized" });
    try {
      const body = await readJson(req);
      if (!body.measurement || typeof body.measurement !== "object") return sendJson(res, 400, { error: "measurement is required" });
      const result = await buildResearchProfile(body.measurement, { operation: "whitepaper_research_profile_proxy" });
      return sendJson(res, 200, result);
    } catch (error) {
      console.error("research-profile proxy failed", error);
      return sendJson(res, error.statusCode || 500, toClientError(error));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/audit") {
    try {
      const body = await readJson(req);
      const siteUrl = normalizeUrl(body.url);
      const jobId = `job_${randomUUID()}`;
      const reportId = `report_${randomUUID()}`;
      const createdAt = Date.now();
      const report = createMockReport(reportId, siteUrl);
      jobs.set(jobId, { jobId, reportId, siteUrl, createdAt });
      reports.set(reportId, report);
      return sendJson(res, 200, { jobId });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Invalid request" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/test-provider") {
    try {
      const result = await testGeminiProvider();
      return sendJson(res, 200, {
        ok: true,
        provider: result.json.provider || result.provider,
        message: result.json.message || "gemini api works",
        model: result.model,
        latencyMs: result.latencyMs
      });
    } catch (error) {
      console.error("test-provider failed", error);
      return sendJson(res, error.statusCode || 500, toClientError(error));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/test-search-provider") {
    try {
      const result = await testPerplexityProvider();
      return sendJson(res, 200, result);
    } catch (error) {
      console.error("test-search-provider failed", error);
      return sendJson(res, error.statusCode || 500, toClientError(error));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/search-context") {
    try {
      const body = await readJson(req);
      const query = String(body.query || "").trim();
      if (!query) return sendJson(res, 400, { error: "query is required" });
      const result = await searchPerplexity(query, { maxTokens: body.maxTokens || 700, operation: "search_context" });
      return sendJson(res, 200, result);
    } catch (error) {
      console.error("search-context failed", error);
      return sendJson(res, error.statusCode || 500, toClientError(error));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/audit-real-lite") {
    let limitTicket;
    try {
      const body = await readJson(req);
      const siteUrl = normalizeUrl(body.url);
      await assertSafePublicUrl(siteUrl);
      const limit = checkAuditLimit({ req, url: siteUrl });
      if (!limit.allowed) {
        res.writeHead(limit.statusCode, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Retry-After": String(limit.retryAfterSeconds)
        });
        return res.end(JSON.stringify({
          ok: false,
          error: limit.message,
          code: limit.code,
          retryAfterSeconds: limit.retryAfterSeconds
        }, null, 2));
      }
      limitTicket = limit;
      recordAuditStart(limitTicket);
      const host = new URL(siteUrl).hostname.replace(/^www\./, "");
      const source = String(body.source || "direct").slice(0, 80);
      funnel.record("audit_started", { host, source });
      const cached = auditCache.get(siteUrl);
      if (cached) {
        const report = normalizeReportForClient({ ...cached.report, cache: cached.cache });
        reports.set(report.id, report);
        funnel.record("audit_cache_hit", {
          host,
          reportId: report.id,
          algorithmVersion: report.algorithmVersion,
          ageSeconds: cached.cache.ageSeconds,
          source
        });
        return sendJson(res, 200, report);
      }
      const freshReport = normalizeReportForClient(await runRealLiteAudit(siteUrl));
      const report = auditCache.set(siteUrl, freshReport);
      reports.set(report.id, report);
      funnel.record("audit_completed", {
        host,
        reportId: report.id,
        algorithmVersion: report.algorithmVersion,
        provider: report.provider,
        latencyMs: report.latencyMs,
        cacheHit: false,
        source
      });
      return sendJson(res, 200, report);
    } catch (error) {
      console.error("audit-real-lite failed", error);
      return sendJson(res, error.statusCode || 500, toClientError(error));
    } finally {
      if (limitTicket) recordAuditEnd();
    }
  }

  if (req.method === "GET" && url.pathname === "/api/rate-limit-state") {
    return sendJson(res, 200, { ...getRateLimitState(), auditCache: auditCache.state() });
  }

  const statusMatch = url.pathname.match(/^\/api\/status\/([^/]+)$/);
  if (req.method === "GET" && statusMatch) {
    const job = jobs.get(statusMatch[1]);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    const elapsed = Date.now() - job.createdAt;
    const progress = Math.min(100, Math.floor(elapsed / 20));
    const done = progress >= 100;
    return sendJson(res, 200, {
      status: done ? "done" : "running",
      progress,
      reportId: done ? job.reportId : undefined
    });
  }

  const reportApiMatch = url.pathname.match(/^\/api\/report\/([^/]+)$/);
  if (req.method === "GET" && reportApiMatch) {
    const report = reports.get(reportApiMatch[1]);
    if (!report) return sendJson(res, 404, { error: "Report not found" });
    return sendJson(res, 200, normalizeReportForClient(report));
  }

  const reportMarkdownMatch = url.pathname.match(/^\/report\/([^/]+)\/markdown$/);
  if (req.method === "GET" && reportMarkdownMatch) {
    const report = reports.get(decodeURIComponent(reportMarkdownMatch[1]));
    if (!report) return sendHtml(res, 404, "<h1>Report not found</h1>");
    return sendMarkdown(res, markdownFilename(report), reportMarkdown(report));
  }

  const reportPageMatch = url.pathname.match(/^\/report\/([^/]+)$/);
  if (req.method === "GET" && reportPageMatch) {
    const report = reports.get(decodeURIComponent(reportPageMatch[1]));
    if (!report) return sendHtml(res, 404, "<h1>Report not found</h1>");
    return sendHtml(res, 200, reportHtml(report));
  }

  if (req.method === "POST" && url.pathname === "/api/leads") {
    try {
      const body = await readJson(req);
      // Field validation
      if (!body.email || typeof body.email !== "string") return sendJson(res, 400, { error: "email is required" });
      if (!body.site || typeof body.site !== "string") return sendJson(res, 400, { error: "site is required" });
      if (body.consent !== true) return sendJson(res, 400, { error: "請先同意本次聯絡所需的個人資料蒐集告知" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return sendJson(res, 400, { error: "email format is invalid" });
      if (body.email.length > 254) return sendJson(res, 400, { error: "email too long" });
      if (body.site.length > 500) return sendJson(res, 400, { error: "site URL too long" });
      if (body.name && body.name.length > 100) return sendJson(res, 400, { error: "name too long" });
      if (body.need && body.need.length > 1000) return sendJson(res, 400, { error: "need description too long (max 1000 chars)" });
      // Validate site URL format
      try { new URL(body.site.trim()); } catch { return sendJson(res, 400, { error: "site must be a valid URL" }); }

      const lead = {
        id: randomUUID(),
        name: (body.name || "").trim(),
        email: body.email.trim(),
        site: body.site.trim(),
        need: (body.need || "").trim(),
        interest: String(body.interest || "diagnostic").slice(0, 80),
        source: String(body.source || "website").slice(0, 80),
        reportId: String(body.reportId || "").slice(0, 120),
        createdAt: new Date().toISOString(),
        consentVersion: "2026-07-13",
        consentedAt: new Date().toISOString()
      };
      leads.push(lead);
      // Persist to filesystem so leads survive server restarts
      const leadsFile = path.resolve(__dirname, "leads.jsonl");
      fs.appendFileSync(leadsFile, JSON.stringify(lead) + "\n", "utf8");
      funnel.record("lead_submitted", {
        leadId: lead.id,
        interest: lead.interest,
        source: lead.source,
        reportId: lead.reportId
      });
      console.log("New lead:", { ...lead, email: "[redacted]", name: lead.name ? "[redacted]" : "" });
      return sendJson(res, 200, {
        ok: true,
        leadId: lead.id,
        nextAction: "我們會在一個工作天內確認需求與試點範圍"
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Invalid request" });
    }
  }

  // API 路徑維持 JSON 404;一般頁面回傳 HTML 404(附回首頁連結)
  if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
    return sendHtml(res, 404, `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>404 — 找不到頁面 | GEOCheck</title>
<style>body{font-family:system-ui,"Noto Sans TC",sans-serif;background:#f7f9fc;color:#1e2a38;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}main{text-align:center;padding:24px}h1{color:#0b3b6f;font-size:3rem;margin:0 0 8px}a{display:inline-block;margin-top:20px;background:#00b8a9;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:700}</style>
</head><body><main><h1>404</h1><p>找不到這個頁面。想檢查你的網站 AI 看不看得見?</p><a href="/">回首頁開始免費健檢</a></main></body></html>`);
  }

  return sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error" });
  });
});

server.listen(PORT, () => {
  console.log(`SEO/GEO mock API running at http://localhost:${PORT}`);
});
// SEO/GEO audit fixes applied 2026-07-18: canonical unified to "/", llms.txt route,
// static og-image/favicon routes, fixed sitemap lastmod, explicit AI-crawler allows, HTML 404.
