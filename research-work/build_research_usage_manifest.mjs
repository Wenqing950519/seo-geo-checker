#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [researchOutputDir, outputFile] = process.argv.slice(2);
if (!researchOutputDir || !outputFile) throw new Error("Usage: node build_research_usage_manifest.mjs <research-output-dir> <output.json>");
const root = path.resolve(researchOutputDir);
const files = walk(root).filter((file) => ["source-discovery-api-usage.json", "direct-verification-usage.json", "store-page-detail-usage.json"].includes(path.basename(file)));
const records = files.map((file) => ({
  file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
  sha256: sha256(fs.readFileSync(file)),
  data: JSON.parse(fs.readFileSync(file, "utf8"))
}));
const search = records.filter((record) => path.basename(record.file) === "source-discovery-api-usage.json");
const direct = records.filter((record) => path.basename(record.file) === "direct-verification-usage.json");
const details = records.filter((record) => path.basename(record.file) === "store-page-detail-usage.json");
const manifest = {
  generated_at: new Date().toISOString(),
  scope: "2026 Taipei Xinyi restaurant AI-search visibility research Stage 2 source collection",
  ai_measurement_status: "not_started",
  perplexity_requests: 0,
  gemini_requests: 0,
  ai_input_tokens: 0,
  ai_output_tokens: 0,
  ai_total_tokens: 0,
  brave_search: {
    usage_files: search.length,
    recorded_attempts: sum(search, "recorded_attempts_total"),
    latest_successful_candidate_queries: sum(search, "successful_calls_total"),
    latest_failed_candidate_queries: sum(search, "failed_calls_total"),
    failed_or_retried_attempt_records: sum(search, "recorded_attempts_total") - sum(search, "successful_calls_total"),
    tokens_available: false,
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    note: "Brave Web Search usage responses do not expose token counts; requests and failures are preserved instead."
  },
  public_page_fetches: {
    direct_verification_runs: direct.length,
    direct_verification_attempted_fetches: sum(direct, "attempted_fetches_this_run"),
    detail_extraction_runs: details.length,
    detail_extraction_attempted_fetches: sum(details, "attempted_fetches"),
    ai_api_calls: 0,
    tokens_available: false
  },
  usage_files: records.map((record) => ({ file: record.file, sha256: record.sha256 }))
};
fs.writeFileSync(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function sum(records, key) { return records.reduce((total, record) => total + Number(record.data[key] || 0), 0); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
