#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args["project-root"] || process.cwd());
const rows = readCsv(path.resolve(projectRoot, required(args, "input")));
const outputDir = path.resolve(projectRoot, required(args, "output-dir"));
const maxFetches = Number(required(args, "max-fetches"));
const concurrency = Math.max(1, Math.min(4, Number(args.concurrency || 3)));
const plannedFetches = rows.reduce((sum, row) => sum + leadUrls(row).length, 0);
if (plannedFetches > maxFetches) throw new Error(`Hard stop: ${plannedFetches} page fetches planned, cap is ${maxFetches}.`);

const require = createRequire(import.meta.url);
require(path.join(projectRoot, "packages/shared/env.js")).loadEnvFiles();
const { assertSafePublicUrl } = require(path.join(projectRoot, "packages/crawler/url-safety.js"));

fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "store-page-details.jsonl");
fs.writeFileSync(outputPath, "", "utf8");
const startedAt = new Date().toISOString();
let completed = 0;
let attemptedFetches = 0;

await runPool(rows, concurrency, async (row) => {
  const tokens = entityTokens(row.candidate_name);
  const attempts = [];
  let selected = null;
  for (const url of leadUrls(row)) {
    attemptedFetches += 1;
    try {
      await assertSafePublicUrl(url);
      const page = await fetchPage(url);
      const evidence = `${page.title} ${page.description} ${page.h1} ${page.text}`;
      const normalized = normalize(evidence);
      const matchedTokens = tokens.filter((token) => normalized.includes(normalize(token)));
      const attempt = {
        url,
        final_url: page.finalUrl,
        status_code: page.statusCode,
        matched_tokens: matchedTokens,
        name_match: matchedTokens.length > 0,
        district_observed: /信義區|臺北市信義|台北市信義|taipei\s*101|xinyi/i.test(evidence),
        addresses_observed: extractAddresses(evidence),
        dine_in_language_observed: /內用|現場用餐|餐廳|訂位|預約|座位|dine[- ]?in|restaurant|reservation|reserve a table/i.test(evidence),
        closure_language_observed: /永久停業|已歇業|停止營業|結束營業|permanently closed|closed permanently/i.test(evidence),
        title: page.title,
        h1: page.h1,
        description: page.description,
        text_excerpt: page.text.slice(0, 800)
      };
      attempts.push(attempt);
      if (attempt.name_match) {
        selected = attempt;
        break;
      }
    } catch (error) {
      attempts.push({ url, status: "failed", error_message: String(error.message || error).slice(0, 300) });
    }
  }
  const record = {
    candidate_id: row.candidate_id,
    candidate_name: row.candidate_name,
    detail_status: selected ? "name_matched_page_observed" : attempts.some((attempt) => attempt.status_code) ? "page_observed_name_unconfirmed" : "fetch_failed",
    selected_url: selected?.url || "",
    selected_final_url: selected?.final_url || "",
    selected_domain: safeDomain(selected?.final_url || selected?.url),
    district_observed: Boolean(selected?.district_observed),
    addresses_observed: selected?.addresses_observed || [],
    dine_in_language_observed: Boolean(selected?.dine_in_language_observed),
    closure_language_observed: Boolean(selected?.closure_language_observed),
    observed_at: new Date().toISOString(),
    attempts
  };
  fs.appendFileSync(outputPath, `${JSON.stringify(record)}\n`, "utf8");
  completed += 1;
  console.log(`[${completed}/${rows.length}] ${record.detail_status} ${row.candidate_id} ${row.candidate_name}`);
});

const all = readJsonl(outputPath);
const counts = all.reduce((acc, row) => {
  acc[row.detail_status] = (acc[row.detail_status] || 0) + 1;
  return acc;
}, {});
const usage = {
  mode: "direct_public_page_detail_extraction",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  input_candidates: rows.length,
  planned_max_fetches: plannedFetches,
  hard_cap: maxFetches,
  attempted_fetches: attemptedFetches,
  status_counts: counts,
  ai_api_calls: 0,
  tokens_available: false,
  evidence_boundary: "Observed page text and regex address leads require human confirmation; absence is not proof of no address, dine-in, or closure."
};
fs.writeFileSync(path.join(outputDir, "store-page-detail-usage.json"), `${JSON.stringify(usage, null, 2)}\n`, "utf8");
console.log(JSON.stringify(usage, null, 2));

async function fetchPage(url) {
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
    const html = await response.text();
    const title = stripHtml(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).slice(0, 500);
    const h1 = stripHtml(matchFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)).slice(0, 500);
    const description = metaDescription(html).slice(0, 500);
    const text = stripHtml(html).slice(0, 20_000);
    if (!text && !title) throw new Error("Empty HTML evidence");
    return { finalUrl: response.url || url, statusCode: response.status, title, h1, description, text };
  } finally {
    clearTimeout(timer);
  }
}

function extractAddresses(value) {
  const matches = String(value || "").match(/[臺台]北市信義區[^,，。;；\n]{0,90}?\d+(?:之\d+)?號(?:[^,，。;；\n]{0,24})?/g) || [];
  return [...new Set(matches.map((match) => match.replace(/\s+/g, " ").trim().slice(0, 120)))].slice(0, 5);
}

function entityTokens(name) {
  const source = String(name || "").replace(/[（(].*?[）)]/g, " ").replace(/台北|臺北|信義區|信義店|餐廳|美食|旗艦店|店$/g, " ");
  return [...new Set(source.split(/[－—–|｜／/,:：·・\s]+/).map((value) => value.trim()).filter((value) => {
    if (/^[\u3400-\u9fff]+$/.test(value)) return value.length >= 2;
    return /[a-z]/i.test(value) && value.replace(/[^a-z0-9]/gi, "").length >= 3;
  }))].slice(0, 8);
}

function normalize(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ""); }
function safeDomain(value) { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function matchFirst(source, pattern) { return String(source || "").match(pattern)?.[1] || ""; }
function metaDescription(source) {
  for (const tag of String(source || "").match(/<meta\b[^>]*>/gi) || []) {
    if (/\bname\s*=\s*["']description["']/i.test(tag)) return stripHtml(tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || "");
  }
  return "";
}
function stripHtml(value) {
  return String(value || "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'").replace(/\s+/g, " ").trim();
}
function leadUrls(row) { return [row.lead_1_url, row.lead_2_url, row.lead_3_url].map((value) => String(value || "").trim()).filter(Boolean); }
function readJsonl(file) { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => { const values = parseCsvLine(line); return Object.fromEntries(header.map((key, index) => [key, values[index] || ""])); });
}
function parseCsvLine(line) {
  const values = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(value); value = ""; } else value += char; }
  values.push(value); return values;
}
async function runPool(items, size, worker) { let index = 0; async function next() { while (index < items.length) await worker(items[index++]); } await Promise.all(Array.from({ length: Math.min(size, items.length) }, next)); }
function parseArgs(tokens) { const parsed = {}; for (let index = 0; index < tokens.length; index += 1) { if (!tokens[index].startsWith("--")) continue; const key = tokens[index].slice(2); const next = tokens[index + 1]; if (!next || next.startsWith("--")) parsed[key] = true; else { parsed[key] = next; index += 1; } } return parsed; }
function required(values, key) { if (values[key] === undefined) throw new Error(`Missing required --${key}`); return values[key]; }
