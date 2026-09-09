const { createHash } = require("node:crypto");
const { loadEnvFiles } = require("../../packages/shared/env.js");
const { createOfficialProvidersFromEnv } = require("../../services/api/application/official-search-providers.js");

loadEnvFiles();

const DEFAULT_PROMPT = "請搜尋網路並以一句話回答：臺灣中央銀行 2026-09-08 公布的新臺幣兌美元銀行間收盤匯率是多少？附來源。";

async function main() {
  const twdPerUsd = requiredPositiveNumber(argument("twd-per-usd") || process.env.TWD_PER_USD, "--twd-per-usd");
  const prompt = String(process.env.OFFICIAL_SMOKE_PROMPT || DEFAULT_PROMPT).trim();
  const providers = createOfficialProvidersFromEnv();
  const observedAt = new Date().toISOString();
  const outcomes = await Promise.all(providers.map(async (provider) => {
    const started = Date.now();
    try {
      const result = await provider.execute({ prompt, locale: "zh-TW", input: { type: "prompt", text: prompt } });
      return {
        profile_id: provider.id,
        status: result.answer && result.searchEvidence?.executed ? "succeeded" : "failed",
        reported_model: result.nativeEvidence?.reported_model || null,
        response_id_present: Boolean(result.nativeEvidence?.response_id),
        search_executed: result.searchEvidence?.executed === true,
        citation_count: Array.isArray(result.citations) ? result.citations.length : 0,
        answer_chars: String(result.answer || "").length,
        usage: result.usage || null,
        cost: result.cost || null,
        latency_ms: Date.now() - started
      };
    } catch (error) {
      return {
        profile_id: provider.id,
        status: "failed",
        error_code: error?.code || "provider_error",
        latency_ms: Date.now() - started
      };
    }
  }));
  const cost = summarizeCost(outcomes, twdPerUsd);
  const roundStatus = outcomes.every((item) => item.status === "succeeded") ? "succeeded" : "failed";
  const result = {
    smoke_version: "official-four-v1",
    observed_at: observedAt,
    prompt_sha256: createHash("sha256").update(prompt).digest("hex"),
    round_status: roundStatus,
    providers: outcomes,
    cost,
    original_assumption: {
      twd_per_successful_round: 4,
      matches: cost.maximum_twd != null ? cost.maximum_twd <= 4 : null,
      repricing_gate_exceeded: cost.maximum_twd != null ? cost.maximum_twd > 4.5 : null
    }
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (roundStatus !== "succeeded") process.exitCode = 1;
}

function summarizeCost(outcomes, twdPerUsd) {
  let minimum = 0;
  let maximum = 0;
  let unknown = false;
  for (const outcome of outcomes) {
    const cost = outcome.cost;
    if (!cost) { unknown = true; continue; }
    if (cost.status === "provider_reported") {
      minimum += Number(cost.provider_reported_usd || 0);
      maximum += Number(cost.provider_reported_usd || 0);
    } else if (cost.status === "estimated_list_price") {
      minimum += Number(cost.estimated_usd || 0);
      maximum += Number(cost.estimated_usd || 0);
    } else if (cost.status === "estimated_range_free_allowance_unknown") {
      minimum += Number(cost.estimated_min_usd || 0);
      maximum += Number(cost.estimated_max_usd || 0);
    } else if (cost.status === "estimated_list_price_range") {
      minimum += Number(cost.estimated_min_usd || 0);
      maximum += Number(cost.estimated_max_usd || 0);
    } else {
      unknown = true;
    }
  }
  return {
    status: unknown ? "partial_unknown" : minimum === maximum ? "estimated_or_reported_point" : "estimated_range",
    usd_minimum: round(minimum),
    usd_maximum: round(maximum),
    twd_per_usd: twdPerUsd,
    minimum_twd: unknown ? null : round(minimum * twdPerUsd),
    maximum_twd: unknown ? null : round(maximum * twdPerUsd),
    note: "Perplexity may report billed cost; other values use 2026-09-09 official list prices. Google Search's monthly free allowance is unknown, so its search fee is represented as a range."
  };
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
}

function requiredPositiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`);
  return number;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: { code: error?.code || "smoke_failed", message: error?.message || "Smoke failed" } }));
  process.exitCode = 1;
});
