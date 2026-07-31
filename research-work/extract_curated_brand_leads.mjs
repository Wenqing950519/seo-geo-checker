#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const candidates = readCsv(path.resolve(required(args, "candidates")));
const searchRows = String(required(args, "search-jsonl")).split(";").flatMap((file) => readJsonl(path.resolve(file)));
const byId = new Map();
for (const row of searchRows) {
  const bucket = byId.get(row.candidate_id) || [];
  bucket.push(...(row.results || []));
  byId.set(row.candidate_id, bucket);
}

const allowlist = new Set([
  "85td-101.com", "apointsteak.com.tw", "bencuisine.com", "bheartnoodles.com",
  "buckskinrestaurantgroup.com.tw", "dcl1976.com", "dimdimsum.tw", "dingxian.com.tw",
  "dintaifung.com.tw", "eatogether.com.tw", "elite-concepts.com", "heyahh.com.tw",
  "honke.kurogeya.com.tw", "hooters.com.tw", "hostshabu.com", "hostshabu.com.tw",
  "ichiran.com.tw", "indianfoodtaiwan.com", "inparadise.com.tw", "jkstudio.tw", "joycecafetw.com",
  "kaifun.com.tw", "kanpaiclassic.com.tw", "karenteppanyaki.com", "khanakhazana.com.tw",
  "lawrys.com.tw", "lebledor.com", "meatlove.tw", "mirawan.com.tw", "onerule.com.tw",
  "osteria.com.tw", "dazhi.osteria.com.tw", "xinyi.osteria.com.tw", "paradisegp.com",
  "rice1923.com", "ricebar.com.tw", "saffron46.com", "seatosky.com.tw", "shilingshabu.com",
  "shinyeh.com.tw", "siammore.com.tw", "smithandwollensky.com.tw", "starfishconcept.com",
  "subway.com.tw", "tamedfox.com", "texasroadhouse.com.tw", "tgifridays.com.tw", "thaitown.com.tw",
  "tw.celavi.com", "twgtea.com", "ukai.co.jp", "verythai.com.tw", "wildwood.com.tw",
  "woolloomooloo.tw", "zonzen.com.tw", "lao-jing.com"
]);

const manualLeads = new Map([
  ["003", ["https://www.apointsteak.com.tw/"]],
  ["009", ["https://www.indianfoodtaiwan.com/zh"]],
  ["022", ["https://tw.celavi.com/"]],
  ["024", ["https://www.kanpaiclassic.com.tw/zh/branch"]],
  ["037", ["http://karenteppanyaki.com/"]],
  ["039", ["https://www.paradisegp.com/tc/tw/"]],
  ["053", ["https://www.elite-concepts.com/zh-hk/our-concepts/taipei/ye-shanghai/"]],
  ["076", ["https://www.kaifun.com.tw/zh-TW/home"]],
  ["081", ["https://www.dimdimsum.tw/pages/store-info"]],
  ["100", ["https://www.heyahh.com.tw/collections/prawn-keelungroad"]],
  ["106", ["https://www.honke.kurogeya.com.tw/zh/branch"]],
  ["129", ["https://www.bencuisine.com/"]],
  ["139", ["https://www.lao-jing.com/"]],
  ["140", ["https://tamedfox.com/"]]
]);

const rows = [];
for (const candidate of candidates) {
  const urls = [];
  for (const result of byId.get(candidate.candidate_id) || []) {
    const domain = safeDomain(result.url);
    if (allowlist.has(domain) && !urls.includes(result.url)) urls.push(result.url);
  }
  for (const url of manualLeads.get(candidate.candidate_id) || []) {
    if (!urls.includes(url)) urls.unshift(url);
  }
  if (!urls.length) continue;
  rows.push({
    candidate_id: candidate.candidate_id,
    candidate_name: candidate.candidate_name,
    lead_1_url: urls[0] || "",
    lead_2_url: urls[1] || "",
    lead_3_url: urls[2] || "",
    curation_status: "provisional_brand_owned_domain_requires_direct_confirmation"
  });
}

const output = path.resolve(required(args, "output"));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, toCsv(rows), "utf8");
console.log(JSON.stringify({ candidates_with_curated_brand_leads: rows.length, planned_max_fetches: rows.reduce((sum, row) => sum + [row.lead_1_url, row.lead_2_url, row.lead_3_url].filter(Boolean).length, 0) }, null, 2));

function safeDomain(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
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
