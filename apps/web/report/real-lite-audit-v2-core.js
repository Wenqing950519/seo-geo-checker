const { AppError } = require("../../../packages/shared/errors.js");
const { randomUUID } = require("crypto");
const geoCore = require("../../../packages/geo-core");
const { ALGORITHM_VERSION, collectScoringSignals, computeScoreV2 } = geoCore.scoring.siteReadiness;
const { computeAiTrustIndex, AI_TRUST_INDEX_VERSION } = geoCore.scoring.aiTrustIndex;
const { computeGeoAssessment } = geoCore.scoring.geoAssessment;
const { evaluatePerplexityVisibility } = geoCore.evidence.visibility;
const { classifySite, questionsForSite } = geoCore.siteAnalyzer.siteType;
const { measureGeoSite } = require("../../../services/api/application/geo-measurement.js");

async function runRealLiteAudit(siteUrl, options = {}) {
  let measurement;
  try {
    measurement = await measureGeoSite(siteUrl, { representativePageLimit: 3, ...options });
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
      ? ["測試題目不含你的店名或品牌名，模擬顧客還不認識你、只描述需求時的情況。"]
      : ["這次無法針對你的產業產生合適的測試問題，所以沒有計算 AI 信任值；這不代表 0 分。"]
  });
  const audit = applyV2Audit(auditSeed, { homepage, technical, representativePages, searchContext, measurement });
  audit.ai_validation = queryPlanning?.status === "ready" ? {
    status: "planned",
    provider: queryPlanning.provider,
    model: queryPlanning.model,
    message_zh: `DeepSeek 已產生 ${queryPlanning.candidates.length} 題候選問題，通過規則後選出 ${queryPlanning.selectedQueries.length} 題交由 Perplexity 實測；DeepSeek 不參與計分。`
  } : {
    status: "unavailable",
    provider: queryPlanning?.provider || "deepseek",
    model: queryPlanning?.model,
    message_zh: "DeepSeek 產題未通過驗證；為避免用錯產業問題造成偏差，本次停止 Perplexity 實測並將 AI Trust Index 標示為 unknown。"
  };

  return {
    id: `real_lite_${randomUUID()}`,
    url: siteUrl,
    createdAt: new Date().toISOString(),
    algorithmVersion: ALGORITHM_VERSION,
    pipelineVersion: measurement.pipelineVersion,
    provider: searchContext?.enabled ? "perplexity" : "local-rules",
    model: searchContext?.authority?.model || searchContext?.discovery?.find((item) => item?.model)?.model || "rules-v3",
    interpretationProvider: queryPlanning?.provider || "deepseek",
    interpretationModel: queryPlanning?.model,
    latencyMs: Number(queryPlanning?.latencyMs) || 0,
    attempts: Number(queryPlanning?.attempts) || 0,
    semanticAttempts: Number(queryPlanning?.semanticAttempts) || 0,
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
  const perplexityObservation = measurement?.perplexityObservation || evaluatePerplexityVisibility({
    siteUrl: homepage.finalUrl || homepage.url,
    metadata: homepage.metadata,
    searchEvidence: searchContext
  });
  const geoAssessment = measurement?.geoAssessment || computeGeoAssessment(scored, perplexityObservation);
  const aiTrustIndex = measurement?.aiTrustIndex || computeAiTrustIndex(perplexityObservation);
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
    value: aiTrustIndex.value,
    ai_trust_value: aiTrustIndex.value,
    legacy_geo_value: geoAssessment.score,
    site_readiness_value: scored.score,
    technical_value: scored.score,
    label: aiTrustIndex.label,
    readiness_label: aiTrustIndex.value === null ? "Unknown" : labelForScore(aiTrustIndex.value),
    site_readiness_label: labelForScore(scored.score),
    summary_zh: aiTrustIndex.summary_zh,
    evidence_status: aiTrustIndex.status,
    evidence_coverage: scored.evidenceCoverage,
    query_run_coverage: aiTrustIndex.denominator.total_runs ? Math.round(aiTrustIndex.denominator.valid_runs / aiTrustIndex.denominator.total_runs * 100) : 0,
    evidence_confidence: perplexityObservation.confidence || "unknown",
    algorithm_version: `ai-trust-${AI_TRUST_INDEX_VERSION}`,
    raw_score: aiTrustIndex.raw_score,
    applied_cap: aiTrustIndex.applied_cap,
    caps: aiTrustIndex.caps,
    breakdown: aiTrustIndex.components,
    denominator: aiTrustIndex.denominator,
    legacy_geo_assessment: geoAssessment,
    site_readiness_raw_score: scored.rawScore,
    site_readiness_cap: scored.cap,
    site_readiness_caps: scored.caps,
    site_readiness_breakdown: scored.breakdown,
    rules: scored.checks,
    scoring_basis_zh: "AI 信任值 v1：AI 回答有提到品牌占 65%，AI 回答有引用官網占 35%。拿不到回答的題目標為未知，不當成 0 分。"
  };
  audit.priority_actions = rankDeterministicActions(buildDeterministicActions(signals));
  audit.technical_seo.issues = buildDeterministicIssues(signals);
  audit.content_citeability = buildDeterministicCiteability(signals);
  audit.positioning = hardenPositioning(audit.positioning, homepage, searchContext);
  audit.limitations_zh = unique([
    ...audit.limitations_zh,
    "這份報告是某一個時間點、對首頁與公開檔案的一次檢查，不保證搜尋排名，也不保證 AI 之後一定會提到你。",
    "要不要開放 AI 業者拿你的內容做訓練，是你的選擇，這一項不影響分數。",
    "AI 怎麼挑選要講哪一家，業者並沒有完全公開；查不到的部分我們一律標成「不知道」，不會用猜的。"
  ]);
  return audit;
}

function summarizeQueryPlanning(plan = {}) {
  return {
    status: plan.status || "unavailable",
    source: plan.source || "unknown",
    version: plan.version || null,
    semantic_attempts: Number(plan.semanticAttempts) || 0,
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
      "你的網站目前有設定擋住搜尋引擎。請幫忙維護網站的人拿掉這個限制（技術上是 robots.txt 的 Disallow、頁面上的 noindex 或伺服器的 X-Robots-Tag）；如果本來就刻意不公開，維持現狀即可。",
      "有這些設定時，Google 與 AI 根本不會來讀你的首頁。", "讓重要頁面重新被搜尋引擎與 AI 讀得到。"));
  }
  if (!signals.title || !signals.h1) {
    actions.push(action("technical", "首頁標題",
      "請在首頁補上一個清楚的頁面名稱（分頁上顯示的那行字）和一個大標題，兩處都直接寫出店名、做什麼、在哪裡，不要只放圖片或 Logo。",
      "缺少標題或標題太模糊時，AI 就很難判斷這是誰的網站。", "讓搜尋引擎與 AI 一眼知道這間店是誰、做什麼。"));
  }
  if (signals.textLength < 300 || signals.renderGainRatio > 1.5) {
    actions.push(action("technical", "首頁可讀文字",
      "請把店名、服務、地區、特色與聯絡方式，用文字直接寫在首頁上，不要只放在圖片裡，也不要等點了按鈕才載入。若網站是靠程式動態產生內容，請幫忙維護網站的人加上預先渲染。",
      "人眼看得到，不代表 AI 讀得到；只有圖片或動態載入時，AI 可能讀到一片空白。", "讓不同的 AI 與搜尋程式都能穩定讀懂首頁。"));
  }
  if (signals.oaiSearchAllowed === false || signals.claudeSearchAllowed === false) {
    const bots = [signals.oaiSearchAllowed === false && "OAI-SearchBot", signals.claudeSearchAllowed === false && "Claude-SearchBot"].filter(Boolean).join("、");
    actions.push(action("technical", "AI 搜尋爬蟲設定",
      `如果你希望出現在 ChatGPT 或 Claude 的回答裡，請幫忙維護網站的人確認是不是誤擋了它們的搜尋程式（${bots}）。只要開放搜尋用途即可，不必連帶開放拿內容去訓練的程式。`,
      "「來搜尋」和「拿去訓練」是兩件事，可以分開決定。", "在不改變內容授權立場的前提下，讓 AI 搜尋讀得到你。"));
  }
  if (!signals.sitemapValid) {
    actions.push(action("technical", "sitemap.xml",
      "請幫忙維護網站的人建立一份網站地圖（sitemap.xml），列出你希望被找到的頁面，並在 robots.txt 裡註明它的位置。",
      "網站地圖能幫搜尋引擎找齊你的重要頁面，但不保證排名。", "降低重要服務頁一直沒被找到的風險。"));
  }
  if (!signals.validSchema || !signals.relevantSchema) {
    actions.push(action("technical", "結構化資料",
      "請幫忙維護網站的人加上給機器讀的商家資料標記（技術上是 LocalBusiness 或 Organization 的 JSON-LD），把店名、地址、電話、營業項目寫清楚，內容要和頁面上看到的一致。",
      "只是「有加」不夠，格式錯或類型不對，機器一樣讀不懂。", "讓搜尋引擎與 AI 更準確認出你是哪一家店。"));
  }
  if (!signals.canonical) {
    actions.push(action("technical", "canonical 網址",
      "請幫忙維護網站的人指定一個「正式網址」（技術上是 rel=canonical），並確認有沒有 www、http 與 https 等版本最後都指向同一個。",
      "同一頁有好幾個網址時，系統可能不知道哪一個才算數。", "讓搜尋引擎清楚知道你的正式網址；不代表排名保證。"));
  }
  if (signals.imageAltRatio < 0.8) {
    actions.push(action("content", "圖片替代文字",
      "請替有資訊的圖片補上一句文字說明，直接寫出照片裡的產品、服務或地點；純裝飾用的圖片可以留空。",
      "圖片沒有文字說明時，AI 和視障輔助工具都看不懂那張圖。", "讓圖片裡的資訊也能被讀懂。"));
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
        "寫得具體、可以查證的內容，比空泛的形容詞更容易被 AI 讀懂與引用。", "讓網站更完整地回答顧客真正在問的問題；但不保證 AI 一定會引用。"));
    }
  }
  return actions;
}

function buildDeterministicIssues(signals) {
  const issues = [];
  if (signals.noindex) issues.push(issue("high", "Indexability", "首頁被設定成「不要被搜尋引擎收錄」。", "搜尋引擎與 AI 可能完全不會收錄這一頁。"));
  if (signals.googlebotAllowed === false) issues.push(issue("high", "Googlebot access", "網站設定擋住了 Google 的檢索程式，讓它讀不到首頁。", "Google 搜尋可能找不到你。"));
  if (!signals.title) issues.push(issue("high", "HTML title", "首頁沒有設定頁面名稱（瀏覽器分頁上顯示的那一行字）。", "搜尋結果與 AI 都不知道這一頁該怎麼稱呼。"));
  if (signals.renderGainRatio > 1.5) issues.push(issue("high", "JavaScript rendering", "首頁大部分文字要等程式跑完才會出現。", "有些 AI 與搜尋程式只會讀到一片空白。"));
  if (signals.textLength < 300) issues.push(issue("high", "Readable content", "首頁能讀到的文字少於 300 字。", "內容太少，AI 無法判斷你在做什麼生意。"));
  if (signals.oaiSearchAllowed === false) issues.push(issue("medium", "OAI-SearchBot", "網站設定擋住了 ChatGPT 的搜尋程式。", "ChatGPT 在回答時比較不會引用到你。"));
  if (signals.claudeSearchAllowed === false) issues.push(issue("medium", "Claude-SearchBot", "網站設定擋住了 Claude 的搜尋程式。", "Claude 在回答時比較不會引用到你。"));
  if (!signals.sitemapValid) issues.push(issue("medium", "Sitemap", "沒有找到可公開讀取的網站地圖（列出全站頁面的清單檔）。", "搜尋引擎比較不容易找齊你的重要頁面。"));
  if (!signals.canonical) issues.push(issue("low", "Canonical", "首頁沒有指定「主要網址」。", "同一頁有多個網址時，系統可能不確定哪一個才是正式版本。"));
  if (!signals.description) issues.push(issue("medium", "Meta description", "首頁沒有寫摘要說明（搜尋結果標題下面那一段文字）。", "在搜尋結果或分享連結時，比較難一眼看懂你在做什麼。"));
  if (!signals.h1) issues.push(issue("high", "H1", "首頁沒有明顯的大標題。", "一進來看不出這一頁在講什麼。"));
  if (!signals.validSchema || !signals.relevantSchema) issues.push(issue("medium", "Structured data", "網站沒有加上給機器讀的商家資料標記（店名、地址、營業項目等）。", "搜尋引擎與 AI 較難確認你到底是哪一家店。"));
  if (signals.imageAltRatio < 0.8) issues.push(issue("low", "Image alt", "約 " + Math.round(signals.imageAltRatio * 100) + "% 的圖片有補上文字說明。", "沒有文字說明的圖片，AI 與視障輔助工具都看不懂。"));
  if (!signals.headingStructure) issues.push(issue("low", "Heading structure", "頁面的標題層級有跳號或缺漏。", "內容結構比較不清楚，不容易被摘錄。"));
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
  audit.score.summary_zh = String(audit.score.summary_zh || "已完成首頁與公開設定的檢查。");
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
    score: { summary_zh: "這次讀不到你的首頁，所以無法判斷網站內容。" },
    positioning: { confidence: "low", misunderstandings_or_risks_zh: ["外部讀不到你的首頁，搜尋引擎與 AI 很可能也遇到同樣的狀況。"] },
    technical_seo: { issues: [issue("high", "Homepage fetchability", `這次讀不到首頁（系統訊息：${error.message}）。`, "搜尋引擎與 AI 也可能同樣讀不到你的網站內容。") ] },
    priority_actions: [action("technical", "網站主機、CDN 或防火牆", "請幫忙維護網站的人確認首頁是不是擋掉了一般訪客或機器人（例如出現錯誤頁、驗證頁或防火牆攔截）。處理後再檢測一次。", "沒有讀到首頁，就無法可靠地判斷網站內容。", "讓搜尋引擎與 AI 至少讀得到你的網站。")],
    limitations_zh: ["這次讀不到首頁，所有沒拿到的資料都標成「不知道」，不會用猜的補上。"]
  });
  audit.score = { ...audit.score, value: null, geo_value: null, site_readiness_value: null, technical_value: null, raw_score: null, applied_cap: null, label: "無法評估", readiness_label: "Unknown", evidence_status: "unavailable", evidence_coverage: 0, evidence_confidence: "unavailable", algorithm_version: ALGORITHM_VERSION, rules: [] };
  audit.ai_validation = { status: "unavailable", message_zh: "這次讀不到首頁，因此無法判斷網站品質、搜尋排名或 AI 能見度。" };
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
