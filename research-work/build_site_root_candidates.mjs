#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const [verificationJsonl, outputCsv, outputSummary] = process.argv.slice(2);
if (!verificationJsonl || !outputCsv || !outputSummary) throw new Error("Usage: node build_site_root_candidates.mjs <verification.jsonl> <output.csv> <summary.json>");
const rows = readJsonl(verificationJsonl).filter((row) => row.verification_status === "brand_evidence_observed" && row.selected_domain);
const groups = new Map();
for (const row of rows) {
  const entry = groups.get(row.selected_domain) || { domain: row.selected_domain, urls: new Set(), candidateIds: [], candidateNames: [] };
  entry.urls.add(row.selected_final_url || row.selected_url);
  entry.candidateIds.push(row.candidate_id);
  entry.candidateNames.push(row.candidate_name);
  groups.set(row.selected_domain, entry);
}
const knownGroupRoots = new Set(["buckskinrestaurantgroup.com.tw", "elite-concepts.com", "paradisegp.com", "shinyeh.com.tw", "starfishconcept.com"]);
const outputRows = [...groups.values()].sort((a, b) => a.domain.localeCompare(b.domain)).map((entry) => ({
  root_url: rootUrl([...entry.urls][0]),
  root_domain: entry.domain,
  mapped_candidate_count: entry.candidateIds.length,
  candidate_ids: entry.candidateIds.join("|"),
  candidate_names: entry.candidateNames.join("|"),
  shared_domain_group: entry.candidateIds.length > 1 || knownGroupRoots.has(entry.domain),
  measurement_scope_status: knownGroupRoots.has(entry.domain) ? "shared_parent_or_group_root_needs_author_scope_decision" : entry.candidateIds.length > 1 ? "shared_brand_root_measure_once" : "single_brand_root_candidate",
  measurement_eligibility: "pending_final_store_sample_and_human_review",
  evidence_urls: [...entry.urls].join("|")
}));
fs.writeFileSync(outputCsv, toCsv(outputRows), "utf8");
const inputHash = sha256(fs.readFileSync(outputCsv));
const summary = {
  generated_at: new Date().toISOString(),
  verified_candidate_rows: rows.length,
  unique_root_domains: outputRows.length,
  shared_domain_rows: outputRows.filter((row) => row.shared_domain_group).length,
  measurement_status: "not_frozen_no_ai_calls_authorized",
  provisional_perplexity_calls_if_all_included: outputRows.length * 3,
  provisional_gemini_calls_if_all_included: outputRows.length,
  csv_sha256: inputHash
};
fs.writeFileSync(outputSummary, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));

function rootUrl(value) { try { const url = new URL(value); return `${url.protocol}//${url.host}/`; } catch { return ""; } }
function readJsonl(file) { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
function toCsv(values) { const columns = Object.keys(values[0]); return `\uFEFF${columns.join(",")}\r\n${values.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\r\n")}\r\n`; }
function csvValue(value) { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
