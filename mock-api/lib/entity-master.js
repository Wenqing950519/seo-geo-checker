const fs = require("fs");
const { getRegistrableDomain, safeHostname } = require("./brand-match");

// 真值表（restaurant_master.csv）欄位契約。缺欄位時立即失敗，不得靜默略過。
const REQUIRED_COLUMNS = [
  "store_id", "brand_id", "official_name_zh", "official_name_en", "aliases",
  "official_domains", "owned_urls", "shared_domain_flag", "branch_name", "district",
  "include_status", "exclusion_reason_code", "reviewed_by", "reviewed_at",
  "truth_source", "dataset_version"
];
const INCLUDE_STATUSES = new Set(["included", "excluded", "pending"]);

function loadEntityMaster(csvPath) {
  const source = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("Entity master has no data rows");
  const header = parseCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) throw new Error(`Entity master is missing column: ${column}`);
  }
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(header.map((name, column) => [name, (values[column] || "").trim()]));
    if (!row.store_id) throw new Error(`Entity master row ${index + 2} is missing store_id`);
    if (!INCLUDE_STATUSES.has(row.include_status)) {
      throw new Error(`Entity master row ${row.store_id} has invalid include_status: ${row.include_status}`);
    }
    if (row.include_status === "excluded" && !row.exclusion_reason_code) {
      throw new Error(`Entity master row ${row.store_id} is excluded without exclusion_reason_code`);
    }
    return {
      ...row,
      aliases: splitList(row.aliases),
      official_domains: splitList(row.official_domains).map((domain) => safeDomain(domain)),
      owned_urls: splitList(row.owned_urls)
    };
  });

  const byDomain = new Map();
  for (const row of rows) {
    for (const domain of row.official_domains) {
      const registrable = getRegistrableDomain(domain);
      if (!registrable) continue;
      if (!byDomain.has(registrable)) byDomain.set(registrable, []);
      byDomain.get(registrable).push(row);
    }
  }
  const datasetVersion = rows[0]?.dataset_version || "unknown";
  return { rows, byDomain, datasetVersion };
}

// 依受測 URL 找對應真值列。共用網域（多品牌）時回報 sharedDomain，讓資料列可稽核。
function findEntityForUrl(master, url) {
  const host = safeHostname(url) || String(url || "").toLowerCase();
  const registrable = getRegistrableDomain(host);
  const candidates = master?.byDomain?.get(registrable) || [];
  if (!candidates.length) return null;
  const included = candidates.filter((row) => row.include_status === "included");
  const chosen = included[0] || candidates[0];
  return {
    row: chosen,
    sharedDomain: candidates.length > 1 || chosen.shared_domain_flag === "true" || chosen.shared_domain_flag === "1",
    candidateCount: candidates.length
  };
}

function buildEntityProfile(row, datasetVersion) {
  if (!row) return null;
  return {
    storeId: row.store_id,
    brandId: row.brand_id,
    includeStatus: row.include_status,
    brandTerms: [row.official_name_zh, row.official_name_en, ...row.aliases].filter(Boolean),
    officialDomains: row.official_domains,
    ownedUrls: row.owned_urls,
    branchName: row.branch_name || "",
    district: row.district || "",
    datasetVersion: row.dataset_version || datasetVersion || "unknown"
  };
}

function splitList(value) {
  return String(value || "").split("|").map((item) => item.trim()).filter(Boolean);
}

function safeDomain(value) {
  const fromUrl = safeHostname(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  return fromUrl || String(value).toLowerCase();
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

module.exports = { REQUIRED_COLUMNS, buildEntityProfile, findEntityForUrl, loadEntityMaster, parseCsvLine };
