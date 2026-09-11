const http = require("http");
const { createHash, randomUUID, timingSafeEqual } = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadEnvFiles } = require("../../packages/shared/env.js");
const { toClientError } = require("../../packages/shared/errors.js");
const {
  checkAuditLimit,
  getRateLimitState,
  recordAuditEnd,
  recordAuditStart
} = require("./guards/rate-limit.js");
const { runRealLiteAudit } = require("../../apps/web/report/real-lite-audit.js");
const { createAuditCache } = require("./storage/audit-cache.js");
const { GEO_PIPELINE_VERSION } = require("./application/geo-measurement.js");
const { buildAuditCacheKey, createD1ReportStore } = require("./storage/d1-report-store.js");
const { createFunnelRecorder } = require("../../apps/web/analytics/funnel-events.js");
const { assertSafePublicUrl } = require("../../packages/crawler/url-safety.js");
const { testDeepSeekProvider } = require("../../packages/ai-providers/deepseek.js");
const { searchPerplexity, testPerplexityProvider } = require("../../packages/ai-providers/perplexity.js");
const { getUsageSummary } = require("../../packages/ai-providers/usage-meter.js");
const { createDeveloperApiHttpHandler } = require("./developer-api-http.js");
const { createSqliteDeveloperPlatformStore } = require("./storage/developer-platform-store.js");
const { createDashboardApiHttpHandler } = require("./dashboard-api-http.js");
const { createSqliteDashboardStore } = require("./storage/dashboard-store.js");
const { createGoogleOAuthHttpHandler } = require("./google-oauth-http.js");
const { createGoogleSearchConsoleClient } = require("./google-search-console-client.js");

loadEnvFiles();

const PORT = Number(process.env.PORT || 8787);
const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN || "https://geocheck.lisheng.cv");
const LEGACY_HOST = String(process.env.LEGACY_HOST || "geocheck.tungowo.com").toLowerCase();

const jobs = new Map();
const reports = new Map();
const auditCache = createAuditCache();
const d1ReportStore = createD1ReportStore();
const developerApi = createDeveloperApiHttpHandler({ createSqlitePlatformStore: createSqliteDeveloperPlatformStore });
const gscClient = createGoogleSearchConsoleClient({ clientId: process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET });
const dashboardApi = createDashboardApiHttpHandler({ gscClient, createSqliteDashboardStore });
const googleOAuth = createGoogleOAuthHttpHandler({ dashboardApi, developerApi, gscClient });
const funnel = createFunnelRecorder();
const TALLY_FORM_URL = "https://tally.so/r/obxVMX";
const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
});
const PRIVATE_OPERATION_PATHS = new Set([
  "/api/test-provider",
  "/api/test-search-provider",
  "/api/search-context",
  "/api/rate-limit-state"
]);
const GA_TAG_HTML = `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-CBTTKVLT82"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-CBTTKVLT82');
  </script>
  <script src="/analytics.js"></script>`;

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data, null, 2);
  const headers = {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token, Authorization, Idempotency-Key",
    ...extraHeaders
  };
  for (const [name, value] of Object.entries(headers)) if (value == null) delete headers[name];
  res.writeHead(status, headers);
  res.end(body);
}

function sendPrivateJson(res, status, data, extraHeaders = {}) {
  return sendJson(res, status, data, {
    "Access-Control-Allow-Origin": null,
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
}

async function getStoredReport(reportId) {
  const id = String(reportId || "");
  const memoryReport = reports.get(id);
  if (memoryReport) return memoryReport;
  try {
    const storedReport = await d1ReportStore.getById(id);
    if (storedReport) reports.set(id, storedReport);
    return storedReport;
  } catch (error) {
    console.error("D1 report lookup failed", error.message);
    return null;
  }
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(html);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

function sendHealth(res) {
  const body = '{"ok":true,"service":"geocheck"}\n';
  res.writeHead(200, {
    ...SECURITY_HEADERS,
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
    ...SECURITY_HEADERS,
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
  const expectedBuffer = createHash("sha256").update(expected).digest();
  const suppliedBuffer = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
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
    ...SECURITY_HEADERS,
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
  return `# GEOCheck — AI 信任值（AI Trust Index）

> GEOCheck(${SITE_ORIGIN}) 是台灣的網站健檢與方法研究計畫。它在指定的 Perplexity Sonar
> 查詢下，量測可見答案是否採用品牌，以及是否引用已驗證的第一方官方 URL；站內準備度另行呈現。

## 量測範圍

- Perplexity Sonar 是目前實際搜尋觀測的唯一來源；GEOCheck 不會將結果外推為
  ChatGPT、Gemini 或其他生成式系統的可見度。
- DeepSeek V4 Flash 只負責根據網站公開內容產生候選查詢與結構化描述；它不參與
  AI Trust Index、不改寫搜尋觀測，也不作為搜尋證據。
- AI Trust Index = 可見答案採用率 65% + 已驗證第一方 URL 來源證據 35%。直接品牌查詢僅用於實體對齊，不進入總分分母。
- 本地確定性規則檢查網站抓取、必要技術存取與內容可引用性。這些是站內準備訊號，不是 AI Trust Index 的替代品。
- 若沒有可判定的可見回答，AI Trust Index 會標為 unknown（null），不會以 0 分或站內準備度取代。

## 解讀限制

- 每份報告都是特定時間、特定網站與指定查詢的單次快照；不保證收錄、排名、推薦或商業成效。
- 「提及／答案採用」、「官方 URL 引用」與「推薦」是不同觀測，報告不會將它們視為同一件事。
- 此指數不是產業標準或生成式引擎的內部排序規則，也不表示模型內部信任。

## 主要頁面

- [首頁與健檢](${SITE_ORIGIN}/): 輸入網址並取得單站報告
- [健檢模組](${SITE_ORIGIN}/#modules): 技術、內容與 Perplexity 觀測的範圍
- [研究與方法](${SITE_ORIGIN}/#method): 資料流程、當前模型與限制
- [專案內容](${SITE_ORIGIN}/#project): 公開研究脈絡與交流方式
- [學習資源](${SITE_ORIGIN}/#resources): GEO、AI 搜尋能見度、llms.txt 與 schema 說明
`;
}

function readJson(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        settled = true;
        body = "";
        const error = new Error("Request body too large");
        error.code = "request_too_large";
        error.statusCode = 413;
        reject(error);
      }
    });
    req.on("end", () => {
      if (settled) return;
      try {
        settled = true;
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        error.code = "invalid_json";
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

const ISSUE_CHECK_LABELS = {
  "Indexability": "搜尋收錄設定",
  "Googlebot access": "Google 讀取權限",
  "HTML title": "頁面標題",
  "JavaScript rendering": "網頁內容呈現方式",
  "Readable content": "首頁文字份量",
  "OAI-SearchBot": "ChatGPT 讀取權限",
  "Claude-SearchBot": "Claude 讀取權限",
  "Sitemap": "網站地圖",
  "Canonical": "主要網址設定",
  "Meta description": "頁面摘要說明",
  "H1": "首頁大標題",
  "Structured data": "商家資料標記",
  "Image alt": "圖片文字說明",
  "Heading structure": "標題層級",
  "Homepage fetchability": "首頁能不能被讀取"
};

const SEVERITY_LABELS = { high: "最優先", medium: "建議處理", low: "有空再做" };

const ACTION_TYPE_LABELS = { technical: "網站設定", content: "網站內容", positioning: "品牌說明" };

const SCORE_LABELS = {
  "高": "AI 很常提到你",
  "穩定": "AI 有一定機會提到你",
  "待改善": "AI 偶爾才提到你",
  "低": "AI 幾乎沒提到你",
  "目前無可用證據": "這次資料不足，暫不評分",
  "無法評估": "這次讀不到網站，無法評分"
};

const CRAWL_STATUS_LABELS = {
  complete: "很順利，網站內容都讀得到",
  partial: "只讀到部分內容",
  insufficient: "幾乎讀不到內容",
  unknown: "這次沒有取得讀取結果"
};

function friendlyLabel(map, value, fallback) {
  const key = String(value ?? "").trim();
  return map[key] || fallback || key || "—";
}

function formatReportTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}

function reportHtml(report) {
  return realLiteReportHtml(report);
}

function realLiteReportHtml(report) {
  const audit = report.audit || {};
  const issues = audit.technical_seo?.issues || [];
  const actions = audit.priority_actions || [];
  const gaps = audit.content_citeability?.gaps_zh || [];
  const score = audit.score || {};
  const observation = audit.perplexity_observation || {};
  const authority = audit.authority_evidence || {};
  const measured = score.evidence_status === "measured";
  const scoreValue = Number.isFinite(score.value) ? score.value : "—";
  const readinessValue = Number.isFinite(score.site_readiness_value) ? score.site_readiness_value : "—";
  const scoreContext = measured
    ? "現在愈來愈多人直接問 AI「有沒有推薦的店」。AI 信任值就是在回答這類問題時，AI 有沒有講到你、有沒有把你的官網當成答案來源。分數越高，代表你在 AI 給的答案裡越常出現。"
    : "這次沒有拿到足夠可判讀的 AI 回答，所以先不給分數。沒有分數不代表 0 分，只代表這次的資料還不足以下判斷。";
  const crawlQuality = report.homepage?.crawlQuality || {};
  const crawlText = friendlyLabel(CRAWL_STATUS_LABELS, crawlQuality.status || "unknown", "這次沒有取得讀取結果");
  const representativeSuccess = (report.representativePages || []).filter((page) => page.crawlQuality?.scorable).length;
  const matchedDomains = authority.matchedExternalDomains || [];
  const obsList = observation.observations || [];

  const adoptionVal = score.breakdown?.answer_adoption ? (Number.isFinite(score.breakdown.answer_adoption.value) ? score.breakdown.answer_adoption.value + "%" : "資料不足") : "—";
  const sourceVal = score.breakdown?.source_evidence ? (Number.isFinite(score.breakdown.source_evidence.value) ? score.breakdown.source_evidence.value + "%" : "資料不足") : "—";

  // Build Query Observation Cards
  const queryCardsHtml = obsList.length ? obsList.map((item, idx) => {
    const isMentioned = Boolean(item.brandMentioned);
    const isCited = Boolean(item.firstPartyCited);
    const mentionPill = isMentioned
      ? `<span class="status-pill success">提到品牌 (內文採用 ✓)</span>`
      : `<span class="status-pill muted">✕ 未明確採用品牌名</span>`;
    const citePill = isCited
      ? `<span class="status-pill success">引用官網 (官方 URL ✓)</span>`
      : `<span class="status-pill muted">✕ 未引用官網</span>`;
    const answerText = item.answer
      ? escapeHtml(item.answer)
      : (isMentioned ? "AI 於檢索答案中直接提及受測品牌相關服務與特色。" : "AI 於本次檢索中未將受測店家列為主要推薦，多提及同業品牌。");
    const sourceList = (item.sourceDomains || []).map((d) => escapeHtml(d)).join("、") || "無外部引用記錄";
    return `
    <div class="query-obs-card">
      <div class="query-card-top">
        <div>
          <span style="font-size:0.75rem;background:var(--teal-subtle);color:var(--teal-d);padding:2px 8px;border-radius:4px;font-weight:700;margin-bottom:4px;display:inline-block;">情境問題 ${idx + 1}</span>
          <strong style="color:var(--navy);font-size:1rem;display:block;">「${escapeHtml(item.query || "")}」</strong>
          <div style="font-size:0.82rem;color:var(--muted);margin-top:4px;">測試引擎：AI 搜尋引擎 (連網檢索) · 檢驗標的：${escapeHtml(report.url)}</div>
        </div>
        <div>${mentionPill}</div>
        <div>${citePill}</div>
      </div>
      <button type="button" class="transcript-toggle-btn" onclick="toggleTranscript('t${idx}', this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>查看 AI 生成回答全文與引述比對</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="transcript-body" id="t${idx}">
        <p><b>【AI 生成回答原文摘錄】：</b><br>${answerText}</p>
        <div class="transcript-tag-box">
          <span class="t-tag self" style="${isMentioned ? '' : 'background:#FEE2E2;color:#991B1B;'}">受測店家：${isMentioned ? '主動採用 ✓' : '未在正文被點名 ✕'}</span>
          <span class="t-tag source">引述來源：${sourceList}</span>
        </div>
      </div>
    </div>`;
  }).join("") : `
    <div class="query-obs-card"><p style="color:var(--muted);">本次檢測尚未產出足夠的有效觀測題目。</p></div>`;

  // Build 12-Point Matrix
  const hasRobotsIssue = issues.some((i) => i.check === "Googlebot access" || i.check === "OAI-SearchBot" || i.check === "Claude-SearchBot");
  const hasSitemapIssue = issues.some((i) => i.check === "Sitemap");
  const hasFetchIssue = issues.some((i) => i.check === "Homepage fetchability");
  const hasTitleIssue = issues.some((i) => i.check === "HTML title");
  const hasMetaIssue = issues.some((i) => i.check === "Meta description");
  const hasSchemaIssue = issues.some((i) => i.check === "Structured data");
  const hasCanonicalIssue = issues.some((i) => i.check === "Canonical");
  const hasFaqGap = gaps.some((g) => g.includes("問答") || g.includes("FAQ"));
  const hasPriceGap = gaps.some((g) => g.includes("價格") || g.includes("費用") || g.includes("菜單"));
  const hasLocationGap = gaps.some((g) => g.includes("地址") || g.includes("地點") || g.includes("交通"));
  const hasProofGap = gaps.some((g) => g.includes("評價") || g.includes("背書") || g.includes("案例"));

  const matrixCol1 = `
    <div class="matrix-col">
      <div class="matrix-col-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        1. AI 爬蟲可讀性 (Crawl)
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasRobotsIssue ? 'chk-fail' : 'chk-pass'}">${hasRobotsIssue ? '缺失' : '通過'}</span>
        <div><b>robots.txt 存取權限</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasRobotsIssue ? '部分 AI 搜尋爬蟲存取受阻' : '未封鎖主串流 AI 搜尋爬蟲'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasSitemapIssue ? 'chk-warn' : 'chk-pass'}">${hasSitemapIssue ? '待修' : '通過'}</span>
        <div><b>sitemap.xml 索引清單</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasSitemapIssue ? '網站地圖未設定或格式不全' : '成功讀取重要頁面索引'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasFetchIssue ? 'chk-fail' : 'chk-pass'}">${hasFetchIssue ? '異常' : '通過'}</span>
        <div><b>HTTP 伺服器響應速度</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasFetchIssue ? '伺服器讀取異常或連線逾時' : '首頁正常回應 (HTTP 200)'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge chk-warn">建議</span>
        <div><b>llms.txt AI 專用摘要</b><br><span style="color:var(--muted);font-size:0.8rem;">建議部署 /llms.txt 加深語意識別</span></div>
      </div>
    </div>`;

  const matrixCol2 = `
    <div class="matrix-col">
      <div class="matrix-col-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        2. 標籤與結構語意 (SEO)
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasTitleIssue ? 'chk-warn' : 'chk-pass'}">${hasTitleIssue ? '待修' : '通過'}</span>
        <div><b>首頁 Title 服務屬性</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasTitleIssue ? '標題缺少核心服務關鍵字' : '標題清楚標示品牌與服務'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasMetaIssue ? 'chk-warn' : 'chk-pass'}">${hasMetaIssue ? '待修' : '通過'}</span>
        <div><b>Meta Description 說明</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasMetaIssue ? '摘要過短或缺少主要業務敘述' : '具備清晰之門市或服務簡介'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasCanonicalIssue ? 'chk-warn' : 'chk-pass'}">${hasCanonicalIssue ? '待修' : '通過'}</span>
        <div><b>規範網址與 OpenGraph</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasCanonicalIssue ? 'canonical 或社交標籤需補齊' : '標準網址與社交標籤健全'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasSchemaIssue ? 'chk-fail' : 'chk-pass'}">${hasSchemaIssue ? '缺失' : '通過'}</span>
        <div><b>LocalBusiness 結構化資料</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasSchemaIssue ? '缺少 Schema JSON-LD 實體標記' : '已部署結構化實體資料'}</span></div>
      </div>
    </div>`;

  const matrixCol3 = `
    <div class="matrix-col">
      <div class="matrix-col-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="12 6 12 12 16 14"></polygon></svg>
        3. 內容可引用性 (Citeability)
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasFaqGap ? 'chk-fail' : 'chk-pass'}">${hasFaqGap ? '缺失' : '通過'}</span>
        <div><b>常見問答 (FAQ) 模組</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasFaqGap ? '缺少針對顧客疑慮的一問一答' : '站內具備清楚問答段落'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasPriceGap ? 'chk-warn' : 'chk-pass'}">${hasPriceGap ? '待修' : '通過'}</span>
        <div><b>文字化服務與價格表</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasPriceGap ? '以圖片呈現或缺少明確文字價目' : '服務項目與價格資訊皆以文字呈現'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasLocationGap ? 'chk-warn' : 'chk-pass'}">${hasLocationGap ? '待補' : '通過'}</span>
        <div><b>地理位置與聯絡資訊</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasLocationGap ? '地址、電話或交通資訊不夠顯眼' : '門市地址與營業時間標示明確'}</span></div>
      </div>
      <div class="check-item">
        <span class="chk-badge ${hasProofGap ? 'chk-warn' : 'chk-pass'}">${hasProofGap ? '待補' : '通過'}</span>
        <div><b>顧客好評與客觀背書</b><br><span style="color:var(--muted);font-size:0.8rem;">${hasProofGap ? '缺少第三方評測或案例佐證' : '包含豐富真實評價與背書'}</span></div>
      </div>
    </div>`;

  // Build External Authority Cards
  const allExternal = [...new Set([...matchedDomains, ...obsList.flatMap((o) => o.sourceDomains || [])])].slice(0, 4);
  const authorityCardsHtml = allExternal.length ? allExternal.map((domain) => `
    <div class="auth-card">
      <strong>${escapeHtml(domain)}</strong>
      <span>AI 搜尋引擎於此平台檢索並交叉比對店家與行業相關事實。</span>
    </div>
  `).join("") : `
    <div class="auth-card">
      <strong>店家官網 (${escapeHtml(new URL(report.url).hostname.replace(/^www\./, ""))})</strong>
      <span>目前主要依據第一方官方網站進行基礎解析。</span>
    </div>`;

  // Build Diagnostic Action Cards (4 Key Areas)
  const actionCardsHtml = actions.slice(0, 4).map((action, idx) => {
    const pClass = `p${(idx % 4) + 1}`;
    const matchedIssue = issues.find((i) => i.check === action.type || i.target_zh === action.target_zh) || issues[idx] || {};
    const flawText = matchedIssue.detail_zh || "相關屬性或結構化內容尚待補齊。";
    const impactText = matchedIssue.impact_zh || "AI 在進行實體比對與解答生成時缺少權威佐證，容易優先推薦已標明屬性的競品。";
    const fixText = action.recommendation_zh || "依循規範補齊相關內容與標籤。";
    return `
    <div class="action-card ${pClass}">
      <div>
        <span class="action-tag">第 ${idx + 1} 項 · 最優先 (P${idx + 1})</span>
        <h3 style="font-size:1.1rem;color:var(--navy);margin-bottom:6px;">${escapeHtml(action.target_zh || "核心診斷項目")}</h3>
        <div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">改善類別：${escapeHtml(friendlyLabel(ACTION_TYPE_LABELS, action.type, "網站內容"))}</div>
        <p style="font-size:0.88rem;color:var(--muted);line-height:1.6;">${escapeHtml(action.recommendation_zh || "")}</p>
      </div>
      <button type="button" class="diagnostic-toggle-btn" onclick="toggleDiagnostic('diag-${idx}', this)">
        點擊查看當前缺失與建議 ▾
      </button>
      <div class="diagnostic-drawer" id="diag-${idx}">
        <div class="diag-block flaw">
          <strong>❌ 當前具體缺失：</strong>
          <p>${escapeHtml(flawText)}</p>
        </div>
        <div class="diag-block impact">
          <strong>⚠️ 對 AI 推薦的負面影響：</strong>
          <p>${escapeHtml(impactText)}</p>
        </div>
        <div class="diag-block fix">
          <strong>💡 具體改善方向：</strong>
          <p>${escapeHtml(fixText)}</p>
        </div>
      </div>
    </div>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>${GA_TAG_HTML}
<title>GeoCheck — AI 信任值報告</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=radar-20260904"/>
<link rel="icon" type="image/png" href="/favicon.png?v=radar-20260904"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--navy:#0B3B6F;--navy-d:#072A52;--teal:#00B8A9;--teal-d:#008276;--teal-subtle:#E6F7F5;--bg:#FFFFFF;--bg-alt:#F7F9FC;--text:#1E2A38;--muted:#5A6B7E;--card-shadow:0 6px 24px rgba(11,59,111,.08);--card-shadow-hover:0 14px 36px rgba(11,59,111,.14);--radius:16px;--radius-full:999px;--font-sans:'Noto Sans TC',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font-sans);color:var(--text);background:var(--bg-alt);line-height:1.7;-webkit-font-smoothing:antialiased}
.report-view-container{min-height:100vh;padding:48px 24px 80px}
.wrap{max-width:1100px;margin:0 auto}
.report-nav-bar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;margin-bottom:28px}
.report-nav-bar h1{font-size:1.8rem;font-weight:900;color:var(--navy)}
.report-meta-url{font-size:0.95rem;color:var(--teal-d);font-weight:600;word-break:break-all;overflow-wrap:anywhere}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--teal);color:#fff;font-weight:700;font-size:0.92rem;padding:10px 22px;border-radius:var(--radius-full);text-decoration:none;border:none;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 14px rgba(0,184,169,0.3)}
.btn:hover{background:var(--teal-d);transform:translateY(-1px)}
.btn-outline{background:#fff;color:var(--teal-d);border:2px solid var(--teal);box-shadow:none}
.btn-outline:hover{background:var(--teal-subtle);color:var(--teal-d)}
.dual-score-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:24px;margin-bottom:28px}
@media(max-width:860px){.dual-score-grid{grid-template-columns:1fr}}
.score-hero-card{background:#FFFFFF;border:1px solid rgba(11,59,111,.08);border-radius:var(--radius);padding:32px;box-shadow:var(--card-shadow)}
.score-hero-card.primary{border-top:4px solid var(--teal)}
.score-hero-card.secondary{border-top:4px solid var(--navy)}
.score-flex{display:flex;align-items:center;gap:24px;margin:16px 0 20px}
.score-big-num{font-size:4rem;font-weight:900;line-height:1;color:var(--teal);font-family:var(--font-mono)}
.score-breakdown-mini{font-size:0.88rem;color:var(--muted);list-style:none;border-top:1px solid var(--bg-alt);padding-top:14px}
.score-breakdown-mini li{margin-bottom:5px}
.score-breakdown-mini strong{color:var(--navy)}
.badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-full);background:#FFF4E0;color:#B97700;font-weight:700;font-size:0.82rem}
.report-sec-head{display:flex;justify-content:space-between;align-items:center;margin-top:36px;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.report-sec-head h2{font-size:1.35rem;color:var(--navy);text-align:left}
.report-sec-head span{font-size:0.85rem;color:var(--muted)}
.query-obs-card{background:#FFFFFF;border:1px solid rgba(11,59,111,.08);border-radius:var(--radius);padding:24px;box-shadow:var(--card-shadow);margin-bottom:20px}
.query-card-top{display:grid;grid-template-columns:1.6fr 1fr 1fr;align-items:center;gap:16px}
@media(max-width:768px){.query-card-top{grid-template-columns:1fr;gap:10px}}
.status-pill{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:700;padding:4px 12px;border-radius:var(--radius-full)}
.status-pill.success{background:var(--teal-subtle);color:var(--teal-d)}
.status-pill.muted{background:#F1F5F9;color:var(--muted)}
.transcript-toggle-btn{margin-top:16px;background:var(--bg-alt);border:1px solid rgba(11,59,111,.1);color:var(--navy);font-size:0.84rem;font-weight:700;padding:8px 14px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.transcript-toggle-btn:hover{background:#E2E8F0}
.transcript-body{display:none;margin-top:14px;padding:16px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:8px;font-size:0.9rem;line-height:1.7}
.transcript-body.open{display:block}
.transcript-tag-box{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:0.78rem}
.t-tag{padding:3px 8px;border-radius:4px;font-weight:600}
.t-tag.self{background:var(--teal-subtle);color:var(--teal-d);font-weight:700}
.t-tag.source{background:#E2E8F0;color:var(--navy)}
.matrix-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
@media(max-width:860px){.matrix-grid{grid-template-columns:1fr}}
.matrix-col{background:#FFFFFF;border:1px solid rgba(11,59,111,.08);border-radius:var(--radius);padding:20px;box-shadow:var(--card-shadow)}
.matrix-col-title{font-size:0.95rem;font-weight:800;color:var(--navy);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--bg-alt);display:flex;align-items:center;gap:6px}
.check-item{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;font-size:0.86rem;line-height:1.45}
.chk-badge{font-size:0.72rem;font-weight:800;padding:2px 6px;border-radius:4px;flex-shrink:0;margin-top:2px}
.chk-pass{background:#DCFCE7;color:#166534}
.chk-warn{background:#FEF3C7;color:#92400E}
.chk-fail{background:#FEE2E2;color:#991B1B}
.authority-box{background:#FFFFFF;border:1px solid rgba(11,59,111,.08);border-radius:var(--radius);padding:24px;box-shadow:var(--card-shadow);margin-top:16px}
.auth-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:14px}
@media(max-width:768px){.auth-grid{grid-template-columns:repeat(2,1fr)}}
.auth-card{background:var(--bg-alt);border-radius:8px;padding:14px;border:1px solid rgba(11,59,111,.06)}
.auth-card strong{display:block;font-size:0.92rem;color:var(--navy);margin-bottom:4px}
.auth-card span{font-size:0.8rem;color:var(--muted)}
.action-cards-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-top:16px}
@media(max-width:860px){.action-cards-grid{grid-template-columns:1fr}}
.action-card{background:#FFFFFF;border:1px solid rgba(11,59,111,.08);border-radius:var(--radius);padding:24px 22px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:var(--card-shadow);transition:transform 0.2s,box-shadow 0.2s}
.action-card:hover{box-shadow:var(--card-shadow-hover)}
.action-card.p1{border-top:4px solid #D6453D}
.action-card.p2{border-top:4px solid #B97700}
.action-card.p3{border-top:4px solid var(--teal)}
.action-card.p4{border-top:4px solid #2563EB}
.action-tag{font-size:0.76rem;font-weight:800;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:12px;width:fit-content}
.action-card.p1 .action-tag{background:#FEE2E2;color:#B91C1C}
.action-card.p2 .action-tag{background:#FEF3C7;color:#B45309}
.action-card.p3 .action-tag{background:var(--teal-subtle);color:var(--teal-d)}
.action-card.p4 .action-tag{background:#EFF6FF;color:#1D4ED8}
.diagnostic-toggle-btn{background:var(--bg-alt);border:1px solid rgba(11,59,111,0.12);color:var(--navy);font-size:0.82rem;font-weight:700;padding:9px 14px;border-radius:6px;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;transition:all 0.2s;font-family:inherit}
.diagnostic-toggle-btn:hover{background:#E2E8F0;color:var(--teal-d)}
.diagnostic-drawer{display:none;margin-top:14px;padding-top:14px;border-top:1px dashed rgba(11,59,111,0.15);font-size:0.86rem;line-height:1.65}
.diagnostic-drawer.open{display:block}
.diag-block{margin-bottom:10px;padding:8px 12px;border-radius:6px}
.diag-block.flaw{background:#FEF2F2;border-left:3px solid #EF4444;color:#991B1B}
.diag-block.impact{background:#FFFBEB;border-left:3px solid #F59E0B;color:#92400E}
.diag-block.fix{background:#F0FDF4;border-left:3px solid #10B981;color:#166534}
.limits-card{background:#FFFFFF;border:1px solid rgba(11,59,111,.08);border-radius:var(--radius);padding:24px;box-shadow:var(--card-shadow);margin-top:28px}
.limits-card h3{color:var(--navy);font-size:1.1rem;margin-bottom:10px}
.limits-card ul{padding-left:20px;color:var(--muted);font-size:0.88rem}
.limits-card li{margin-bottom:6px}
.report-bottom-cta{display:flex;gap:12px;justify-content:center;margin-top:36px;flex-wrap:wrap}
@media(max-width:600px){
  .report-view-container{padding:24px 16px 60px}
  .report-nav-bar h1{font-size:1.45rem}
  .score-hero-card{padding:20px 16px}
  .score-flex{flex-wrap:wrap;gap:14px}
  .score-big-num{font-size:3rem}
  .query-obs-card,.authority-box,.limits-card,.action-card{padding:18px 16px}
  .auth-grid{grid-template-columns:1fr}
  .report-bottom-cta .btn{width:100%;justify-content:center}
}
</style>
</head>
<body>
<main class="report-view-container">
  <div class="wrap">
    <div class="report-nav-bar">
      <div>
        <h1>GeoCheck — AI 信任值健檢報告</h1>
        <div class="report-meta-url">受測網址：${escapeHtml(report.url)} · 檢測時間：${escapeHtml(formatReportTime(report.createdAt))}</div>
      </div>
      <div>
        <a class="btn btn-outline" href="/#top" data-track-action="run_another_analysis">← 回到主頁重新檢測</a>
      </div>
    </div>

    <!-- Dual Metric Cards -->
    <div class="dual-score-grid">
      <!-- AI Trust Index (Primary) -->
      <div class="score-hero-card primary">
        <span class="badge" style="background:#FFF4E0;color:#B97700;margin-bottom:8px;">主分數 · 觀測 AI 外部回答</span>
        <h2 style="font-size:1.3rem;color:var(--navy);text-align:left;">AI 信任值 (AI Trust Index)</h2>
        <div class="score-flex">
          <div class="score-big-num">${escapeHtml(scoreValue)}</div>
          <div>
            <div style="font-weight:700;color:#B97700;margin-bottom:6px;">評級：${escapeHtml(friendlyLabel(SCORE_LABELS, score.label, score.label || "這次資料不足，暫不評分"))}</div>
            <p style="font-size:0.88rem;color:var(--muted);line-height:1.5;">${escapeHtml(scoreContext)}</p>
          </div>
        </div>
        <ul class="score-breakdown-mini">
          <li>• AI 回答裡有提到你的品牌 (占 65%)：<strong>${adoptionVal}</strong></li>
          <li>• AI 回答裡有引用你的官網 (占 35%)：<strong>${sourceVal}</strong></li>
          <li>• 註記：這次一共問了 ${escapeHtml(score.denominator?.total_runs ?? 0)} 題，其中 ${escapeHtml(score.denominator?.valid_runs ?? 0)} 題拿到可以判讀的回答。沒拿到回答的題目不會被當成 0 分。少於兩題有效查詢時封頂 69 分。</li>
        </ul>
      </div>

      <!-- Site Readiness (Secondary) -->
      <div class="score-hero-card secondary">
        <span class="badge" style="background:#EAF2FB;color:var(--navy);margin-bottom:8px;">站內準備度 · 基礎體質不補分</span>
        <h2 style="font-size:1.3rem;color:var(--navy);text-align:left;">網站基礎體質 (Site Readiness)</h2>
        <div class="score-flex">
          <div class="score-big-num" style="color:var(--navy);">${escapeHtml(readinessValue)} <span style="font-size:1.5rem;color:var(--muted);font-weight:500;">/ 100</span></div>
          <div>
            <div style="font-weight:700;color:var(--navy);margin-bottom:6px;">體質評級：${readinessValue >= 70 ? "優良（高可讀性）" : readinessValue >= 50 ? "良好（內容可讀）" : "待加強（讀取受限）"}</div>
            <p style="font-size:0.88rem;color:var(--muted);line-height:1.5;">${escapeHtml(crawlText)}；另外成功讀取 ${escapeHtml(representativeSuccess)} 個代表性內頁。</p>
          </div>
        </div>
        <ul class="score-breakdown-mini">
          <li>• 機器人存取 (robots.txt)：<strong>${crawlQuality.robotsReadable ? "正常開放 (Pass)" : "受限或未知"}</strong></li>
          <li>• 說明：此分數看網站本身好不好讀，不計入 AI 信任值主分數，體質好不保證被 AI 推薦。</li>
        </ul>
      </div>
    </div>

    <!-- 1. AI Real Transcript & Benchmark -->
    <div class="report-sec-head">
      <h2>顧客真實提問與 AI 搜尋回答實錄</h2>
      <span>模擬顧客尋找服務時的回答全文比對</span>
    </div>
    <p style="font-size:0.88rem;color:var(--muted);margin-bottom:16px;">下面這些問題皆刻意未包含您的品牌名稱，模擬顧客只描述情境與需求時，AI 搜尋引擎的實際推薦與引述行為。</p>
    ${queryCardsHtml}

    <!-- 2. 12-Point Technical Matrix -->
    <div class="report-sec-head">
      <h2>網站技術與內容結構 12 項詳細體檢清單</h2>
      <span>客觀檢驗機器人能否順暢讀取並摘錄你的網站</span>
    </div>
    <div class="matrix-grid">
      ${matrixCol1}
      ${matrixCol2}
      ${matrixCol3}
    </div>

    <!-- 3. External Authority Sources -->
    <div class="report-sec-head">
      <h2>AI 搜尋參考的外部網站來源</h2>
      <span>AI 引擎認識你或競品時，所依據的外部平台數據</span>
    </div>
    <div class="authority-box">
      <p style="font-size:0.88rem;color:var(--muted);line-height:1.6;">
        AI 不只閱讀您的官網，更會在網路上交叉比對第三方評測。以下為本次檢驗中 AI 搜尋引擎所參考的重要外部來源：
      </p>
      <div class="auth-grid">
        ${authorityCardsHtml}
      </div>
    </div>

    <!-- 4. Core Diagnostic Actions -->
    <div class="report-sec-head">
      <h2>網站核心診斷與優化建議</h2>
      <span>點擊卡片展開當前具體缺失、AI 判讀障礙與修復方向</span>
    </div>
    <div class="action-cards-grid">
      ${actionCardsHtml || '<div class="action-card p1"><p style="color:var(--muted);">目前暫無重大缺失需立即處理。</p></div>'}
    </div>

    <!-- Limitations -->
    <div class="limits-card">
      <h3>看分數之前，先知道它不能代表什麼</h3>
      <ul>
        <li>問不到足夠回答的時候，我們會標成「不知道」，不會當成 0 分。</li>
        <li>結果只代表這個時間點、這幾題問題問到的狀況，換個時間或換個問法可能不一樣。</li>
        <li>被提到不等於被推薦，被引用也不保證會帶來客人或訂單。</li>
        <li>報告給的是可以追查的線索，不保證任何搜尋排名或 AI 之後的引用結果。</li>
        ${(audit.limitations_zh || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>

    <!-- Bottom Actions -->
    <div class="report-bottom-cta">
      <a class="btn btn-outline" href="/report/${encodeURIComponent(report.id)}/markdown" data-track-action="download_report">下載這份報告</a>
      <a class="btn" href="${TALLY_FORM_URL}" target="_blank" rel="noopener" data-track-action="book_report_interpretation">找人幫你解讀報告</a>
    </div>
  </div>
</main>
<script>
function toggleTranscript(id, btn) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}
function toggleDiagnostic(id, btn) {
  const el = document.getElementById(id);
  if (el) {
    const isOpen = el.classList.toggle('open');
    btn.textContent = isOpen ? '收起詳細診斷 ▲' : '點擊查看當前缺失與建議 ▾';
  }
}
</script>
${reportTrackingHtml(report.id)}</body></html>`;
}

function reportTopNavHtml() {
  return `
    <nav class="report-nav" aria-label="報告操作">
      <a class="button secondary" href="/home" data-track-action="run_another_analysis">← 回到主頁</a>
    </nav>
  `;
}

function reportTrackingHtml(reportId) {
  const safeReportId = JSON.stringify(String(reportId || "").slice(0, 120));
  return `<script>
    (function(){
      const analysisId=${safeReportId};
      window.GeoCheckAnalytics?.trackResultViewed(analysisId,{
        journey_stage:'result',
      });
      document.querySelectorAll('[data-track-action]').forEach(function(element){
        element.addEventListener('click',function(){
          window.GeoCheckAnalytics?.track('recommendation_clicked',{
            analysis_id:analysisId,
            action_type:element.dataset.trackAction,
            journey_stage:'next_step',
            analysis_stage:'result_viewed',
            analysis_status:'completed'
          });
        });
      });
    })();
  </script>`;
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
  return realLiteReportMarkdown(report);
}

function realLiteReportMarkdown(report) {
  const audit = report.audit || {};
  const score = audit.score || {};
  const observation = audit.perplexity_observation || {};
  const authority = audit.authority_evidence || {};
  const answerRate = score.breakdown?.answer_adoption?.value;
  const sourceRate = score.breakdown?.source_evidence?.value;
  return `# 你的網站在 AI 搜尋裡的表現

- 網址：${report.url}
- 檢測時間：${formatReportTime(report.createdAt)}
- 報告編號：${report.id}
- 版本：${score.algorithm_version || report.algorithmVersion || ""}

## AI 信任值

- AI 信任值：${score.value ?? "這次資料不足，暫不評分"}
- AI 回答裡有提到你的品牌：${Number.isFinite(answerRate) ? `${answerRate}%` : "資料不足"}（占分數 65%）
- AI 回答裡有引用你的官網：${Number.isFinite(sourceRate) ? `${sourceRate}%` : "資料不足"}（占分數 35%）
- 拿到可判讀回答的題數：${score.denominator?.valid_runs ?? 0} / ${score.denominator?.total_runs ?? 0}（沒拿到回答的題目不算 0 分）
- 網站基礎體質：${score.site_readiness_value ?? "資料不足"} / 100（不計入 AI 信任值）

${score.summary_zh || ""}

## 顧客這樣問的時候，AI 怎麼回答

下面這些問題都沒有寫出你的店名或品牌名，模擬顧客還不認識你時會怎麼問。

- 拿到回答的題數：${observation.measuredQueryCount ?? 0} / ${observation.queryCount ?? 0}
- 有提到你的比例：${observation.mentionRate ?? "資料不足"}%
- 有連到你官網的比例：${observation.citationRate ?? "資料不足"}%
- 網路上有沒有其他網站在談你：${authority.entityGrounded ? "有找到" : "這次沒有找到足夠的資料"}
- 找到的相關網站：${(authority.matchedExternalDomains || []).join("、") || "無"}

${(observation.observations || []).map((item) => `- ${item.query}：${item.brandMentioned ? "有提到你" : "沒提到你"}；${item.firstPartyCited ? "有連到官網" : "沒有連到官網"}`).join("\n")}

## 網站上建議修正的地方

${(audit.technical_seo?.issues || []).map((issue) => `- [${friendlyLabel(SEVERITY_LABELS, issue.severity, "建議處理")}] ${friendlyLabel(ISSUE_CHECK_LABELS, issue.check, issue.check)}：${issue.detail_zh}`).join("\n")}

## 網站內容還少了什麼

${(audit.content_citeability?.gaps_zh || []).map((item) => `- ${item}`).join("\n")}

## 如果只做三件事，先做這些

${(audit.priority_actions || []).map((action, index) => `- 第 ${index + 1} 件（${friendlyLabel(ACTION_TYPE_LABELS, action.type, "網站內容")}）${action.target_zh}：${action.recommendation_zh}`).join("\n")}

## 這份報告不能保證什麼

${(audit.limitations_zh || []).map((item) => `- ${item}`).join("\n")}
`;
}

function markdownFilename(report) {
  const host = (() => {
    try {
      return new URL(report.url).hostname.replace(/^www\./, "");
    } catch {
      return "ai-visibility-report";
    }
  })();
  const date = new Date().toISOString().slice(0, 10);
  return `${host}-ai-visibility-report-${date}.md`.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (maybeRedirectLegacyHost(req, res, url)) return;

  if (await googleOAuth.handle({ req, res, url, readJson, sendJson })) return;

  if (await dashboardApi.handle({ req, res, url, readJson, sendJson })) return;

  if (await developerApi.handle({ req, res, url, readJson, sendJson })) return;

  if (req.method === "OPTIONS" && PRIVATE_OPERATION_PATHS.has(url.pathname)) {
    return sendPrivateJson(res, 204, null, { Allow: "GET, POST, OPTIONS" });
  }

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

  if (req.method === "GET" && url.pathname === "/privacy") {
    return sendHtml(res, 200, fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/privacy.html"), "utf8"));
  }
  if (req.method === "GET" && url.pathname === "/terms") {
    return sendHtml(res, 200, fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/terms.html"), "utf8"));
  }
  if (req.method === "GET" && url.pathname === "/refund") {
    return sendHtml(res, 200, fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/refund.html"), "utf8"));
  }

  if (req.method === "GET" && url.pathname === "/llms.txt") {
    return sendText(res, 200, llmsTxt(), "text/plain; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/analytics.js") {
    const analyticsPath = path.resolve(__dirname, "../../apps/web/public/analytics.js");
    if (!fs.existsSync(analyticsPath)) return sendText(res, 404, "Not found");
    return sendText(res, 200, fs.readFileSync(analyticsPath, "utf8"), "application/javascript; charset=utf-8");
  }

  // 正典 URL 統一為 /:根路徑直接以 200 回傳首頁(canonical/og:url/schema 均指向 /)
  if (req.method === "GET" && url.pathname === "/") {
    const prototypePath = path.resolve(__dirname, "../../apps/web/public/home.html");
    if (!fs.existsSync(prototypePath)) {
      return sendHtml(res, 404, "<h1>Prototype HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(prototypePath, "utf8"));
  }

  // UI/UX 2.0 概念展示原型頁面
  if (req.method === "GET" && (url.pathname === "/demo" || url.pathname === "/demo/")) {
    const demoPath = path.resolve(__dirname, "../../apps/web/public/demo.html");
    if (!fs.existsSync(demoPath)) {
      return sendHtml(res, 404, "<h1>Demo HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(demoPath, "utf8"));
  }

  // 品牌識別系統 (Brand Identity System)
  if (req.method === "GET" && (url.pathname === "/brand" || url.pathname === "/brand/")) {
    const brandPath = path.resolve(__dirname, "../../apps/web/public/brand.html");
    if (!fs.existsSync(brandPath)) {
      return sendHtml(res, 404, "<h1>Brand HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(brandPath, "utf8"));
  }

  // 方法論白皮書 (Methodology Whitepaper)
  if (req.method === "GET" && (url.pathname === "/whitepaper" || url.pathname === "/whitepaper/")) {
    const whitepaperPath = path.resolve(__dirname, "../../apps/web/public/whitepaper.html");
    if (!fs.existsSync(whitepaperPath)) {
      return sendHtml(res, 404, "<h1>Whitepaper HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(whitepaperPath, "utf8"));
  }

  // Developer Platform 介紹介面 (Showcase / Landing)
  if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/developers" || url.pathname === "/developers/")) {
    const devPath = path.resolve(__dirname, "../../apps/web/public/developers.html");
    if (!fs.existsSync(devPath)) {
      return sendHtml(res, 404, "<h1>Developers HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(devPath, "utf8"));
  }

  // Developer Platform 技術文件 (SDK & API Docs)
  if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/developers/docs" || url.pathname === "/developers/docs/")) {
    const docsPath = path.resolve(__dirname, "../../apps/web/public/developers/docs.html");
    if (!fs.existsSync(docsPath)) {
      return sendHtml(res, 404, "<h1>Developer Docs HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(docsPath, "utf8"));
  }

  // Developer Platform 管理控制台 (Console Dashboard)
  if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/developers/console" || url.pathname === "/developers/console/" || url.pathname === "/developers-console" || url.pathname === "/developers-console/")) {
    const consolePath = path.resolve(__dirname, "../../apps/web/public/developers-console.html");
    if (!fs.existsSync(consolePath)) {
      return sendHtml(res, 404, "<h1>Developer Console HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(consolePath, "utf8"));
  }

  // Product A Marketing Dashboard (SPA Client)
  if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/app" || url.pathname === "/app/" || url.pathname.startsWith("/app/"))) {
    const appDir = path.resolve(__dirname, "../../apps/web/app");
    let relativePath = url.pathname.replace(/^\/app\/?/, "");
    if (!relativePath || relativePath === "" || relativePath.indexOf(".") === -1) {
      relativePath = "index.html";
    }
    const safeFilePath = path.resolve(appDir, relativePath);
    if (!safeFilePath.toLowerCase().startsWith(appDir.toLowerCase()) || !fs.existsSync(safeFilePath)) {
      const indexPath = path.resolve(appDir, "index.html");
      if (fs.existsSync(indexPath)) {
        return sendHtml(res, 200, fs.readFileSync(indexPath, "utf8"));
      }
      return sendHtml(res, 404, "<h1>Dashboard not found</h1>");
    }

    const ext = path.extname(safeFilePath).toLowerCase();
    const mimeMap = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".mjs": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".json": "application/json; charset=utf-8"
    };
    const contentType = mimeMap[ext] || "text/plain; charset=utf-8";
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end(fs.readFileSync(safeFilePath));
  }

  // 靜態資產:og-image 與 favicon(缺檔時回 404,不再讓 meta 指向不存在的資源)
  if (req.method === "GET" && (url.pathname === "/og-image.png" || url.pathname === "/favicon.png" || url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg")) {
    let assetName = "favicon.png";
    let contentType = "image/png";
    if (url.pathname === "/og-image.png") {
      assetName = "og-image.png";
    } else if (url.pathname === "/favicon.svg") {
      assetName = "favicon.svg";
      contentType = "image/svg+xml";
    }
    const assetPath = path.resolve(__dirname, "../../apps/web/public", assetName);
    if (!fs.existsSync(assetPath)) return sendText(res, 404, "Not found");
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end(fs.readFileSync(assetPath));
  }

  // 靜態圖檔資產目錄 /assets/*
  if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/assets/")) {
    const safeAssetPath = path.resolve(__dirname, "../../apps/web/public", url.pathname.slice(1));
    const assetsDir = path.resolve(__dirname, "../../apps/web/public/assets");
    if (fs.existsSync(safeAssetPath) && safeAssetPath.toLowerCase().startsWith(assetsDir.toLowerCase())) {
      const ext = path.extname(safeAssetPath).toLowerCase();
      const mimeTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*"
      });
      return res.end(fs.readFileSync(safeAssetPath));
    }
    return sendText(res, 404, "Not found");
  }

  const adminPathToken = getAdminPathToken();
  const privateAdminPath = adminPathToken ? `/${adminPathToken}` : "";
  if (privateAdminPath && req.method === "GET" && url.pathname === privateAdminPath) {
    const adminPath = path.resolve(__dirname, "../../apps/web/public/admin.html");
    if (!fs.existsSync(adminPath)) return sendHtml(res, 404, "<h1>Not found</h1>");
    return sendHtml(res, 200, fs.readFileSync(adminPath, "utf8"));
  }

  // 舊路徑 /home 以 301 併入正典 /
  if (req.method === "GET" && url.pathname === "/home") {
    res.writeHead(301, {
      ...SECURITY_HEADERS,
      "Location": "/",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end();
  }

  if (privateAdminPath && req.method === "GET" && url.pathname === `${privateAdminPath}/usage`) {
    if (!isValidAdminToken(req)) return sendPrivateJson(res, 401, { error: "Unauthorized" });
    return sendPrivateJson(res, 200, getUsageSummary({ limit: url.searchParams.get("limit") }));
  }

  if (req.method === "POST" && url.pathname === "/api/audit") {
    return sendJson(res, 410, {
      error: "This mock audit endpoint is retired. Use /api/audit-real-lite for an evidence-backed AI Trust Index report.",
      code: "deprecated_endpoint",
      replacement: "/api/audit-real-lite"
    });
  }

  if (req.method === "POST" && url.pathname === "/api/test-provider") {
    if (!isValidAdminToken(req)) return sendPrivateJson(res, 401, { error: "Unauthorized" });
    try {
      const result = await testDeepSeekProvider();
      return sendPrivateJson(res, 200, {
        ok: true,
        provider: result.json.provider || result.provider,
        message: result.json.message || "deepseek api works",
        model: result.model,
        latencyMs: result.latencyMs
      });
    } catch (error) {
      console.error("test-provider failed", error);
      return sendPrivateJson(res, error.statusCode || 500, toClientError(error));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/test-search-provider") {
    if (!isValidAdminToken(req)) return sendPrivateJson(res, 401, { error: "Unauthorized" });
    try {
      const result = await testPerplexityProvider();
      return sendPrivateJson(res, 200, result);
    } catch (error) {
      console.error("test-search-provider failed", error);
      return sendPrivateJson(res, error.statusCode || 500, toClientError(error));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/search-context") {
    if (!isValidAdminToken(req)) return sendPrivateJson(res, 401, { error: "Unauthorized" });
    try {
      const body = await readJson(req);
      const query = String(body.query || "").trim();
      if (!query) return sendPrivateJson(res, 400, { error: "query is required" });
      const result = await searchPerplexity(query, { maxTokens: body.maxTokens || 700, operation: "search_context" });
      return sendPrivateJson(res, 200, result);
    } catch (error) {
      console.error("search-context failed", error);
      return sendPrivateJson(res, error.statusCode || 500, toClientError(error));
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
          ...SECURITY_HEADERS,
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
      const customQueries = Array.isArray(body.customQueries)
        ? body.customQueries.map((q) => String(q || "").trim()).filter(Boolean)
        : null;
      if (customQueries?.length && (customQueries.length > 4 || new Set(customQueries.map((query) => query.replace(/\s+/g, " ").toLowerCase())).size !== customQueries.length)) {
        return sendJson(res, 400, { error: "自訂觀測題最多 4 題，且每題都必須不同；未填的題目會由系統依網站內容補足。", code: "invalid_custom_queries" });
      }
      const cacheKey = buildAuditCacheKey({ siteUrl, customQueries, pipelineVersion: GEO_PIPELINE_VERSION });
      const memoryCacheKey = `audit:${cacheKey}`;
      let cached = auditCache.get(memoryCacheKey);
      if (!cached) {
        try {
          cached = await d1ReportStore.getByCacheKey(cacheKey);
          if (cached) auditCache.set(memoryCacheKey, cached.report);
        } catch (error) {
          console.error("D1 report cache lookup failed", error.message);
        }
      }
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
      const freshReport = normalizeReportForClient(await runRealLiteAudit(siteUrl, { customQueries }));
      const report = auditCache.set(memoryCacheKey, freshReport);
      reports.set(report.id, report);
      try {
        await d1ReportStore.set(cacheKey, freshReport);
      } catch (error) {
        console.error("D1 report cache write failed", error.message);
      }
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
    if (!isValidAdminToken(req)) return sendPrivateJson(res, 401, { error: "Unauthorized" });
    return sendPrivateJson(res, 200, { ...getRateLimitState(), auditCache: auditCache.state(), reportStore: d1ReportStore.state() });
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
    const report = await getStoredReport(reportApiMatch[1]);
    if (!report) return sendJson(res, 404, { error: "Report not found" });
    return sendJson(res, 200, normalizeReportForClient(report));
  }

  const reportMarkdownMatch = url.pathname.match(/^\/report\/([^/]+)\/markdown$/);
  if (req.method === "GET" && reportMarkdownMatch) {
    const report = await getStoredReport(decodeURIComponent(reportMarkdownMatch[1]));
    if (!report) return sendHtml(res, 404, "<h1>Report not found</h1>");
    return sendMarkdown(res, markdownFilename(report), reportMarkdown(report));
  }

  const reportPageMatch = url.pathname.match(/^\/report\/([^/]+)$/);
  if (req.method === "GET" && reportPageMatch) {
    const report = await getStoredReport(decodeURIComponent(reportPageMatch[1]));
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
      // Validate site URL format and prevent dangerous schemes from entering the lead store.
      try {
        const leadSite = new URL(body.site.trim());
        if (!["http:", "https:"].includes(leadSite.protocol)) throw new Error("unsupported protocol");
      } catch {
        return sendJson(res, 400, { error: "site must be a valid http(s) URL" });
      }

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
      // Persist to filesystem so leads survive server restarts
      const leadsFile = path.resolve(__dirname, "../../mock-api/leads.jsonl");
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
        nextAction: "已收到資料；如需進一步了解，我們會透過 Email 聯絡"
      });
    } catch (error) {
      if (error?.code === "request_too_large") return sendJson(res, 413, { error: "Request body is too large" });
      if (error?.code === "invalid_json" || error instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON" });
      console.error("lead submission failed", { code: error?.code || "internal_error" });
      return sendJson(res, 500, { error: "Unable to save lead" });
    }
  }

  // API 路徑維持 JSON 404;一般頁面回傳 HTML 404(附回首頁連結)
  if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
    return sendHtml(res, 404, `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>GeoCheck — 找不到頁面 (404)</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=radar-20260904"/>
<link rel="icon" type="image/png" href="/favicon.png?v=radar-20260904"/>
<style>body{font-family:system-ui,"Noto Sans TC",sans-serif;background:#f7f9fc;color:#1e2a38;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}main{text-align:center;padding:24px}h1{color:#0b3b6f;font-size:3rem;margin:0 0 8px}a{display:inline-block;margin-top:20px;background:#00b8a9;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:700}</style>
</head><body><main><h1>404</h1><p>找不到這個頁面。想檢查你的網站 AI 看不看得見?</p><a href="/">回首頁開始免費健檢</a></main></body></html>`);
  }

  return sendJson(res, 404, { error: "Not found" });
}

if (process.env.GEOCHECK_SERVER_NO_LISTEN !== "true") {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: "Internal server error" });
    });
  });

  server.listen(PORT, () => {
    console.log(`SEO/GEO mock API running at http://localhost:${PORT}`);
  });
}
module.exports = { normalizeReportForClient, reportHtml, reportMarkdown };
// SEO/GEO audit fixes applied 2026-07-18: canonical unified to "/", llms.txt route,
// static og-image/favicon routes, fixed sitemap lastmod, explicit AI-crawler allows, HTML 404.
