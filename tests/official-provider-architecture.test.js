const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const at = (value) => path.join(root, value);
const {
  OFFICIAL_ENGINE_PROFILES,
  getOfficialEngineProfile,
  listOfficialEngineProfiles
} = require(at("services/api/application/official-engine-profiles.js"));
const {
  SEARCH_PROVIDER_CONTRACT_VERSION,
  defineSearchProvider
} = require(at("services/api/ports/search-provider.js"));

assert.equal(SEARCH_PROVIDER_CONTRACT_VERSION, "0.1.0");
assert.deepEqual(
  Object.keys(OFFICIAL_ENGINE_PROFILES),
  ["openai-web", "google-web", "perplexity-sonar", "anthropic-web"]
);

for (const profile of listOfficialEngineProfiles()) {
  assert.equal(profile.routing, "official_direct");
  assert.equal(profile.developerApiStatus, "prototype_benchmark_verified");
  assert.equal(profile.modelStatus, "account_smoke_verified");
  assert.equal(profile.searchCapabilityStatus, "controlled_benchmark_verified");
  assert.equal(profile.lastSmokeDate, "2026-09-09");
  assert.equal(profile.lastBenchmarkDate, "2026-09-09");
  assert.ok(profile.provider);
  assert.ok(profile.model);
  assert.ok(profile.searchSurface);
  assert.ok(profile.apiFamily);
  assert.strictEqual(getOfficialEngineProfile(profile.id), OFFICIAL_ENGINE_PROFILES[profile.id]);
}

assert.deepEqual(
  Object.fromEntries(listOfficialEngineProfiles().map((profile) => [profile.id, profile.model])),
  {
    "openai-web": "gpt-5.6-luna",
    "google-web": "gemini-3.5-flash-lite",
    "perplexity-sonar": "sonar",
    "anthropic-web": "claude-haiku-4-5-20251001"
  }
);

assert.equal(OFFICIAL_ENGINE_PROFILES["perplexity-sonar"].existingAdapter, true);
assert.equal(OFFICIAL_ENGINE_PROFILES["openai-web"].existingAdapter, true);
assert.equal(OFFICIAL_ENGINE_PROFILES["google-web"].existingAdapter, true);
assert.equal(OFFICIAL_ENGINE_PROFILES["anthropic-web"].existingAdapter, true);

const adapter = defineSearchProvider({
  id: "fixture-official-provider",
  async execute() {
    return { answer: "fixture", nativeEvidence: {} };
  }
});
assert.equal(adapter.id, "fixture-official-provider");
assert.equal(typeof adapter.execute, "function");
assert.throws(() => defineSearchProvider({ id: "missing-execute" }), /execute/);

function runtimeJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? runtimeJavaScriptFiles(target) : target.endsWith(".js") ? [target] : [];
  });
}

for (const file of [
  ...runtimeJavaScriptFiles(at("packages")),
  ...runtimeJavaScriptFiles(at("services"))
]) {
  assert.doesNotMatch(
    fs.readFileSync(file, "utf8"),
    /openrouter/i,
    `${path.relative(root, file)} must not route production measurements through OpenRouter`
  );
}

console.log("official provider architecture tests passed");
