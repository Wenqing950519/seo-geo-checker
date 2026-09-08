const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const server = fs.readFileSync(path.join(root, "services/api/server.js"), "utf8");
const home = fs.readFileSync(path.join(root, "apps/web/public/home.html"), "utf8");
function realLiteReportSection(source) {
  const start = source.indexOf("function realLiteReportHtml(report) {");
  const end = source.indexOf("function reportTopNavHtml() {");
  return source.slice(start, end);
}

const batch = fs.readFileSync(path.join(root, ".agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs"), "utf8");

// 報告頁對商家說人話：只講「AI 有沒有提到你」「AI 有沒有引用你的官網」，
// 不揭露供應商、模型與內部方法用語。
assert.match(server, /AI 信任值/);
assert.match(server, /AI 回答裡有提到你的品牌/);
assert.match(server, /AI 回答裡有引用你的官網/);
assert.match(server, /沒拿到回答的題目不會被當成 0 分/);
assert.doesNotMatch(realLiteReportSection(server), /Perplexity|DeepSeek|Provider:|Model:/);
assert.match(home, /AI 有沒有提到你（占 65%）/);
assert.match(home, /AI 有沒有引用你的官網（占 35%）/);
assert.match(home, /不會當成 0 分/);
assert.match(batch, /ai_trust_index/);
assert.match(batch, /source_evidence_rate/);
console.log("ai trust product/report/whitepaper surface tests passed");
