const PRICING_VERSION = "2026-09-09";

const LIST_PRICES_USD = Object.freeze({
  "openai-web": Object.freeze({ inputPerMillion: 0.20, outputPerMillion: 1.20, searchPerRequest: 0.010 }),
  "google-web": Object.freeze({ inputPerMillion: 0.30, outputPerMillion: 2.50, searchPerRequest: 0.014, searchAllowanceUnknown: true }),
  "perplexity-sonar": Object.freeze({ inputPerMillion: 1.00, outputPerMillion: 1.00, searchPerRequest: 0.005 }),
  "anthropic-web": Object.freeze({ inputPerMillion: 1.00, outputPerMillion: 5.00, searchPerRequest: 0.010 })
});

function estimateProviderCost(profileId, usage = {}) {
  const price = LIST_PRICES_USD[profileId];
  if (!price) return { status: "unknown", pricing_version: PRICING_VERSION };
  const reported = finiteNonNegative(usage.provider_reported_cost_usd);
  const inputTokens = finiteNonNegative(usage.input_tokens);
  const outputTokens = finiteNonNegative(usage.output_tokens);
  const searchRequests = finiteNonNegative(usage.search_requests);
  const totalTokens = finiteNonNegative(usage.total_tokens);
  const tokenCost = inputTokens == null || outputTokens == null
    ? null
    : inputTokens / 1_000_000 * price.inputPerMillion + outputTokens / 1_000_000 * price.outputPerMillion;
  const tokenMinimum = tokenCost ?? (totalTokens == null ? null : totalTokens / 1_000_000 * Math.min(price.inputPerMillion, price.outputPerMillion));
  const tokenMaximum = tokenCost ?? (totalTokens == null ? null : totalTokens / 1_000_000 * Math.max(price.inputPerMillion, price.outputPerMillion));
  const searchCost = searchRequests == null ? null : searchRequests * price.searchPerRequest;
  const listMinimum = tokenMinimum == null || searchCost == null ? null : tokenMinimum + (price.searchAllowanceUnknown ? 0 : searchCost);
  const listMaximum = tokenMaximum == null || searchCost == null ? null : tokenMaximum + searchCost;
  const listTotal = listMinimum != null && listMaximum != null && listMinimum === listMaximum ? listMaximum : null;

  if (reported != null) {
    return {
      status: "provider_reported",
      pricing_version: PRICING_VERSION,
      provider_reported_usd: round(reported),
      estimated_list_usd: listMaximum == null ? null : round(listMaximum)
    };
  }
  if (listMinimum == null || listMaximum == null) {
    return {
      status: "unknown",
      pricing_version: PRICING_VERSION,
      token_cost_usd: tokenCost == null ? null : round(tokenCost),
      search_cost_usd: searchCost == null ? null : round(searchCost)
    };
  }
  const isRange = listMinimum !== listMaximum;
  return {
    status: price.searchAllowanceUnknown ? "estimated_range_free_allowance_unknown" : isRange ? "estimated_list_price_range" : "estimated_list_price",
    pricing_version: PRICING_VERSION,
    estimated_usd: round(listMaximum),
    estimated_min_usd: round(listMinimum),
    estimated_max_usd: round(listMaximum),
    token_cost_usd: tokenCost == null ? null : round(tokenCost),
    token_cost_min_usd: round(tokenMinimum),
    token_cost_max_usd: round(tokenMaximum),
    search_cost_usd: round(searchCost)
  };
}

function finiteNonNegative(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

module.exports = { LIST_PRICES_USD, PRICING_VERSION, estimateProviderCost };
