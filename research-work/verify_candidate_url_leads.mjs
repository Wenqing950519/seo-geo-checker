#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args["project-root"] || process.cwd());
const inputPath = path.resolve(projectRoot, required(args, "input"));
const outputDir = path.resolve(projectRoot, required(args, "output-dir"));
const maxFetches = boundedInt(required(args, "max-fetches"), 0, 0, 2000);
const concurrency = boundedInt(args.concurrency, 2, 1, 4);
const delayMs = boundedInt(args["delay-ms"], 250, 0, 10_000);
const retryFailed = Boolean(args["retry-failed"]);

const require = createRequire(import.meta.url);
require(path.join(projectRoot, "mock-api", "lib", "env.js")).loadEnvFiles();
const { assertSafePublicUrl } = require(path.join(projectRoot, "mock-api", "lib", "url-safety.js"));


const rows = readCsv(inputPath);
const outputPath = path.join(outputDir, "direct-verification.jsonl");
fs.mkdirSync(outputDir, { recursive: true });
const existing = readJsonl(outputPath);
const latestById = new Map(existing.map((row) => [row.candidate_id, row]));
const pending = rows.filter((row) => {
  const latest = latestById.get(row.candidate_id);
  const hasLead = leadUrls(row).length > 0;
  return hasLead && (!latest || (retryFailed && latest.verification_status === "fetch_failed"));
});
const plannedFetches = pending.reduce((sum, row) => sum + leadUrls(row).length, 0);
if (plannedFetches > maxFetches) throw new Error(`Hard stop: up to ${plannedFetches} page fetches planned, cap is ${maxFetches}.`);

const startedAt = new Date().toISOString();
console.log(`Direct verification: ${pending.length} candidates, up to ${plannedFetches} fetches, cap ${maxFetches}.`);
let completed = 0;
let attemptedFetches = 0;

await runPool(pending, concurrency, async (row) => {
  const tokens = entityTokens(row.candidate_name);
  const attempts = [];
  let selected = null;
  for (const url of leadUrls(row)) {
    attemptedFetches += 1;
    try {
      await assertSafePublicUrl(url);
      const page = await fetchVerificationPage(url);
      const evidence = [page.metadata?.title, page.metadata?.description, page.metadata?.h1, page.metadata?.ogTitle, page.text]
        .filter(Boolean)
        .join(" ");
      const normalized = normalizeText(evidence);
      const matchedTokens = tokens.filter((token) => normalized.includes(normalizeText(token)));
      const nameMatch = matchedTokens.length > 0;
      const districtObserved = /信義區|臺北市信義|台北市信義|taipei\s*101|xinyi/i.test(evidence);
      const attempt = {
        url,
        final_url: page.finalUrl,
        status: "success",
        status_code: page.statusCode,
        fetch_method: page.fetchMethod,
        title: page.metadata?.title || "",
        h1: page.metadata?.h1 || "",
        description: page.metadata?.description || "",
        canonical: page.metadata?.canonical || "",
        matched_tokens: matchedTokens,
        name_match: nameMatch,
        district_observed: districtObserved,
        text_excerpt: String(page.text || "").slice(0, 500)
      };
      attempts.push(attempt);
      if (nameMatch) {
        selected = attempt;
        break;
      }
    } catch (error) {
      attempts.push({
        url,
        status: "failed",
        error_stage: String(error.stage || "direct_fetch"),
        error_message: String(error.message || error).slice(0, 400)
      });
    }
  }

  const anySuccess = attempts.some((attempt) => attempt.status === "success");
  const record = {
    candidate_id: row.candidate_id,
    candidate_name: row.candidate_name,
    entity_tokens: tokens,
    verification_status: selected ? "brand_evidence_observed" : anySuccess ? "page_fetched_name_unconfirmed" : "fetch_failed",
    selected_url: selected?.url || "",
    selected_final_url: selected?.final_url || "",
    selected_domain: safeDomain(selected?.final_url || selected?.url),
    branch_or_district_observed: Boolean(selected?.district_observed),
    measured_at: new Date().toISOString(),
    attempts
  };
  fs.appendFileSync(outputPath, `${JSON.stringify(record)}\n`, "utf8");
  completed += 1;
  console.log(`[${completed}/${pending.length}] ${record.verification_status} ${row.candidate_id} ${row.candidate_name}`);
  if (delayMs) await sleep(delayMs);
});

const allAttempts = readJsonl(outputPath);
const latest = [...new Map(allAttempts.map((row) => [row.candidate_id, row])).values()];
const counts = latest.reduce((acc, row) => {
  acc[row.verification_status] = (acc[row.verification_status] || 0) + 1;
  return acc;
}, {});
const usage = {
  mode: "direct_public_page_verification",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  input_candidates: rows.length,
  pending_candidates_this_run: pending.length,
  planned_max_fetches_this_run: plannedFetches,
  hard_cap_this_run: maxFetches,
  attempted_fetches_this_run: attemptedFetches,
  latest_records: latest.length,
  status_counts: counts,
  ai_api_calls: 0,
  tokens_available: false,
  evidence_boundary: "Automated brand-text observation is a verification aid; final official ownership and branch eligibility require evidence review."
};
fs.writeFileSync(path.join(outputDir, "direct-verification-usage.json"), `${JSON.stringify(usage, null, 2)}\n`, "utf8");
console.log(JSON.stringify(usage, null, 2));

async function fetchVerificationPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) throw new Error(`Non-HTML ${contentType}`);
    const html = await response.text();
    const title = stripHtml(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).slice(0, 500);
    const h1 = stripHtml(matchFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)).slice(0, 500);
    const description = metaDescription(html).slice(0, 500);
    const text = stripHtml(html).slice(0, 8000);
    if (!text && !title) throw new Error("Empty HTML evidence");
    return {
      finalUrl: response.url || url,
      statusCode: response.status,
      fetchMethod: "http-direct",
      metadata: { title, h1, description, canonical: "" },
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

function matchFirst(source, pattern) {
  return String(source || "").match(pattern)?.[1] || "";
}

function metaDescription(source) {
  for (const tag of String(source || "").match(/<meta\b[^>]*>/gi) || []) {
    if (/\bname\s*=\s*["']description["']/i.test(tag)) {
      return stripHtml(tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || "");
    }
  }
  return "";
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function leadUrls(row) {
  return [row.lead_1_url, row.lead_2_url, row.lead_3_url].map((value) => String(value || "").trim()).filter(Boolean);
}

function entityTokens(name) {
  const source = String(name || "")
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/台北|臺北|信義區|信義店|餐廳|美食|旗艦店|店$/g, " ");
  const chunks = source.split(/[－—–|｜／/,:：·・\s]+/).map((value) => value.trim()).filter(Boolean);
  const tokens = [];
  for (const chunk of chunks) {
    if (/^[\u3400-\u9fff]+$/.test(chunk) && chunk.length >= 2) tokens.push(chunk);
    else if (/[a-z]/i.test(chunk) && chunk.replace(/[^a-z0-9]/gi, "").length >= 3) tokens.push(chunk);
  }
  return [...new Set(tokens)].slice(0, 8);
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function safeDomain(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

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
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
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
    else { parsed[key] = next; index += 1; }
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
