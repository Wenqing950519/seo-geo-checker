#!/usr/bin/env node
import fs from "node:fs";

const [candidatesCsv, searchJsonl, outputCsv] = process.argv.slice(2);
if (!candidatesCsv || !searchJsonl || !outputCsv) throw new Error("Usage: node extract_booking_social_leads.mjs <candidates.csv> <search.jsonl> <output.csv>");
const candidates = new Map(readCsv(candidatesCsv).map((row) => [row.candidate_id, row]));
const searchRows = readJsonl(searchJsonl);
const accepted = [
  "inline.app", "tablecheck.com", "facebook.com", "instagram.com", "rsv.skm.com.tw", "oddle.me",
  "opentable.com", "opentable.com.tw", "eztable.com", "shop.ichefpos.com", "linktr.ee"
];
const rows = [];
for (const search of searchRows) {
  if (search.status !== "success") continue;
  const urls = [];
  for (const result of search.results || []) {
    const domain = safeDomain(result.url);
    if (!accepted.some((value) => domain === value || domain.endsWith(`.${value}`))) continue;
    if (!urls.includes(result.url)) urls.push(result.url);
  }
  if (!urls.length) continue;
  const candidate = candidates.get(search.candidate_id);
  rows.push({
    candidate_id: search.candidate_id,
    candidate_name: candidate?.candidate_name || search.candidate_name,
    lead_1_url: urls[0] || "",
    lead_2_url: urls[1] || "",
    lead_3_url: urls[2] || "",
    source_tier: "official_social_or_booking_candidate_requires_direct_confirmation"
  });
}
fs.writeFileSync(outputCsv, toCsv(rows), "utf8");
console.log(JSON.stringify({ candidates_with_social_or_booking_leads: rows.length, planned_max_fetches: rows.reduce((sum, row) => sum + [row.lead_1_url, row.lead_2_url, row.lead_3_url].filter(Boolean).length, 0) }, null, 2));

function safeDomain(value) { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
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
function toCsv(values) { const columns = Object.keys(values[0]); return `\uFEFF${columns.join(",")}\r\n${values.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\r\n")}\r\n`; }
function csvValue(value) { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
