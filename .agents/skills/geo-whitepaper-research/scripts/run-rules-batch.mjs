#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args["project-root"] || process.cwd());
const inputPath = path.resolve(projectRoot, required(args, "input"));
const outputDir = path.resolve(projectRoot, args["output-dir"] || defaultOutputDir());
const concurrency = boundedInt(args.concurrency, 3, 1, 10);
const delayMs = boundedInt(args["delay-ms"], 300, 0, 10_000);
const pageLimit = boundedInt(args["representative-pages"], 3, 0, 5);
const maxSites = boundedInt(args["max-sites"], 1000, 1, 1000);
let algorithmVersion;
const retryFailed = Boolean(args["retry-failed"]);

assertFile(path.join(projectRoot, "mock-api", "lib", "scoring-v2.js"), "Run from the GeoCheck project root or pass --project-root.");
assertFile(inputPath, `Input file not found: ${inputPath}`);

const require = createRequire(import.meta.url);
const { loadEnvFiles } = require(path.join(projectRoot, "mock-api", "lib", "env.js"));
const { assertSafePublicUrl } = require(path.join(projectRoot, "mock-api", "lib", "url-safety.js"));
const { fetchHomepage, fetchRepresentativePages } = require(path.join(projectRoot, "mock-api", "lib", "html-v2.js"));
const { fetchTechnicalSignals } = require(path.join(projectRoot, "mock-api", "lib", "technical-signals.js"));
const { ALGORITHM_VERSION, collectScoringSignals, computeScoreV2 } = require(path.join(projectRoot, "mock-api", "lib", "scoring-v2.js"));
algorithmVersion = String(args["algorithm-version"] || `${ALGORITHM_VERSION}-rules`);
loadEnvFiles();

fs.mkdirSync(outputDir, { recursive: true });
const jsonlPath = path.join(outputDir, "results.jsonl");
const existingRows = readJsonl(jsonlPath);
const rowsByUrl = new Map(existingRows.map((row) => [row.url, row]));
const urls = readUrls(inputPath).slice(0, maxSites);
const pending = urls.filter((url) => {
  const row = rowsByUrl.get(url);
  return !row || row.algorithm_version !== algorithmVersion || (retryFailed && row.crawl_status === "failed");
});

console.log(`GeoCheck rules-only batch: ${urls.length} sites, ${pending.length} pending, concurrency ${concurrency}`);
let completed = 0;
await runPool(pending, concurrency, async (url) => {
  const result = await auditOne(url);
  fs.appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`, "utf8");
  rowsByUrl.set(url, result);
  completed += 1;
  console.log(`[${completed}/${pending.length}] ${result.crawl_status} ${url}${result.site_readiness_score === null ? "" : ` readiness=${result.site_readiness_score}`}`);
  if (delayMs) await sleep(delayMs);
});

const rows = urls.map((url) => rowsByUrl.get(url)).filter(Boolean);
const datasetHash = sha256(rows.map(stableResearchRow).map(JSON.stringify).join("\n"));
const summary = { ...buildSummary(rows, algorithmVersion), dataset_sha256: datasetHash };
const methodology = {
  generated_at: new Date().toISOString(),
  mode: "rules_only",
  input_file: path.relative(projectRoot, inputPath),
  algorithm_version: algorithmVersion,
  scoring_engine_version: ALGORITHM_VERSION,
  site_count: urls.length,
  result_count: rows.length,
  concurrency,
  delay_ms: delayMs,
  representative_pages: pageLimit,
  paid_ai_calls: 0,
  overall_geo_available: false,
  dataset_sha256: datasetHash
};

fs.writeFileSync(path.join(outputDir, "results.csv"), toCsv(rows), "utf8");
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "methodology.json"), `${JSON.stringify(methodology, null, 2)}\n`, "utf8");
console.log(`Completed. Output: ${outputDir}`);
console.log(`Dataset SHA-256: ${datasetHash}`);

async function auditOne(url) {
  const measuredAt = new Date().toISOString();
  try {
    await assertSafePublicUrl(url);
    const homepage = await fetchHomepage(url);
    const technical = await fetchTechnicalSignals(url, homepage);
    const representativePages = await fetchRepresentativePages(technical.representativeUrls || [], pageLimit);
    const signals = collectScoringSignals({ homepage, technical, representativePages });
    const scored = computeScoreV2(signals);
    const weakestGroup = findWeakestGroup(scored.breakdown);
    const topChecks = scored.checks
      .filter((check) => check.status === "fail" || check.status === "partial")
      .sort((a, b) => (b.weight - b.points) - (a.weight - a.points))
      .slice(0, 3);
    return {
      url,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      site_type: signals.siteType,
      geo_score: null,
      site_readiness_score: scored.score,
      score_scope: "owned_site_readiness_only",
      readiness_raw_score: scored.rawScore,
      readiness_label: labelForScore(scored.score),
      evidence_coverage: scored.evidenceCoverage,
      evidence_confidence: scored.evidenceConfidence,
      summary_zh: conciseSummary(scored.score, weakestGroup, topChecks),
      weakest_group: weakestGroup,
      top_failures: topChecks.map((check) => check.id),
      breakdown: scored.breakdown,
      rule_results: scored.checks,
      caps: scored.caps,
      crawl_status: "success",
      measured_at: measuredAt,
      algorithm_version: algorithmVersion,
      evidence_hash: sha256(JSON.stringify(compactEvidence(homepage, technical, representativePages)))
    };
  } catch (error) {
    return {
      url,
      domain: safeDomain(url),
      site_type: null,
      geo_score: null,
      site_readiness_score: null,
      score_scope: "owned_site_readiness_only",
      readiness_raw_score: null,
      readiness_label: "Unknown",
      evidence_coverage: 0,
      evidence_confidence: "unavailable",
      summary_zh: "本次無法可靠讀取網站，因此不產生分數。",
      weakest_group: null,
      top_failures: [],
      breakdown: {},
      rule_results: [],
      caps: [],
      crawl_status: "failed",
      error_stage: String(error.stage || "crawl"),
      error_message: String(error.message || "Unknown crawl error").slice(0, 300),
      measured_at: measuredAt,
      algorithm_version: algorithmVersion,
      evidence_hash: null
    };
  }
}

function compactEvidence(homepage, technical, pages) {
  return {
    finalUrl: homepage.finalUrl,
    statusCode: homepage.statusCode,
    fetchMethod: homepage.fetchMethod,
    metadata: homepage.metadata,
    textHash: sha256(String(homepage.text || "")),
    technical: { robots: technical.robots, sitemap: technical.sitemap, llms: technical.llms },
    pages: pages.map((page) => ({
      url: page.url,
      statusCode: page.statusCode,
      metadata: page.metadata,
      crawlQuality: page.crawlQuality,
      textHash: sha256(String(page.text || ""))
    }))
  };
}

function conciseSummary(score, weakestGroup, checks) {
  const groups = {
    crawl_access: "抓取與收錄",
    discoverability: "網站發現性",
    semantic_clarity: "語意標記",
    content_readability: "內容可讀性",
    citeability: "內容可引用性"
  };
  const level = score >= 85 ? "整體準備度良好" : score >= 70 ? "整體基礎尚可" : score >= 45 ? "整體仍需改善" : "整體存在明顯缺口";
  const reasons = checks.slice(0, 2).map((check) => check.evidence).filter(Boolean);
  const detail = reasons.length ? `主要問題是${reasons.join("、")}。` : "未發現高權重失敗項目。";
  return `${level}；最弱環節為${groups[weakestGroup] || "未知"}。${detail}`;
}

function findWeakestGroup(breakdown = {}) {
  return Object.entries(breakdown)
    .filter(([, value]) => Number(value.max) > 0)
    .sort((a, b) => (a[1].points / a[1].max) - (b[1].points / b[1].max))[0]?.[0] || null;
}

function buildSummary(rows, version) {
  const successful = rows.filter((row) => row.crawl_status === "success" && Number.isFinite(row.site_readiness_score));
  const ruleTotals = {};
  for (const row of successful) {
    for (const check of row.rule_results || []) {
      const bucket = ruleTotals[check.id] ||= { known: 0, pass: 0, partial: 0, fail: 0 };
      if (check.status !== "unknown") bucket.known += 1;
      if (bucket[check.status] !== undefined) bucket[check.status] += 1;
    }
  }
  const rulePassRates = Object.fromEntries(Object.entries(ruleTotals).map(([id, value]) => [id, {
    ...value,
    pass_rate: value.known ? round(value.pass / value.known * 100, 1) : null
  }]));
  return {
    generated_at: new Date().toISOString(),
    algorithm_version: version,
    total_sites: rows.length,
    successful_sites: successful.length,
    failed_sites: rows.length - successful.length,
    crawl_success_rate: rows.length ? round(successful.length / rows.length * 100, 1) : 0,
    site_readiness_score: describe(successful.map((row) => row.site_readiness_score)),
    readiness_bands: groupStats(successful, (row) => row.readiness_label),
    by_industry: groupStats(successful, (row) => row.site_type || "unknown"),
    by_evidence_confidence: groupStats(successful, (row) => row.evidence_confidence || "unknown"),
    rule_pass_rates: rulePassRates
  };
}

function groupStats(rows, keyFn) {
  const groups = {};
  for (const row of rows) (groups[keyFn(row)] ||= []).push(row.site_readiness_score);
  return Object.fromEntries(Object.entries(groups).map(([key, scores]) => [key, { count: scores.length, ...describe(scores) }]));
}

function describe(values) {
  if (!values.length) return { mean: null, median: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length, 1),
    median: median(sorted),
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function toCsv(rows) {
  const columns = ["url", "domain", "site_type", "geo_score", "site_readiness_score", "score_scope", "readiness_label", "evidence_coverage", "evidence_confidence", "summary_zh", "weakest_group", "top_failures", "crawl_status", "measured_at", "algorithm_version", "evidence_hash"];
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvValue(column === "top_failures" ? (row[column] || []).join("|") : row[column])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function readUrls(file) {
  const source = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = path.extname(file).toLowerCase() === ".csv"
    ? source.split(/\r?\n/).filter(Boolean).map(parseCsvLine)
    : source.split(/\r?\n/).filter(Boolean).map((line) => [line.trim()]);
  if (!rows.length) throw new Error("Input file contains no URLs.");
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const index = header.findIndex((value) => ["url", "domain", "website", "site"].includes(value));
  const values = index >= 0 ? rows.slice(1).map((row) => row[index]) : rows.map((row) => row[0]);
  const seen = new Set();
  return values.flatMap((value) => {
    try {
      const normalized = normalizeUrl(value);
      if (seen.has(normalized)) return [];
      seen.add(normalized);
      return [normalized];
    } catch {
      console.warn(`Skipped invalid URL: ${value}`);
      return [];
    }
  });
}

function normalizeUrl(value) {
  const input = String(value || "").trim();
  const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported protocol");
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.pathname = "/";
  parsed.search = "";
  return parsed.toString();
}

async function runPool(items, size, worker) {
  let index = 0;
  async function next() {
    while (index < items.length) await worker(items[index++]);
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += char;
  }
  values.push(value);
  return values;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function stableResearchRow(row) {
  return {
    url: row.url,
    geo_score: row.geo_score,
    site_readiness_score: row.site_readiness_score,
    score_scope: row.score_scope,
    site_type: row.site_type,
    crawl_status: row.crawl_status,
    algorithm_version: row.algorithm_version,
    evidence_hash: row.evidence_hash,
    top_failures: row.top_failures
  };
}

function parseArgs(tokens) {
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 1) {
    if (!tokens[index].startsWith("--")) continue;
    const key = tokens[index].slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function required(values, key) {
  if (!values[key]) throw new Error(`Missing required --${key}`);
  return values[key];
}

function boundedInt(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

function labelForScore(score) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Decent";
  if (score >= 45) return "Needs Work";
  return "Critical";
}

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2, 1);
}

function round(value, digits) { return Number(Number(value).toFixed(digits)); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function safeDomain(value) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; } }
function assertFile(file, message) { if (!fs.existsSync(file)) throw new Error(message); }
function defaultOutputDir() { return path.join("research-output", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
