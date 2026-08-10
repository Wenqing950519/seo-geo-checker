#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const rows = readCsv(path.resolve(required(args, "input")));
const output = path.resolve(required(args, "output"));

const brandOwnedCandidates = new Set([
  "85td-101.com", "bheartnoodles.com", "buckskinrestaurantgroup.com.tw", "dingxian.com.tw",
  "eatogether.com.tw", "hongkonghotpot.com", "hooters.com.tw", "hostshabu.com", "hostshabu.com.tw",
  "ichiran.com.tw", "inparadise.com.tw", "jkstudio.tw", "joycecafetw.com", "lawrys.com.tw",
  "lebledor.com", "meatlove.tw", "mirawan.com.tw", "onerule.com.tw", "osteria.com.tw",
  "rice1923.com", "ricebar.com.tw", "saffron46.com", "seatosky.com.tw", "shilingshabu.com",
  "shinyeh.com.tw", "siammore.com.tw", "smithandwollensky.com.tw", "starfishconcept.com",
  "subway.com.tw", "texasroadhouse.com.tw", "tgifridays.com.tw", "thaitown.com.tw", "twgtea.com",
  "ukai.co.jp", "verythai.com.tw", "wildwood.com.tw", "woolloomooloo.tw", "xinyi.osteria.com.tw",
  "dazhi.osteria.com.tw", "zonzen.com.tw"
]);

const officialVenueDomains = new Set([
  "bellavita.com.tw", "breeze.com.tw", "citylink.tw", "eslitehotel.com", "humblehousehotels.com",
  "hyatt.com", "lemeridien-taipei.com", "meet.eslite.com", "regenttaiwan.com", "rsv.skm.com.tw",
  "skm.com.tw", "taipei-101.com.tw", "uni-ustyle.com.tw"
]);

const bookingDomains = new Set([
  "autoreserve.com", "daantonio.oddle.me", "myfunnow.com", "paradisegrouptw.oddle.me",
  "shop.ichefpos.com", "tablecheck.com", "toppho-ruan.oddle.me", "wa10-thaitown.oddle.me"
]);

const knownThirdPartyDomains = new Set([
  "85td-chinese-restaurant.wheree.com", "bigpipi.tw", "bing.com", "carfun.tw", "casualrestaurants.com",
  "donna.tw", "eggrollcat.com", "fooday.app", "ialley.tw", "kenji.life", "khanakhazana.us",
  "panpanlife.com", "queeniej.com", "tatlerasia.com", "vegemap.merit-times.com", "wallacewang.tw",
  "weddingday.com.tw", "wowlavie.com", "xinmedia.com"
]);

const outputRows = [];
for (const row of rows) {
  let emitted = 0;
  for (let index = 1; index <= 3; index += 1) {
    const url = row[`lead_${index}_url`];
    const domain = row[`lead_${index}_domain`];
    if (!url || !domain) continue;
    emitted += 1;
    const sourceType = classify(domain);
    outputRows.push({
      candidate_id: row.candidate_id,
      candidate_name: row.candidate_name,
      lead_rank: index,
      evidence_url: url,
      root_domain: domain,
      search_score: row[`lead_${index}_score`],
      search_title: row[`lead_${index}_title`],
      source_type: sourceType,
      measurement_eligible: sourceType === "brand_owned_candidate" ? "pending_direct_confirmation" : "no",
      evidence_role: sourceType === "official_venue_page" ? "store_eligibility_only"
        : sourceType === "booking_platform" ? "supplementary_store_lead_only"
          : sourceType === "brand_owned_candidate" ? "candidate_for_site_measurement"
            : sourceType === "known_third_party" ? "discovery_lead_only" : "unresolved_lead_only",
      review_status: "not_yet_human_confirmed",
      notes: "Search result is a lead, not evidence. Direct page review is required."
    });
  }
  if (!emitted) {
    outputRows.push({
      candidate_id: row.candidate_id,
      candidate_name: row.candidate_name,
      lead_rank: "",
      evidence_url: "",
      root_domain: "",
      search_score: "",
      search_title: "",
      source_type: "no_ranked_lead",
      measurement_eligible: "no_data",
      evidence_role: "none",
      review_status: "requires_additional_source_search",
      notes: "No ranked lead was observed; this is not evidence that no official site exists."
    });
  }
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, toCsv(outputRows), "utf8");
const counts = outputRows.reduce((acc, row) => {
  acc[row.source_type] = (acc[row.source_type] || 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ candidates: rows.length, evidence_rows: outputRows.length, source_type_counts: counts }, null, 2));

function classify(domain) {
  if (brandOwnedCandidates.has(domain)) return "brand_owned_candidate";
  if (officialVenueDomains.has(domain)) return "official_venue_page";
  if (bookingDomains.has(domain)) return "booking_platform";
  if (knownThirdPartyDomains.has(domain)) return "known_third_party";
  return "unresolved_domain";
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
