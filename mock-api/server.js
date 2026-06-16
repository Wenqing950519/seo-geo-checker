const http = require("http");
const { randomUUID } = require("crypto");
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
const { testAgnesProvider } = require("./providers/agnes");
const { braveLlmContext, braveWebSearch, testBraveProvider } = require("./providers/brave");

loadEnvFiles();

const PORT = Number(process.env.PORT || 8787);
const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN || "https://geocheck.lisheng.cv");
const LEGACY_HOST = String(process.env.LEGACY_HOST || "geocheck.tungowo.com").toLowerCase();

const jobs = new Map();
const reports = new Map();
const leads = [];
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
    "Access-Control-Allow-Headers": "Content-Type"
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

function sendMarkdown(res, filename, markdown) {
  res.writeHead(200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(markdown);
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

function robotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    ""
  ].join("\n");
}

function sitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/home</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
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
  const audit = report.audit;
  const issues = audit.technical_seo?.issues || [];
  const actions = audit.priority_actions || [];
  const questions = audit.geo_questions || [];
  const gaps = audit.content_citeability?.gaps_zh || [];

  const issueRows = issues.map((issue) => `
    <tr>
      <td>${escapeHtml(issue.severity || "")}</td>
      <td>${escapeHtml(issue.check || "")}</td>
      <td>${escapeHtml(issue.detail_zh || "")}</td>
      <td>${escapeHtml(issue.impact_zh || "")}</td>
    </tr>
  `).join("");
  const actionRows = actions.map((action) => `
    <tr>
      <td>${escapeHtml(action.priority || "")}</td>
      <td>${escapeHtml(action.type || "")}</td>
      <td>${escapeHtml(action.target_zh || "")}</td>
      <td>${escapeHtml(action.recommendation_zh || "")}</td>
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
    main{max-width:1040px;margin:0 auto;padding:48px 20px}
    .card{background:#fff;border:1px solid #e5edf5;border-radius:12px;padding:24px;margin:18px 0;box-shadow:0 8px 24px rgba(11,59,111,.08)}
    h1,h2{color:#0b3b6f;line-height:1.3}
    .score{font-size:56px;font-weight:800;color:#00a99b}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;border-bottom:1px solid #e5edf5;padding:10px;vertical-align:top}
    .badge{display:inline-block;padding:4px 12px;border-radius:999px;background:#fff4e0;color:#9a6500;font-weight:700}
    .meta{color:#5a6b7e;font-size:.92rem}
    .report-nav{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
    a.button{display:inline-block;background:#00b8a9;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700}
    a.button.secondary{background:#fff;color:#0b3b6f;border:1px solid #cdd9e5}
    @media(max-width:640px){
      main{padding:30px 14px}
      .card{padding:18px;border-radius:10px}
      h1{font-size:1.65rem}
      h2{font-size:1.2rem}
      .score{font-size:48px}
      .meta{font-size:.82rem;word-break:break-word}
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
    <p class="meta">Provider: ${escapeHtml(displayProvider(report.provider))} / Model: ${escapeHtml(displayModel(report.model))} / Attempts: ${escapeHtml(report.attempts || 1)} / Latency: ${escapeHtml(report.latencyMs)}ms</p>

    <section class="card">
      <h2>整體健康度</h2>
      <div class="score">${escapeHtml(audit.score?.value ?? "")}</div>
      <p><span class="badge">${escapeHtml(audit.score?.label || "")}</span></p>
      <p>${escapeHtml(audit.score?.summary_zh || "")}</p>
    </section>

    <section class="card">
      <h2>AI 眼中定位</h2>
      <p><strong>可能分類：</strong>${escapeHtml(audit.positioning?.perceived_category_zh || "")}</p>
      <p><strong>信心等級：</strong>${escapeHtml(audit.positioning?.confidence || "")}</p>
      <h3>可能受眾</h3>
      <ul>${(audit.positioning?.perceived_audience_zh || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h3>缺少訊號 / 風險</h3>
      <ul>${(audit.positioning?.missing_signals_zh || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>

    <section class="card">
      <h2>技術 SEO 問題</h2>
      <table><thead><tr><th>嚴重度</th><th>檢查項目</th><th>說明</th><th>影響</th></tr></thead><tbody>${issueRows}</tbody></table>
    </section>

    <section class="card">
      <h2>GEO 測試問題</h2>
      <ul>${questions.map((q) => `<li>${escapeHtml(q.question_zh)} <span class="meta">(${escapeHtml(q.intent)}, value ${escapeHtml(q.business_value)})</span></li>`).join("")}</ul>
    </section>

    <section class="card">
      <h2>內容可引用性缺口</h2>
      <ul>${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>
    </section>

    <section class="card">
      <h2>建議優先處理的 3 件事</h2>
      <table><thead><tr><th>優先級</th><th>類型</th><th>目標</th><th>建議方向</th></tr></thead><tbody>${actionRows}</tbody></table>
    </section>

    <section class="card">
      <h2>資料限制</h2>
      <ul>${(audit.limitations_zh || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>

    <section class="card">
      <h2>想知道這些問題該怎麼修？</h2>
      <p>這是 real-lite 測試報告。下一步可以把完整站內頁面、Search Console 與更完整的 GEO 測試加入流程。</p>
      <a class="button secondary" href="/report/${encodeURIComponent(report.id)}/markdown">下載健檢報告</a>
      <a class="button" href="${TALLY_FORM_URL}" target="_blank" rel="noopener">預約報告解讀</a>
    </section>
  </main>
</body>
</html>`;
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
  const audit = report.audit;
  return `# SEO/GEO 網站健檢報告

- URL: ${report.url}
- Report ID: ${report.id}
- Created At: ${report.createdAt}
- Provider: ${displayProvider(report.provider)}
- Model: ${displayModel(report.model)}
- Attempts: ${report.attempts || 1}
- Latency: ${report.latencyMs}ms

## 整體健康度

- Score: ${audit.score?.value ?? ""}
- Label: ${audit.score?.label ?? ""}

${audit.score?.summary_zh || ""}

## AI 眼中定位

- 可能分類: ${audit.positioning?.perceived_category_zh || ""}
- 信心等級: ${audit.positioning?.confidence || ""}

### 可能受眾

${(audit.positioning?.perceived_audience_zh || []).map((item) => `- ${item}`).join("\n")}

### 可能使用情境

${(audit.positioning?.perceived_use_cases_zh || []).map((item) => `- ${item}`).join("\n")}

### 誤解或風險

${(audit.positioning?.misunderstandings_or_risks_zh || []).map((item) => `- ${item}`).join("\n")}

### 缺少訊號

${(audit.positioning?.missing_signals_zh || []).map((item) => `- ${item}`).join("\n")}

## 技術 SEO 問題

${(audit.technical_seo?.issues || []).map((issue) => `- [${issue.severity}] ${issue.check}: ${issue.detail_zh}
  - Impact: ${issue.impact_zh}`).join("\n")}

## GEO 測試問題

${(audit.geo_questions || []).map((q) => `- ${q.question_zh}
  - Intent: ${q.intent}
  - Business value: ${q.business_value}`).join("\n")}

## 內容可引用性

### Strengths

${(audit.content_citeability?.strengths_zh || []).map((item) => `- ${item}`).join("\n")}

### Gaps

${(audit.content_citeability?.gaps_zh || []).map((item) => `- ${item}`).join("\n")}

## 建議優先處理的 3 件事

${(audit.priority_actions || []).map((action) => `### ${action.priority} ${action.type}

- Target: ${action.target_zh}
- Recommendation: ${action.recommendation_zh}
- Reason: ${action.reason_zh}
- Expected impact: ${action.expected_impact_zh}
`).join("\n")}

## 資料限制

${(audit.limitations_zh || []).map((item) => `- ${item}`).join("\n")}

## 給 AI 協作的提示

請根據以上 SEO/GEO 健檢結果，協助我把每一個 P1-P3 建議拆成可執行的修復任務。請優先產出：

1. 要修改的頁面或區塊
2. 建議新增或重寫的文案
3. 建議新增的 FAQ / schema / metadata
4. 哪些項目需要人工提供證據或案例
5. 哪些修復可以先做，哪些需要進一步資料
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

  if (req.method === "GET" && url.pathname === "/robots.txt") {
    return sendText(res, 200, robotsTxt());
  }

  if (req.method === "GET" && url.pathname === "/sitemap.xml") {
    return sendText(res, 200, sitemapXml(), "application/xml; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(302, {
      "Location": "/home",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/home") {
    const prototypePath = path.resolve(__dirname, "public", "home.html");
    if (!fs.existsSync(prototypePath)) {
      return sendHtml(res, 404, "<h1>Prototype HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(prototypePath, "utf8"));
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
      const result = await testAgnesProvider();
      return sendJson(res, 200, {
        ok: true,
        provider: result.json.provider,
        message: result.json.message,
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
      const result = await testBraveProvider();
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
      const mode = body.mode === "web" ? "web" : "llm";
      const result = mode === "web"
        ? await braveWebSearch(query, { count: body.count || 10 })
        : await braveLlmContext(query, {
          count: body.count || 10,
          maximumNumberOfUrls: body.maximumNumberOfUrls || 8,
          maximumNumberOfTokens: body.maximumNumberOfTokens || 4096
        });
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
      const report = normalizeReportForClient(await runRealLiteAudit(siteUrl));
      reports.set(report.id, report);
      return sendJson(res, 200, report);
    } catch (error) {
      console.error("audit-real-lite failed", error);
      return sendJson(res, error.statusCode || 500, toClientError(error));
    } finally {
      if (limitTicket) recordAuditEnd();
    }
  }

  if (req.method === "GET" && url.pathname === "/api/rate-limit-state") {
    return sendJson(res, 200, getRateLimitState());
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return sendJson(res, 400, { error: "email format is invalid" });
      if (body.email.length > 254) return sendJson(res, 400, { error: "email too long" });
      if (body.site.length > 500) return sendJson(res, 400, { error: "site URL too long" });
      if (body.name && body.name.length > 100) return sendJson(res, 400, { error: "name too long" });
      if (body.need && body.need.length > 1000) return sendJson(res, 400, { error: "need description too long (max 1000 chars)" });
      // Validate site URL format
      try { new URL(body.site.trim()); } catch { return sendJson(res, 400, { error: "site must be a valid URL" }); }

      const lead = {
        name: (body.name || "").trim(),
        email: body.email.trim(),
        site: body.site.trim(),
        need: (body.need || "").trim(),
        createdAt: new Date().toISOString(),
        consentedAt: new Date().toISOString() // user accepted privacy notice before submit
      };
      leads.push(lead);
      // Persist to filesystem so leads survive server restarts
      const leadsFile = path.resolve(__dirname, "leads.jsonl");
      fs.appendFileSync(leadsFile, JSON.stringify(lead) + "\n", "utf8");
      console.log("New lead:", lead);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || "Invalid request" });
    }
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
