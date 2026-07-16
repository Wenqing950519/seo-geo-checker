#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args["project-root"] || process.cwd());
const inputPath = path.resolve(projectRoot, required(args, "input"));
const outputDir = path.resolve(projectRoot, args["output-dir"] || defaultOutputDir());
const concurrency = boundedInt(args.concurrency, 2, 1, 4);
const delayMs = boundedInt(args["delay-ms"], 500, 0, 10_000);
const representativePages = boundedInt(args["representative-pages"], 3, 0, 5);
const maxSites = boundedInt(args["max-sites"], 1000, 1, 1000);
const maxPerplexityCalls = boundedInt(required(args, "max-perplexity-calls"), 0, 0, 100_000);
const maxGeminiCalls = boundedInt(required(args, "max-gemini-calls"), 0, 0, 100_000);
const retryFailed = Boolean(args["retry-failed"]);

const require = createRequire(import.meta.url);
const { loadEnvFiles } = require(path.join(projectRoot, "mock-api", "lib", "env.js"));
loadEnvFiles();
const { assertSafePublicUrl } = require(path.join(projectRoot, "mock-api", "lib", "url-safety.js"));
const {
  GEO_PIPELINE_VERSION,
  PERPLEXITY_CALLS_PER_SITE,
  conciseGeoComment,
  measureGeoSite
} = require(path.join(projectRoot, "mock-api", "lib", "geo-measurement.js"));
const {
  GEMINI_CALLS_PER_SITE,
  RESEARCH_PROFILE_VERSION,
  assertNoAdviceFields,
  buildResearchProfileResolved
} = require(path.join(projectRoot, "mock-api", "lib", "research-profile.js"));
const { getPerplexityConfig } = require(path.join(projectRoot, "mock-api", "providers", "perplexity.js"));
const { getGeminiConfig } = require(path.join(projectRoot, "mock-api", "providers", "gemini.js"));

assertFile(inputPath, `Input file not found: ${inputPath}`);
const perplexityConfig = getPerplexityConfig();
const geminiConfig = getGeminiConfig();
const urls = readUrls(inputPath).slice(0, maxSites);
fs.mkdirSync(outputDir, { recursive: true });
const jsonlPath = path.join(outputDir, "results.jsonl");
const existingRows = readJsonl(jsonlPath);
const rowsByUrl = new Map(existingRows.map((row) => [row.url, row]));
const pending = urls.filter((url) => {
  const row = rowsByUrl.get(url);
  return !row || row.pipeline_version !== GEO_PIPELINE_VERSION || row.profile_version !== RESEARCH_PROFILE_VERSION || (retryFailed && row.measurement_status !== "success");
});
const plannedPerplexityCalls = pending.length * PERPLEXITY_CALLS_PER_SITE;
const plannedGeminiCalls = pending.length * GEMINI_CALLS_PER_SITE;
if (plannedPerplexityCalls > maxPerplexityCalls) throw new Error(`Hard stop: ${plannedPerplexityCalls} Perplexity calls planned, cap is ${maxPerplexityCalls}.`);
if (plannedGeminiCalls > maxGeminiCalls) throw new Error(`Hard stop: ${plannedGeminiCalls} Gemini calls planned, cap is ${maxGeminiCalls}.`);

console.log(`GeoCheck AI evidence batch: ${urls.length} sites, ${pending.length} pending.`);
console.log(`Hard budget: Perplexity ${plannedPerplexityCalls}/${maxPerplexityCalls}; Gemini ${plannedGeminiCalls}/${maxGeminiCalls}.`);
let completed = 0;
await runPool(pending, concurrency, async (url) => {
  const result = await auditOne(url);
  fs.appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`, "utf8");
  rowsByUrl.set(url, result);
  completed += 1;
  console.log(`[${completed}/${pending.length}] ${result.measurement_status} ${url} geo=${result.geo_score ?? "unknown"}`);
  if (delayMs) await sleep(delayMs);
});

const rows = urls.map((url) => rowsByUrl.get(url)).filter(Boolean);
const datasetHash = sha256(rows.map(stableResearchRow).map(JSON.stringify).join("\n"));
const methodology = {
  generated_at: new Date().toISOString(),
  mode: "perplexity_plus_gemini_evidence",
  input_file: path.relative(projectRoot, inputPath),
  site_count: urls.length,
  result_count: rows.length,
  pipeline_version: GEO_PIPELINE_VERSION,
  profile_version: RESEARCH_PROFILE_VERSION,
  scoring_model: "Perplexity search evidence + deterministic GeoCheck lanes",
  perplexity_model: perplexityConfig.model,
  gemini_model: geminiConfig.model,
  perplexity_calls_per_site: PERPLEXITY_CALLS_PER_SITE,
  gemini_calls_per_site: GEMINI_CALLS_PER_SITE,
  planned_perplexity_calls: plannedPerplexityCalls,
  planned_gemini_calls: plannedGeminiCalls,
  max_perplexity_calls: maxPerplexityCalls,
  max_gemini_calls: maxGeminiCalls,
  gemini_scope: "basic information, industry, structure and observed content classification only",
  gemini_execution_mode: String(process.env.GEMINI_EXECUTION_MODE || "auto"),
  optimization_advice_generated: false,
  concurrency,
  delay_ms: delayMs,
  representative_pages: representativePages,
  query_design: "one exact-entity authority query and two unbranded discovery queries per site",
  claim_boundary: "Results describe this Perplexity model, fixed query set and collection window; they do not prove universal visibility across all AI systems.",
  dataset_sha256: datasetHash
};
const summary = { ...buildSummary(rows), dataset_sha256: datasetHash };
fs.writeFileSync(path.join(outputDir, "results.csv"), toCsv(rows), "utf8");
fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "methodology.json"), `${JSON.stringify(methodology, null, 2)}\n`, "utf8");
console.log(`Completed. Output: ${outputDir}`);
console.log(`Dataset SHA-256: ${datasetHash}`);

async function auditOne(url) {
  const measuredAt = new Date().toISOString();
  try {
    await assertSafePublicUrl(url);
    const measurement = await measureGeoSite(url, { representativePageLimit: representativePages });
    let profileResult = null;
    let profileError = null;
    try {
      profileResult = await buildResearchProfileResolved(measurement);
      assertNoAdviceFields(profileResult.profile);
    } catch (error) {
      profileError = { stage: String(error.stage || "gemini_profile"), message: String(error.message || error).slice(0, 300) };
    }
    return researchRow(measurement, profileResult, profileError, measuredAt);
  } catch (error) {
    return {
      url,
      domain: safeDomain(url),
      geo_score: null,
      site_readiness_score: null,
      perplexity_score: null,
      mention_rate: null,
      official_citation_rate: null,
      concise_comment_zh: "網站或 API 證據不足，本筆資料不計為零分。",
      measurement_status: "failed",
      error_stage: String(error.stage || "measurement"),
      error_message: String(error.message || error).slice(0, 300),
      measured_at: measuredAt,
      pipeline_version: GEO_PIPELINE_VERSION,
      profile_version: RESEARCH_PROFILE_VERSION
    };
  }
}

function researchRow(measurement, profileResult, profileError, measuredAt) {
  const observation = measurement.perplexityObservation;
  const geo = measurement.geoAssessment;
  const sources = collectSources(measurement.searchEvidence);
  return {
    url: measurement.finalUrl,
    domain: safeDomain(measurement.finalUrl),
    site_type: measurement.siteType,
    geo_score: geo.score,
    geo_status: geo.status,
    site_readiness_score: measurement.siteReadiness.score,
    perplexity_score: observation.score,
    mention_rate: observation.mentionRate,
    official_citation_rate: observation.citationRate,
    entity_grounded: Boolean(observation.authority?.entityGrounded),
    authority_aliases: observation.authorityAliases || [],
    query_observations: observation.observations || [],
    source_urls: sources,
    evidence_confidence: observation.confidence,
    concise_comment_zh: conciseGeoComment(measurement),
    gemini_profile: profileResult?.profile || null,
    gemini_profile_status: profileResult ? "success" : "unavailable",
    gemini_profile_model: profileResult?.model || geminiConfig.model,
    gemini_profile_execution: profileResult?.execution || null,
    gemini_profile_error: profileError,
    optimization_advice_generated: false,
    geo_lanes: geo.lanes,
    geo_caps: geo.caps,
    site_readiness_breakdown: measurement.siteReadiness.breakdown,
    measurement_status: geo.status === "measured" ? "success" : "insufficient_perplexity_evidence",
    measured_at: measuredAt,
    pipeline_version: GEO_PIPELINE_VERSION,
    profile_version: RESEARCH_PROFILE_VERSION,
    evidence_hash: sha256(JSON.stringify(compactEvidence(measurement, sources)))
  };
}

function collectSources(searchEvidence = {}) {
  const results = [searchEvidence.authority, ...(searchEvidence.discovery || [])].filter(Boolean);
  const urls = results.flatMap((result) => [
    ...(Array.isArray(result.citations) ? result.citations : []),
    ...(Array.isArray(result.searchResults) ? result.searchResults.map((item) => item?.url) : [])
  ]).filter(Boolean);
  return [...new Set(urls)];
}

function compactEvidence(measurement, sources) {
  return {
    url: measurement.finalUrl,
    pipeline: measurement.pipelineVersion,
    metadata: measurement.homepage.metadata,
    text_hash: sha256(String(measurement.homepage.text || "")),
    observations: measurement.perplexityObservation.observations,
    authority: measurement.perplexityObservation.authority,
    sources
  };
}

function buildSummary(rows) {
  const measured = rows.filter((row) => row.measurement_status === "success" && Number.isFinite(row.geo_score));
  const profiles = rows.filter((row) => row.gemini_profile_status === "success");
  return {
    generated_at: new Date().toISOString(),
    total_sites: rows.length,
    measured_sites: measured.length,
    failed_or_unknown_sites: rows.length - measured.length,
    gemini_profile_successes: profiles.length,
    geo_score: describe(measured.map((row) => row.geo_score)),
    site_readiness_score: describe(measured.map((row) => row.site_readiness_score)),
    perplexity_score: describe(measured.map((row) => row.perplexity_score)),
    mean_mention_rate: mean(measured.map((row) => row.mention_rate)),
    mean_official_citation_rate: mean(measured.map((row) => row.official_citation_rate)),
    entity_grounded_rate: measured.length ? round(measured.filter((row) => row.entity_grounded).length / measured.length * 100, 1) : null,
    by_industry: groupCount(profiles.map((row) => row.gemini_profile?.industry || "unknown"))
  };
}

function toCsv(rows) {
  const columns = ["url", "domain", "site_type", "geo_score", "site_readiness_score", "perplexity_score", "mention_rate", "official_citation_rate", "entity_grounded", "evidence_confidence", "concise_comment_zh", "gemini_entity_name", "gemini_industry", "gemini_business_scope", "gemini_profile_status", "measurement_status", "measured_at", "pipeline_version", "profile_version", "evidence_hash"];
  const lines = [columns.join(",")];
  for (const row of rows) {
    const flat = { ...row, gemini_entity_name: row.gemini_profile?.entity_name, gemini_industry: row.gemini_profile?.industry, gemini_business_scope: row.gemini_profile?.business_scope };
    lines.push(columns.map((column) => csvValue(flat[column])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function readUrls(file) {
  const source = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = path.extname(file).toLowerCase() === ".csv" ? source.split(/\r?\n/).filter(Boolean).map(parseCsvLine) : source.split(/\r?\n/).filter(Boolean).map((line) => [line.trim()]);
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
  parsed.username = ""; parsed.password = ""; parsed.hash = ""; parsed.pathname = "/"; parsed.search = "";
  return parsed.toString();
}

async function runPool(items, size, worker) {
  let index = 0;
  async function next() { while (index < items.length) await worker(items[index++]); }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));
}

function parseCsvLine(line) {
  const values = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value); return values;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

function stableResearchRow(row) {
  return { url: row.url, geo_score: row.geo_score, perplexity_score: row.perplexity_score, mention_rate: row.mention_rate, official_citation_rate: row.official_citation_rate, gemini_profile: row.gemini_profile, measurement_status: row.measurement_status, pipeline_version: row.pipeline_version, profile_version: row.profile_version, evidence_hash: row.evidence_hash };
}

function parseArgs(tokens) {
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 1) {
    if (!tokens[index].startsWith("--")) continue;
    const key = tokens[index].slice(2); const next = tokens[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else { parsed[key] = next; index += 1; }
  }
  return parsed;
}

function required(values, key) { if (values[key] === undefined) throw new Error(`Missing required --${key}`); return values[key]; }
function boundedInt(value, fallback, min, max) { const number = Number(value ?? fallback); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function defaultOutputDir() { return path.join("research-output", `ai-evidence-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`); }
function assertFile(file, message) { if (!fs.existsSync(file)) throw new Error(message); }
function safeDomain(value) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; } }
function csvValue(value) { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function describe(values) { const finite = values.filter(Number.isFinite).sort((a, b) => a - b); return finite.length ? { mean: mean(finite), median: finite.length % 2 ? finite[Math.floor(finite.length / 2)] : round((finite[finite.length / 2 - 1] + finite[finite.length / 2]) / 2, 1), min: finite[0], max: finite.at(-1) } : { mean: null, median: null, min: null, max: null }; }
function mean(values) { const finite = values.filter(Number.isFinite); return finite.length ? round(finite.reduce((sum, value) => sum + value, 0) / finite.length, 1) : null; }
function groupCount(values) { return values.reduce((groups, value) => ({ ...groups, [value]: (groups[value] || 0) + 1 }), {}); }
function round(value, digits) { return Number(Number(value).toFixed(digits)); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
