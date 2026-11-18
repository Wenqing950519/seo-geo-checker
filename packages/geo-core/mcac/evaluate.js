// MCAC reports four findings and computes an overview score when each dimension
// can be scored. The legacy total field stays null.

const {
  classifyAnswerStatus,
  classifySourceType,
  isPlatformRootInput,
  matchTermsInText,
  safeHostname,
  textMatchesAnyTerm
} = require("../evidence/brand-match.js");
const { judgeFact, parseFactAnswer } = require("./facts.js");
const { parseActions } = require("./actions.js");

const MCAC_VERSION = "0.2.0";
const MCAC_FLAG_RULES_VERSION = "mcac-flags-v0";

function evaluateMcac({ probes = [], brandTerms = [], siteHost = "", officialDomains = [], truth = {}, resolveUrl = (url) => url } = {}) {
  const host = String(siteHost || "").toLowerCase().replace(/^www\./, "");
  const platformRoot = isPlatformRootInput(host);
  const annotated = (Array.isArray(probes) ? probes : []).map((probe) => annotate(probe, host, officialDomains, platformRoot, resolveUrl));
  const valid = annotated.filter((probe) => probe.answerStatus === "answered");
  const mentionResult = mention(valid.filter((probe) => probe.type === "discovery"), brandTerms);
  const citationResult = citation(valid, platformRoot);
  const accuracyResult = accuracy(annotated.find((probe) => probe.type === "fact"), truth);
  const conversionResult = conversion(annotated.find((probe) => probe.type === "action"), host, officialDomains, resolveUrl);
  const score = computeMcacScore({
    mention: mentionResult,
    citation: citationResult,
    accuracy: accuracyResult,
    conversion: conversionResult
  });
  return {
    method: "mcac",
    method_version: MCAC_VERSION,
    flag_rules_version: MCAC_FLAG_RULES_VERSION,
    probes: annotated,
    mention: mentionResult,
    citation: citationResult,
    accuracy: accuracyResult,
    conversion: conversionResult,
    score,
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
  if (!n) return { flag: "unknown", hits: null, n: 0, ranks: [], matched_terms: [], options_by_probe: [], peers: [] };
  const rows = discovery.map((probe) => {
    const matched = matchTermsInText(probe.answer, brandTerms).map((term) => term.value);
    const rank = matched.length ? optionRank(probe.answer, brandTerms) : null;
    const options = extractOptionList(probe.answer, brandTerms);
    return { matched, rank, options };
  });
  const hits = rows.filter((row) => row.matched.length).length;
  const peers = [...new Set(rows.flatMap((row) => row.options.filter((item) => !item.isSelf).map((item) => item.name)))].slice(0, 10);
  return {
    flag: hits === n ? "yes" : hits > 0 ? "part" : "no",
    hits,
    n,
    ranks: rows.map((row) => row.rank),
    matched_terms: [...new Set(rows.flatMap((row) => row.matched))],
    options_by_probe: rows.map((row) => row.options),
    peers
  };
}

// A rank counts the options themselves: the outermost list lines, and of those only the
// numbered ones (also "### 1." headings) when any are numbered; without a list, table rows.
// Reasons and sources nested under an option, rules (---) and italic notes are not options
// (2026-10-20 smoke; the research parser counted every list line).
const NUMBERED_LINE = /^\s*(?:#{1,6}\s*)?(?:\d{1,2}\s*[.)、]|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十]\s*[、.])/;
const BULLET_LINE = /^\s*[-*•]\s+\S/;

function extractRawOptions(answer) {
  const lines = String(answer || "").split(/\r?\n/);
  const listLines = lines.filter((line) => NUMBERED_LINE.test(line) || BULLET_LINE.test(line));
  if (listLines.length) {
    const indent = (line) => line.match(/^\s*/)[0].length;
    const top = Math.min(...listLines.map(indent));
    const outer = listLines.filter((line) => indent(line) === top);
    const numbered = outer.filter((line) => NUMBERED_LINE.test(line));
    return numbered.length ? numbered : outer;
  }
  const rows = lines.filter((line) => /^\s*\|.*\|\s*$/.test(line) && !/^[\s|:\-]+$/.test(line));
  return rows.length >= 2 ? rows.slice(1) : [];
}

function optionRank(answer, terms) {
  const options = extractRawOptions(answer);
  const index = options.findIndex((line) => textMatchesAnyTerm(line, terms));
  return index >= 0 ? index + 1 : null;
}

function cleanOptionName(line) {
  let text = String(line || "").trim();
  if (/^\s*\|.*\|\s*$/.test(text)) {
    const cells = text.split("|").map((cell) => cell.trim()).filter(Boolean);
    text = cells[0] || "";
  }
  text = text
    .replace(NUMBERED_LINE, "")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/[*_`]+/g, "")
    .trim();
  const split = text.split(/\s*(?:：|:|—|–|\s+-\s+|[｜|。；])\s*/);
  let name = (split[0] || "").trim();
  if (name.length > 48) {
    const commaSplit = name.split(/\s*[，,]\s*/);
    if (commaSplit[0] && commaSplit[0].length >= 2) name = commaSplit[0].trim();
  }
  return name.slice(0, 60).trim();
}

function extractOptionList(answer, terms = []) {
  return extractRawOptions(answer).slice(0, 10).map((line, index) => {
    const name = cleanOptionName(line);
    if (!name) return null;
    return {
      rank: index + 1,
      name,
      isSelf: Array.isArray(terms) && terms.length ? textMatchesAnyTerm(line, terms) : false
    };
  }).filter(Boolean);
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
  const flag = judged.includes("mismatch") ? "mismatch"
    : judged.includes("correct") ? "correct"
      : judged.every((value) => value === "unverifiable") ? "unverifiable"
        : "not_provided";
  return { flag, fields, truth: truthSummary, claimed: { phone: claimed.phone, address: claimed.address } };
}

function conversion(probe, host, officialDomains, resolveUrl) {
  if (!probe) return { flag: "unknown", reason: "no_action_question", entries: [], official_entry: null, actions: [] };
  if (probe.answerStatus !== "answered") return { flag: "unknown", reason: `action_${probe.answerStatus}`, entries: [], official_entry: null, actions: [] };
  const parsed = parseActions(probe.answer, { siteHost: host, officialDomains, resolveUrl });
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

// Exposure-funnel composite score (0-100) over the four MCAC dimensions:
// Mention (35) -> Citation (25) -> Accuracy (20) -> Conversion (20).
// A missing dimension withholds the overview. Within Mention and Citation the
// denominator is the number of valid answers for that dimension.
function computeMcacScore(mcac = {}) {
  const m = mcac?.mention || {};
  let mentionScore;
  if (m.flag === "unknown" || !m.n || m.hits === null || m.hits === undefined) {
    mentionScore = { status: "unknown", points: null, max: 35 };
  } else {
    const n = Number(m.n);
    const hits = Math.max(0, Math.min(Number(m.hits) || 0, n));
    const base = (hits / n) * 28;
    const validRanks = (Array.isArray(m.ranks) ? m.ranks : []).filter((r) => Number.isFinite(r) && r > 0);
    let rankBonus = 0;
    if (hits > 0) {
      if (validRanks.length) {
        const bestRank = Math.min(...validRanks);
        rankBonus = bestRank <= 3 ? 7 : bestRank <= 10 ? 4 : 2;
      } else {
        rankBonus = 2;
      }
    }
    mentionScore = { status: "measured", points: Math.min(35, Math.round((base + rankBonus) * 10) / 10), max: 35 };
  }

  const c = mcac?.citation || {};
  let citationScore;
  if (c.flag === "unknown" || !c.n || c.official_probes === null || c.official_probes === undefined) {
    citationScore = { status: "unknown", points: null, max: 25 };
  } else {
    const n = Number(c.n);
    const official = Math.max(0, Number(c.official_probes) || 0);
    const points = official === 0 ? 0 : (official / n >= 0.75 ? 25 : (official * 2 >= n ? 22 : 14));
    citationScore = { status: "measured", points, max: 25 };
  }

  const a = mcac?.accuracy || {};
  let accuracyScore;
  if (a.flag === "unknown") {
    accuracyScore = { status: "unknown", points: null, max: 20 };
  } else {
    const fields = a.fields || {};
    const scoreField = (val) => (val === "correct" ? 10 : val === "not_provided" ? 3 : val === "unverifiable" ? 2 : val === "mismatch" ? 0 : null);
    const pScore = scoreField(fields.phone);
    const aScore = scoreField(fields.address);
    if (pScore === null && aScore === null) {
      accuracyScore = { status: "unknown", points: null, max: 20 };
    } else if (pScore === null) {
      accuracyScore = { status: "measured", points: aScore * 2, max: 20 };
    } else if (aScore === null) {
      accuracyScore = { status: "measured", points: pScore * 2, max: 20 };
    } else {
      accuracyScore = { status: "measured", points: pScore + aScore, max: 20 };
    }
  }

  const v = mcac?.conversion || {};
  let conversionScore;
  if (v.flag === "unknown") {
    conversionScore = { status: "unknown", points: null, max: 20 };
  } else if (v.flag !== "yes") {
    conversionScore = { status: "measured", points: 0, max: 20 };
  } else {
    let pts = 12;
    if (v.official_entry === true) pts += 5;
    if (Array.isArray(v.entries) && v.entries.length >= 2) pts += 3;
    conversionScore = { status: "measured", points: Math.min(20, pts), max: 20 };
  }

  const breakdown = {
    mention: mentionScore,
    citation: citationScore,
    accuracy: accuracyScore,
    conversion: conversionScore
  };
  const valid = Object.values(breakdown).filter((item) => item.status !== "unknown");
  const validMax = valid.reduce((sum, item) => sum + item.max, 0);
  const validPoints = valid.reduce((sum, item) => sum + item.points, 0);
  if (validMax === 0) {
    return {
      method: "exposure_funnel_v1",
      value: null,
      status: "unknown",
      tone: "unknown",
      label: "尚無可判讀資料",
      valid_dimensions: 0,
      total_dimensions: 4,
      breakdown
    };
  }
  // The score is shown only when all four results were measured (2026-11-15 decision). Rescaling
  // the measured ones made a report with an unknown mention read 75 "具備基礎能見度".
  if (valid.length < 4) {
    return {
      method: "exposure_funnel_v1",
      value: null,
      status: "partial",
      tone: "unknown",
      label: `4 項中 ${valid.length} 項可判讀`,
      valid_dimensions: valid.length,
      total_dimensions: 4,
      breakdown
    };
  }
  const value = Math.round((validPoints / validMax) * 100);
  const [label, tone] = value >= 80
    ? ["能見度優異", "yes"]
    : value >= 60
      ? ["具備基礎能見度", "yes"]
      : value >= 35
        ? ["能見度待補強", "part"]
        : ["能見度偏低", "no"];
  return {
    method: "exposure_funnel_v1",
    value,
    status: "measured",
    tone,
    label,
    valid_dimensions: valid.length,
    total_dimensions: 4,
    breakdown
  };
}

module.exports = { MCAC_FLAG_RULES_VERSION, MCAC_VERSION, evaluateMcac, computeMcacScore, extractOptionList };
