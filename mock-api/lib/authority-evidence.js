const GENERIC_TERMS = new Set([
  "首頁", "官方網站", "關於我們", "服務", "公司", "網站", "home", "official", "website",
  "taiwan", "台灣", "臺灣", "股份有限公司", "有限公司", "co", "ltd", "inc"
]);

function evaluateAuthorityEvidence({ siteUrl, metadata = {}, searchContext = null } = {}) {
  const host = safeHostname(siteUrl);
  const brandTerms = deriveBrandTerms({ host, metadata });
  const base = {
    status: searchContext?.enabled ? "measured" : "unknown",
    score: searchContext?.enabled ? 0 : null,
    confidence: searchContext?.enabled ? "low" : "unknown",
    entityGrounded: false,
    firstPartySourceFound: false,
    brandTerms,
    matchedExternalDomains: [],
    unmatchedExternalDomains: [],
    governmentOrEducationDomains: [],
    evidence: []
  };
  if (!searchContext?.enabled) {
    base.evidence.push("外部搜尋證據未啟用或暫時無法取得");
    return base;
  }

  const results = Array.isArray(searchContext.searchResults) ? searchContext.searchResults : [];
  const citationUrls = Array.isArray(searchContext.citations) ? searchContext.citations : [];
  const resultUrls = results.map((item) => item?.url).filter(Boolean);
  const allUrls = [...citationUrls, ...resultUrls];
  const firstPartySourceFound = allUrls.some((url) => isFirstParty(url, host));
  const matchedExternalDomains = new Set();
  const unmatchedExternalDomains = new Set();

  for (const result of results) {
    const domain = safeHostname(result?.url);
    if (!domain || sameRegistrableHost(domain, host)) continue;
    if (resultMatchesEntity(result, brandTerms, host)) matchedExternalDomains.add(domain);
    else unmatchedExternalDomains.add(domain);
  }

  const matched = [...matchedExternalDomains];
  const governmentOrEducationDomains = matched.filter((domain) => /(?:\.gov\.tw|\.edu\.tw|\.gov|\.edu)$/i.test(domain));
  const entityGrounded = firstPartySourceFound || matched.length > 0;
  let score = entityGrounded ? scoreForSources(matched.length) : 0;
  if (governmentOrEducationDomains.length) score = Math.min(100, score + 10);
  const confidence = !entityGrounded ? "low" : matched.length >= 3 ? "high" : "medium";

  return {
    ...base,
    score,
    confidence,
    entityGrounded,
    firstPartySourceFound,
    matchedExternalDomains: matched,
    unmatchedExternalDomains: [...unmatchedExternalDomains],
    governmentOrEducationDomains,
    evidence: [
      firstPartySourceFound ? "搜尋來源包含受測網站自身網域" : "搜尋來源未包含受測網站自身網域",
      `可與品牌實體對齊的外部來源網域 ${matched.length} 個`,
      `未通過實體對齊的外部來源網域 ${unmatchedExternalDomains.size} 個`
    ]
  };
}

function deriveBrandTerms({ host = "", metadata = {} } = {}) {
  const candidates = [
    host.split(".")[0],
    ...String(metadata.title || "").split(/[|｜—–\-:：]/),
    ...String(metadata.h1 || "").split(/[|｜—–\-:：]/)
  ];
  const terms = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeEntityText(candidate);
    if (isUsefulTerm(normalized)) terms.add(normalized);
    const withoutTaiwan = normalized.replace(/^(?:台灣|臺灣|taiwan)/, "");
    if (isUsefulTerm(withoutTaiwan)) terms.add(withoutTaiwan);
  }
  return [...terms].sort((a, b) => b.length - a.length).slice(0, 8);
}

function resultMatchesEntity(result, brandTerms, host) {
  if (isFirstParty(result?.url, host)) return true;
  const haystack = normalizeEntityText([
    result?.title,
    result?.snippet,
    result?.description,
    result?.url
  ].filter(Boolean).join(" "));
  return brandTerms.some((term) => haystack.includes(term));
}

function scoreForSources(count) {
  if (count >= 6) return 95;
  if (count >= 4) return 85;
  if (count >= 3) return 75;
  if (count >= 2) return 60;
  if (count >= 1) return 40;
  return 0;
}

function isUsefulTerm(value) {
  return value.length >= 3 && !GENERIC_TERMS.has(value) && !/^\d+$/.test(value);
}

function normalizeEntityText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function safeHostname(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function isFirstParty(value, host) {
  const domain = safeHostname(value);
  return Boolean(domain && host && sameRegistrableHost(domain, host));
}

function sameRegistrableHost(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

module.exports = { deriveBrandTerms, evaluateAuthorityEvidence, resultMatchesEntity };
