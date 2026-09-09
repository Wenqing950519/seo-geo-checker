function profile(value) {
  return Object.freeze({
    ...value,
    routing: "official_direct",
    developerApiStatus: "prototype_benchmark_verified",
    modelStatus: "account_smoke_verified",
    searchCapabilityStatus: "controlled_benchmark_verified",
    lastSmokeDate: "2026-09-09",
    lastBenchmarkDate: "2026-09-09"
  });
}

const OFFICIAL_ENGINE_PROFILES = Object.freeze({
  "openai-web": profile({
    id: "openai-web",
    provider: "openai",
    model: "gpt-5.6-luna",
    apiFamily: "responses",
    searchSurface: "openai_web_search",
    existingAdapter: true
  }),
  "google-web": profile({
    id: "google-web",
    provider: "google",
    model: "gemini-3.5-flash-lite",
    apiFamily: "gemini_api",
    searchSurface: "google_search_grounding",
    existingAdapter: true
  }),
  "perplexity-sonar": profile({
    id: "perplexity-sonar",
    provider: "perplexity",
    model: "sonar",
    apiFamily: "sonar",
    searchSurface: "perplexity_native_search",
    existingAdapter: true
  }),
  "anthropic-web": profile({
    id: "anthropic-web",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    apiFamily: "messages",
    searchSurface: "anthropic_web_search",
    existingAdapter: true
  })
});

function listOfficialEngineProfiles() {
  return Object.values(OFFICIAL_ENGINE_PROFILES);
}

function getOfficialEngineProfile(id) {
  return OFFICIAL_ENGINE_PROFILES[String(id || "")] || null;
}

module.exports = {
  OFFICIAL_ENGINE_PROFILES,
  getOfficialEngineProfile,
  listOfficialEngineProfiles
};
