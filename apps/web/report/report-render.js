// Report page and Markdown rendering. Pure JavaScript with no file, network or database access,
// so the Node server and the audit Worker share it. Moved out of services/api/server.js on
// 2026-11-15 so report pages no longer wake the audit container.
const { mcacReportHtml, mcacReportMarkdown } = require("./mcac-report-html.js");

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
  if (report?.method !== "mcac") return realLiteReportHtml(report);
  // Same GA4 tag and result_viewed event as the Classic report page.
  return mcacReportHtml(report)
    .replace("</head>", `${GA_TAG_HTML}</head>`)
    .replace("</body>", `${reportTrackingHtml(report.id)}</body>`);
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
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=lslabs-20261023"/>
<link rel="icon" type="image/png" href="/favicon.png?v=lslabs-20261023"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--navy:#0B1F3B;--navy-d:#060E1C;--blue:#3B82F6;--teal:#3B82F6;--teal-d:#1D4ED8;--teal-subtle:#EFF6FF;--bg:#FFFFFF;--bg-alt:#F8FAFC;--text:#1E293B;--muted:#475569;--card-shadow:0 4px 16px rgba(11,31,59,.06);--card-shadow-hover:0 12px 32px rgba(11,31,59,.12);--radius:14px;--radius-full:999px;--font-sans:'Plus Jakarta Sans','Noto Sans TC',system-ui,sans-serif;--font-number:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;--font-mono:'JetBrains Mono',monospace}
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
.score-hero-card{background:#FFFFFF;border:1px solid rgba(11,31,59,.08);border-radius:var(--radius);padding:32px;box-shadow:var(--card-shadow)}
.score-hero-card.primary{border-top:4px solid var(--teal)}
.score-hero-card.secondary{border-top:4px solid var(--navy)}
.score-flex{display:flex;align-items:center;gap:24px;margin:16px 0 20px}
.score-big-num{font-size:4rem;font-weight:900;line-height:1;color:var(--teal);font-family:var(--font-number);font-variant-numeric:tabular-nums}
.score-breakdown-mini{font-size:0.88rem;color:var(--muted);list-style:none;border-top:1px solid var(--bg-alt);padding-top:14px}
.score-breakdown-mini li{margin-bottom:5px}
.score-breakdown-mini strong{color:var(--navy)}
.badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-full);background:#FFFBEB;color:#F59E0B;font-weight:700;font-size:0.82rem}
.report-sec-head{display:flex;justify-content:space-between;align-items:center;margin-top:36px;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.report-sec-head h2{font-size:1.35rem;color:var(--navy);text-align:left}
.report-sec-head span{font-size:0.85rem;color:var(--muted)}
.query-obs-card{background:#FFFFFF;border:1px solid rgba(11,31,59,.08);border-radius:var(--radius);padding:24px;box-shadow:var(--card-shadow);margin-bottom:20px}
.query-card-top{display:grid;grid-template-columns:1.6fr 1fr 1fr;align-items:center;gap:16px}
@media(max-width:768px){.query-card-top{grid-template-columns:1fr;gap:10px}}
.status-pill{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:700;padding:4px 12px;border-radius:var(--radius-full)}
.status-pill.success{background:var(--teal-subtle);color:var(--teal-d)}
.status-pill.muted{background:#F1F5F9;color:var(--muted)}
.transcript-toggle-btn{margin-top:16px;background:var(--bg-alt);border:1px solid rgba(11,31,59,.1);color:var(--navy);font-size:0.84rem;font-weight:700;padding:8px 14px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.transcript-toggle-btn:hover{background:#E2E8F0}
.transcript-body{display:none;margin-top:14px;padding:16px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:8px;font-size:0.9rem;line-height:1.7}
.transcript-body.open{display:block}
.transcript-tag-box{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:0.78rem}
.t-tag{padding:3px 8px;border-radius:4px;font-weight:600}
.t-tag.self{background:var(--teal-subtle);color:var(--teal-d);font-weight:700}
.t-tag.source{background:#E2E8F0;color:var(--navy)}
.matrix-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
@media(max-width:860px){.matrix-grid{grid-template-columns:1fr}}
.matrix-col{background:#FFFFFF;border:1px solid rgba(11,31,59,.08);border-radius:var(--radius);padding:20px;box-shadow:var(--card-shadow)}
.matrix-col-title{font-size:0.95rem;font-weight:800;color:var(--navy);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--bg-alt);display:flex;align-items:center;gap:6px}
.check-item{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;font-size:0.86rem;line-height:1.45}
.chk-badge{font-size:0.72rem;font-weight:800;padding:2px 6px;border-radius:4px;flex-shrink:0;margin-top:2px}
.chk-pass{background:#DCFCE7;color:#166534}
.chk-warn{background:#FEF3C7;color:#92400E}
.chk-fail{background:#FEE2E2;color:#991B1B}
.authority-box{background:#FFFFFF;border:1px solid rgba(11,31,59,.08);border-radius:var(--radius);padding:24px;box-shadow:var(--card-shadow);margin-top:16px}
.auth-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:14px}
@media(max-width:768px){.auth-grid{grid-template-columns:repeat(2,1fr)}}
.auth-card{background:var(--bg-alt);border-radius:8px;padding:14px;border:1px solid rgba(11,31,59,.06)}
.auth-card strong{display:block;font-size:0.92rem;color:var(--navy);margin-bottom:4px}
.auth-card span{font-size:0.8rem;color:var(--muted)}
.action-cards-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-top:16px}
@media(max-width:860px){.action-cards-grid{grid-template-columns:1fr}}
.action-card{background:#FFFFFF;border:1px solid rgba(11,31,59,.08);border-radius:var(--radius);padding:24px 22px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:var(--card-shadow);transition:transform 0.2s,box-shadow 0.2s}
.action-card:hover{box-shadow:var(--card-shadow-hover)}
.action-card.p1{border-top:4px solid #EF4444}
.action-card.p2{border-top:4px solid #F59E0B}
.action-card.p3{border-top:4px solid var(--teal)}
.action-card.p4{border-top:4px solid #10B981}
.action-tag{font-size:0.76rem;font-weight:800;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:12px;width:fit-content}
.action-card.p1 .action-tag{background:#FEF2F2;color:#DC2626}
.action-card.p2 .action-tag{background:#FFFBEB;color:#D97706}
.action-card.p3 .action-tag{background:var(--teal-subtle);color:var(--teal-d)}
.action-card.p4 .action-tag{background:#ECFDF5;color:#059669}
.diagnostic-toggle-btn{background:var(--bg-alt);border:1px solid rgba(11,31,59,0.12);color:var(--navy);font-size:0.82rem;font-weight:700;padding:9px 14px;border-radius:6px;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;transition:all 0.2s;font-family:inherit}
.diagnostic-toggle-btn:hover{background:#E2E8F0;color:var(--teal-d)}
.diagnostic-drawer{display:none;margin-top:14px;padding-top:14px;border-top:1px dashed rgba(11,31,59,0.15);font-size:0.86rem;line-height:1.65}
.diagnostic-drawer.open{display:block}
.diag-block{margin-bottom:10px;padding:8px 12px;border-radius:6px}
.diag-block.flaw{background:#FEF2F2;border-left:3px solid #EF4444;color:#991B1B}
.diag-block.impact{background:#FFFBEB;border-left:3px solid #F59E0B;color:#92400E}
.diag-block.fix{background:#F0FDF4;border-left:3px solid #10B981;color:#166534}
.limits-card{background:#FFFFFF;border:1px solid rgba(11,31,59,.08);border-radius:var(--radius);padding:24px;box-shadow:var(--card-shadow);margin-top:28px}
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
        <h1>GeoCheck — AI 信任值健檢報告 <small style="font-size:0.55em;color:var(--muted);font-weight:700;margin-left:6px">By LS-Labs</small></h1>
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
        <span class="badge" style="background:#FFFBEB;color:#F59E0B;margin-bottom:8px;">主分數 · 觀測 AI 外部回答</span>
        <h2 style="font-size:1.3rem;color:var(--navy);text-align:left;">AI 信任值 (AI Trust Index)</h2>
        <div class="score-flex">
          <div class="score-big-num">${escapeHtml(scoreValue)}</div>
          <div>
            <div style="font-weight:700;color:#F59E0B;margin-bottom:6px;">評級：${escapeHtml(friendlyLabel(SCORE_LABELS, score.label, score.label || "這次資料不足，暫不評分"))}</div>
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
        <span class="badge" style="background:#EFF6FF;color:var(--navy);margin-bottom:8px;">站內準備度 · 基礎體質不補分</span>
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
  return report?.method === "mcac" ? mcacReportMarkdown(report) : realLiteReportMarkdown(report);
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

module.exports = { normalizeReportForClient, reportHtml, reportMarkdown };
