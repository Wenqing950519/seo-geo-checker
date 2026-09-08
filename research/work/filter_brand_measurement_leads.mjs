#!/usr/bin/env node
import fs from "node:fs";

const [registerPath, outputPath] = process.argv.slice(2);
if (!registerPath || !outputPath) throw new Error("Usage: node filter_brand_measurement_leads.mjs <register.csv> <output.csv>");

const rows = readCsv(registerPath).filter((row) => row.source_type === "brand_owned_candidate");
const grouped = new Map();
for (const row of rows) {
  const entry = grouped.get(row.candidate_id) || { candidate_id: row.candidate_id, candidate_name: row.candidate_name, urls: [] };
  if (!entry.urls.includes(row.evidence_url)) entry.urls.push(row.evidence_url);
  grouped.set(row.candidate_id, entry);
}

const outputRows = [...grouped.values()].map((entry) => ({
  candidate_id: entry.candidate_id,
  candidate_name: entry.candidate_name,
  lead_1_url: entry.urls[0] || "",
  lead_2_url: entry.urls[1] || "",
  lead_3_url: entry.urls[2] || ""
}));
fs.writeFileSync(outputPath, toCsv(outputRows), "utf8");
console.log(JSON.stringify({ candidates: outputRows.length, planned_max_fetches: outputRows.reduce((sum, row) => sum + [row.lead_1_url, row.lead_2_url, row.lead_3_url].filter(Boolean).length, 0) }, null, 2));

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
