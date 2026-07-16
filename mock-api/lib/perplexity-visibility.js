const { deriveBrandTerms, evaluateAuthorityEvidence } = require("./authority-evidence");

function evaluatePerplexityVisibility({ siteUrl, metadata = {}, searchEvidence = null } = {}) {
  const authority = evaluateAuthorityEvidence({
    siteUrl,
    metadata,
    searchContext: searchEvidence?.authority || null
  });
  const authorityAliases = authority.firstPartySourceFound ? extractAuthorityAliases(searchEvidence?.authority?.answer) : [];
  const brandTerms = [...new Set([...deriveBrandTerms({ host: safeHostname(siteUrl), metadata }), ...authorityAliases])];
  const discovery = Array.isArray(searchEvidence?.discovery) ? searchEvidence.discovery : [];
  const measured = discovery.filter((item) => item?.enabled);
  if (!measured.length) {
    return {
      status: "unknown",
      score: null,
      confidence: "unknown",
      brandTerms,
      authorityAliases,
      mentionRate: null,
      citationRate: null,
      queryCount: discovery.length,
      measuredQueryCount: 0,
      authority,
      observations: []
    };
  }

  const host = safeHostname(siteUrl);
  const observations = measured.map((result) => {
    const answer = normalizeEntityText(result.answer || "");
    const brandMentioned = brandTerms.some((term) => answer.includes(term));
    const urls = [
      ...(Array.isArray(result.citations) ? result.citations : []),
      ...(Array.isArray(result.searchResults) ? result.searchResults.map((item) => item?.url).filter(Boolean) : [])
    ];
    const firstPartyCited = urls.some((url) => isFirstParty(url, host));
    return {
      query: result.query || "",
      brandMentioned,
      firstPartyCited,
      citationCount: Array.isArray(result.citations) ? result.citations.length : 0,
      sourceDomains: [...new Set(urls.map(safeHostname).filter(Boolean))]
    };
  });
  const mentionRate = ratio(observations.filter((item) => item.brandMentioned).length, observations.length);
  const citationRate = ratio(observations.filter((item) => item.firstPartyCited).length, observations.length);
  const authorityComponent = Number.isFinite(authority.score) ? authority.score : 0;
  const score = Math.round(mentionRate * 40 + citationRate * 30 + authorityComponent * 0.3);
  const confidence = observations.length >= 3 && authority.entityGrounded ? "high" : observations.length >= 2 ? "medium" : "low";
  return {
    status: "measured",
    score,
    confidence,
    brandTerms,
    authorityAliases,
    mentionRate: Math.round(mentionRate * 100),
    citationRate: Math.round(citationRate * 100),
    queryCount: discovery.length,
    measuredQueryCount: observations.length,
    authority,
    observations
  };
}

function extractAuthorityAliases(answer) {
  const line = String(answer || "").match(/(?:^|\n)\s*ALIASES?\s*[:：]\s*([^\n]+)/i)?.[1] || "";
  if (!line || /^unknown\b/i.test(line.trim())) return [];
  return [...new Set(line.split(/\s*[|,，、;；]\s*/).map(normalizeEntityText).filter((term) => term.length >= 2 && term.length <= 40))].slice(0, 8);
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function normalizeEntityText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function safeHostname(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function isFirstParty(value, host) {
  const domain = safeHostname(value);
  return Boolean(domain && host && (domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`)));
}

module.exports = { evaluatePerplexityVisibility, extractAuthorityAliases };
