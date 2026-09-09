function costBoundsFromOutcomes(outcomes, twdPerUsd, unknownRoundCostReserveTwd) {
  let minimumUsd = 0;
  let maximumUsd = 0;
  let hasUnknown = false;
  for (const outcome of outcomes) {
    const bounds = providerCostBounds(outcome?.cost);
    if (!bounds) {
      hasUnknown = true;
      continue;
    }
    minimumUsd += bounds.minimum;
    maximumUsd += bounds.maximum;
  }
  const minimumTwd = minimumUsd * twdPerUsd;
  const maximumTwd = maximumUsd * twdPerUsd;
  return {
    status: hasUnknown ? "partial_unknown" : minimumUsd === maximumUsd ? "point" : "range",
    minimum_usd: round(minimumUsd),
    maximum_usd: round(maximumUsd),
    minimum_twd: round(minimumTwd),
    maximum_twd: round(maximumTwd),
    accounted_maximum_twd: round(hasUnknown ? Math.max(maximumTwd, unknownRoundCostReserveTwd) : maximumTwd),
    has_unknown_cost: hasUnknown
  };
}

function buildBenchmarkSummary(records, criteria) {
  const completed = records.length;
  const allFourSuccess = records.filter((record) => Array.isArray(record.providers)
    && record.providers.length === 4
    && record.providers.every((provider) => provider.status === "succeeded")).length;
  const costs = records.map((record) => Number(record.round_cost?.accounted_maximum_twd)).filter(Number.isFinite);
  const durations = records.map((record) => Number(record.round_duration_ms)).filter(Number.isFinite);
  const providerFailures = {};
  for (const record of records) {
    for (const provider of record.providers || []) {
      if (provider.status === "succeeded") continue;
      providerFailures[provider.profile_id] = (providerFailures[provider.profile_id] || 0) + 1;
    }
  }
  const summary = {
    completed_rounds: completed,
    all_four_success_rounds: allFourSuccess,
    all_four_success_rate: completed ? round(allFourSuccess / completed) : null,
    p95_round_cost_twd: nearestRank(costs, 0.95),
    maximum_round_cost_twd: costs.length ? round(Math.max(...costs)) : null,
    total_accounted_cost_twd: round(costs.reduce((sum, value) => sum + value, 0)),
    p95_round_duration_ms: nearestRank(durations, 0.95),
    maximum_round_duration_ms: durations.length ? Math.max(...durations) : null,
    provider_failure_counts: providerFailures
  };
  summary.checks = {
    completed_required_rounds: completed === criteria.required_rounds,
    minimum_all_four_success_rounds: allFourSuccess >= criteria.minimum_all_four_success_rounds,
    p95_round_cost_within_limit: summary.p95_round_cost_twd != null && summary.p95_round_cost_twd <= criteria.p95_round_cost_twd_max,
    every_round_within_duration_limit: summary.maximum_round_duration_ms != null && summary.maximum_round_duration_ms <= criteria.maximum_round_duration_ms,
    total_budget_within_limit: summary.total_accounted_cost_twd <= criteria.total_budget_twd
  };
  summary.passed = Object.values(summary.checks).every(Boolean);
  return summary;
}

function nearestRank(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return round(sorted[index]);
}

function providerCostBounds(cost) {
  if (!cost || typeof cost !== "object") return null;
  if (cost.status === "provider_reported" && finite(cost.provider_reported_usd)) {
    return { minimum: Number(cost.provider_reported_usd), maximum: Number(cost.provider_reported_usd) };
  }
  if (cost.status === "estimated_list_price" && finite(cost.estimated_usd)) {
    return { minimum: Number(cost.estimated_usd), maximum: Number(cost.estimated_usd) };
  }
  if (["estimated_range_free_allowance_unknown", "estimated_list_price_range"].includes(cost.status)
    && finite(cost.estimated_min_usd) && finite(cost.estimated_max_usd)) {
    return { minimum: Number(cost.estimated_min_usd), maximum: Number(cost.estimated_max_usd) };
  }
  return null;
}

function finite(value) {
  return value != null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
}

module.exports = { buildBenchmarkSummary, costBoundsFromOutcomes, nearestRank };
