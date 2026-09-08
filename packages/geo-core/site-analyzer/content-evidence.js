function analyzeContentEvidence({ homepage = {}, representativePages = [], verticalSignals = {} } = {}) {
  const pages = [homepage, ...representativePages.filter((page) => page?.crawlQuality?.scorable)];
  const text = pages.map((page) => String(page.text || "")).join("\n");
  const lower = text.toLowerCase();
  const schema = collectSchemaFacts(pages.map((page) => page.html || "").join("\n"));
  const host = safeHostname(homepage.finalUrl || homepage.url);
  const externalReferenceDomains = extractExternalReferenceDomains(pages.map((page) => page.html || "").join("\n"), host);
  const questionCount = countMatches(text, /(?:常見問題|faq|q&a|[^\s]{2,20}[？?])/gi, 20);
  const numericEvidenceCount = countMatches(text, /\d+(?:[.,]\d+)?\s*(?:%|％|年經驗|年資|家客戶|位客戶|件案例|個案例|次|人|元|萬元|萬|天|月|間門市|家門市|分店)/gi, 20);
  const sourceAttributionCount = countMatches(text, /(?:資料來源|參考資料|引用來源|根據[^，。]{0,30}(?:研究|報告|統計)|研究指出|報告顯示|according to|references?|sources?)/gi, 20);
  const credentialCount = countMatches(text, /(?:證照|認證|公會|執照|獲獎|award|certified|licensed|官方授權)/gi, 20);
  const caseOutcomeCount = countMatches(text, /(?:案例|完工|成果|實績|case study|before.?after)[^。\n]{0,80}(?:提升|降低|完成|改善|成長|節省|\d+(?:[.,]\d+)?\s*(?:%|％|天|月|年|元|萬))/gi, 20);
  const comparisonCount = countMatches(text, /(?:比較|差異|適合|方案|門市|分店|服務區域|vs\.?|compare|location)/gi, 30);
  const casePageCount = representativePages.filter((page) => /\/(?:case|cases|portfolio|works|projects|success|story)(?:\/|$)/i.test(safePath(page.url))).length;
  const clarityDimensions = [
    /(?:服務|產品|菜單|房型|專業領域|service|product|menu)/i.test(lower),
    /(?:台北|臺北|新北|桃園|新竹|台中|臺中|台南|臺南|高雄|服務區域|地址|location|address)/i.test(lower),
    /(?:價格|費用|收費|報價|price|pricing|fee)/i.test(lower),
    /(?:流程|預約|訂位|訂房|聯絡|電話|email|contact|booking|reservation)/i.test(lower)
  ].filter(Boolean).length;

  const faq = Boolean(verticalSignals.faq) && (questionCount >= 2 || schema.types.includes("FAQPage"));
  const cases = Boolean(verticalSignals.cases) && (casePageCount > 0 || caseOutcomeCount > 0 || (numericEvidenceCount > 0 && /案例|成果|實績|case study/i.test(text)));
  const comparisons = Boolean(verticalSignals.comparisons) && comparisonCount >= 2;
  const proof = Boolean(verticalSignals.proof) && (
    numericEvidenceCount > 0 || sourceAttributionCount > 0 || credentialCount > 0 ||
    schema.citationCount > 0 || externalReferenceDomains.length > 0
  );
  const serviceClarity = Boolean(verticalSignals.serviceClarity) && clarityDimensions >= 2;

  return {
    signals: { faq, cases, comparisons, proof, serviceClarity },
    metrics: {
      questionCount,
      numericEvidenceCount,
      sourceAttributionCount,
      credentialCount,
      caseOutcomeCount,
      comparisonCount,
      casePageCount,
      clarityDimensions,
      externalReferenceDomainCount: externalReferenceDomains.length,
      externalReferenceDomains,
      schema
    }
  };
}

function collectSchemaFacts(html) {
  const blocks = [...String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const facts = {
    types: [], sameAsCount: 0, citationCount: 0, authorCount: 0,
    hasName: false, hasUrl: false, hasLogo: false, hasAddress: false,
    hasTelephone: false, hasEmail: false, hasDateModified: false
  };
  const types = new Set();
  for (const block of blocks) {
    try { visitSchema(JSON.parse(block[1]), facts, types); } catch { /* invalid JSON-LD is scored elsewhere */ }
  }
  facts.types = [...types];
  return facts;
}

function visitSchema(value, facts, types) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item) => visitSchema(item, facts, types));
  const type = value["@type"];
  for (const item of Array.isArray(type) ? type : [type]) if (item) types.add(String(item));
  facts.sameAsCount += arrayLength(value.sameAs);
  facts.citationCount += arrayLength(value.citation);
  facts.authorCount += arrayLength(value.author);
  facts.hasName ||= hasValue(value.name);
  facts.hasUrl ||= hasValue(value.url);
  facts.hasLogo ||= hasValue(value.logo);
  facts.hasAddress ||= hasValue(value.address);
  facts.hasTelephone ||= hasValue(value.telephone);
  facts.hasEmail ||= hasValue(value.email);
  facts.hasDateModified ||= hasValue(value.dateModified) || hasValue(value.datePublished);
  Object.values(value).forEach((item) => visitSchema(item, facts, types));
}

function extractExternalReferenceDomains(html, host) {
  const ignored = /(?:facebook\.com|instagram\.com|youtube\.com|youtu\.be|line\.me|linkedin\.com|twitter\.com|x\.com)$/i;
  const domains = new Set();
  for (const match of String(html || "").matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const domain = safeHostname(match[2]);
    if (!domain || !host || domain === host || domain.endsWith(`.${host}`) || ignored.test(domain)) continue;
    domains.add(domain);
  }
  return [...domains];
}

function countMatches(text, pattern, max) {
  return Math.min(max, [...String(text || "").matchAll(pattern)].length);
}

function arrayLength(value) {
  if (!hasValue(value)) return 0;
  return Array.isArray(value) ? value.length : 1;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return String(value || "").trim().length > 0;
}

function safeHostname(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function safePath(value) {
  try { return new URL(value).pathname; } catch { return String(value || ""); }
}

module.exports = { analyzeContentEvidence, collectSchemaFacts, extractExternalReferenceDomains };
