// GeoCheck MCAC answer engines. Exactly two combinations exist (2026-10-20):
// DeepSeek planning + Perplexity Sonar, or DeepSeek planning + Gemini Flash with
// Google Search grounding. Any other engine name is refused, never mapped.

const { createOfficialProvider } = require("./official-search-providers.js");

const MCAC_ENGINES = Object.freeze({
  perplexity: "perplexity-sonar",
  gemini: "google-web"
});
const DEFAULT_MCAC_ENGINE = "perplexity";

function resolveMcacEngine(name) {
  const key = String(name ?? DEFAULT_MCAC_ENGINE).trim().toLowerCase() || DEFAULT_MCAC_ENGINE;
  if (!Object.hasOwn(MCAC_ENGINES, key)) {
    const error = new Error(`GeoCheck MCAC engine "${key}" is not allowed; use perplexity or gemini`);
    error.code = "mcac_engine_not_allowed";
    throw error;
  }
  return { id: key, profileId: MCAC_ENGINES[key] };
}

function createMcacEngineClient({ engine, config = process.env, fetch, model } = {}) {
  const resolved = resolveMcacEngine(engine ?? config.GEOCHECK_MCAC_ENGINE);
  const modelOverride = model || (resolved.id === "gemini" ? config.GEOCHECK_MCAC_GEMINI_MODEL : null) || undefined;
  const adapter = createOfficialProvider(resolved.profileId, { config, fetch, model: modelOverride });
  return {
    id: resolved.id,
    profileId: resolved.profileId,
    model: modelOverride || null,
    async ask(prompt, { timeoutMs = 45_000, maxOutputTokens = 1_024 } = {}) {
      const started = Date.now();
      const result = await adapter.execute({ prompt, timeoutMs, maxOutputTokens });
      return {
        answer: String(result.answer || ""),
        citations: Array.isArray(result.citations) ? result.citations : [],
        usage: result.usage || {},
        cost: result.cost || null,
        model: result.nativeEvidence?.reported_model || modelOverride || null,
        searchExecuted: Boolean(result.searchEvidence?.executed),
        latencyMs: Date.now() - started
      };
    }
  };
}

module.exports = { DEFAULT_MCAC_ENGINE, MCAC_ENGINES, createMcacEngineClient, resolveMcacEngine };
