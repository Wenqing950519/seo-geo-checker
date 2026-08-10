#!/usr/bin/env node
import fs from "node:fs";

const [candidateCsv, verifiedJsonl, outputCsv] = process.argv.slice(2);
if (!candidateCsv || !verifiedJsonl || !outputCsv) throw new Error("Usage: node prepare_brand_core_search.mjs <candidates.csv> <verified.jsonl> <output.csv>");

const candidates = readCsv(candidateCsv);
const verifiedIds = new Set(readJsonl(verifiedJsonl).filter((row) => row.verification_status === "brand_evidence_observed").map((row) => row.candidate_id));
for (const id of ["003", "009", "024", "037", "039", "053", "075", "076", "081", "100", "106", "129", "139"]) verifiedIds.add(id);

const rows = candidates.filter((row) => !verifiedIds.has(row.candidate_id)).map((row) => ({
  candidate_id: row.candidate_id,
  candidate_name: brandCore(row.candidate_name),
  source_candidate_name: row.candidate_name
}));
fs.writeFileSync(outputCsv, toCsv(rows), "utf8");
console.log(JSON.stringify({ input_candidates: candidates.length, excluded_with_brand_lead: verifiedIds.size, search_candidates: rows.length }, null, 2));

function brandCore(value) {
  return String(value || "")
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/－.*$/g, " ")
    .replace(/(?:台北|臺北)?信義(?:新光|威秀|遠百|微風|統一時代)?(?:A\d+)?(?:店|館)?/g, " ")
    .replace(/(?:微風南山|微風信義|新光三越|統一時代|松山車站|遠百信義A13|Neo19|Taipei 101)/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || String(value || "").trim();
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
