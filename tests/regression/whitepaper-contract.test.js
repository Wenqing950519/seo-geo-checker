const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const script = fs.readFileSync(path.join(root, ".agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs"), "utf8");
const skill = fs.readFileSync(path.join(root, ".agents/skills/geo-whitepaper-research/SKILL.md"), "utf8");

assert.match(script, /required\(args, "master"\)/, "publishable whitepaper batches require an entity master");
assert.match(script, /assertReviewedEntityCoverage\(urls, master\)/, "publishable batches must reject uncovered or unreviewed entity-master rows before provider work");
assert.match(script, /ai_trust_index/);
assert.match(script, /measurement_status: trust\.status === "measured" \? "success" : "unknown"/);
assert.match(skill, /approved-entity-master/);
assert.match(skill, /unknown.*never convert it to zero/);
console.log("whitepaper contract tests passed");
