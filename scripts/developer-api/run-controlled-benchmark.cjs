const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { isIP } = require("node:net");
const { loadEnvFiles } = require("../../packages/shared/env.js");
const { createOfficialProvidersFromEnv } = require("../../services/api/application/official-search-providers.js");
const { buildBenchmarkSummary, costBoundsFromOutcomes } = require("./benchmark-metrics.cjs");

const root = path.resolve(__dirname, "../..");
const defaultPlan = path.join(root, "docs/developer-api/evidence/controlled-benchmark-inputs-20-v1.json");
const defaultOutput = path.join(root, "docs/developer-api/evidence/controlled-benchmark-2026-09-09.jsonl");

async function main() {
  const planPath = path.resolve(argument("plan") || defaultPlan);
  const outputPath = path.resolve(argument("output") || defaultOutput);
  const twdPerUsd = positiveNumber(argument("twd-per-usd"), "--twd-per-usd");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  validatePlan(plan);
  const planHash = sha256(JSON.stringify(plan));
  if (process.argv.includes("--validate-only")) {
    process.stdout.write(`${JSON.stringify({ valid: true, plan_version: plan.plan_version, plan_sha256: planHash, questions: plan.questions.length }, null, 2)}\n`);
    return;
  }

  loadEnvFiles();
  const providers = createOfficialProvidersFromEnv();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const events = readEvents(outputPath);
  const start = events.find((event) => event.event === "benchmark_started");
  if (start && (start.plan_sha256 !== planHash || Number(start.twd_per_usd) !== twdPerUsd)) {
    throw codedError("benchmark_identity_mismatch", "Existing evidence belongs to a different plan or exchange rate");
  }
  if (events.some((event) => event.event === "benchmark_completed")) {
    const completed = events.findLast((event) => event.event === "benchmark_completed");
    process.stdout.write(`${JSON.stringify(completed.summary, null, 2)}\n`);
    process.exitCode = completed.summary.passed ? 0 : 2;
    return;
  }
  const runId = start?.run_id || `bench_${randomUUID()}`;
  if (!start) appendEvent(outputPath, {
    event: "benchmark_started",
    run_id: runId,
    started_at: new Date().toISOString(),
    plan_version: plan.plan_version,
    plan_sha256: planHash,
    twd_per_usd: twdPerUsd,
    criteria: plan.criteria,
    limits: plan.limits
  });

  const currentEvents = readEvents(outputPath);
  const completedIds = new Set(currentEvents.filter((event) => event.event === "round_completed").map((event) => event.question_id));
  const ambiguous = currentEvents.find((event) => event.event === "round_started" && !completedIds.has(event.question_id));
  if (ambiguous) {
    throw codedError("ambiguous_inflight_round", `Round ${ambiguous.question_id} started without a completion record; reconcile provider billing before any retry`);
  }
  const records = currentEvents.filter((event) => event.event === "round_completed");

  for (const [index, question] of plan.questions.entries()) {
    if (completedIds.has(question.id)) continue;
    const current = buildBenchmarkSummary(records, plan.criteria);
    if (current.total_accounted_cost_twd + plan.limits.unknown_round_cost_reserve_twd > plan.criteria.total_budget_twd) {
      appendEvent(outputPath, { event: "benchmark_stopped", run_id: runId, stopped_at: new Date().toISOString(), reason: "budget_guard", summary: current });
      throw codedError("budget_guard", "Conservative budget guard stopped the benchmark before the next round");
    }
    const roundStartedAt = new Date().toISOString();
    appendEvent(outputPath, {
      event: "round_started",
      run_id: runId,
      round: index + 1,
      question_id: question.id,
      prompt_sha256: sha256(question.prompt),
      started_at: roundStartedAt
    });
    const roundStart = Date.now();
    const outcomes = await Promise.all(providers.map((provider) => executeProvider(provider, question, plan)));
    const roundCost = costBoundsFromOutcomes(outcomes, twdPerUsd, plan.limits.unknown_round_cost_reserve_twd);
    const record = {
      event: "round_completed",
      run_id: runId,
      round: index + 1,
      question_id: question.id,
      category: question.category,
      reference_url: question.reference_url,
      prompt_sha256: sha256(question.prompt),
      started_at: roundStartedAt,
      completed_at: new Date().toISOString(),
      round_duration_ms: Date.now() - roundStart,
      providers: outcomes,
      round_cost: roundCost
    };
    appendEvent(outputPath, record);
    records.push(record);
    completedIds.add(question.id);
    const progress = buildBenchmarkSummary(records, plan.criteria);
    process.stdout.write(`[${records.length}/${plan.criteria.required_rounds}] ${question.id} success=${outcomes.filter((item) => item.status === "succeeded").length}/4 cost_max_twd=${roundCost.accounted_maximum_twd} duration_ms=${record.round_duration_ms} cumulative_twd=${progress.total_accounted_cost_twd}\n`);
    if (progress.total_accounted_cost_twd > plan.criteria.total_budget_twd) {
      appendEvent(outputPath, { event: "benchmark_stopped", run_id: runId, stopped_at: new Date().toISOString(), reason: "budget_exceeded", summary: progress });
      throw codedError("budget_exceeded", "Recorded conservative cost exceeded the approved budget");
    }
  }

  const summary = buildBenchmarkSummary(records, plan.criteria);
  const summaryEvent = { event: "benchmark_completed", run_id: runId, completed_at: new Date().toISOString(), summary };
  appendEvent(outputPath, summaryEvent);
  const summaryPath = outputPath.replace(/\.jsonl$/i, ".summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify({ ...summaryEvent, plan_version: plan.plan_version, plan_sha256: planHash, twd_per_usd: twdPerUsd }, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.passed ? 0 : 2;
}

async function executeProvider(provider, question, plan) {
  const started = Date.now();
  try {
    const result = await provider.execute({
      prompt: question.prompt,
      locale: plan.locale,
      input: { type: "prompt", text: question.prompt },
      maxOutputTokens: plan.limits.max_output_tokens,
      maxSearchRequests: plan.limits.max_search_requests_where_supported,
      timeoutMs: plan.limits.provider_timeout_ms
    });
    const citationCount = Array.isArray(result.citations) ? result.citations.length : 0;
    const answerCharacters = String(result.answer || "").length;
    const searchExecuted = result.searchEvidence?.executed === true;
    let errorCode = null;
    if (!answerCharacters) errorCode = "provider_invalid_response";
    else if (!searchExecuted) errorCode = "search_unconfirmed";
    else if (!citationCount) errorCode = "citation_missing";
    return {
      profile_id: provider.id,
      status: errorCode ? "failed" : "succeeded",
      error_code: errorCode,
      latency_ms: Date.now() - started,
      reported_model: result.nativeEvidence?.reported_model || null,
      response_id_present: Boolean(result.nativeEvidence?.response_id),
      search_executed: searchExecuted,
      citation_count: citationCount,
      answer_characters: answerCharacters,
      usage: result.usage || null,
      cost: result.cost || null
    };
  } catch (error) {
    return {
      profile_id: provider.id,
      status: "failed",
      error_code: error?.code || "provider_error",
      latency_ms: Date.now() - started,
      reported_model: null,
      response_id_present: false,
      search_executed: false,
      citation_count: 0,
      answer_characters: 0,
      usage: null,
      cost: null
    };
  }
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.questions)) throw new Error("Plan must contain questions");
  if (plan.questions.length !== plan.criteria?.required_rounds || plan.questions.length !== 20) throw new Error("Plan must contain exactly 20 required questions");
  const ids = new Set();
  for (const question of plan.questions) {
    if (!question.id || ids.has(question.id)) throw new Error("Question ids must be present and unique");
    ids.add(question.id);
    if (!String(question.prompt || "").trim() || String(question.prompt).length > 2_000) throw new Error(`Invalid prompt: ${question.id}`);
    const url = new URL(question.reference_url);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(host) || host === "localhost") throw new Error(`Reference URL must be public HTTPS: ${question.id}`);
  }
  const criteria = plan.criteria || {};
  for (const key of ["required_rounds", "minimum_all_four_success_rounds", "p95_round_cost_twd_max", "maximum_round_duration_ms", "total_budget_twd"]) positiveNumber(criteria[key], `criteria.${key}`);
  const limits = plan.limits || {};
  for (const key of ["attempts_per_provider", "max_output_tokens", "max_search_requests_where_supported", "provider_timeout_ms", "unknown_round_cost_reserve_twd"]) positiveNumber(limits[key], `limits.${key}`);
  if (limits.attempts_per_provider !== 1) throw new Error("Controlled benchmark forbids retries");
  if (limits.provider_timeout_ms >= criteria.maximum_round_duration_ms) throw new Error("Provider timeout must leave room inside the round duration limit");
}

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw codedError("invalid_evidence_file", `Invalid JSONL at line ${index + 1}`); }
  });
}

function appendEvent(file, value) {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`);
  return number;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: { code: error?.code || "benchmark_failed", message: error?.message || "Benchmark failed" } }));
  process.exitCode = 1;
});
