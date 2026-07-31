#!/usr/bin/env node
import fs from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Usage: node summarize_ranked_domains.mjs <ranked.csv>");

const rows = readCsv(file);
const domains = new Map();
for (const row of rows) {
  for (let index = 1; index <= 3; index += 1) {
    const domain = row[`lead_${index}_domain`];
    const score = Number(row[`lead_${index}_score`]);
    if (!domain || score < 5) continue;
    const entry = domains.get(domain) || { domain, score, names: new Set(), urls: new Set() };
    entry.score = Math.max(entry.score, score);
    entry.names.add(row.candidate_name);
    entry.urls.add(row[`lead_${index}_url`]);
    domains.set(domain, entry);
  }
}

for (const entry of [...domains.values()].sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain))) {
  console.log(`${entry.score}\t${entry.domain}\t${[...entry.names].join("｜")}`);
}
console.error(`unique\t${domains.size}`);

function readCsv(path) {
  const lines = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
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
