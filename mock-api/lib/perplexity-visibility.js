const { evaluateAuthorityEvidence } = require("./authority-evidence");
const {
  PARSER_VERSION,
  buildBrandTermSet,
  classifyAnswerStatus,
  classifySourceType,
  extractAuthorityAliases,
  extractMentionRank,
  isFirstParty,
  isPlatformRootInput,
  matchTermsInText,
  safeHostname
} = require("./brand-match");

function evaluatePerplexityVisibility({
  siteUrl,
  metadata = {},
  searchEvidence = null,
  entityProfile = null,
  citationResolution = null
} = {}) {
  const host = safeHostname(siteUrl);
  const officialDomains = entityProfile?.officialDomains || [];
  const platformRootInput = isPlatformRootInput(host);
  const authority = evaluateAuthorityEvidence({
    siteUrl,
    metadata,
    searchContext: searchEvidence?.authority || null,
    entityProfile
  });
  // 別名需有實體對齊證據（第一方來源或已對齊的外部來源）才可採納，避免幻覺別名造成 FP。
  const aliasesAllowed = authority.firstPartySourceFound || authority.entityGrounded;
  const authorityAliases = aliasesAllowed ? extractAuthorityAliases(searchEvidence?.authority?.answer) : [];
  const termSet = buildBrandTermSet({
    host,
    metadata,
    aliases: authorityAliases,
    masterTerms: entityProfile?.brandTerms || []
  });
  const brandTerms = termSet.map((term) => term.value);
  const termOrigin = entityProfile?.brandTerms?.length ? "master" : "derived";
  const resolveUrl = (url) => (citationResolution && citationResolution[url]) || url;

  const discovery = Array.isArray(searchEvidence?.discovery) ? searchEvidence.discovery : [];
  const enabled = discovery.filter((item) => item?.enabled);
  const observations = enabled.map((result) => {
    const answer = String(result.answer || "");
    const answerStatus = classifyAnswerStatus(answer);
    const matchedTerms = answerStatus === "answered" ? matchTermsInText(answer, termSet).map((term) => term.value) : [];
    const brandMentioned = matchedTerms.length > 0;
    const rank = answerStatus === "answered" ? extractMentionRank(answer, termSet) : { rank: null, status: "no_list" };
    const urls = [
      ...(Array.isArray(result.citations) ? result.citations : []),
      ...(Array.isArray(result.searchResults) ? result.searchResults.map((item) => item?.url).filter(Boolean) : [])
    ].map(resolveUrl);
    const firstPartyCited = !platformRootInput && urls.some((url) => isFirstParty(url, host, officialDomains));
    const sourceTypes = {};
    for (const url of urls) {
      const type = platformRootInput ? "unattributable" : classifySourceType(url, host, officialDomains);
      sourceTypes[type] = (sourceTypes[type] || 0) + 1;
    }
    return {
      query: result.query || "",
      queryId: result.queryId || null,
      answerStatus,
      excluded: answerStatus !== "answered",
      brandMentioned,
      matchedTerms,
      mentionRank: rank.rank,
      rankParseStatus: rank.status,
      firstPartyCited,
      citationCount: Array.isArray(result.citations) ? result.citations.length : 0,
      sourceDomains: [...new Set(urls.map(safeHostname).filter(Boolean))],
      sourceTypes
    };
  });

  const answered = observations.filter((item) => item.answerStatus === "answered");
  if (!answered.length) {
    return {
      status: "unknown",
      score: null,
      parserVersion: PARSER_VERSION,
      confidence: "unknown",
      brandTerms,
      brandTermSources: termSet.map((term) => ({ term: term.value, source: term.source })),
      termOrigin,
      platformRootInput,
      authorityAliases,
      mentionRate: null,
      citationRate: null,
      queryCount: discovery.length,
      measuredQueryCount: 0,
      excludedQueryCount: observations.length,
      authority,
      observations
    };
  }

  const mentionRate = ratio(answered.filter((item) => item.brandMentioned).length, answered.length);
  const citationRate = ratio(answered.filter((item) => item.firstPartyCited).length, answered.length);
  // authority 缺測時以 knownWeight 重標定，不把缺失當 0 分；confidence 另行降級。
  const authorityKnown = authority.status === "measured" && Number.isFinite(authority.score);
  const knownWeight = 70 + (authorityKnown ? 30 : 0);
  const points = mentionRate * 40 + citationRate * 30 + (authorityKnown ? authority.score * 0.3 : 0);
  const score = Math.round((points / knownWeight) * 100);
  let confidence = answered.length >= 3 && authority.entityGrounded ? "high" : answered.length >= 2 ? "medium" : "low";
  if (!authorityKnown && confidence === "high") confidence = "medium";
  return {
    status: "measured",
    score,
    parserVersion: PARSER_VERSION,
    confidence,
    brandTerms,
    brandTermSources: termSet.map((term) => ({ term: term.value, source: term.source })),
    termOrigin,
    platformRootInput,
    authorityAliases,
    mentionRate: Math.round(mentionRate * 100),
    citationRate: Math.round(citationRate * 100),
    queryCount: discovery.length,
    measuredQueryCount: answered.length,
    excludedQueryCount: observations.length - answered.length,
    authorityKnown,
    authority,
    observations
  };
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

module.exports = { evaluatePerplexityVisibility, extractAuthorityAliases };
