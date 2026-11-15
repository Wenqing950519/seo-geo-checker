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
const { resolveAuditMethod, runRealLiteAudit } = require("../../apps/web/report/real-lite-audit.js");
const { normalizeReportForClient, reportHtml, reportMarkdown } = require("../../apps/web/report/report-render.js");
const { MCAC_PIPELINE_VERSION } = require("./application/mcac-measurement.js");
const { resolveMcacEngine } = require("./application/mcac-engines.js");
const { createAuditCache } = require("./storage/audit-cache.js");
const { GEO_PIPELINE_VERSION } = require("./application/geo-measurement.js");
const { buildAuditCacheKey, createD1ReportStore } = require("./storage/d1-report-store.js");
const { createFunnelRecorder } = require("../../apps/web/analytics/funnel-events.js");
const { assertSafePublicUrl } = require("../../packages/crawler/url-safety.js");
const { testDeepSeekProvider } = require("../../packages/ai-providers/deepseek.js");
const { searchPerplexity, testPerplexityProvider } = require("../../packages/ai-providers/perplexity.js");
const { getUsageSummary } = require("../../packages/ai-providers/usage-meter.js");
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
const gscClient = createGoogleSearchConsoleClient({ clientId: process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET });
const dashboardApi = createDashboardApiHttpHandler({ gscClient, createSqliteDashboardStore });
const googleOAuth = createGoogleOAuthHttpHandler({ dashboardApi, gscClient });
const funnel = createFunnelRecorder();
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

> GEOCheck(${SITE_ORIGIN}) 是台灣的網站健檢與方法研究計畫。它在指定的 AI 搜尋
> 查詢下，量測可見答案是否採用品牌，以及是否引用已驗證的第一方官方 URL；站內準備度另行呈現。

## 量測範圍

- 每次檢測只問一個 AI 搜尋；GEOCheck 不會將結果外推為其他生成式系統的可見度。
- 出題模型只負責根據網站公開內容產生候選查詢與結構化描述；它不參與
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
- [健檢模組](${SITE_ORIGIN}/#modules): 技術、內容與 AI 搜尋觀測的範圍
- [研究與方法](${SITE_ORIGIN}/#method): 資料流程與限制
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

// served as an MCAC result.
function currentPipelineVersion() {
  return resolveAuditMethod() === "mcac"
    ? `${MCAC_PIPELINE_VERSION}-${resolveMcacEngine(process.env.GEOCHECK_MCAC_ENGINE).id}`
    : GEO_PIPELINE_VERSION;
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

  // The UI/UX 2.0 demo prototype is retired (LSL-D-001); answer 410 like the public Pages host.
  if (req.method === "GET" && (url.pathname === "/demo" || url.pathname === "/demo/")) {
    return sendHtml(res, 410, '<h1>這個頁面已移除</h1><p><a href="/">回到 GeoCheck 首頁</a></p>');
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
      const mimeTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
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
      const cacheKey = buildAuditCacheKey({ siteUrl, customQueries, pipelineVersion: currentPipelineVersion() });
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
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=lslabs-20261023"/>
<link rel="icon" type="image/png" href="/favicon.png?v=lslabs-20261023"/>
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
