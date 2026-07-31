#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = parseArgs(process.argv.slice(2));
const input = path.resolve(required(args, "input"));
const outputDir = path.resolve(required(args, "output-dir"));
fs.mkdirSync(outputDir, { recursive: true });

const jsonlPath = path.join(outputDir, "tfda-xinyi-dining-registry.jsonl");
const csvPath = path.join(outputDir, "tfda-xinyi-dining-registry.csv");
const summaryPath = path.join(outputDir, "tfda-filter-summary.json");
fs.writeFileSync(jsonlPath, "", "utf8");

const csvRows = [];
const registrations = new Set();
const addresses = new Set();
let totalRows = 0;
let xinyiRows = 0;
let diningRows = 0;
let parseFailures = 0;

for await (const objectText of streamJsonArrayObjects(input)) {
  totalRows += 1;
  let row;
  try {
    row = JSON.parse(objectText);
  } catch {
    parseFailures += 1;
    continue;
  }
  const address = String(row["業者地址"] || "");
  if (!/(臺|台)北市信義區/.test(address)) continue;
  xinyiRows += 1;
  if (String(row["登錄項目"] || "") !== "餐飲場所") continue;
  diningRows += 1;
  registrations.add(String(row["食品業者登錄字號"] || ""));
  addresses.add(address);
  fs.appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`, "utf8");
  csvRows.push(row);
}

fs.writeFileSync(csvPath, toCsv(csvRows), "utf8");
const summary = {
  source_file: path.basename(input),
  source_sha256: sha256(input),
  filtered_at: new Date().toISOString(),
  filter: {
    address_regex: "(臺|台)北市信義區",
    registration_item_equals: "餐飲場所"
  },
  total_rows_streamed: totalRows,
  xinyi_rows_all_registration_items: xinyiRows,
  xinyi_dining_rows: diningRows,
  distinct_registration_numbers: registrations.size,
  distinct_addresses: addresses.size,
  parse_failures: parseFailures,
  outputs: {
    jsonl: path.basename(jsonlPath),
    csv: path.basename(csvPath)
  },
  output_sha256: {
    jsonl: sha256(jsonlPath),
    csv: sha256(csvPath)
  }
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));

async function* streamJsonArrayObjects(file) {
  const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  let started = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buffer = "";
  for await (const chunk of stream) {
    for (const char of chunk) {
      if (!started) {
        if (char === "{") {
          started = true;
          depth = 1;
          buffer = "{";
        }
        continue;
      }
      buffer += char;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          yield buffer;
          started = false;
          buffer = "";
        }
      }
    }
  }
  if (started || depth !== 0) throw new Error("Input ended inside a JSON object; source is incomplete.");
}

function toCsv(rows) {
  const columns = ["公司或商業登記名稱", "公司統一編號", "業者地址", "食品業者登錄字號", "登錄項目"];
  return `\uFEFF${columns.join(",")}\r\n${rows.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\r\n")}\r\n`;
}

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
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
