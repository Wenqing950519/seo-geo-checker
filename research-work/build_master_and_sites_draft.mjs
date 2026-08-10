#!/usr/bin/env node
// 把 140 家候選池 + 07-18 來源發現成果，轉成批次直接可讀的兩個草稿檔：
//   1) xinyi-140.master.draft.csv  真值表草稿（entity-master.js 契約，include_status 一律 pending）
//   2) xinyi-140.sites.draft.csv   去重根網域網站輸入清單
// 本腳本不呼叫任何 API，也不決定樣本資格；eligibility 仍由人工在 v0.3 審核表裁決。
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const projectRoot = path.resolve(process.argv[2] || process.cwd());
const require = createRequire(import.meta.url);
const { parseCsvLine, REQUIRED_COLUMNS } = require(path.join(projectRoot, "mock-api", "lib", "entity-master.js"));
const { getRegistrableDomain, safeHostname } = require(path.join(projectRoot, "mock-api", "lib", "brand-match.js"));

const inputDir = path.join(projectRoot, "research-input", "xinyi-restaurants-2026");
const outDir = path.join(projectRoot, "research-input");
const DATASET_VERSION = "xinyi-140-draft-v0.1";

const review = readCsv(path.join(inputDir, "candidate_evidence_review_v0.3.csv"));
const leads = readCsv(path.join(inputDir, "curated_brand_measurement_leads_v0.3.csv"));
const roots = readCsv(path.join(inputDir, "site_root_candidates_v0.1.csv"));

// 兩份來源的 candidate_id 補零格式不一致（審核表 "1" vs leads "001"），統一為三位數再對照。
const padId = (value) => String(value || "").trim().padStart(3, "0");
const leadsById = new Map(leads.map((row) => [padId(row.candidate_id), row]));
const sharedRoots = new Set(roots.filter((row) => String(row.shared_domain_group).toUpperCase() === "TRUE").map((row) => row.root_domain));

const masterRows = review.map((row) => {
  const { base, branch } = splitBranch(row.candidate_name);
  const domain = normalizeDomain(row.provisional_brand_domain);
  const root = domain ? getRegistrableDomain(domain) : "";
  const lead = leadsById.get(padId(row.candidate_id));
  const ownedUrls = lead
    ? [lead.lead_1_url, lead.lead_2_url, lead.lead_3_url]
        .filter(Boolean)
        .filter((url) => root && getRegistrableDomain(safeHostname(url) || "") !== root)
    : [];
  return {
    store_id: `XY-${padId(row.candidate_id)}`,
    brand_id: root ? `BR-${root.split(".")[0].toUpperCase().replace(/[^A-Z0-9]/g, "")}` : "",
    official_name_zh: base,
    official_name_en: "",
    aliases: "",
    official_domains: domain,
    owned_urls: ownedUrls.join("|"),
    shared_domain_flag: root && sharedRoots.has(root) ? "true" : "false",
    branch_name: branch,
    district: "信義區",
    // pending＝尚未裁決。批次只會跳過 excluded，pending 仍會被量測，故付費前必須全部收斂。
    include_status: "pending",
    exclusion_reason_code: "",
    reviewed_by: "",
    reviewed_at: "",
    truth_source: row.measurement_domain_status || "unknown",
    dataset_version: DATASET_VERSION
  };
});

const siteRows = roots
  .map((row) => ({
    url: row.root_url,
    root_domain: row.root_domain,
    mapped_candidate_count: row.mapped_candidate_count,
    candidate_ids: row.candidate_ids,
    shared_domain_group: row.shared_domain_group,
    include_in_batch: ""
  }))
  .sort((a, b) => a.root_domain.localeCompare(b.root_domain));

writeCsv(path.join(outDir, "xinyi-140.master.draft.csv"), REQUIRED_COLUMNS, masterRows);
writeCsv(path.join(outDir, "xinyi-140.sites.draft.csv"), ["url", "root_domain", "mapped_candidate_count", "candidate_ids", "shared_domain_group", "include_in_batch"], siteRows);

const withDomain = masterRows.filter((row) => row.official_domains).length;
const shared = masterRows.filter((row) => row.shared_domain_flag === "true").length;
console.log(`master 草稿: ${masterRows.length} 列（有網域 ${withDomain}、無網域 ${masterRows.length - withDomain}、共用網域 ${shared}）`);
console.log(`sites 草稿: ${siteRows.length} 個去重根網域（共用群組 ${siteRows.filter((r) => String(r.shared_domain_group).toUpperCase() === "TRUE").length}）`);
console.log(`include_status 全部為 pending，需人工裁決後才可付費批次。`);

function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0]).map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((name, index) => [name, (values[index] || "").trim()]));
  });
}

function writeCsv(file, columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvValue(row[column])).join(","));
  fs.writeFileSync(file, `﻿${lines.join("\r\n")}\r\n`, "utf8");
}

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// 分店名稱切分為草稿等級：括號或全形／半形連字號後段視為分店，人工複核時可修正。
function splitBranch(name) {
  const paren = name.match(/^(.*?)（(.+?)）\s*$/);
  if (paren) return { base: paren[1].trim(), branch: paren[2].trim() };
  const dash = name.match(/^(.*?)[－–—-](.+)$/);
  if (dash && /[店館廳館]$|店$/.test(dash[2].trim())) return { base: dash[1].trim(), branch: dash[2].trim() };
  return { base: name.trim(), branch: "" };
}

function normalizeDomain(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return safeHostname(/^https?:\/\//i.test(text) ? text : `https://${text}`) || text.toLowerCase();
}
