#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const candidates = readCsv(path.resolve(required(args, "candidates")));
const verification = [...new Map(readJsonl(path.resolve(required(args, "verification"))).map((row) => [row.candidate_id, row])).values()];
const byId = new Map(verification.map((row) => [row.candidate_id, row]));
const outputPath = path.resolve(required(args, "output"));
const reviewPath = path.resolve(required(args, "review-output"));

const review = candidates.map((candidate) => {
  const observed = byId.get(candidate.candidate_id);
  const domain = observed?.selected_domain || "";
  const reason = officialConfidenceReason(candidate.candidate_name, domain);
  return {
    candidate_id: candidate.candidate_id,
    candidate_name: candidate.candidate_name,
    observed_domain: domain,
    observed_url: observed?.selected_final_url || observed?.selected_url || "",
    observed_status: observed?.verification_status || "not_checked",
    high_confidence_official_lead: Boolean(reason),
    confidence_reason: reason || "needs_stricter_search"
  };
});

const unresolvedIds = new Set(review.filter((row) => !row.high_confidence_official_lead).map((row) => row.candidate_id));
const unresolved = candidates.filter((row) => unresolvedIds.has(row.candidate_id));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, toCsv(unresolved), "utf8");
fs.writeFileSync(reviewPath, toCsv(review), "utf8");
console.log(JSON.stringify({ total: candidates.length, high_confidence_leads: candidates.length - unresolved.length, round2_candidates: unresolved.length }, null, 2));

function officialConfidenceReason(name, domain) {
  if (!domain || isNonOfficial(domain)) return "";
  const trusted = [
    "skm.com.tw", "rsv.skm.com.tw", "breeze.com.tw", "bellavita.com.tw", "taipei-101.com.tw",
    "hyatt.com", "grandhyatttaipei.com", "marriott.com", "humblehousehotels.com", "eslitehotel.com",
    "mitsui-shopping-park.com.tw", "uni-ustyle.com.tw", "dreamplaza.com.tw",
    "shilingshabu.com", "apointsteak.com.tw", "indianfoodtaiwan.com", "inparadise.com.tw",
    "meatlove.tw", "saffron46.com", "karenteppanyaki.com", "jkstudio.tw", "twgtea.com",
    "dimdimsum.tw", "seatosky.com.tw", "buckskinrestaurantgroup.com.tw", "mirawan.com.tw",
    "ukai.co.jp", "elite-concepts.com"
  ];
  if (trusted.some((value) => domain === value || domain.endsWith(`.${value}`))) return "curated_brand_or_venue_domain";
  const domainKey = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const tokens = latinTokens(name);
  if (domainKey.length >= 5 && tokens.some((token) => token.includes(domainKey) || domainKey.includes(token))) return "brand_token_matches_domain";
  return "";
}

function latinTokens(name) {
  return String(name || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !["taipei", "restaurant", "kitchen", "cafe", "hotel"].includes(token));
}

function isNonOfficial(domain) {
  const values = [
    "blog", "foodie", "travel", "trip", "wanderlog", "tabelog", "tablecheck", "mobile01", "17life",
    "elle.com", "gq.com", "cosmopolitan", "ltn.com.tw", "fashionguide", "easytravel", "yam.com",
    "greenmedia", "boncity", "bitesize", "wingontravel", "yelp", "zeczec", "bella.tw",
    "anikofoodie", "mecocute", "carp0729", "windiewang", "hansphoto", "eztripplan",
    "achingfoodie", "bigfang", "dorapig", "brianviews", "47life", "banbi", "haohui2017",
    "jingxuan", "cinnachic", "foodieteller", "winentaste", "tiffany0118", "sosense",
    "dianachen0818", "yedistyle", "caocaoluveat", "playing.ltn", "yaya.tw"
  ];
  return values.some((value) => domain.includes(value));
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
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function toCsv(rows) {
  const columns = Object.keys(rows[0]);
  return `\uFEFF${columns.join(",")}\r\n${rows.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\r\n")}\r\n`;
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
