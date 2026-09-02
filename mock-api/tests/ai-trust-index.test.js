const assert = require("node:assert/strict");
const { computeAiTrustIndex, AI_TRUST_INDEX_VERSION } = require("../lib/ai-trust-index");

const measured = computeAiTrustIndex({
  queryCount: 4,
  measuredQueryCount: 4,
  excludedQueryCount: 0,
  mentionRate: 100,
  citationRate: 50
});
assert.equal(AI_TRUST_INDEX_VERSION, "1.0.0");
assert.equal(measured.value, 82.5, "65% answer adoption and 35% verified source evidence");
assert.equal(measured.denominator.valid_runs, 4);
assert.equal(measured.denominator.query_scope, "approved_unbranded_discovery_queries_only");

const sourceAbsent = computeAiTrustIndex({ queryCount: 2, measuredQueryCount: 2, mentionRate: 100, citationRate: 0 });
assert.equal(sourceAbsent.status, "measured", "a measured absence of official URLs is zero, not unknown");
assert.equal(sourceAbsent.value, 65);

const unknown = computeAiTrustIndex({ queryCount: 2, measuredQueryCount: 0, excludedQueryCount: 2, mentionRate: null, citationRate: null });
assert.equal(unknown.status, "unknown");
assert.equal(unknown.value, null, "unknown must not become zero");
assert.equal(unknown.unknown_follow_up.includes("重新執行"), true);

const partial = computeAiTrustIndex({ queryCount: 2, measuredQueryCount: 1, excludedQueryCount: 1, mentionRate: 100, citationRate: 100 });
assert.equal(partial.raw_score, 100);
assert.equal(partial.value, 69, "one valid query-run must be visibly capped");

console.log(JSON.stringify({ passed: true, version: AI_TRUST_INDEX_VERSION, measured: measured.value, unknown: unknown.value }, null, 2));
