const { classifySite } = require("./site-type");
const { analyzeContentEvidence } = require("./content-evidence");

const WEIGHTS = Object.freeze({
  homepage_fetch: 8,
  indexable: 8,
  googlebot_access: 6,
  oai_search_access: 4,
  claude_search_access: 4,
  sitemap_valid: 8,
  homepage_in_sitemap: 3,
  sitemap_declared: 2,
  canonical: 2,
  title: 5,
  description: 3,
  h1: 4,
  open_graph: 2,
  valid_schema: 2,
  relevant_schema: 2,
  readable_text: 8,
  initial_html_text: 4,
  render_consistency: 4,
  image_alt: 2,
  heading_structure: 2,
  faq: 3,
  cases: 3,
  comparisons: 3,
  proof: 3,
  service_clarity: 3
});

const REASONS = Object.freeze({
  homepage_fetch: "先確認任何搜尋服務都拿得到首頁",
  indexable: "noindex 會直接限制搜尋收錄",
  googlebot_access: "保護既有 Google 搜尋可見度",
  oai_search_access: "直接關係 ChatGPT 搜尋摘要與引用",
  claude_search_access: "直接關係 Claude 搜尋索引可見度",
  sitemap_valid: "協助搜尋服務找到重要頁面",
  homepage_in_sitemap: "確認首頁被列為正式索引頁",
  sitemap_declared: "讓爬蟲更快找到網站地圖",
  canonical: "避免網址版本分散收錄訊號",
  title: "標題是理解頁面主題的核心訊號",
  description: "提供頁面摘要但不保證排名",
  h1: "讓頁面主題對人與機器都清楚",
  open_graph: "補強分享摘要，不當成排名主訊號",
  valid_schema: "只有可解析的結構化資料才有用",
  relevant_schema: "類型需與商家或服務內容相符",
  readable_text: "只有圖片時 AI 缺少可理解文字",
  initial_html_text: "多數爬蟲未必執行完整 JavaScript",
  render_consistency: "避免畫面與原始 HTML 內容落差",
  image_alt: "替圖片提供可讀的文字說明",
  heading_structure: "清楚層級可降低內容理解成本",
  faq: "問答格式容易對應使用者問題",
  cases: "案例能證明服務實際成果",
  comparisons: "比較內容支援評估與決策問題",
  proof: "來源與數據提升可引用性",
  service_clarity: "明說服務對象與流程才不易誤解"
});

function collectScoringSignals({ homepage = {}, technical = {}, representativePages = [] }) {
  const metadata = homepage.metadata || {};
  const pageTexts = representativePages.filter((page) => page?.crawlQuality?.scorable).map((page) => page.text || "");
  const text = [homepage.text || "", ...pageTexts].join("\n").toLowerCase();
  const siteType = classifySite({ url: homepage.finalUrl || homepage.url || "", metadata, text });
  const pageMetadata = representativePages.map((page) => page.metadata || {});
  const textLength = text.length;
  const initialTextLength = Number(homepage.initialTextLength ?? textLength);
  const xRobots = String(homepage.headers?.xRobotsTag || "").toLowerCase();
  const metaRobots = `${metadata.robots || ""},${metadata.googlebot || ""}`.toLowerCase();
  const noindex = /(?:^|[,\s])noindex(?:[,\s]|$)/.test(`${metaRobots},${xRobots}`);
  const botAccess = technical.robots?.botAccess || {};
  const schemaTypes = [metadata, ...pageMetadata].flatMap((item) => item.jsonLd?.types || []);
  const relevantSchema = schemaTypes.some((type) => /^(Organization|LocalBusiness|Service|Product|Article|FAQPage|WebSite|Person)$/i.test(type));
  const imageCount = Number(metadata.imageCount || 0);
  const altRatio = imageCount ? Number(metadata.imagesWithAlt || 0) / imageCount : 1;
  const headingLevels = Array.isArray(metadata.headingLevels) ? metadata.headingLevels : [];
  const renderGainRatio = initialTextLength > 0 ? Math.max(0, textLength - initialTextLength) / initialTextLength : (textLength > 0 ? Infinity : 0);
  const verticalSignals = siteGeoSignals(siteType, text, representativePages) || {
    faq: /faq|q&a|常見問題|問與答|問題/.test(text),
    cases: /case study|案例|成果|實績|作品/.test(text),
    comparisons: /比較|vs\.?|差異|選擇|適合/.test(text),
    proof: /數據|來源|研究|認證|證照|獎項/.test(text),
    serviceClarity: /服務|價格|費用|預約|聯絡|地區/.test(text)
  };
  const contentEvidence = analyzeContentEvidence({ homepage, representativePages, verticalSignals });

  return {
    fetched: Boolean(homepage && !homepage.fetchBlocked && (homepage.statusCode || 200) < 400),
    noindex,
    googlebotAllowed: botAccess.Googlebot?.allowed ?? null,
    oaiSearchAllowed: botAccess["OAI-SearchBot"]?.allowed ?? null,
    claudeSearchAllowed: botAccess["Claude-SearchBot"]?.allowed ?? null,
    robotsKnown: technical.robots?.readable !== false,
    sitemapValid: Boolean(technical.sitemap?.valid),
    homepageInSitemap: Boolean(technical.sitemap?.homepageIncluded),
    sitemapDeclared: Boolean(technical.robots?.sitemaps?.length),
    canonical: hasText(metadata.canonical),
    title: hasText(metadata.title),
    description: hasText(metadata.description),
    h1: hasText(metadata.h1),
    openGraph: hasText(metadata.ogTitle) && hasText(metadata.ogDescription),
    validSchema: [metadata, ...pageMetadata].some((item) => Number(item.jsonLd?.validCount || 0) > 0),
    relevantSchema,
    textLength,
    initialTextLength,
    renderGainRatio,
    imageAltRatio: altRatio,
    headingStructure: headingLevels.includes(1) && !headingLevels.some((level, index) => index > 0 && level - headingLevels[index - 1] > 1),
    siteType,
    representativePageCount: representativePages.filter((page) => page?.crawlQuality?.scorable).length,
    geoSignals: contentEvidence.signals,
    contentEvidence: contentEvidence.metrics
  };
}

function siteGeoSignals(siteType, text, representativePages) {
  const paths = representativePages.map((page) => String(page.url || "").toLowerCase()).join(" ");
  const signalSets = {
    restaurant: {
      faq: /faq|常見問題|訂位須知|用餐須知/.test(text),
      cases: /菜單|餐點|料理|menu|product/.test(text) || /\/(?:menu|product)/.test(paths),
      comparisons: /分店|門市|地點|交通|location|store/.test(text) || /\/(?:store|location)/.test(paths),
      proof: /評價|獲獎|媒體|食材|品牌故事|review|award|news|about/.test(text),
      serviceClarity: /訂位|營業時間|外送|外帶|reservation|delivery|takeout/.test(text)
    },
    hospitality: {
      faq: /faq|常見問題|入住|退房|取消|check-?in|check-?out/.test(text),
      cases: /房型|客房|設施|room|amenities/.test(text) || /\/(?:room|rooms|stay)/.test(paths),
      comparisons: /交通|景點|位置|停車|location|transport/.test(text),
      proof: /評價|旅宿登記|獲獎|媒體|review|license|award/.test(text),
      serviceClarity: /價格|房價|訂房|入住|取消|price|booking/.test(text)
    },
    local_service: {
      faq: /faq|常見問題|服務須知/.test(text),
      cases: /案例|作品|完工|施工前後|portfolio|case study|before.?after/.test(text) || /\/(?:case|cases|portfolio|works)/.test(paths),
      comparisons: /服務區域|地區|縣市|價格區間|service area|coverage|pricing/.test(text),
      proof: /評價|年資|證照|保固|客戶|review|license|warranty/.test(text),
      serviceClarity: /報價|估價|預約|流程|工期|聯絡|quote|estimate|appointment/.test(text)
    },
    professional_service: {
      faq: /faq|常見問題|法律知識|稅務知識|專業文章/.test(text),
      cases: /案例|實績|代表案件|客戶成果|case study|experience/.test(text),
      comparisons: /專業領域|服務項目|適用對象|practice area|expertise/.test(text),
      proof: /資格|證照|團隊|年資|出版|公會|license|credential|team/.test(text),
      serviceClarity: /諮詢|預約|流程|費用|聯絡|consultation|appointment|fee/.test(text)
    },
    retail: {
      faq: /faq|常見問題|退換貨|售後/.test(text),
      cases: /商品|系列|品牌|型錄|product|catalog/.test(text),
      comparisons: /門市|分店|庫存|營業時間|store|location|inventory/.test(text),
      proof: /評價|正品|授權|保固|獲獎|review|authorized|warranty/.test(text),
      serviceClarity: /價格|營業時間|聯絡|預訂|取貨|price|hours|pickup/.test(text)
    }
  };
  return signalSets[siteType] || null;
}

function computeScoreV2(signals) {
  const checks = [];
  add(checks, "homepage_fetch", signals.fetched, signals.fetched ? "首頁回應正常" : "首頁無法正常取得");
  add(checks, "indexable", !signals.noindex, signals.noindex ? "偵測到 noindex" : "未偵測到 noindex");
  add(checks, "googlebot_access", signals.robotsKnown ? signals.googlebotAllowed : null, accessEvidence(signals.googlebotAllowed, signals.robotsKnown));
  add(checks, "oai_search_access", signals.robotsKnown ? signals.oaiSearchAllowed : null, accessEvidence(signals.oaiSearchAllowed, signals.robotsKnown));
  add(checks, "claude_search_access", signals.robotsKnown ? signals.claudeSearchAllowed : null, accessEvidence(signals.claudeSearchAllowed, signals.robotsKnown));
  add(checks, "sitemap_valid", signals.sitemapValid, signals.sitemapValid ? "sitemap 可解析" : "未找到有效 sitemap");
  add(checks, "homepage_in_sitemap", signals.homepageInSitemap, signals.homepageInSitemap ? "sitemap 含首頁" : "sitemap 未確認含首頁");
  add(checks, "sitemap_declared", signals.sitemapDeclared, signals.sitemapDeclared ? "robots.txt 有 Sitemap" : "robots.txt 未列 Sitemap");
  add(checks, "canonical", signals.canonical, signals.canonical ? "有 canonical" : "缺少 canonical");
  add(checks, "title", signals.title, signals.title ? "有 title" : "缺少 title");
  add(checks, "description", signals.description, signals.description ? "有 meta description" : "缺少 meta description");
  add(checks, "h1", signals.h1, signals.h1 ? "有 H1" : "缺少 H1");
  add(checks, "open_graph", signals.openGraph, signals.openGraph ? "OG 標題與摘要齊全" : "OG 標題或摘要不完整");
  add(checks, "valid_schema", signals.validSchema, signals.validSchema ? "JSON-LD 可解析" : "無有效 JSON-LD");
  add(checks, "relevant_schema", signals.relevantSchema, signals.relevantSchema ? "Schema 類型符合頁面" : "未找到合適 Schema 類型");
  addPartial(checks, "readable_text", signals.textLength >= 1000 ? 1 : signals.textLength >= 300 ? 0.625 : 0, `可讀文字 ${signals.textLength} 字`);
  add(checks, "initial_html_text", signals.initialTextLength >= 200, `原始 HTML 可讀文字 ${signals.initialTextLength} 字`);
  add(checks, "render_consistency", signals.renderGainRatio <= 1.5, signals.renderGainRatio <= 1.5 ? "渲染前後差異可接受" : "主要內容依賴 JavaScript");
  addPartial(checks, "image_alt", signals.imageAltRatio >= 0.8 ? 1 : signals.imageAltRatio >= 0.5 ? 0.5 : 0, `圖片 alt 覆蓋 ${Math.round(signals.imageAltRatio * 100)}%`);
  add(checks, "heading_structure", signals.headingStructure, signals.headingStructure ? "標題層級清楚" : "標題層級缺漏或跳級");
  add(checks, "faq", signals.geoSignals.faq, signals.geoSignals.faq ? "有問答訊號" : "未找到問答內容");
  add(checks, "cases", signals.geoSignals.cases, signals.geoSignals.cases ? "有案例訊號" : "未找到案例內容");
  add(checks, "comparisons", signals.geoSignals.comparisons, signals.geoSignals.comparisons ? "有比較訊號" : "未找到比較內容");
  add(checks, "proof", signals.geoSignals.proof, signals.geoSignals.proof ? "有證據訊號" : "未找到來源或數據");
  add(checks, "service_clarity", signals.geoSignals.serviceClarity, signals.geoSignals.serviceClarity ? "服務資訊清楚" : "服務對象與流程不明");

  const knownWeight = checks.filter((check) => check.status !== "unknown").reduce((sum, check) => sum + check.weight, 0);
  const knownPoints = checks.reduce((sum, check) => sum + check.points, 0);
  let rawScore = knownWeight ? Math.round((knownPoints / knownWeight) * 100) : 0;
  const caps = [];
  if (!signals.fetched) caps.push({ max: 25, reason: "首頁無法抓取" });
  if (signals.noindex) caps.push({ max: 35, reason: "首頁設定 noindex" });
  if (signals.googlebotAllowed === false) caps.push({ max: 35, reason: "Googlebot 被 robots.txt 阻擋" });
  if (signals.textLength < 100) caps.push({ max: 42, reason: "頁面幾乎沒有可讀文字" });
  const cap = caps.length ? Math.min(...caps.map((item) => item.max)) : 100;
  const score = Math.min(rawScore, cap);
  return { score, rawScore, cap, caps, checks, breakdown: summarizeGroups(checks) };
}

function add(checks, id, passed, evidence) {
  addPartial(checks, id, passed === null || passed === undefined ? null : (passed ? 1 : 0), evidence);
}

function addPartial(checks, id, ratio, evidence) {
  const weight = WEIGHTS[id];
  const unknown = ratio === null || ratio === undefined;
  checks.push({
    id,
    weight,
    points: unknown ? 0 : Math.round(weight * ratio * 10) / 10,
    status: unknown ? "unknown" : ratio === 1 ? "pass" : ratio > 0 ? "partial" : "fail",
    evidence,
    reason_zh: REASONS[id]
  });
}

function accessEvidence(allowed, known) {
  if (!known) return "robots.txt 無法讀取，狀態未知";
  return allowed ? "robots.txt 未封鎖" : "robots.txt 已封鎖";
}

function summarizeGroups(checks) {
  const groups = {
    crawl_access: ["homepage_fetch", "indexable", "googlebot_access", "oai_search_access", "claude_search_access"],
    discoverability: ["sitemap_valid", "homepage_in_sitemap", "sitemap_declared", "canonical"],
    semantic_clarity: ["title", "description", "h1", "open_graph", "valid_schema", "relevant_schema"],
    content_readability: ["readable_text", "initial_html_text", "render_consistency", "image_alt", "heading_structure"],
    citeability: ["faq", "cases", "comparisons", "proof", "service_clarity"]
  };
  return Object.fromEntries(Object.entries(groups).map(([name, ids]) => {
    const items = checks.filter((check) => ids.includes(check.id));
    return [name, {
      points: Math.round(items.reduce((sum, item) => sum + item.points, 0) * 10) / 10,
      max: items.reduce((sum, item) => sum + item.weight, 0)
    }];
  }));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = { collectScoringSignals, computeScoreV2, REASONS, WEIGHTS };
