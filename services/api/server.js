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
const SITE_ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN || "https://geocheck.lslabs.tw");
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

  // Result flags: the lab-report H/L column, in words. Missing data is its
  // own flag, never folded into "無".
  const flag = (kind, text) => `<span class="flag flag--${kind}">${escapeHtml(text)}</span>`;
  const rateFlag = (breakdown) => {
    if (!breakdown || !Number.isFinite(breakdown.value)) return flag("unknown", "未知");
    if (breakdown.value >= 60) return flag("yes", "常出現");
    if (breakdown.value > 0) return flag("part", "部分");
    return flag("no", "沒有");
  };
  const SCORE_FLAGS = { "高": ["yes", "高"], "穩定": ["part", "穩定"], "待改善": ["part", "待改善"], "低": ["no", "低"] };
  const scoreFlag = SCORE_FLAGS[score.label] ? flag(...SCORE_FLAGS[score.label]) : flag("unknown", "未評分");
  const readinessFlag = !Number.isFinite(score.site_readiness_value)
    ? flag("unknown", "未知")
    : score.site_readiness_value >= 70 ? flag("yes", "好讀") : score.site_readiness_value >= 50 ? flag("part", "可讀") : flag("no", "受限");
  const hostname = new URL(report.url).hostname.replace(/^www\./, "");

  // One row per question, with the transcript behind a disclosure.
  const queryRowsHtml = obsList.length ? obsList.map((item, idx) => {
    const isMentioned = Boolean(item.brandMentioned);
    const isCited = Boolean(item.firstPartyCited);
    const answerText = item.answer
      ? escapeHtml(item.answer)
      : (isMentioned ? "AI 於檢索答案中直接提及受測品牌相關服務與特色。" : "AI 於本次檢索中未將受測店家列為主要推薦，多提及同業品牌。");
    const sources = (item.sourceDomains || []).map((d) => `<li>${escapeHtml(d)}</li>`).join("");
    return `
      <li class="q">
        <div class="q-row">
          <span class="q-no mono">Q${idx + 1}</span>
          <p class="q-text">「${escapeHtml(item.query || "")}」</p>
          <span class="q-flags">${isMentioned ? flag("yes", "提到你") : flag("no", "沒提到")}${isCited ? flag("yes", "引用官網") : flag("no", "未引用")}</span>
        </div>
        <details class="q-detail">
          <summary>看 AI 回答原文與引用來源</summary>
          <div class="q-body">
            <p>${answerText}</p>
            <p class="q-src-title">引用來源</p>
            ${sources ? `<ul class="q-src mono">${sources}</ul>` : `<p class="q-src-none">無外部引用記錄</p>`}
          </div>
        </details>
      </li>`;
  }).join("") : `<li class="q"><p class="q-empty">本次檢測尚未產出足夠的有效觀測題目。</p></li>`;

  // 12-point check, grouped by what a reader would fix together.
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
  const check = (name, [kind, label], note) => `
          <li><span class="chk-name">${name}<small>${note}</small></span>${flag(kind, label)}</li>`;
  const PASS = ["yes", "通過"];
  const checkGroups = [
    ["AI 爬蟲可讀性", [
      check("robots.txt 存取權限", hasRobotsIssue ? ["no", "缺失"] : PASS, hasRobotsIssue ? "部分 AI 搜尋爬蟲存取受阻" : "未封鎖主串流 AI 搜尋爬蟲"),
      check("sitemap.xml 索引清單", hasSitemapIssue ? ["part", "待修"] : PASS, hasSitemapIssue ? "網站地圖未設定或格式不全" : "成功讀取重要頁面索引"),
      check("HTTP 伺服器回應", hasFetchIssue ? ["no", "異常"] : PASS, hasFetchIssue ? "伺服器讀取異常或連線逾時" : "首頁正常回應 (HTTP 200)"),
      check("llms.txt AI 專用摘要", ["part", "建議"], "建議部署 /llms.txt 加深語意識別")
    ]],
    ["標籤與結構語意", [
      check("首頁 Title 服務屬性", hasTitleIssue ? ["part", "待修"] : PASS, hasTitleIssue ? "標題缺少核心服務關鍵字" : "標題清楚標示品牌與服務"),
      check("Meta Description 說明", hasMetaIssue ? ["part", "待修"] : PASS, hasMetaIssue ? "摘要過短或缺少主要業務敘述" : "具備清晰之門市或服務簡介"),
      check("規範網址與 OpenGraph", hasCanonicalIssue ? ["part", "待修"] : PASS, hasCanonicalIssue ? "canonical 或社交標籤需補齊" : "標準網址與社交標籤健全"),
      check("LocalBusiness 結構化資料", hasSchemaIssue ? ["no", "缺失"] : PASS, hasSchemaIssue ? "缺少 Schema JSON-LD 實體標記" : "已部署結構化實體資料")
    ]],
    ["內容可引用性", [
      check("常見問答 (FAQ)", hasFaqGap ? ["no", "缺失"] : PASS, hasFaqGap ? "缺少針對顧客疑慮的一問一答" : "站內具備清楚問答段落"),
      check("文字化服務與價格", hasPriceGap ? ["part", "待修"] : PASS, hasPriceGap ? "以圖片呈現或缺少明確文字價目" : "服務項目與價格資訊皆以文字呈現"),
      check("地理位置與聯絡資訊", hasLocationGap ? ["part", "待補"] : PASS, hasLocationGap ? "地址、電話或交通資訊不夠顯眼" : "門市地址與營業時間標示明確"),
      check("顧客好評與客觀背書", hasProofGap ? ["part", "待補"] : PASS, hasProofGap ? "缺少第三方評測或案例佐證" : "包含豐富真實評價與背書")
    ]]
  ];
  const checksHtml = checkGroups.map(([title, rows]) => `
        <div class="chk-group">
          <h3>${title}</h3>
          <ul>${rows.join("")}
          </ul>
        </div>`).join("");

  const allExternal = [...new Set([...matchedDomains, ...obsList.flatMap((o) => o.sourceDomains || [])])].slice(0, 4);
  const sourcesHtml = allExternal.length
    ? allExternal.map((domain) => `<li class="mono">${escapeHtml(domain)}</li>`).join("")
    : `<li><span class="mono">${escapeHtml(hostname)}</span>（店家官網）：目前主要依據第一方官方網站進行基礎解析。</li>`;

  const actionsHtml = actions.slice(0, 4).map((action, idx) => {
    const matchedIssue = issues.find((i) => i.check === action.type || i.target_zh === action.target_zh) || issues[idx] || {};
    const flawText = matchedIssue.detail_zh || "相關屬性或結構化內容尚待補齊。";
    const impactText = matchedIssue.impact_zh || "AI 在進行實體比對與解答生成時缺少權威佐證，容易優先推薦已標明屬性的競品。";
    const fixText = action.recommendation_zh || "依循規範補齊相關內容與標籤。";
    return `
      <li class="act">
        <span class="act-no num">${idx + 1}</span>
        <div>
          <h3>${escapeHtml(action.target_zh || "核心診斷項目")}<small>${escapeHtml(friendlyLabel(ACTION_TYPE_LABELS, action.type, "網站內容"))}</small></h3>
          <p>${escapeHtml(action.recommendation_zh || "")}</p>
          <details class="act-detail">
            <summary>看目前的缺失與影響</summary>
            <dl>
              <div><dt>目前缺失</dt><dd>${escapeHtml(flawText)}</dd></div>
              <div><dt>對 AI 推薦的影響</dt><dd>${escapeHtml(impactText)}</dd></div>
              <div><dt>改善方向</dt><dd>${escapeHtml(fixText)}</dd></div>
            </dl>
          </details>
        </div>
      </li>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>${GA_TAG_HTML}
<title>GeoCheck — AI 信任值報告</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=radar-20260904"/>
<link rel="icon" type="image/png" href="/favicon.png?v=radar-20260904"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+TC:wght@400;500;700;900&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--ink:#0B1F3B;--text:#1E293B;--muted:#475569;--faint:#64748B;--paper:#FFFFFF;--desk:#EEF2F7;--rule:#D5DDE8;--rule-soft:#E2E8F0;--action:#1D4ED8;--action-strong:#1E40AF;--field:#0B1F3B;--sans:'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif;--latin:'Space Grotesk','Noto Sans TC',system-ui,sans-serif;--mono:'IBM Plex Mono',ui-monospace,Menlo,monospace}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font:400 16px/1.7 var(--sans);color:var(--text);background:var(--desk);-webkit-font-smoothing:antialiased}
h1,h2,h3,p{margin:0}h1,h2,h3{color:var(--ink);line-height:1.3;text-wrap:balance}
a{color:var(--action);text-underline-offset:3px}a:hover{color:var(--action-strong)}
::selection{background:#BFD3FF;color:var(--ink)}
:focus-visible{outline:2px solid var(--action);outline-offset:3px;border-radius:4px}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}.num{font-family:var(--latin);font-variant-numeric:tabular-nums}
.bar{background:var(--field);color:#F8FAFC}
.bar-inner,.sheet,.after{width:min(100% - 32px,880px);margin-inline:auto}
.bar-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:60px}
.bar-logo{display:inline-flex;align-items:center;gap:10px;color:#F8FAFC;text-decoration:none;font:700 1.05rem/1 var(--latin)}
.bar-logo small{font:500 .72rem/1 var(--latin);color:#94A3B8}
.bar a.back{color:#BFD3FF;font-size:.9rem;text-decoration:none}.bar a.back:hover{color:#fff;text-decoration:underline}
.bar :focus-visible{outline-color:#60A5FA}
.sheet{margin-top:32px;background:var(--paper);border:1px solid var(--rule);border-radius:4px;box-shadow:0 1px 0 var(--rule),0 28px 56px -32px rgba(11,31,59,.4)}
.head{padding:28px 32px 20px;border-bottom:2px solid var(--ink)}
.head h1{font-size:clamp(1.3rem,3vw,1.6rem);font-weight:900;letter-spacing:.04em}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px 24px;margin:14px 0 0;font-size:.82rem}
.meta div{min-width:0}.meta dt{color:var(--faint)}.meta dd{margin:0;font-family:var(--mono);color:var(--text);overflow-wrap:anywhere}
.part{padding:28px 32px;border-bottom:1px solid var(--rule)}
.part:last-child{border-bottom:0}
.part>h2{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;font-size:1.05rem;font-weight:900;letter-spacing:.04em;margin-bottom:6px}
.part>h2 small{font-size:.8rem;font-weight:400;letter-spacing:0;color:var(--muted)}
.part>.hint{font-size:.88rem;color:var(--muted);margin-bottom:14px}
.results{width:100%;border-collapse:collapse}
.results th,.results td{padding:14px 0;border-bottom:1px solid var(--rule-soft);text-align:left;vertical-align:top}
.results tr:last-child th,.results tr:last-child td{border-bottom:0}
.results th{font-weight:700;color:var(--ink);padding-right:16px}
.results th small{display:block;margin-top:3px;font-weight:400;font-size:.84rem;line-height:1.6;color:var(--muted);max-width:36em}
.results td.v{font:700 1.25rem/1.3 var(--latin);color:var(--ink);white-space:nowrap;padding-right:16px;font-variant-numeric:tabular-nums}
.results td.v small{font-size:.7em;font-weight:500;color:var(--faint)}
.results td.f{text-align:right;width:1%}
.results tr.lead td.v{font-size:2.4rem;line-height:1.1}
.flag{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:4px;font:700 .76rem/1.6 var(--sans);letter-spacing:.04em;white-space:nowrap}
.flag::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.flag--yes{color:#047857;background:#ECFDF5}.flag--part{color:#B45309;background:#FFF4E0}.flag--no{color:#B91C1C;background:#FEF2F2}
.flag--unknown{color:#475569;background:#F1F5F9}.flag--unknown::before{background:transparent;border:1.5px solid currentColor;width:7px;height:7px}
.qs,.acts,.srcs{list-style:none;margin:0;padding:0}
.q{border-top:1px solid var(--rule-soft);padding:14px 0}
.q-row{display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;align-items:baseline}
.q-no{font-size:.8rem;color:var(--faint)}
.q-text{font-weight:700;color:var(--ink)}
.q-flags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.q-empty{color:var(--muted)}
details>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:6px;min-height:36px;font-size:.86rem;font-weight:700;color:var(--action)}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"";width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .2s}
details[open]>summary::before{transform:rotate(45deg)}
.q-detail{margin:4px 0 0 calc(2.2em + 14px)}
.q-body{padding:12px 16px;border-left:1px solid var(--rule);font-size:.92rem;background:#F8FAFC}
.q-body>p:first-child{white-space:pre-line}
.q-src-title{margin-top:12px;font-size:.78rem;font-weight:700;color:var(--faint);letter-spacing:.06em}
.q-src{margin:4px 0 0;padding-left:1.1em;font-size:.84rem}.q-src-none{font-size:.84rem;color:var(--muted)}
.chk{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px 28px}
.chk-group h3{font-size:.9rem;font-weight:900;padding-bottom:8px;border-bottom:1px solid var(--ink)}
.chk-group ul{list-style:none;margin:0;padding:0}
.chk-group li{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--rule-soft);font-size:.88rem}
.chk-name{font-weight:500;color:var(--ink)}.chk-name small{display:block;font-size:.78rem;font-weight:400;color:var(--muted);line-height:1.5}
.srcs{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 24px}
.srcs li{padding:10px 0;border-bottom:1px solid var(--rule-soft);font-size:.9rem;overflow-wrap:anywhere}
.act{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:18px 0;border-top:1px solid var(--rule-soft)}
.act:first-child{border-top:0;padding-top:4px}
.act-no{display:grid;place-items:center;width:30px;height:30px;border:1.5px solid var(--ink);border-radius:50%;font-weight:700;color:var(--ink)}
.act h3{font-size:1.02rem;font-weight:900}.act h3 small{margin-left:10px;font-size:.78rem;font-weight:500;color:var(--faint)}
.act p{margin-top:4px;font-size:.92rem;color:var(--muted)}
.act dl{margin:8px 0 0;display:grid;gap:10px;font-size:.88rem}
.act dt{font-weight:700;color:var(--ink)}.act dd{margin:0;color:var(--text)}
.limits{margin:0;padding-left:1.2em;font-size:.88rem;color:var(--muted)}.limits li+li{margin-top:4px}
.after{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;margin-top:24px;margin-bottom:64px}
.after-actions{display:flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:8px;background:var(--action);color:#fff;font:700 .92rem/1 var(--sans);text-decoration:none;border:1px solid var(--action)}
.btn:hover{background:var(--action-strong);border-color:var(--action-strong);color:#fff}
.btn-ghost{background:var(--paper);color:var(--action);border-color:var(--rule)}.btn-ghost:hover{background:#fff;color:var(--action-strong);border-color:var(--action)}
.after small{font-size:.8rem;color:var(--muted)}
@media(max-width:760px){
  .head,.part{padding:22px 18px}
  .chk{grid-template-columns:1fr}
  .q-row{grid-template-columns:auto 1fr}.q-flags{grid-column:2;justify-content:flex-start}
  .q-detail{margin-left:0}
  .results tr{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:12px 0;border-bottom:1px solid var(--rule-soft)}
  .results tr:last-child{border-bottom:0}
  .results th,.results td{padding:0;border:0}.results th{grid-column:1/-1}
  .results td.f{text-align:right;width:auto;align-self:center}
  .results tr.lead td.v{font-size:2rem}
  .after-actions{width:100%}.after-actions .btn{flex:1}
}
@media print{body{background:#fff}.bar,.after{display:none}.sheet{margin:0;border:0;box-shadow:none}details>summary{display:none}details .q-body,details dl{display:block}}
</style>
</head>
<body>
<header class="bar">
  <div class="bar-inner">
    <a class="bar-logo" href="/" aria-label="GeoCheck 首頁">
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="rgba(59,130,246,.16)"/><path d="M 38 15 A 18 18 0 1 0 42 25" stroke="#FFFFFF" stroke-width="4.2" stroke-linecap="round"/><path d="M 16 25 L 22 31 L 38 15" stroke="#60A5FA" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      GeoCheck <small>by LS-Labs</small>
    </a>
    <a class="back" href="/#top" data-track-action="run_another_analysis">檢測另一個網站</a>
  </div>
</header>
<main class="sheet">
  <header class="head">
    <h1>AI 信任值檢測單</h1>
    <dl class="meta">
      <div><dt>受檢網站</dt><dd>${escapeHtml(report.url)}</dd></div>
      <div><dt>檢測時間</dt><dd>${escapeHtml(formatReportTime(report.createdAt))}</dd></div>
      <div><dt>有效題數</dt><dd>${escapeHtml(score.denominator?.valid_runs ?? 0)} / ${escapeHtml(score.denominator?.total_runs ?? 0)}</dd></div>
    </dl>
  </header>

  <section class="part" aria-labelledby="r-results">
    <h2 id="r-results">結果</h2>
    <table class="results">
      <caption class="visually-hidden">AI 信任值與分項結果</caption>
      <tbody>
        <tr class="lead">
          <th scope="row">AI 信任值<small>${escapeHtml(friendlyLabel(SCORE_LABELS, score.label, score.label || "這次資料不足，暫不評分"))}。${escapeHtml(scoreContext)}</small></th>
          <td class="v">${escapeHtml(scoreValue)}<small> / 100</small></td>
          <td class="f">${scoreFlag}</td>
        </tr>
        <tr>
          <th scope="row">AI 回答裡有提到你的品牌（占 65%）<small>顧客沒說店名時，AI 主動講到你的比例</small></th>
          <td class="v">${escapeHtml(adoptionVal)}</td>
          <td class="f">${rateFlag(score.breakdown?.answer_adoption)}</td>
        </tr>
        <tr>
          <th scope="row">AI 回答裡有引用你的官網（占 35%）<small>回答的來源裡，出現你官網的比例</small></th>
          <td class="v">${escapeHtml(sourceVal)}</td>
          <td class="f">${rateFlag(score.breakdown?.source_evidence)}</td>
        </tr>
        <tr>
          <th scope="row">有效題數<small>這次一共問了 ${escapeHtml(score.denominator?.total_runs ?? 0)} 題，其中 ${escapeHtml(score.denominator?.valid_runs ?? 0)} 題拿到可以判讀的回答。沒拿到回答的題目不會被當成 0 分。少於兩題有效查詢時封頂 69 分。</small></th>
          <td class="v">${escapeHtml(score.denominator?.valid_runs ?? 0)}<small> / ${escapeHtml(score.denominator?.total_runs ?? 0)}</small></td>
          <td class="f"></td>
        </tr>
        <tr>
          <th scope="row">網站基礎體質（不計入 AI 信任值）<small>${escapeHtml(crawlText)}；另外成功讀取 ${escapeHtml(representativeSuccess)} 個代表性內頁。機器人存取（robots.txt）：${crawlQuality.robotsReadable ? "正常開放" : "受限或未知"}。體質好不保證被 AI 推薦。</small></th>
          <td class="v">${escapeHtml(readinessValue)}<small> / 100</small></td>
          <td class="f">${readinessFlag}</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="part" aria-labelledby="r-queries">
    <h2 id="r-queries">逐題紀錄<small>問題都不含你的品牌名</small></h2>
    <p class="hint">模擬顧客只描述情境與需求時，AI 搜尋引擎實際怎麼推薦、引用了誰。</p>
    <ol class="qs">${queryRowsHtml}
    </ol>
  </section>

  <section class="part" aria-labelledby="r-checks">
    <h2 id="r-checks">網站體檢 12 項<small>機器能不能順利讀取並摘錄你的網站</small></h2>
    <div class="chk">${checksHtml}
    </div>
  </section>

  <section class="part" aria-labelledby="r-sources">
    <h2 id="r-sources">AI 參考的外部來源</h2>
    <p class="hint">AI 不只讀你的官網，也會交叉比對其他網站。以下是本次檢測中出現的來源：</p>
    <ul class="srcs">${sourcesHtml}</ul>
  </section>

  <section class="part" aria-labelledby="r-actions">
    <h2 id="r-actions">先修這幾件事</h2>
    ${actionsHtml ? `<ol class="acts">${actionsHtml}
    </ol>` : `<p class="hint">目前暫無重大缺失需立即處理。</p>`}
  </section>

  <section class="part" aria-labelledby="r-limits">
    <h2 id="r-limits">看分數之前，先知道它不能代表什麼</h2>
    <ul class="limits">
      <li>問不到足夠回答的時候，我們會標成「不知道」，不會當成 0 分。</li>
      <li>結果只代表這個時間點、這幾題問題問到的狀況，換個時間或換個問法可能不一樣。</li>
      <li>被提到不等於被推薦，被引用也不保證會帶來客人或訂單。</li>
      <li>報告給的是可以追查的線索，不保證任何搜尋排名或 AI 之後的引用結果。</li>
      ${(audit.limitations_zh || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  </section>
</main>
<div class="after">
  <small class="mono">GeoCheck · AI Trust Index v1 · ${escapeHtml(String(report.id || "").slice(0, 40))}</small>
  <div class="after-actions">
    <a class="btn btn-ghost" href="/report/${encodeURIComponent(report.id)}/markdown" data-track-action="download_report">下載這份報告</a>
    <a class="btn" href="${TALLY_FORM_URL}" target="_blank" rel="noopener" data-track-action="book_report_interpretation">找人幫你解讀報告</a>
  </div>
</div>
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
  if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/developers/docs" || url.pathname === "/developers/docs/" || url.pathname === "/docs" || url.pathname === "/docs/")) {
    const docsPath = path.resolve(__dirname, "../../apps/web/public/developers/docs.html");
    if (!fs.existsSync(docsPath)) {
      return sendHtml(res, 404, "<h1>Developer Docs HTML not found</h1>");
    }
    return sendHtml(res, 200, fs.readFileSync(docsPath, "utf8"));
  }

  // Developer Platform 管理控制台 (Console Dashboard)
  if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/developers/console" || url.pathname === "/developers/console/" || url.pathname === "/developers-console" || url.pathname === "/developers-console/" || url.pathname === "/console" || url.pathname === "/console/")) {
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
