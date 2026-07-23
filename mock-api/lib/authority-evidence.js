const {
  buildBrandTermSet,
  isFirstParty,
  matchTermsInText,
  safeHostname
} = require("./brand-match");

function evaluateAuthorityEvidence({ siteUrl, metadata = {}, searchContext = null, entityProfile = null } = {}) {
  const host = safeHostname(siteUrl);
  const officialDomains = entityProfile?.officialDomains || [];
  const termSet = buildBrandTermSet({ host, metadata, masterTerms: entityProfile?.brandTerms || [] });
  const brandTerms = termSet.map((term) => term.value);
  const base = {
    status: searchContext?.enabled ? "measured" : "unknown",
    score: searchContext?.enabled ? 0 : null,
    confidence: searchContext?.enabled ? "low" : "unknown",
    entityGrounded: false,
    firstPartySourceFound: false,
    brandTerms,
    brandTermSources: termSet.map((term) => ({ term: term.value, source: term.source })),
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
  const firstPartySourceFound = allUrls.some((url) => isFirstParty(url, host, officialDomains));
  const matchedExternalDomains = new Set();
  const unmatchedExternalDomains = new Set();

  for (const result of results) {
    const domain = safeHostname(result?.url);
    if (!domain || isFirstParty(result?.url, host, officialDomains)) continue;
    if (resultMatchesEntity(result, termSet, host, officialDomains)) matchedExternalDomains.add(domain);
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

// 相容介面：回傳字串陣列（舊呼叫端與報表使用）。
function deriveBrandTerms({ host = "", metadata = {} } = {}) {
  return buildBrandTermSet({ host, metadata }).map((term) => term.value);
}

function resultMatchesEntity(result, termSet, host, officialDomains = []) {
  if (isFirstParty(result?.url, host, officialDomains)) return true;
  const haystack = [result?.title, result?.snippet, result?.description, result?.url]
    .filter(Boolean)
    .join("\n");
  return matchTermsInText(haystack, termSet).length > 0;
}

function scoreForSources(count) {
  if (count >= 6) return 95;
  if (count >= 4) return 85;
  if (count >= 3) return 75;
  if (count >= 2) return 60;
  if (count >= 1) return 40;
  return 0;
}

module.exports = { deriveBrandTerms, evaluateAuthorityEvidence, resultMatchesEntity };
