#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const candidates = readCsv(path.resolve(required(args, "candidates")));
const sourceFiles = String(required(args, "search-jsonl")).split(";").map((value) => path.resolve(value));
const searchRows = sourceFiles.flatMap(readJsonl);
const resultsById = new Map();
for (const row of searchRows) {
  const bucket = resultsById.get(row.candidate_id) || [];
  bucket.push(...(row.results || []));
  resultsById.set(row.candidate_id, bucket);
}

const rows = candidates.map((candidate) => {
  const seen = new Set();
  const ranked = (resultsById.get(candidate.candidate_id) || [])
    .filter((result) => {
      const key = String(result.url || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((result) => ({ ...result, domain: safeDomain(result.url), official_score: scoreResult(candidate.candidate_name, result) }))
    .filter((result) => result.official_score >= 4)
    .sort((a, b) => b.official_score - a.official_score || Number(a.rank || 99) - Number(b.rank || 99))
    .slice(0, 3);
  return {
    candidate_id: candidate.candidate_id,
    candidate_name: candidate.candidate_name,
    lead_count: ranked.length,
    lead_1_url: ranked[0]?.url || "",
    lead_1_domain: ranked[0]?.domain || "",
    lead_1_title: ranked[0]?.title || "",
    lead_1_score: ranked[0]?.official_score ?? "",
    lead_2_url: ranked[1]?.url || "",
    lead_2_domain: ranked[1]?.domain || "",
    lead_2_title: ranked[1]?.title || "",
    lead_2_score: ranked[1]?.official_score ?? "",
    lead_3_url: ranked[2]?.url || "",
    lead_3_domain: ranked[2]?.domain || "",
    lead_3_title: ranked[2]?.title || "",
    lead_3_score: ranked[2]?.official_score ?? "",
    verification_status: ranked.length ? "ranked_official_lead_needs_direct_verification" : "no_ranked_official_lead"
  };
});

const outputPath = path.resolve(required(args, "output"));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, toCsv(rows), "utf8");
const counts = rows.reduce((acc, row) => {
  acc[row.verification_status] = (acc[row.verification_status] || 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ total: rows.length, counts }, null, 2));

function scoreResult(name, result) {
  const domain = safeDomain(result.url);
  if (!domain || isNonOfficial(domain)) return -100;
  const title = String(result.title || "");
  const description = String(result.description || "");
  const evidence = `${title} ${description}`;
  let score = 0;
  if (/官方網站|官方網頁|官方訂位|首頁\s*[|｜-]|餐廳據點|門市據點|分店資訊|locations?|stores?|our restaurants?/i.test(evidence)) score += 5;
  if (/網友評價|食記|攻略|懶人包|必吃|優惠|評論|附近|食評|開箱|推薦\d|top\s*\d|旅遊|部落格/i.test(title)) score -= 5;
  const tokens = entityTokens(name);
  const normalizedEvidence = normalizeText(evidence);
  const tokenMatches = tokens.filter((token) => normalizedEvidence.includes(normalizeText(token))).length;
  score += Math.min(tokenMatches, 2) * 2;
  const domainKey = domain.replace(/\.(com|net|org|co|tw|jp|me|shop|asia).*$/i, "").replace(/[^a-z0-9]/gi, "");
  const latin = latinTokens(name);
  if (domainKey.length >= 4 && latin.some((token) => token.includes(domainKey) || domainKey.includes(token))) score += 5;
  if (isTrustedVenueDomain(domain)) score += 5;
  if (/\/(store|stores|shop|shops|branch|branches|restaurant|restaurants|dining|brand|location|locations)\b/i.test(String(result.url || ""))) score += 1;
  return score;
}

function entityTokens(name) {
  const source = String(name || "").replace(/[（(].*?[）)]/g, " ").replace(/台北|臺北|信義區|信義店|餐廳|美食|旗艦店|店$/g, " ");
  return [...new Set(source.split(/[－—–|｜／/,:：·・\s]+/).map((value) => value.trim()).filter((value) => {
    if (/^[\u3400-\u9fff]+$/.test(value)) return value.length >= 2;
    return /[a-z]/i.test(value) && value.replace(/[^a-z0-9]/gi, "").length >= 3;
  }))].slice(0, 8);
}

function latinTokens(name) {
  return String(name || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !["taipei", "restaurant", "kitchen", "cafe", "hotel"].includes(token));
}

function isTrustedVenueDomain(domain) {
  const values = [
    "skm.com.tw", "bellavita.com.tw", "breeze.com.tw", "taipei-101.com.tw", "citylink.tw",
    "uni-ustyle.com.tw", "hyatt.com", "marriott.com", "humblehousehotels.com",
    "lemeridien-taipei.com", "regenttaiwan.com", "eslitehotel.com", "grandhilai.com",
    "hilton.com", "ihg.com", "tablecheck.com", "oddle.me"
  ];
  return values.some((value) => domain === value || domain.endsWith(`.${value}`));
}

function isNonOfficial(domain) {
  const values = [
    "tripadvisor", "trip.com", "ifoodie", "facebook", "instagram", "threads.net", "opentable",
    "inline.app", "eztable", "klook", "kkday", "ubereats", "foodpanda", "openrice", "fonfood",
    "walkerland", "spot.line.me", "pixnet", "vocus", "gomaji", "niniyeh", "tenjo.tw",
    "eggie.tw", "anise.tw", "upssmile", "stancylife", "marieclaire", "harpersbazaar",
    "cosmopolitan", "gq.com", "elle.com", "mobile01", "tabelog", "wanderlog", "easytravel",
    "yam.com", "ltn.com.tw", "tvbs.com.tw", "vogue.com.tw", "medium.com", "shopee",
    "maggieblog", "bunnyann", "nash.tw", "wendyjourney", "travel", "foodie", "blog",
    "eattaipei", "findcoupon", "footinder", "wingontravel", "taiwantour", "taiwantour",
    "liontravel", "microsoft.com", "thehkhub", "bobowin", "bigfang", "47life", "blake.com.tw",
    "carollin", "jumpman", "oreo.blog", "greenmedia", "linktr.ee", "ddnews", "dailycheska",
    "nicklee", "whitneyblog", "viviyu", "sarychien", "kkmurmur", "mecocute", "hippolife",
    "wensgoodlife", "tiffany0118", "anikofoodie", "sylvia128", "charliegogogogo",
    "dianachen0818", "guide.", "17life", "eztripplan", "bitesize", "boncity", "yaya.tw"
  ];
  return values.some((value) => domain.includes(value));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function safeDomain(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
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
