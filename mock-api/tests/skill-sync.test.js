const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  GEMINI_CALLS_PER_SITE,
  assertNoAdviceFields,
  buildResearchProfilePrompt,
  normalizeResearchProfile
} = require("../lib/research-profile");
const { PARSER_VERSION, PERPLEXITY_CALLS_PER_SITE, SCORING_VERSION } = require("../lib/geo-measurement");

const root = path.resolve(__dirname, "..", "..");
const webCore = fs.readFileSync(path.join(root, "mock-api", "lib", "real-lite-audit-v2-core.js"), "utf8");
const measurementCore = fs.readFileSync(path.join(root, "mock-api", "lib", "geo-measurement.js"), "utf8");
const perplexityProvider = fs.readFileSync(path.join(root, "mock-api", "providers", "perplexity.js"), "utf8");
const batch = fs.readFileSync(path.join(root, ".agents", "skills", "geo-whitepaper-research", "scripts", "run-ai-evidence-batch.mjs"), "utf8");
const skill = fs.readFileSync(path.join(root, ".agents", "skills", "geo-whitepaper-research", "SKILL.md"), "utf8");

assert.match(webCore, /require\("\.\/geo-measurement"\)/, "Website must use the shared GEO measurement pipeline");
assert.match(batch, /mock-api["\s,]+"lib["\s,]+"geo-measurement\.js"/, "Whitepaper batch must import the shared GEO measurement pipeline");
assert.match(batch, /buildResearchProfile/, "Whitepaper batch must run Gemini descriptive profiling");
assert.match(batch, /max-perplexity-calls/, "Whitepaper batch must require a Perplexity hard cap");
assert.match(batch, /max-gemini-calls/, "Whitepaper batch must require a Gemini hard cap");
assert.match(batch, /optimization_advice_generated:\s*false/, "Whitepaper output must explicitly mark advice as disabled");
assert.strictEqual(PERPLEXITY_CALLS_PER_SITE, 3);
assert.strictEqual(GEMINI_CALLS_PER_SITE, 1);
assert.match(PARSER_VERSION, /^\d+\.\d+\.\d+$/, "Parser version must be pinned and semver");
assert.match(SCORING_VERSION, /^\d+\.\d+\.\d+$/, "Scoring version must be pinned and semver");
assert.match(batch, /parser_version/, "Whitepaper rows must record parser_version");
assert.match(batch, /scoring_version/, "Whitepaper rows must record scoring_version");
assert.match(batch, /raw_ref/, "Whitepaper rows must reference persisted raw evidence");
assert.match(batch, /required\(args,\s*"query-set"\)/, "Whitepaper batch must require a human-reviewed frozen query set");
assert.match(batch, /loadEntityMaster/, "Whitepaper batch must support the entity master truth table");

assert.match(skill, /Perplexity/, "Skill contract must document Perplexity evidence");
assert.match(skill, /Gemini Flash-Lite/, "Skill contract must document Gemini descriptive profiling");
assert.match(skill, /never copy scoring weights into the Skill/, "Skill must bind scoring to production code instead of duplicated weights");
assert.match(skill, /人工.*凍結|human-reviewed/i, "Skill must require human review before whitepaper batch search");

const prompt = buildResearchProfilePrompt({
  finalUrl: "https://example.com/",
  siteType: "local_business",
  homepage: { metadata: { title: "Example" }, text: "Example business content" },
  signals: {},
  technical: {},
  representativePages: []
});
assert.match(prompt, /不是提出優化建議/);
assert.match(prompt, /不得產出 recommendation/);

const normalized = normalizeResearchProfile({ entity_name: "Example", industry: "餐飲", recommendation: "should be dropped" });
assert.strictEqual(normalized.entity_name, "Example");
assert.strictEqual(Object.hasOwn(normalized, "recommendation"), false);
assert.throws(() => assertNoAdviceFields({ recommendation: "change title" }), /forbidden advice field/);

console.log("skill-sync.test.js passed");
