#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args["project-root"] || process.cwd());
const siteUrl = required(args, "site");
const outputPath = path.resolve(projectRoot, required(args, "output"));
const maxGeminiCalls = Number(required(args, "max-gemini-calls"));
if (!Number.isInteger(maxGeminiCalls) || maxGeminiCalls < 1) {
  throw new Error("Hard stop: drafting a query set requires exactly one Gemini call; set --max-gemini-calls to at least 1.");
}

const require = createRequire(import.meta.url);
const { loadEnvFiles } = require(path.join(projectRoot, "mock-api", "lib", "env.js"));
loadEnvFiles();
const { assertSafePublicUrl } = require(path.join(projectRoot, "mock-api", "lib", "url-safety.js"));
const { fetchHomepage, fetchRepresentativePages } = require(path.join(projectRoot, "mock-api", "lib", "html-v2.js"));
const { fetchTechnicalSignals } = require(path.join(projectRoot, "mock-api", "lib", "technical-signals.js"));
const { classifySite } = require(path.join(projectRoot, "mock-api", "lib", "site-type.js"));
const { QUERY_PLANNER_VERSION, buildGeoQueryPlanResolved } = require(path.join(projectRoot, "mock-api", "lib", "query-planner.js"));

await assertSafePublicUrl(siteUrl);
console.log(`Drafting candidate query set from representative site: ${siteUrl}`);
console.log(`Hard budget: Gemini 1/${maxGeminiCalls}; Perplexity 0.`);

const homepage = await fetchHomepage(siteUrl);
const finalUrl = homepage.finalUrl || homepage.url || siteUrl;
const siteType = classifySite({ url: finalUrl, metadata: homepage.metadata, text: homepage.text });
const technical = await fetchTechnicalSignals(siteUrl, homepage);
const representativePages = await fetchRepresentativePages(technical.representativeUrls || [], 3);
const plan = await buildGeoQueryPlanResolved({ siteUrl: finalUrl, homepage, representativePages, siteType }, {
  operation: "whitepaper_query_set_draft"
});
if (plan.status !== "ready") throw new Error(plan.reason || "Gemini query draft did not pass validation");

const draft = {
  status: "draft_requires_human_review",
  generated_at: new Date().toISOString(),
  representative_site: finalUrl,
  planner_version: QUERY_PLANNER_VERSION,
  provider: plan.provider,
  model: plan.model,
  industry: plan.industry,
  primary_offering: plan.primary_offering,
  geography: plan.geography,
  confidence: plan.confidence,
  candidate_queries: plan.candidates,
  automatically_suggested_queries: plan.selectedQueries,
  human_review_checklist: [
    "確認所有題目都符合研究產業，而不是網站製作商、頁尾或模板文字。",
    "刪除品牌名、網域、指定競品與要求附來源等會扭曲自然搜尋意圖的字句。",
    "同一產業全樣本必須使用完全相同的凍結題目。",
    "至少保留兩題，並涵蓋推薦、比較或決策中的兩種不同意圖。",
    "將審核後的題目填入 approved_query_set_template.queries，再另存為正式 JSON；不要直接使用本 draft 檔執行批次。"
  ],
  approved_query_set_template: {
    query_set_version: `${slug(plan.industry)}-reviewed-v1`,
    industry: plan.industry,
    review_status: "replace_with_approved",
    reviewed_by: "",
    reviewed_at: "",
    queries: []
  },
  api_budget: { gemini_calls: 1, perplexity_calls: 0 }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
console.log(`Draft written to ${outputPath}`);
console.log("Human review is mandatory before the paid Perplexity batch.");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    result[key] = next && !next.startsWith("--") ? argv[++index] : true;
  }
  return result;
}

function required(value, key) {
  const result = value[key];
  if (result === undefined || result === true || String(result).trim() === "") throw new Error(`Missing required --${key}`);
  return String(result).trim();
}

function slug(value) {
  const normalized = String(value || "industry").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return normalized || "industry";
}
