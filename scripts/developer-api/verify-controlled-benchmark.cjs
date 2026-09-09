const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { buildBenchmarkSummary } = require("./benchmark-metrics.cjs");

const root = path.resolve(__dirname, "../..");
const planPath = path.join(root, "docs/developer-api/evidence/controlled-benchmark-inputs-20-v1.json");
const evidencePath = path.join(root, "docs/developer-api/evidence/controlled-benchmark-2026-09-09.jsonl");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const events = fs.readFileSync(evidencePath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const benchmarkStarts = events.filter((event) => event.event === "benchmark_started");
const roundStarts = events.filter((event) => event.event === "round_started");
const rounds = events.filter((event) => event.event === "round_completed");
const completions = events.filter((event) => event.event === "benchmark_completed");

assert.equal(benchmarkStarts.length, 1);
assert.equal(completions.length, 1);
assert.equal(roundStarts.length, plan.questions.length);
assert.equal(rounds.length, plan.questions.length);
assert.equal(new Set(rounds.map((round) => round.question_id)).size, plan.questions.length);
assert.deepEqual(rounds.map((round) => round.question_id), plan.questions.map((question) => question.id));
assert.equal(benchmarkStarts[0].plan_sha256, sha256(JSON.stringify(plan)));

for (const [index, round] of rounds.entries()) {
  const question = plan.questions[index];
  assert.equal(round.prompt_sha256, sha256(question.prompt));
  assert.equal(roundStarts[index].question_id, round.question_id);
  assert.equal(roundStarts[index].prompt_sha256, round.prompt_sha256);
  assert.deepEqual(round.providers.map((provider) => provider.profile_id), ["openai-web", "google-web", "perplexity-sonar", "anthropic-web"]);
  assert.equal(round.providers.length, 4);
  for (const provider of round.providers) {
    assert.equal(Object.hasOwn(provider, "answer"), false);
    assert.equal(Object.hasOwn(provider, "citations"), false);
  }
}

const recomputed = buildBenchmarkSummary(rounds, plan.criteria);
assert.deepEqual(completions[0].summary, recomputed);
assert.equal(recomputed.passed, true);
process.stdout.write(`${JSON.stringify({ verified: true, plan_version: plan.plan_version, evidence_events: events.length, ...recomputed }, null, 2)}\n`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
