const { callAgnesJson } = require("../providers/agnes");
const { getBraveAuditContext } = require("../providers/brave");
const { AppError } = require("./errors");
const { fetchHomepage } = require("./html-v2");
const { fetchTechnicalSignals } = require("./technical-signals");
const { collectScoringSignals, computeScoreV2 } = require("./scoring-v2");

function realLitePrompt({ siteUrl, metadata, text, searchContext, technical }) {
  return `你是「生成式搜尋引擎爬蟲行為分析師」與「輕量級演算法架構師」。請只輸出有效 JSON。

核心準則：
1. 嚴禁猜測。沒有官方文件或本次抓取證據時，寫「未知」並提出驗證方式。
2. 對象是不懂程式的在地小商家。建議要用繁體中文白話說明，並交代請網站設計師改哪個檔案或 HTML 區域；不知道行號時不可捏造行號。
3. 不承諾排名或一定被 AI 引用。
4. 不得建議為了 AI 犧牲 Google 搜尋收錄。
5. GPTBot、ClaudeBot、Google-Extended 屬訓練或產品政策控制，不可把允許它們當成搜尋高分必要條件。
6. llms.txt 目前列為實驗性導覽，不可宣稱是排名或引用必要條件。
7. 總分由伺服器的確定性 V2 規則計算；你填的 score.value 不會被採用。

網站：${siteUrl}
首頁 metadata：${JSON.stringify(metadata, null, 2)}
技術抓取證據：${JSON.stringify(technical, null, 2)}
首頁文字節錄：${text}
搜尋佐證：${JSON.stringify(searchContext, null, 2)}

回傳格式：
{
  "score": { "value": 0, "label": "Critical | Needs Work | Decent | Strong", "summary_zh": "" },
  "positioning": {
    "perceived_category_zh": "", "perceived_audience_zh": [], "perceived_use_cases_zh": [],
    "misunderstandings_or_risks_zh": [], "missing_signals_zh": [], "confidence": "low | medium | high"
  },
  "technical_seo": { "issues": [{ "severity": "high | medium | low", "check": "", "detail_zh": "", "impact_zh": "" }] },
  "geo_questions": [{ "question_zh": "", "intent": "awareness | consideration | decision", "business_value": 1 }],
  "content_citeability": { "strengths_zh": [], "gaps_zh": [] },
  "priority_actions": [{
    "priority": "P1 | P2 | P3", "type": "positioning | technical | content | authority",
    "target_zh": "", "recommendation_zh": "", "reason_zh": "", "expected_impact_zh": ""
  }],
  "limitations_zh": []
}

規則：geo_questions 恰好 3 題；priority_actions 恰好 3 項。所有 *_zh 使用繁體中文。`;
}

async function runRealLiteAudit(siteUrl) {
  let homepage;
  try {
    homepage = await fetchHomepage(siteUrl);
  } catch (error) {
    if (error instanceof AppError && ["fetch_homepage", "browser_fetch"].includes(error.stage)) {
      return createFetchLimitedReport(siteUrl, error);
    }
    throw error;
  }

  const [technical, searchContext] = await Promise.all([
    fetchTechnicalSignals(siteUrl, homepage),
    getBraveAuditContext({ siteUrl, title: homepage.metadata?.title, description: homepage.metadata?.description })
  ]);
  const prompt = realLitePrompt({
    siteUrl,
    metadata: homepage.metadata,
    text: homepage.text,
    searchContext,
    technical
  });
  const result = await callAgnesJson(prompt, { temperature: 0.1, attempts: 2, timeoutMs: 35_000 });
  const audit = applyV2Audit(normalizeAudit(result.json), { homepage, technical });

  return {
    id: `real_lite_${Date.now()}`,
    url: siteUrl,
    createdAt: new Date().toISOString(),
    algorithmVersion: "2.0",
    provider: result.provider || "agnes",
    model: result.model,
    latencyMs: result.latencyMs,
    attempts: result.attempts,
    repairedJson: Boolean(result.repairedJson),
    homepage: {
      metadata: homepage.metadata,
      textLength: homepage.text.length,
      initialTextLength: homepage.initialTextLength,
      renderGain: homepage.renderGain || 0,
      renderAttempted: Boolean(homepage.renderAttempted),
      fetchMethod: homepage.fetchMethod || "http",
      statusCode: homepage.statusCode
    },
    technical,
    search: searchContext,
    audit
  };
}

function applyV2Audit(audit, { homepage, technical }) {
  const signals = collectScoringSignals({ homepage, technical });
  const scored = computeScoreV2(signals);
  audit.score = {
    ...audit.score,
    value: scored.score,
    label: labelForScore(scored.score),
    algorithm_version: "2.0",
    raw_score: scored.rawScore,
    applied_cap: scored.cap,
    caps: scored.caps,
    breakdown: scored.breakdown,
    rules: scored.checks,
    scoring_basis_zh: `V2 客觀規則分 ${scored.rawScore}；${scored.cap < 100 ? `因「${scored.caps.map((item) => item.reason).join("、")}」上限為 ${scored.cap} 分` : "未觸發分數上限"}。模型只負責解釋，不參與加權。`
  };
  audit.priority_actions = mergePriorityActions(buildDeterministicActions(signals), audit.priority_actions);
  audit.technical_seo.issues = mergeIssues(buildDeterministicIssues(signals), audit.technical_seo.issues);
  audit.limitations_zh = unique([
    ...audit.limitations_zh,
    "本報告是首頁與公開技術檔案的單次快照，不等於實際收錄、排名或 AI 引用保證。",
    "GPTBot、ClaudeBot、Google-Extended 的允許狀態只代表內容政策選擇，不列入搜尋能見度分數。",
    "特定 AI 系統如何排序與引用內容沒有完整公開規則；未公開部分一律視為未知。"
  ]);
  return audit;
}

function buildDeterministicActions(signals) {
  const actions = [];
  if (!signals.fetched || signals.noindex || !signals.googlebotAllowed) {
    actions.push(action("technical", "首頁抓取與收錄設定",
      "請先聯絡網站設計師檢查網站根目錄的 robots.txt、首頁 <head> 的 robots meta，以及伺服器的 X-Robots-Tag。移除誤設的 Disallow: / 或 noindex；若本來就是刻意不公開，則維持現狀。",
      "這些設定會直接阻止 Google 或其他搜尋服務讀取首頁。", "恢復重要頁面的基本抓取與收錄資格。"));
  }
  if (!signals.title || !signals.h1) {
    actions.push(action("technical", "首頁標題",
      "請網站設計師在首頁 <head> 補上清楚的 <title>，並在畫面主要內容放一個 H1。兩者都要直接寫出店名、服務與地區，不要只放圖片或 Logo。",
      "AI 抓不到標題時，常見原因是 title 或 H1 缺少、太模糊，或只在 JavaScript 執行後才出現。", "讓搜尋引擎與 AI 一眼知道這間店是誰、做什麼。"));
  }
  if (signals.textLength < 300 || signals.renderGainRatio > 1.5) {
    actions.push(action("technical", "首頁可讀文字",
      "請網站設計師把店名、服務、地區、營業特色與聯絡方式直接放進伺服器回傳的 HTML。若網站是 SPA，請加上 SSR 或預先渲染；不要等按鈕點擊後才載入主要內容。",
      "畫面看得到不等於爬蟲拿得到；只靠圖片或 JavaScript 會讓部分 AI 讀到空白頁。", "提高不同爬蟲穩定理解首頁的機會。"));
  }
  if (!signals.oaiSearchAllowed || !signals.claudeSearchAllowed) {
    const bots = [!signals.oaiSearchAllowed && "OAI-SearchBot", !signals.claudeSearchAllowed && "Claude-SearchBot"].filter(Boolean).join("、");
    actions.push(action("technical", "AI 搜尋爬蟲設定",
      `如果您希望出現在 ChatGPT 或 Claude 搜尋，請網站設計師檢查 robots.txt 是否誤擋 ${bots}。只調整搜尋 bot 即可，不必同時開放 GPTBot、ClaudeBot 等訓練用途 bot。`,
      "搜尋用途與模型訓練用途不同，應分開管理。", "在保留內容政策選擇的同時，增加 AI 搜尋可讀性。"));
  }
  if (!signals.sitemapValid) {
    actions.push(action("technical", "sitemap.xml",
      "請網站設計師建立可公開讀取的 sitemap.xml，只列出希望被搜尋到的正式網址，並在 robots.txt 最後加上完整的 Sitemap 網址。",
      "網站地圖能協助搜尋服務發現重要頁面，但不是排名保證。", "減少重要服務頁沒有被發現的風險。"));
  }
  if (!signals.validSchema || !signals.relevantSchema) {
    actions.push(action("technical", "結構化資料",
      "請網站設計師依店家類型加入可通過驗證的 LocalBusiness 或 Organization JSON-LD，內容必須與頁面看得到的店名、地址、電話與服務一致。",
      "只檢查是否有 JSON-LD 不夠；格式錯誤或類型不合也無法提供清楚語意。", "讓搜尋系統更準確辨認商家實體與服務。"));
  }
  return actions;
}

function buildDeterministicIssues(signals) {
  const issues = [];
  if (signals.noindex) issues.push(issue("high", "Indexability", "首頁偵測到 noindex。", "搜尋服務可能不會收錄這個頁面。"));
  if (signals.googlebotAllowed === false) issues.push(issue("high", "Googlebot access", "robots.txt 阻擋 Googlebot 首頁。", "會傷害傳統 Google 搜尋的抓取能力。"));
  if (!signals.title) issues.push(issue("high", "HTML title", "首頁沒有可讀的 <title>。", "搜尋結果與 AI 都缺少明確頁面名稱。"));
  if (signals.renderGainRatio > 1.5) issues.push(issue("high", "JavaScript rendering", "大部分文字只在 JavaScript 執行後出現。", "不支援完整渲染的爬蟲可能讀到空殼。"));
  if (signals.textLength < 300) issues.push(issue("high", "Readable content", "首頁可讀文字少於 300 字。", "AI 缺少足夠內容判斷商家與服務。"));
  if (signals.oaiSearchAllowed === false) issues.push(issue("medium", "OAI-SearchBot", "robots.txt 阻擋 OAI-SearchBot。", "可能降低 ChatGPT 搜尋摘要與引用可見度。"));
  if (signals.claudeSearchAllowed === false) issues.push(issue("medium", "Claude-SearchBot", "robots.txt 阻擋 Claude-SearchBot。", "可能降低 Claude 搜尋索引可見度。"));
  return issues;
}

function action(type, target, recommendation, reason, impact) {
  return { priority: "", type, target_zh: target, recommendation_zh: recommendation, reason_zh: reason, expected_impact_zh: impact };
}

function issue(severity, check, detail, impact) {
  return { severity, check, detail_zh: detail, impact_zh: impact };
}

function mergePriorityActions(deterministic, generated) {
  const merged = [...deterministic, ...ensureArray(generated)].slice(0, 3);
  while (merged.length < 3) {
    merged.push(action("content", "首頁內容", "補上店名、服務對象、地區、常見問題與可驗證案例。", "目前可用訊號不足。", "降低搜尋服務誤解網站的機會。"));
  }
  return merged.map((item, index) => ({ ...item, priority: `P${index + 1}` }));
}

function mergeIssues(deterministic, generated) {
  const seen = new Set();
  return [...deterministic, ...ensureArray(generated)].filter((item) => {
    const key = String(item?.check || item?.detail_zh || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function normalizeAudit(value) {
  const audit = value && typeof value === "object" ? value : {};
  audit.score = audit.score || {};
  audit.score.summary_zh = String(audit.score.summary_zh || "已完成首頁與公開技術訊號檢查。");
  audit.positioning = audit.positioning || {};
  for (const key of ["perceived_audience_zh", "perceived_use_cases_zh", "misunderstandings_or_risks_zh", "missing_signals_zh"]) {
    audit.positioning[key] = ensureArray(audit.positioning[key]);
  }
  audit.positioning.confidence = ["low", "medium", "high"].includes(audit.positioning.confidence) ? audit.positioning.confidence : "low";
  audit.technical_seo = audit.technical_seo || {};
  audit.technical_seo.issues = ensureArray(audit.technical_seo.issues);
  audit.geo_questions = ensureArray(audit.geo_questions).slice(0, 3);
  while (audit.geo_questions.length < 3) {
    audit.geo_questions.push({ question_zh: "這間店提供什麼服務，適合誰？", intent: "consideration", business_value: 3 });
  }
  audit.content_citeability = audit.content_citeability || {};
  audit.content_citeability.strengths_zh = ensureArray(audit.content_citeability.strengths_zh);
  audit.content_citeability.gaps_zh = ensureArray(audit.content_citeability.gaps_zh);
  audit.priority_actions = ensureArray(audit.priority_actions);
  audit.limitations_zh = ensureArray(audit.limitations_zh);
  return audit;
}

function createFetchLimitedReport(siteUrl, error) {
  const audit = normalizeAudit({
    score: { summary_zh: "本次無法讀取首頁，因此不能可靠判斷頁面內容。" },
    positioning: { confidence: "low", misunderstandings_or_risks_zh: ["首頁無法公開讀取，搜尋引擎與 AI 也可能遇到相同問題。"] },
    technical_seo: { issues: [issue("high", "Homepage fetchability", error.message, "搜尋服務可能無法讀取網站內容。") ] },
    priority_actions: [action("technical", "網站主機、CDN 或防火牆", "請網站設計師檢查首頁是否回傳 403、5xx、驗證頁或封鎖一般爬蟲。確認後再重新檢測。", "沒有取得首頁就無法做可信的內容判讀。", "恢復基本抓取能力。")],
    limitations_zh: ["首頁抓取失敗，所有未取得的項目都視為未知，未用猜測補值。"]
  });
  audit.score = { ...audit.score, value: 0, raw_score: 0, applied_cap: 25, label: "Critical", algorithm_version: "2.0", rules: [] };
  audit.priority_actions = mergePriorityActions(audit.priority_actions, []);
  return {
    id: `real_lite_${Date.now()}`, url: siteUrl, createdAt: new Date().toISOString(), algorithmVersion: "2.0",
    provider: "local-fallback", model: "fetch-limited", latencyMs: 0, attempts: 0, repairedJson: false,
    homepage: { metadata: {}, textLength: 0, fetchBlocked: true, fetchError: { message: error.message, details: error.details } },
    technical: {}, audit
  };
}

function labelForScore(score) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Decent";
  if (score >= 45) return "Needs Work";
  return "Critical";
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

module.exports = { applyV2Audit, realLitePrompt, runRealLiteAudit };
