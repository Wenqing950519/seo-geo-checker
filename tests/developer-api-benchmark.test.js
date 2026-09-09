const assert = require("node:assert/strict");
const { buildBenchmarkSummary, costBoundsFromOutcomes, nearestRank } = require("../scripts/developer-api/benchmark-metrics.cjs");

assert.equal(nearestRank([1, 2, 3, 4, 5], 0.95), 5);
assert.deepEqual(
  costBoundsFromOutcomes([
    { cost: { status: "estimated_list_price", estimated_usd: 0.02 } },
    { cost: { status: "estimated_range_free_allowance_unknown", estimated_min_usd: 0.001, estimated_max_usd: 0.03 } },
    { cost: { status: "provider_reported", provider_reported_usd: 0.005 } },
    { cost: null }
  ], 30, 12),
  {
    status: "partial_unknown",
    minimum_usd: 0.026,
    maximum_usd: 0.055,
    minimum_twd: 0.78,
    maximum_twd: 1.65,
    accounted_maximum_twd: 12,
    has_unknown_cost: true
  }
);

const criteria = {
  required_rounds: 20,
  minimum_all_four_success_rounds: 19,
  p95_round_cost_twd_max: 4.5,
  maximum_round_duration_ms: 30000,
  total_budget_twd: 120
};
const records = Array.from({ length: 20 }, (_, index) => ({
  providers: ["openai-web", "google-web", "perplexity-sonar", "anthropic-web"].map((profileId) => ({
    profile_id: profileId,
    status: index === 19 && profileId === "google-web" ? "failed" : "succeeded"
  })),
  round_cost: { accounted_maximum_twd: index === 19 ? 9 : 2 },
  round_duration_ms: index === 19 ? 29900 : 5000
}));
const passing = buildBenchmarkSummary(records, criteria);
assert.equal(passing.all_four_success_rounds, 19);
assert.equal(passing.p95_round_cost_twd, 2);
assert.equal(passing.maximum_round_cost_twd, 9);
assert.equal(passing.total_accounted_cost_twd, 47);
assert.equal(passing.passed, true);
records[19].round_duration_ms = 30001;
assert.equal(buildBenchmarkSummary(records, criteria).passed, false);

console.log("developer API controlled benchmark metric tests passed");
