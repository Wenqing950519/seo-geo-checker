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
const { testDeepSeekProvider } = require("./providers/deepseek");
const { searchPerplexity, testPerplexityProvider } = require("./providers/perplexity");
const { getUsageSummary } = require("./lib/usage-meter");

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
  </script>
  <script src="/analytics.js"></script>`;

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
  const breakdownLabels = {
    answer_adoption: ["AI 回答裡有提到你的品牌", "代表 AI 認得你，也願意把你講出來。"],
    source_evidence: ["AI 回答裡有引用你的官網", "代表 AI 把你的網站當成可信來源，顧客也比較有機會點進來。"]
  };
  const breakdownRows = Object.entries(score.breakdown || {}).map(([key, value]) => {
    const [title, note] = breakdownLabels[key] || [key, ""];
    const shown = Number.isFinite(value.value) ? `${value.value}%` : "資料不足";
    return `<tr><td><strong>${escapeHtml(title)}</strong><br/><span class="meta">${escapeHtml(note)}</span></td><td>${escapeHtml(shown)}</td><td>${escapeHtml(value.weight ?? "—")}%</td></tr>`;
  }).join("");
  const matchedDomains = authority.matchedExternalDomains || [];
  const observationRows = (observation.observations || []).map((item) =>
    `<tr><td>${escapeHtml(item.query || "")}</td><td>${item.brandMentioned ? "有提到" : "沒提到"}</td><td>${item.firstPartyCited ? "有連到官網" : "沒有"}</td><td>${escapeHtml((item.sourceDomains || []).join("、") || "—")}</td></tr>`
  ).join("");
  const issueRows = issues.map((issue) =>
    `<tr><td>${escapeHtml(friendlyLabel(SEVERITY_LABELS, issue.severity, "建議處理"))}</td><td>${escapeHtml(friendlyLabel(ISSUE_CHECK_LABELS, issue.check, issue.check))}</td><td>${escapeHtml(issue.detail_zh || "")}</td><td>${escapeHtml(issue.impact_zh || "")}</td></tr>`
  ).join("");
  const actionRows = actions.map((action, index) =>
    `<tr><td>第 ${index + 1} 件</td><td>${escapeHtml(friendlyLabel(ACTION_TYPE_LABELS, action.type, "網站內容"))}</td><td>${escapeHtml(action.target_zh || "")}</td><td>${escapeHtml(action.recommendation_zh || "")}</td></tr>`
  ).join("");

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/>${GA_TAG_HTML}
<title>AI 信任值報告</title>
<style>
body{font-family:system-ui,"Noto Sans TC",sans-serif;margin:0;background:#f7f9fc;color:#1e2a38;line-height:1.7}main{max-width:1040px;margin:0 auto;padding:48px 20px}.card{background:#fff;border:1px solid #e5edf5;border-radius:12px;padding:24px;margin:18px 0;box-shadow:0 8px 24px rgba(11,59,111,.08)}h1,h2,h3{color:#0b3b6f;line-height:1.3}.score{font-size:56px;font-weight:800;color:#00a99b}.readiness{font-size:28px;font-weight:750;color:#0b3b6f}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #e5edf5;padding:10px;vertical-align:top}.badge{display:inline-block;padding:4px 12px;border-radius:999px;background:#fff4e0;color:#9a6500;font-weight:700}.meta{color:#5a6b7e;font-size:.92rem}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.metric{background:#f4f8fc;border-radius:10px;padding:14px}.report-nav{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}a.button{display:inline-block;background:#00b8a9;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700}a.button.secondary{background:#fff;color:#0b3b6f;border:1px solid #cdd9e5}@media(max-width:640px){main{padding:30px 14px}.card{padding:18px}.metrics{grid-template-columns:1fr}.score{font-size:48px}table{display:block;overflow-x:auto;white-space:nowrap}.report-nav a.button{width:100%;text-align:center}}
</style></head><body><main>
${reportTopNavHtml()}
<h1>你的網站在 AI 搜尋裡的表現</h1>
<p>${escapeHtml(report.url)}</p>
<p class="meta">檢測時間：${escapeHtml(formatReportTime(report.createdAt))}</p>
<section class="card"><h2>AI 信任值</h2><div class="score">${escapeHtml(scoreValue)}</div><p><span class="badge">${escapeHtml(friendlyLabel(SCORE_LABELS, score.label, score.label || "這次資料不足，暫不評分"))}</span></p><p>${scoreContext}</p><p>${escapeHtml(score.summary_zh || "")}</p><p class="meta">這次一共問了 ${escapeHtml(score.denominator?.total_runs ?? 0)} 題，其中 ${escapeHtml(score.denominator?.valid_runs ?? 0)} 題拿到可以判讀的回答。沒拿到回答的題目不會被當成 0 分。</p></section>
<section class="card"><h2>這個分數是怎麼來的</h2><p>AI 信任值只看兩件事：AI 有沒有講到你，以及 AI 有沒有把你的官網當成資料來源。</p><table><thead><tr><th>看的是什麼</th><th>這次的表現</th><th>占分數比重</th></tr></thead><tbody>${breakdownRows}</tbody></table></section>
<section class="card"><h2>顧客這樣問的時候，AI 怎麼回答</h2><p>下面這些問題都沒有寫出你的店名或品牌名，模擬顧客還不認識你、只描述自己需求時會怎麼問。</p><div class="metrics"><div class="metric"><strong>拿到回答的題數</strong><br/>${escapeHtml(observation.measuredQueryCount ?? 0)} / ${escapeHtml(observation.queryCount ?? 0)}</div><div class="metric"><strong>有提到你的比例</strong><br/>${escapeHtml(observation.mentionRate ?? "—")}%</div><div class="metric"><strong>有連到你官網的比例</strong><br/>${escapeHtml(observation.citationRate ?? "—")}%</div></div><p><strong>網路上有沒有其他網站在談你：</strong>${authority.entityGrounded ? "有找到" : "這次沒有找到足夠的資料"}${matchedDomains.length ? `（${escapeHtml(matchedDomains.join("、"))}）` : ""}</p><table><thead><tr><th>顧客可能會問的問題</th><th>有提到你嗎</th><th>有連到你的官網嗎</th><th>AI 這次參考了哪些網站</th></tr></thead><tbody>${observationRows}</tbody></table></section>
<section class="card"><h2>AI 讀得到你的網站嗎</h2><p>讀取結果：${escapeHtml(crawlText)}；另外成功讀到 ${escapeHtml(representativeSuccess)} 個內頁。</p><h3>網站基礎體質</h3><div class="readiness">${escapeHtml(readinessValue)} / 100</div><p class="meta">這一項不算進 AI 信任值。它看的是網站本身好不好讀：內容夠不夠、標題清不清楚、AI 與搜尋引擎進不進得來。體質好不保證 AI 會提到你，但體質差通常會讓後面的努力事倍功半。</p></section>
<section class="card"><h2>網站上建議修正的地方</h2><table><thead><tr><th>重要程度</th><th>檢查項目</th><th>目前狀況</th><th>為什麼重要</th></tr></thead><tbody>${issueRows}</tbody></table></section>
<section class="card"><h2>網站內容還少了什麼</h2><ul>${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul></section>
<section class="card"><h2>如果只做三件事，先做這些</h2><table><thead><tr><th>順序</th><th>類別</th><th>要改哪裡</th><th>建議怎麼做</th></tr></thead><tbody>${actionRows}</tbody></table></section>
<section class="card"><h2>這份報告不能保證什麼</h2><ul>${(audit.limitations_zh || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
<section class="card"><a class="button secondary" href="/report/${encodeURIComponent(report.id)}/markdown" data-track-action="download_report">下載這份報告</a> <a class="button" href="${TALLY_FORM_URL}" target="_blank" rel="noopener" data-track-action="book_report_interpretation">找人幫你解讀報告</a></section>
</main>${reportTrackingHtml(report.id)}</body></html>`;
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

  if (req.method === "GET" && url.pathname === "/analytics.js") {
    const analyticsPath = path.resolve(__dirname, "public", "analytics.js");
    if (!fs.existsSync(analyticsPath)) return sendText(res, 404, "Not found");
    return sendText(res, 200, fs.readFileSync(analyticsPath, "utf8"), "application/javascript; charset=utf-8");
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

  if (req.method === "POST" && url.pathname === "/api/audit") {
    return sendJson(res, 410, {
      error: "This mock audit endpoint is retired. Use /api/audit-real-lite for an evidence-backed AI Trust Index report.",
      code: "deprecated_endpoint",
      replacement: "/api/audit-real-lite"
    });
  }

  if (req.method === "POST" && url.pathname === "/api/test-provider") {
    try {
      const result = await testDeepSeekProvider();
      return sendJson(res, 200, {
        ok: true,
        provider: result.json.provider || result.provider,
        message: result.json.message || "deepseek api works",
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
        nextAction: "已收到資料；如需進一步了解，我們會透過 Email 聯絡"
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
