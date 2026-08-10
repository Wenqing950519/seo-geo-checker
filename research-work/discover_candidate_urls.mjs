#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args["project-root"] || process.cwd());
const inputPath = path.resolve(projectRoot, required(args, "input"));
const outputDir = path.resolve(projectRoot, required(args, "output-dir"));
const maxCalls = boundedInt(required(args, "max-calls"), 0, 0, 1000);
const concurrency = boundedInt(args.concurrency, 1, 1, 4);
const delayMs = boundedInt(args["delay-ms"], 500, 0, 10_000);
const resultCount = boundedInt(args["result-count"], 8, 1, 20);
const retryFailed = Boolean(args["retry-failed"]);
const queryMode = String(args["query-mode"] || "default");

const require = createRequire(import.meta.url);
require(path.join(projectRoot, "mock-api", "lib", "env.js")).loadEnvFiles();
const { braveWebSearch, getBraveConfig } = require(path.join(projectRoot, "mock-api", "providers", "brave.js"));

const rows = readCsv(inputPath);
const outputPath = path.join(outputDir, "search-results.jsonl");
fs.mkdirSync(outputDir, { recursive: true });
const existing = readJsonl(outputPath);
const latestById = new Map(existing.map((row) => [row.candidate_id, row]));
const pending = rows.filter((row) => {
  const latest = latestById.get(row.candidate_id);
  return !latest || (retryFailed && latest.status !== "success");
});
if (pending.length > maxCalls) {
  throw new Error(`Hard stop: ${pending.length} Brave calls planned, cap is ${maxCalls}.`);
}

const config = getBraveConfig({ required: true });
const startedAt = new Date().toISOString();
console.log(`Source discovery: ${rows.length} candidates, ${pending.length} pending Brave calls, cap ${maxCalls}.`);

let completed = 0;
await runPool(pending, concurrency, async (row) => {
  const query = queryMode === "official-strict"
    ? `"${row.candidate_name}" 官網 官方網站 -site:tripadvisor.com.tw -site:ifoodie.tw -site:facebook.com -site:instagram.com -site:opentable.com.tw -site:inline.app`
    : queryMode === "booking-social"
      ? `"${row.candidate_name}" 台北 信義區 訂位 官方 Facebook Instagram`
      : `"${row.candidate_name}" 台北 信義區 官方網站 餐廳`;
  const measuredAt = new Date().toISOString();
  let record;
  try {
    const result = await braveWebSearch(query, { count: resultCount, attempts: 2, timeoutMs: 20_000 });
    record = {
      candidate_id: row.candidate_id,
      candidate_name: row.candidate_name,
      query,
      status: "success",
      measured_at: measuredAt,
      latency_ms: result.latencyMs,
      results: result.results
    };
  } catch (error) {
    record = {
      candidate_id: row.candidate_id,
      candidate_name: row.candidate_name,
      query,
      status: "failed",
      measured_at: measuredAt,
      latency_ms: null,
      error_stage: String(error.stage || "brave_search"),
      error_message: String(error.message || error).slice(0, 500),
      results: []
    };
  }
  fs.appendFileSync(outputPath, `${JSON.stringify(record)}\n`, "utf8");
  completed += 1;
  console.log(`[${completed}/${pending.length}] ${record.status} ${row.candidate_id} ${row.candidate_name}`);
  if (delayMs) await sleep(delayMs);
});

const allAttempts = readJsonl(outputPath);
const latest = [...new Map(allAttempts.map((row) => [row.candidate_id, row])).values()];
const successful = latest.filter((row) => row.status === "success");
const failed = latest.filter((row) => row.status !== "success");
const latency = successful.map((row) => row.latency_ms).filter(Number.isFinite);
const usage = {
  provider: "Brave Web Search API",
  query_mode: queryMode,
  base_url: config.baseUrl,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  candidate_count: rows.length,
  planned_calls_this_run: pending.length,
  hard_cap_this_run: maxCalls,
  recorded_attempts_total: allAttempts.length,
  latest_candidate_records: latest.length,
  successful_calls_total: successful.length,
  failed_calls_total: failed.length,
  tokens_available: false,
  input_tokens: null,
  output_tokens: null,
  total_tokens: null,
  mean_latency_ms: latency.length ? Math.round(latency.reduce((sum, value) => sum + value, 0) / latency.length) : null,
  evidence_boundary: "Search results are source leads only and require direct-page verification before entering the evidence ledger."
};
fs.writeFileSync(path.join(outputDir, "source-discovery-api-usage.json"), `${JSON.stringify(usage, null, 2)}\n`, "utf8");
console.log(`Completed source discovery: ${successful.length} successful, ${failed.length} failed.`);

function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, values[index] || ""]));
  });
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

async function runPool(items, size, worker) {
  let index = 0;
  async function next() {
    while (index < items.length) await worker(items[index++]);
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));
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
  if (values[key] === undefined) throw new Error(`Missing required --${key}`);
  return values[key];
}

function boundedInt(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
