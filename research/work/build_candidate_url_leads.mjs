#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(required(args, "input"));
const outputPath = path.resolve(required(args, "output"));
const latest = [...new Map(readJsonl(inputPath).map((row) => [row.candidate_id, row])).values()]
  .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

const rows = latest.map((row) => {
  const leads = (row.results || [])
    .map((result) => ({ ...result, domain: safeDomain(result.url) }))
    .filter((result) => result.domain && !isExcluded(result.domain))
    .slice(0, 3);
  return {
    candidate_id: row.candidate_id,
    candidate_name: row.candidate_name,
    search_status: row.status,
    lead_count: leads.length,
    lead_1_url: leads[0]?.url || "",
    lead_1_domain: leads[0]?.domain || "",
    lead_1_title: leads[0]?.title || "",
    lead_2_url: leads[1]?.url || "",
    lead_2_domain: leads[1]?.domain || "",
    lead_2_title: leads[1]?.title || "",
    lead_3_url: leads[2]?.url || "",
    lead_3_domain: leads[2]?.domain || "",
    lead_3_title: leads[2]?.title || "",
    verification_status: leads.length ? "needs_direct_verification" : "no_nonplatform_lead",
    reviewer: "",
    notes: ""
  };
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, toCsv(rows), "utf8");
const counts = rows.reduce((acc, row) => {
  acc[row.verification_status] = (acc[row.verification_status] || 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ rows: rows.length, counts }, null, 2));

function isExcluded(domain) {
  const excluded = [
    "tripadvisor.", "trip.com", "ifoodie.tw", "facebook.com", "instagram.com", "threads.net",
    "opentable.", "inline.app", "eztable.", "klook.com", "kkday.com", "ubereats.", "foodpanda.",
    "openrice.com", "fonfood.com", "walkerland.com.tw", "spot.line.me", "pixnet.net", "vocus.cc",
    "gomaji.com", "niniyeh.com", "tenjo.tw", "eggie.tw", "anise.tw", "upssmile.com",
    "stancylife.com", "marieclaire.com.tw", "harpersbazaar.com", "kenalice.tw",
    "globalfoodelicious.com", "lordcat.net", "nash.tw", "blaketravel.tw", "footinder.com.tw",
    "busy.tw", "google.", "maps.", "youtube.com", "wikipedia.org", "travel.taipei",
    "tisshuang.tw", "taitaitaiwan.com", "bunnyann.com", "suni.tw", "niusnews.com",
    "ettoday.net", "udn.com", "setn.com", "yahoo.com", "dcard.tw", "ptt.cc"
  ];
  return excluded.some((value) => domain.includes(value));
}

function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function safeDomain(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
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
