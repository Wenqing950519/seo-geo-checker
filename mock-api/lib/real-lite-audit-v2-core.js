const { AppError } = require("./errors");
const { ALGORITHM_VERSION, collectScoringSignals, computeScoreV2 } = require("./scoring-v2");
const { classifySite, questionsForSite } = require("./site-type");
const { measureGeoSite } = require("./geo-measurement");

async function runRealLiteAudit(siteUrl) {
  let measurement;
  try {
    measurement = await measureGeoSite(siteUrl, { representativePageLimit: 3 });
  } catch (error) {
    if (error instanceof AppError && ["fetch_homepage", "browser_fetch", "browser_challenge", "crawl_quality"].includes(error.stage)) {
      return createFetchLimitedReport(siteUrl, error);
    }
    throw error;
  }

  const { homepage, technical, representativePages, searchEvidence: searchContext, queryPlanning } = measurement;
  const auditSeed = normalizeAudit({
    score: {},
    positioning: queryPlanning?.positioning || {},
    technical_seo: { issues: [] },
    geo_questions: [],
    content_citeability: { strengths_zh: [], gaps_zh: [] },
    priority_actions: [],
    limitations_zh: queryPlanning?.status === "ready"
      ? ["Gemini 先依網站證據產生候選搜尋題，後端通過品牌排除、意圖與重複度檢查後，才交由 Perplexity 實測。"]
      : ["Gemini 未能產出有效搜尋題，因此未呼叫 Perplexity，也未顯示 GEO 分數。"]
  });
  const audit = applyV2Audit(auditSeed, { homepage, technical, representativePages, searchContext, measurement });
  audit.ai_validation = queryPlanning?.status === "ready" ? {
    status: "planned",
    provider: queryPlanning.provider,
    model: queryPlanning.model,
    message_zh: `Gemini 已產生 ${queryPlanning.candidates.length} 題候選問題，通過規則後選出 ${queryPlanning.selectedQueries.length} 題交由 Perplexity 實測；Gemini 不參與計分。`
  } : {
    status: "unavailable",
    provider: queryPlanning?.provider || "gemini",
    model: queryPlanning?.model,
    message_zh: "Gemini 產題未通過驗證；為避免用錯產業問題造成偏差，本次停止 Perplexity 實測並將 GEO 分數標為未知。"
  };

  return {
    id: `real_lite_${Date.now()}`,
    url: siteUrl,
    createdAt: new Date().toISOString(),
    algorithmVersion: ALGORITHM_VERSION,
    provider: searchContext?.enabled ? "perplexity" : "local-rules",
    model: searchContext?.authority?.model || searchContext?.discovery?.find((item) => item?.model)?.model || "rules-v3",
    interpretationProvider: queryPlanning?.provider || "gemini",
    interpretationModel: queryPlanning?.model,
    latencyMs: Number(queryPlanning?.latencyMs) || 0,
    attempts: Number(queryPlanning?.attempts) || 0,
    repairedJson: false,
    queryPlanning,
    homepage: {
      metadata: homepage.metadata,
      textLength: homepage.text.length,
      initialTextLength: homepage.initialTextLength,
      renderGain: homepage.renderGain || 0,
      renderAttempted: Boolean(homepage.renderAttempted),
      fetchMethod: homepage.fetchMethod || "http",
      statusCode: homepage.statusCode,
      crawlQuality: homepage.crawlQuality,
      crawlDiagnostics: homepage.crawlDiagnostics,
      internalLinkCount: homepage.internalLinks?.length || 0
    },
    technical,
    representativePages,
    search: searchContext,
    audit
  };
}

function applyV2Audit(audit, { homepage, technical, representativePages = [], searchContext = null, measurement = null }) {
  const signals = measurement?.signals || collectScoringSignals({ homepage, technical, representativePages });
  const scored = measurement?.siteReadiness || computeScoreV2(signals);
  const siteType = classifySite({ metadata: homepage.metadata, text: homepage.text, url: homepage.url });
  const perplexityObservation = measurement?.perplexityObservation || require("./perplexity-visibility").evaluatePerplexityVisibility({
    siteUrl: homepage.finalUrl || homepage.url,
    metadata: homepage.metadata,
    searchEvidence: searchContext
  });
  const geoAssessment = measurement?.geoAssessment || require("./geo-assessment").computeGeoAssessment(scored, perplexityObservation);
  audit.site_type = siteType;
  audit.perplexity_observation = perplexityObservation;
  audit.authority_evidence = perplexityObservation.authority;
  audit.query_planning = summarizeQueryPlanning(measurement?.queryPlanning);
  audit.geo_questions = measurement?.queryPlanning?.selectedQueries?.length
    ? measurement.queryPlanning.selectedQueries.map((query, index) => ({
        question_zh: query.text,
        intent: query.intent,
        business_value: index === 0 ? 4 : 3
      }))
    : questionsForSite(siteType);
  audit.score = {
    ...audit.score,
    value: geoAssessment.score,
    geo_value: geoAssessment.score,
    site_readiness_value: scored.score,
    technical_value: scored.score,
    label: geoAssessment.status === "measured" ? "Perplexity GEO 實測" : "GEO 證據不足",
    readiness_label: geoAssessment.score === null ? "Unknown" : labelForScore(geoAssessment.score),
    site_readiness_label: labelForScore(scored.score),
    summary_zh: geoAssessment.summary_zh,
    evidence_status: geoAssessment.status,
    evidence_coverage: scored.evidenceCoverage,
    evidence_confidence: perplexityObservation.confidence || "unknown",
    algorithm_version: ALGORITHM_VERSION,
    raw_score: geoAssessment.rawScore,
    applied_cap: geoAssessment.caps.length ? Math.min(...geoAssessment.caps.map((item) => item.max)) : 100,
    caps: geoAssessment.caps,
    breakdown: geoAssessment.lanes,
    site_readiness_raw_score: scored.rawScore,
    site_readiness_cap: scored.cap,
    site_readiness_caps: scored.caps,
    site_readiness_breakdown: scored.breakdown,
    rules: scored.checks,
    scoring_basis_zh: "GEO V3：Gemini 先產生並驗證產業搜尋題；Perplexity 實際搜尋觀測 50%、內容可引用性 30%、必要技術存取 20%。Gemini 不參與計分。"
  };
  audit.priority_actions = rankDeterministicActions(buildDeterministicActions(signals));
  audit.technical_seo.issues = buildDeterministicIssues(signals);
  audit.content_citeability = buildDeterministicCiteability(signals);
  audit.positioning = hardenPositioning(audit.positioning, homepage, searchContext);
  audit.limitations_zh = unique([
    ...audit.limitations_zh,
    "本報告是首頁與公開技術檔案的單次快照，不等於實際收錄、排名或 AI 引用保證。",
    "GPTBot、ClaudeBot、Google-Extended 的允許狀態只代表內容政策選擇，不列入搜尋能見度分數。",
    "特定 AI 系統如何排序與引用內容沒有完整公開規則；未公開部分一律視為未知。"
  ]);
  return audit;
}

function summarizeQueryPlanning(plan = {}) {
  return {
    status: plan.status || "unavailable",
    source: plan.source || "unknown",
    version: plan.version || null,
    provider: plan.provider || null,
    model: plan.model || null,
    entity_name: plan.entity_name || "unknown",
    industry: plan.industry || "unknown",
    primary_offering: plan.primary_offering || "unknown",
    geography: Array.isArray(plan.geography) ? plan.geography : [],
    confidence: plan.confidence || "low",
    candidate_count: Array.isArray(plan.candidates) ? plan.candidates.length : 0,
    candidates: Array.isArray(plan.candidates) ? plan.candidates : [],
    selected_queries: Array.isArray(plan.selectedQueries) ? plan.selectedQueries : [],
    reason: plan.reason || null
  };
}

function buildDeterministicScoreSummary(scored) {
  const label = labelForScore(scored.score);
  const confidence = scored.evidenceConfidence === "high" ? "高" : scored.evidenceConfidence === "medium" ? "中" : "低";
  return `規則檢測分數為 ${scored.score} 分（${label}）；已取得 ${scored.evidenceCoverage}% 的評分證據，證據信心為${confidence}。此分數不等於實際搜尋排名或 AI 引用保證。`;
}

function buildDeterministicCiteability(signals) {
  const definitions = [
    ["faq", "網站有可直接回答顧客問題的內容", "補上常見問題與清楚答案"],
    ["cases", "網站有案例、產品或服務實例", "補上真實案例、產品或服務實例"],
    ["comparisons", "網站有地區、方案或比較資訊", "補上服務地區、方案差異或比較資訊"],
    ["proof", "網站有評價、資格或其他可信證明", "補上評價、證照、保固或可驗證證明"],
    ["serviceClarity", "網站清楚交代服務與行動方式", "清楚寫出服務內容、地區、價格或聯絡方式"]
  ];
  const strengths = [];
  const gaps = [];
  for (const [key, strength, gap] of definitions) {
    (signals.geoSignals?.[key] ? strengths : gaps).push(signals.geoSignals?.[key] ? strength : gap);
  }
  return { strengths_zh: strengths, gaps_zh: gaps };
}

function hardenPositioning(positioning = {}, homepage = {}, searchContext = null) {
  const metadata = homepage.metadata || {};
  const evidence = [metadata.title, metadata.h1, metadata.description].filter(Boolean).map(String);
  const hasSearchEvidence = Boolean(searchContext?.enabled && (searchContext?.authority?.enabled || ensureArray(searchContext?.discovery).some((item) => item?.enabled)));
  let confidence = ["low", "medium", "high"].includes(positioning.confidence) ? positioning.confidence : "low";
  if (evidence.length < 2) confidence = "low";
  else if (!hasSearchEvidence && confidence === "high") confidence = "medium";
  return {
    ...positioning,
    confidence,
    evidence_basis_zh: evidence,
    interpretation_notice_zh: "本區是 AI 根據頁面文字進行的語意解讀，不參與技術分數；缺乏公開證據時不得視為搜尋引擎事實。"
  };
}

function rankDeterministicActions(actions) {
  return actions.slice(0, 3).map((item, index) => ({ ...item, priority: `P${index + 1}` }));
}

function buildDeterministicActions(signals) {
  const actions = [];
  if (!signals.fetched || signals.noindex || signals.googlebotAllowed === false) {
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
  if (signals.oaiSearchAllowed === false || signals.claudeSearchAllowed === false) {
    const bots = [signals.oaiSearchAllowed === false && "OAI-SearchBot", signals.claudeSearchAllowed === false && "Claude-SearchBot"].filter(Boolean).join("、");
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
  if (!signals.canonical) {
    actions.push(action("technical", "canonical 網址",
      "請網站設計師在首頁 <head> 加上指向正式首頁網址的 rel='canonical'，並確認 http、https、www 與非 www 版本只保留一個主要版本。",
      "canonical 能降低同一內容有多個網址時的判讀混亂。", "讓搜尋系統更清楚辨認正式網址；不代表排名保證。"));
  }
  if (signals.imageAltRatio < 0.8) {
    actions.push(action("content", "圖片替代文字",
      "請替有資訊用途的圖片補上簡短 alt 文字，直接說明照片中的產品、服務或地點；純裝飾圖片可保留空 alt。",
      "圖片缺少替代文字時，爬蟲與使用輔助工具的人較難理解內容。", "提高圖片資訊的可讀性與無障礙完整度。"));
  }
  const citeabilityActions = [
    ["serviceClarity", "服務資訊", "請在首頁清楚寫出提供什麼服務、服務誰、服務地區、價格或詢價方式，以及下一步如何聯絡。"],
    ["proof", "可信證明", "請補上可驗證的評價、證照、獎項、保固、媒體報導或具日期的實績；沒有證據的項目不要自行宣稱。"],
    ["faq", "常見問題", "請整理顧客最常問的 3 至 5 題，使用一問一答方式寫出明確答案。"],
    ["cases", "案例或實例", "請補上真實案例、產品或服務實例，說明對象、做法與可驗證結果。"],
    ["comparisons", "方案與地區比較", "請補上分店、服務地區、方案或產品差異，讓顧客能直接判斷哪一種適合自己。"]
  ];
  for (const [key, target, recommendation] of citeabilityActions) {
    if (!signals.geoSignals?.[key]) {
      actions.push(action("content", target, recommendation,
        "具體、可核對的內容比空泛形容詞更容易被搜尋系統理解與引用。", "提高頁面回答實際問題的完整度；不保證會被 AI 引用。"));
    }
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
  if (!signals.sitemapValid) issues.push(issue("medium", "Sitemap", "未確認可公開讀取的有效 sitemap.xml。", "搜尋服務較難完整發現重要頁面。"));
  if (!signals.canonical) issues.push(issue("low", "Canonical", "首頁未偵測到 canonical 網址。", "多網址版本可能增加主要網址判讀的不確定性。"));
  if (!signals.description) issues.push(issue("medium", "Meta description", "首頁未偵測到 meta description。", "搜尋結果與分享摘要較難清楚描述頁面。"));
  if (!signals.h1) issues.push(issue("high", "H1", "首頁未偵測到清楚的 H1。", "頁面主題與商家服務較難被快速辨認。"));
  if (!signals.validSchema || !signals.relevantSchema) issues.push(issue("medium", "Structured data", "未偵測到有效且符合網站類型的 JSON-LD。", "搜尋系統較難用結構化方式辨認商家實體。"));
  if (signals.imageAltRatio < 0.8) issues.push(issue("low", "Image alt", "圖片 alt 覆蓋率約 " + Math.round(signals.imageAltRatio * 100) + "% 。", "部分圖片資訊不易被爬蟲與輔助工具理解。"));
  if (!signals.headingStructure) issues.push(issue("low", "Heading structure", "標題層級缺漏或跳級。", "頁面資訊架構較不清楚。"));
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
  audit.score = { ...audit.score, value: null, geo_value: null, site_readiness_value: null, technical_value: null, raw_score: null, applied_cap: null, label: "無法評估", readiness_label: "Unknown", evidence_status: "unavailable", evidence_coverage: 0, evidence_confidence: "unavailable", algorithm_version: ALGORITHM_VERSION, rules: [] };
  audit.ai_validation = { status: "unavailable", message_zh: "首頁未能成功抓取，因此本次不能判斷網站品質、搜尋排名或 AI 能見度。" };
  return {
    id: `real_lite_${Date.now()}`, url: siteUrl, createdAt: new Date().toISOString(), algorithmVersion: ALGORITHM_VERSION,
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

module.exports = { applyV2Audit, createFetchLimitedReport, runRealLiteAudit };
