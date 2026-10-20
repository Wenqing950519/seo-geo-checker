const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ledger = path.resolve(__dirname, "../../mock-api/usage-events.jsonl");
const backup = fs.existsSync(ledger) ? fs.readFileSync(ledger) : null;
fs.rmSync(ledger, { force: true });
process.env.DEEPSEEK_INPUT_USD_PER_1M_TOKENS = "0.14";
process.env.DEEPSEEK_OUTPUT_USD_PER_1M_TOKENS = "0.28";
process.env.AI_USAGE_RUN_ID = "research-test-run";
const { recordAiUsage, getUsageSummary } = require("../../packages/ai-providers/usage-meter.js");
recordAiUsage({ provider: "deepseek", model: "test", operation: "audit", status: "success", inputTokens: 1000, outputTokens: 500, latencyMs: 10 });
recordAiUsage({ provider: "deepseek", model: "test", operation: "other", status: "success", inputTokens: 10, outputTokens: 5, runId: "other-run" });
const summary = getUsageSummary({ runId: "research-test-run" });
assert.equal(summary.totals.requests, 1); assert.equal(summary.totals.totalTokens, 1500); assert.equal(summary.totals.successRate, 100); assert.equal(summary.totals.costConfigured, true); assert(summary.totals.estimatedCostUsd > 0);
fs.rmSync(ledger, { force: true }); if (backup) fs.writeFileSync(ledger, backup);
delete process.env.AI_USAGE_RUN_ID;

// The audit container has no mock-api folder (2026-10-20 container check): the ledger must create
// its folder, and a ledger that cannot be written must never break the call that uses the model.
const os = require("os");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "usage-meter-"));
process.env.AI_USAGE_LEDGER_FILE = path.join(tmp, "missing", "dir", "usage.jsonl");
assert.doesNotThrow(() => recordAiUsage({ provider: "deepseek", model: "test", operation: "audit", status: "success" }));
assert.ok(fs.existsSync(process.env.AI_USAGE_LEDGER_FILE), "the ledger folder is created");
fs.writeFileSync(path.join(tmp, "a-file"), "");
process.env.AI_USAGE_LEDGER_FILE = path.join(tmp, "a-file", "usage.jsonl");
assert.doesNotThrow(() => recordAiUsage({ provider: "deepseek", model: "test", operation: "audit", status: "success" }), "an unwritable ledger is skipped");
delete process.env.AI_USAGE_LEDGER_FILE;
fs.rmSync(tmp, { recursive: true, force: true });
console.log("usage meter tests passed");
