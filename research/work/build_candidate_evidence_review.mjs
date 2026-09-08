#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const candidates = readCsv(path.resolve(required(args, "candidates")));
const registry = readJsonl(path.resolve(required(args, "registry-jsonl")));
const tfdaLeads = readCsv(path.resolve(required(args, "tfda-leads")));
const brandVerification = readJsonl(path.resolve(required(args, "brand-verification")));
const detailSources = String(required(args, "detail-jsonl"))
  .split(";")
  .map((entry) => {
    const [role, file] = entry.split("=");
    return { role, rows: readJsonl(path.resolve(file)) };
  });

const registryByAddressBase = new Map();
for (const row of registry) {
  const base = addressBase(row["業者地址"]);
  if (!base) continue;
  const bucket = registryByAddressBase.get(base) || [];
  bucket.push(row);
  registryByAddressBase.set(base, bucket);
}
const tfdaById = groupBy(tfdaLeads, "candidate_id");
const brandById = new Map(brandVerification.map((row) => [row.candidate_id, row]));
const detailsByRole = new Map(detailSources.map((source) => [source.role, new Map(source.rows.map((row) => [row.candidate_id, row]))]));
const roleOrder = ["brand", "support", "booking", "round2", "round1"];
const sharedGroupDomains = new Set(["buckskinrestaurantgroup.com.tw", "elite-concepts.com", "paradisegp.com", "shinyeh.com.tw", "starfishconcept.com"]);

const outputRows = candidates.map((candidate) => {
  const observations = roleOrder.flatMap((role) => {
    const row = detailsByRole.get(role)?.get(candidate.candidate_id);
    return row ? [{ role, row }] : [];
  });
  const matched = observations.filter(({ row }) => row.detail_status === "name_matched_page_observed");
  const addresses = [...new Set(matched.flatMap(({ row }) => row.addresses_observed || []).map(addressBase).filter(Boolean))];
  const registryMatches = addresses.flatMap((base) => (registryByAddressBase.get(base) || []).map((record) => ({ base, record })));
  const strongTfda = (tfdaById.get(candidate.candidate_id) || []).filter((row) => row.match_status === "strong_name_lead_needs_manual_confirmation");
  const brand = brandById.get(candidate.candidate_id);
  const domain = brand?.verification_status === "brand_evidence_observed" ? brand.selected_domain : "";
  const matchedRoles = [...new Set(matched.map(({ role }) => role))];
  const districtObserved = matched.some(({ row }) => row.district_observed);
  const dineLanguageObserved = matched.some(({ row }) => row.dine_in_language_observed);
  const closureLanguageObserved = matched.some(({ row }) => row.closure_language_observed);
  const bestStatus = reviewStatus({ matchedRoles, addresses, registryMatches, strongTfda, districtObserved, dineLanguageObserved });
  return {
    candidate_id: candidate.candidate_id,
    candidate_name: candidate.candidate_name,
    initial_cuisine: candidate.initial_cuisine,
    initial_business_type: candidate.initial_business_type,
    initial_price_band: candidate.initial_price_band,
    initial_priority: candidate.initial_priority,
    observed_source_roles: matchedRoles.join("|"),
    observed_address_bases: addresses.join("|"),
    district_language_observed: districtObserved,
    dine_in_language_observed: dineLanguageObserved,
    closure_language_observed: closureLanguageObserved,
    tfda_exact_address_match_count: registryMatches.length,
    tfda_exact_address_registered_names: [...new Set(registryMatches.map(({ record }) => record["公司或商業登記名稱"]))].slice(0, 12).join("|"),
    tfda_strong_name_lead_count: strongTfda.length,
    tfda_strong_name_addresses: [...new Set(strongTfda.map((row) => row.address).filter(Boolean))].join("|"),
    provisional_brand_domain: domain,
    measurement_domain_status: domain ? (sharedGroupDomains.has(domain) ? "shared_group_root_needs_manual_scope_decision" : "brand_root_candidate_needs_manual_confirmation") : "no_confirmed_brand_root",
    review_status: bestStatus,
    eligibility_decision: "pending_human_review",
    exclusion_reason_code: "",
    reviewer: "",
    evidence_boundary: "Automated joins create review leads only; they do not establish current operation, dine-in eligibility, or official ownership."
  };
});

const output = path.resolve(required(args, "output"));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, toCsv(outputRows), "utf8");
const counts = outputRows.reduce((acc, row) => {
  acc[row.review_status] = (acc[row.review_status] || 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ candidates: outputRows.length, review_status_counts: counts, with_provisional_brand_domain: outputRows.filter((row) => row.provisional_brand_domain).length }, null, 2));

function reviewStatus(values) {
  const hasHigherTier = values.matchedRoles.includes("brand") || values.matchedRoles.includes("support") || values.matchedRoles.includes("booking");
  if (hasHigherTier && values.addresses.length && values.registryMatches.length && values.dineLanguageObserved) return "ready_for_manual_eligibility_review";
  if (hasHigherTier && values.districtObserved && values.dineLanguageObserved) return "higher_tier_page_observed_address_crosscheck_needed";
  if (values.addresses.length && values.registryMatches.length) return "government_address_crosscheck_lead";
  if (values.strongTfda.length) return "government_name_lead_needs_store_identity_review";
  if (values.matchedRoles.includes("round2") || values.matchedRoles.includes("round1")) return "third_party_page_lead_only";
  return "source_gap";
}

function addressBase(value) {
  const match = String(value || "").replace(/臺/g, "台").replace(/\s+/g, "").match(/台北市信義區[^,，。;；\n]{0,80}?\d+(?:之\d+)?號/i);
  return match ? match[0].toLowerCase() : "";
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) { const bucket = map.get(row[key]) || []; bucket.push(row); map.set(row[key], bucket); }
  return map;
}

function readJsonl(file) { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => { const values = parseCsvLine(line); return Object.fromEntries(header.map((key, index) => [key, values[index] || ""])); });
}
function parseCsvLine(line) {
  const values = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(value); value = ""; } else value += char; }
  values.push(value); return values;
}
function toCsv(values) { const columns = Object.keys(values[0]); return `\uFEFF${columns.join(",")}\r\n${values.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\r\n")}\r\n`; }
function csvValue(value) { const text = value === null || value === undefined ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function parseArgs(tokens) { const parsed = {}; for (let index = 0; index < tokens.length; index += 1) { if (!tokens[index].startsWith("--")) continue; const key = tokens[index].slice(2); const next = tokens[index + 1]; if (!next || next.startsWith("--")) parsed[key] = true; else { parsed[key] = next; index += 1; } } return parsed; }
function required(values, key) { if (values[key] === undefined) throw new Error(`Missing required --${key}`); return values[key]; }
