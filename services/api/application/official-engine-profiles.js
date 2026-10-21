// Platform 正本已移至 ls-labs `products/platform/api/…`（LSL-D-009）；本檔供 MCAC／Classic 使用，
// 模型與價格變更各依 LSL-D-002（Platform）與 LSL-D-006（MCAC）。兩邊不會自動同步。
function profile(value) {
  return Object.freeze({
    routing: "official_direct",
    developerApiStatus: "prototype_benchmark_verified",
    modelStatus: "account_smoke_verified",
    searchCapabilityStatus: "controlled_benchmark_verified",
    lastSmokeDate: "2026-09-09",
    lastBenchmarkDate: "2026-09-09",
    ...value
  });
}

const OFFICIAL_ENGINE_PROFILES = Object.freeze({
  "openai-web": profile({
    id: "openai-web",
    provider: "openai",
    model: "gpt-6-luna",
    apiFamily: "responses",
    searchSurface: "openai_web_search",
    existingAdapter: true,
    developerApiStatus: "pending_live_smoke",
    modelStatus: "official_documentation_verified",
    searchCapabilityStatus: "official_documentation_verified",
    lastSmokeDate: null,
    lastBenchmarkDate: null
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
    model: "claude-haiku-5-5",
    apiFamily: "messages",
    searchSurface: "anthropic_web_search",
    existingAdapter: true,
    // LSL-D-002: 2026-10-14 benchmarks v1 and v2 both 17/20 (max_tokens, then missing
    // citations); 2026-10-19 v3 with a 4,096-token limit passed 19/20.
    developerApiStatus: "prototype_benchmark_verified",
    modelStatus: "account_smoke_verified",
    searchCapabilityStatus: "controlled_benchmark_verified",
    lastSmokeDate: "2026-10-19",
    lastBenchmarkDate: "2026-10-19"
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
