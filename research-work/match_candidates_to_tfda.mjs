#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const candidates = readCsv(path.resolve(required(args, "candidates")));
const registry = readJsonl(path.resolve(required(args, "registry-jsonl")));
const output = path.resolve(required(args, "output"));

const rows = [];
for (const candidate of candidates) {
  const ranked = registry
    .map((record) => ({ record, ...scoreMatch(candidate.candidate_name, record["公司或商業登記名稱"]) }))
    .filter((entry) => entry.score >= 20)
    .sort((a, b) => b.score - a.score || a.record["公司或商業登記名稱"].localeCompare(b.record["公司或商業登記名稱"]))
    .slice(0, 5);
  if (!ranked.length) {
    rows.push(baseRow(candidate, null, "no_plausible_name_lead"));
    continue;
  }
  ranked.forEach((entry, index) => rows.push(baseRow(candidate, entry, entry.score >= 80 ? "strong_name_lead_needs_manual_confirmation" : "fuzzy_name_lead_needs_manual_confirmation", index + 1)));
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, toCsv(rows), "utf8");
const counts = rows.reduce((acc, row) => {
  acc[row.match_status] = (acc[row.match_status] || 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ candidates: candidates.length, output_rows: rows.length, status_counts: counts }, null, 2));

function baseRow(candidate, entry, status, rank = "") {
  return {
    candidate_id: candidate.candidate_id,
    candidate_name: candidate.candidate_name,
    match_rank: rank,
    match_score: entry?.score ?? "",
    matched_tokens: entry?.matchedTokens.join("|") || "",
    registered_name: entry?.record["公司或商業登記名稱"] || "",
    tax_id: entry?.record["公司統一編號"] || "",
    address: entry?.record["業者地址"] || "",
    food_business_registration_id: entry?.record["食品業者登錄字號"] || "",
    registration_item: entry?.record["登錄項目"] || "",
    match_status: status,
    reviewer_status: "pending_manual_review",
    evidence_boundary: "Name similarity creates a lead only; it does not prove candidate-store identity or current operation."
  };
}

function scoreMatch(candidateName, registeredName) {
  const candidate = normalize(candidateName);
  const registered = normalize(registeredName);
  const tokens = entityTokens(candidateName);
  const matchedTokens = tokens.filter((token) => registered.includes(normalize(token)));
  let score = 0;
  if (candidate.length >= 3 && registered.length >= 3 && (registered.includes(candidate) || candidate.includes(registered))) score += 100;
  score += matchedTokens.reduce((sum, token) => sum + Math.min(30, 10 + normalize(token).length * 4), 0);
  score += Math.round(diceCoefficient(candidate, registered) * 40);
  return { score, matchedTokens };
}

function entityTokens(value) {
  const source = String(value || "")
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/－.*$/g, " ")
    .replace(/台北|臺北|信義區|信義店|台灣|餐廳|分店|旗艦店|本店/g, " ");
  return [...new Set(source.split(/[－—–|｜／/,:：·・\s]+/).map((token) => token.trim()).filter((token) => {
    if (/^[\u3400-\u9fff]+$/.test(token)) return token.length >= 2;
    return /[a-z]/i.test(token) && token.replace(/[^a-z0-9]/gi, "").length >= 3;
  }))].slice(0, 8);
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/股份有限公司|有限公司|企業社|商行|小吃店|餐飲|商業/g, "").replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = new Map();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) || 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = counts.get(pair) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (a.length - 1 + b.length - 1);
}

function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
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

function toCsv(values) {
  const columns = Object.keys(values[0]);
  return `\uFEFF${columns.join(",")}\r\n${values.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\r\n")}\r\n`;
}

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
