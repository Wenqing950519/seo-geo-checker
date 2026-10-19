// MCAC evaluation: four results read separately (Mention, Citation, Accuracy,
// Conversion-readiness). No blended total exists; unknown stays unknown and is never
// counted as zero. Flag thresholds are v0 and provisional (Human Ownership).

const {
  classifyAnswerStatus,
  classifySourceType,
  extractMentionRank,
  isPlatformRootInput,
  matchTermsInText,
  safeHostname
} = require("../evidence/brand-match.js");
const { judgeFact, parseFactAnswer } = require("./facts.js");
const { parseActions } = require("./actions.js");

const MCAC_VERSION = "0.1.0";
const MCAC_FLAG_RULES_VERSION = "mcac-flags-v0";

function evaluateMcac({ probes = [], brandTerms = [], siteHost = "", officialDomains = [], truth = {}, resolveUrl = (url) => url } = {}) {
  const host = String(siteHost || "").toLowerCase().replace(/^www\./, "");
  const platformRoot = isPlatformRootInput(host);
  const annotated = (Array.isArray(probes) ? probes : []).map((probe) => annotate(probe, host, officialDomains, platformRoot, resolveUrl));
  const valid = annotated.filter((probe) => probe.answerStatus === "answered");
  return {
    method: "mcac",
    method_version: MCAC_VERSION,
    flag_rules_version: MCAC_FLAG_RULES_VERSION,
    probes: annotated,
    mention: mention(valid.filter((probe) => probe.type === "discovery"), brandTerms),
    citation: citation(valid, platformRoot),
    accuracy: accuracy(annotated.find((probe) => probe.type === "fact"), truth),
    conversion: conversion(annotated.find((probe) => probe.type === "action"), host, officialDomains),
    total: null
  };
}

function annotate(probe, host, officialDomains, platformRoot, resolveUrl) {
  const answerStatus = probe.status === "failed" ? "failed" : classifyAnswerStatus(probe.answer);
  const urls = [...new Set((Array.isArray(probe.citations) ? probe.citations : [])
    .map((citation) => (typeof citation === "string" ? citation : citation?.url))
    .filter(Boolean)
    .map((url) => resolveUrl(url) || url))];
  return {
    id: probe.id,
    type: probe.type,
    query: probe.query || "",
    answerStatus,
    answer: typeof probe.answer === "string" ? probe.answer : "",
    error: probe.error || null,
    sources: urls.map((url) => ({ url, type: platformRoot ? "unattributable" : sourceType(url, host, officialDomains) }))
  };
}

// A Google Maps place link is a map whether it is served from maps.google.com or
// google.com/maps; the shared classifier only knows the first form.
function sourceType(url, host, officialDomains) {
  const type = classifySourceType(url, host, officialDomains);
  if (type === "other" && /(?:^|\.)google\.[a-z.]+$/.test(safeHostname(url)) && /\/maps(?:\/|\?|$)/.test(url)) return "maps";
  return type;
}

function mention(discovery, brandTerms) {
  const n = discovery.length;
  if (!n) return { flag: "unknown", hits: null, n: 0, ranks: [], matched_terms: [] };
  const rows = discovery.map((probe) => {
    const matched = matchTermsInText(probe.answer, brandTerms).map((term) => term.value);
    const rank = matched.length ? extractMentionRank(probe.answer, brandTerms).rank : null;
    return { matched, rank };
  });
  const hits = rows.filter((row) => row.matched.length).length;
  return {
    flag: hits === n ? "yes" : hits > 0 ? "part" : "no",
    hits,
    n,
    ranks: rows.map((row) => row.rank),
    matched_terms: [...new Set(rows.flatMap((row) => row.matched))]
  };
}

function citation(valid, platformRoot) {
  const n = valid.length;
  const byType = {};
  for (const probe of valid) for (const source of probe.sources) byType[source.type] = (byType[source.type] || 0) + 1;
  const officialProbes = valid.filter((probe) => probe.sources.some((source) => source.type === "official")).length;
  const officialUrls = [...new Set(valid.flatMap((probe) => probe.sources.filter((source) => source.type === "official").map((source) => source.url)))];
  const base = { official_probes: n ? officialProbes : null, n, by_type: byType, official_urls: officialUrls };
  if (!n) return { flag: "unknown", ...base };
  if (platformRoot) return { flag: "unknown", reason: "platform_root_input", ...base };
  return { flag: officialProbes * 2 >= n ? "yes" : officialProbes > 0 ? "part" : "no", ...base };
}

function accuracy(probe, truth = {}) {
  const truthSummary = {
    phone: truth?.phone || null,
    address: truth?.address || null,
    hours: truth?.hours || null
  };
  if (!probe) return { flag: "unknown", reason: "no_fact_question", fields: unknownFields(), truth: truthSummary, claimed: null };
  if (probe.answerStatus !== "answered") return { flag: "unknown", reason: `fact_${probe.answerStatus}`, fields: unknownFields(), truth: truthSummary, claimed: null };
  const claimed = parseFactAnswer(probe.answer);
  const fields = {
    phone: judgeFact("phone", truth?.phone?.values || truth?.phone?.value, claimed.phone),
    address: judgeFact("address", truth?.address?.values || truth?.address?.value, claimed.address),
    hours: "not_judged"
  };
  const judged = [fields.phone, fields.address];
  const flag = judged.includes("incorrect") ? "incorrect"
    : judged.includes("correct") ? "correct"
      : judged.every((value) => value === "unverifiable") ? "unverifiable"
        : "not_provided";
  return { flag, fields, truth: truthSummary, claimed: { phone: claimed.phone, address: claimed.address } };
}

function conversion(probe, host, officialDomains) {
  if (!probe) return { flag: "unknown", reason: "no_action_question", entries: [], official_entry: null, actions: [] };
  if (probe.answerStatus !== "answered") return { flag: "unknown", reason: `action_${probe.answerStatus}`, entries: [], official_entry: null, actions: [] };
  const parsed = parseActions(probe.answer, { siteHost: host, officialDomains });
  return {
    flag: parsed.hasActionable ? "yes" : "no",
    entries: [...new Set(parsed.entries.map((entry) => entry.type))],
    official_entry: parsed.officialEntry,
    actions: parsed.entries
  };
}

function unknownFields() {
  return { phone: "unknown", address: "unknown", hours: "not_judged" };
}

module.exports = { MCAC_FLAG_RULES_VERSION, MCAC_VERSION, evaluateMcac };
