const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const server = fs.readFileSync(path.join(root, "mock-api/server.js"), "utf8");
const home = fs.readFileSync(path.join(root, "mock-api/public/home.html"), "utf8");
const batch = fs.readFileSync(path.join(root, ".agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs"), "utf8");

assert.match(server, /AI Trust Index/);
assert.match(server, /答案採用率：\$\{score\.breakdown\?\.answer_adoption/);
assert.match(server, /來源證據率：\$\{score\.breakdown\?\.source_evidence/);
assert.match(server, /unknown 不計為 0/);
assert.match(home, /答案層占 65%，來源層占 35%/);
assert.match(home, /不是模型內部信任分數/);
assert.match(batch, /ai_trust_index/);
assert.match(batch, /source_evidence_rate/);
console.log("ai trust product/report/whitepaper surface tests passed");
