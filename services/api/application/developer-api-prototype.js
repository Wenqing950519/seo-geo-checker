const { createHash, randomUUID } = require("node:crypto");
const { isIP } = require("node:net");
const { listOfficialEngineProfiles } = require("./official-engine-profiles.js");
const { defineSearchProvider } = require("../ports/search-provider.js");
const { createInMemoryMeasurementResultStore } = require("../storage/developer-measurement-result-store.js");
const {
  buildBrandTermSet,
  classifyAnswerStatus,
  classifySourceType,
  isFirstParty,
  matchTermsInText
} = require("../../../packages/geo-core/evidence/brand-match.js");

const DEVELOPER_API_PROTOTYPE_VERSION = "0.1.0";
const DEFAULT_QUOTA_LIMIT = 3;

class DeveloperApiError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function createFixtureProviders(options = {}) {
  const failProfileId = String(options.failProfileId || "");
  return listOfficialEngineProfiles().map((profile) => defineSearchProvider({
    id: profile.id,
    mode: "fixture",
    async execute(request) {
      if (profile.id === failProfileId) {
        throw new DeveloperApiError("provider_timeout", `${profile.provider} fixture timed out`, 503);
      }
      const host = request.input.url ? new URL(request.input.url).hostname : "fixture.example";
      return {
        answer: `[fixture:${profile.provider}] ${request.prompt}\n本回應只用於離線 API 雛型驗證。`,
        citations: [{
          url: `https://${host}/fixture/${profile.id}`,
          title: `${profile.provider} fixture citation`
        }],
        searchEvidence: { mode: "fixture_native_search", profile_id: profile.id, executed: true }
      };
    }
  }));
}

function createDeveloperApiPrototype(options = {}) {
  const now = options.now || (() => new Date());
  const schedule = options.schedule || ((task) => setImmediate(task));
  const quotaLimit = positiveInteger(options.quotaLimit, DEFAULT_QUOTA_LIMIT);
  const providers = normalizeProviders(options.providers || createFixtureProviders());
  const providerMode = providers[0].adapter.mode;
  const resultStore = options.resultStore || createInMemoryMeasurementResultStore();
  const jobs = new Map();
  const operationIds = new Map();
  const usage = new Map();

  async function createMeasurement({ tenantId, idempotencyKey, body }) {
    const tenant = requiredTenant(tenantId);
    const key = requiredIdempotencyKey(idempotencyKey);
    const request = {
      ...normalizeMeasurementRequest(body),
      profile_set_version: providerMode === "official" ? "official-four-v1" : "official-four-fixture-v1"
    };
    const requestHash = hashRequest(request);
    const operationKey = `${tenant}:${key}`;
    const existingJobId = operationIds.get(operationKey);
    if (existingJobId) {
      const existing = jobs.get(existingJobId);
      if (existing.request_hash !== requestHash) {
        throw new DeveloperApiError("idempotency_conflict", "Idempotency-Key was already used with different content", 409);
      }
      return { created: false, job: publicJob(existing) };
    }

    const accountUsage = usageFor(tenant);
    if (accountUsage.used_rounds + accountUsage.reserved_rounds >= quotaLimit) {
      throw new DeveloperApiError("quota_exhausted", "No prototype rounds remain", 429);
    }
    accountUsage.reserved_rounds += 1;
    const createdAt = now().toISOString();
    const job = {
      job_id: `job_${randomUUID()}`,
      measurement_id: `msr_${randomUUID()}`,
      tenant_id: tenant,
      status: "queued",
      created_at: createdAt,
      request_hash: requestHash,
      request
    };
    jobs.set(job.job_id, job);
    operationIds.set(operationKey, job.job_id);
    schedule(() => execute(job).catch((error) => failBeforeResult(job, error)));
    return { created: true, job: publicJob(job) };
  }

  function getJob({ tenantId, jobId }) {
    const job = jobs.get(String(jobId || ""));
    return job && job.tenant_id === String(tenantId || "") ? publicJob(job) : null;
  }

  function getJobByMeasurement({ tenantId, measurementId }) {
    for (const job of jobs.values()) {
      if (job.tenant_id === String(tenantId || "") && job.measurement_id === String(measurementId || "")) return publicJob(job);
    }
    return null;
  }

  async function getMeasurement({ tenantId, measurementId }) {
    return resultStore.get({ tenantId: String(tenantId || ""), measurementId: String(measurementId || "") });
  }

  function getUsage({ tenantId }) {
    const item = usageFor(requiredTenant(tenantId));
    return {
      used_rounds: item.used_rounds,
      reserved_rounds: item.reserved_rounds,
      remaining_rounds: Math.max(0, quotaLimit - item.used_rounds - item.reserved_rounds),
      quota_limit: quotaLimit
    };
  }

  async function execute(job) {
    job.status = "running";
    const attempts = await Promise.all(providers.map(async ({ profile, adapter }) => {
      try {
        const response = await adapter.execute({ ...job.request, prompt: job.request.effective_prompt }, {
          attempt_id: `att_${randomUUID()}`,
          job_id: job.job_id,
          profile
        });
        return normalizeEngineResult(profile, response);
      } catch (error) {
        return failedEngineResult(profile, error);
      }
    }));
    const completedAt = now().toISOString();
    const succeeded = attempts.every((engine) => engine.status === "succeeded");
    const completed = buildMeasurement(job, attempts, succeeded, completedAt, providerMode);
    try {
      await resultStore.put(completed);
    } catch (error) {
      await failBeforeResult(job, new DeveloperApiError("persistence_error", "Unable to save measurement result", 500));
      return;
    }
    const accountUsage = usageFor(job.tenant_id);
    accountUsage.reserved_rounds = Math.max(0, accountUsage.reserved_rounds - 1);
    if (succeeded) accountUsage.used_rounds += 1;
    job.status = completed.status;
    job.completed_at = completedAt;
  }

  async function failBeforeResult(job, error) {
    if (["succeeded", "failed"].includes(job.status)) return;
    job.status = "failed";
    job.error_code = error?.code || "internal_error";
    job.completed_at = now().toISOString();
    const accountUsage = usageFor(job.tenant_id);
    accountUsage.reserved_rounds = Math.max(0, accountUsage.reserved_rounds - 1);
  }

  function usageFor(tenant) {
    if (!usage.has(tenant)) usage.set(tenant, { used_rounds: 0, reserved_rounds: 0 });
    return usage.get(tenant);
  }

  return {
    createMeasurement,
    getJob,
    getJobByMeasurement,
    getMeasurement,
    getUsage,
    state: () => ({ version: DEVELOPER_API_PROTOTYPE_VERSION, provider_count: providers.length, provider_mode: providerMode, result_store: resultStore.state?.() || { kind: "custom" } })
  };
}

function normalizeProviders(adapters) {
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const normalized = listOfficialEngineProfiles().map((profile) => {
    const adapter = byId.get(profile.id);
    if (!adapter) throw new TypeError(`Missing fixed fixture provider: ${profile.id}`);
    return { profile, adapter };
  });
  const modes = new Set(normalized.map(({ adapter }) => adapter.mode));
  if (modes.size !== 1 || !["fixture", "official"].includes(normalized[0].adapter.mode)) {
    throw new TypeError("All fixed providers must declare the same explicit mode: fixture or official");
  }
  return normalized;
}

function normalizeMeasurementRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DeveloperApiError("invalid_request", "Request body must be an object");
  }
  const input = body.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DeveloperApiError("invalid_request", "input is required");
  }
  const type = String(input.type || "");
  let normalizedInput;
  let effectivePrompt;
  let questionSource;
  if (type === "prompt") {
    const text = boundedText(input.text, "input.text", 4_000);
    normalizedInput = { type, text };
    effectivePrompt = text;
    questionSource = "user";
  } else if (type === "url") {
    const url = normalizePublicHttpUrl(input.url, "input.url");
    normalizedInput = { type, url };
    effectivePrompt = generatedPrompt(url, body.locale);
    questionSource = "generated";
  } else {
    throw new DeveloperApiError("invalid_request", "input.type must be prompt or url");
  }
  const target = normalizeTarget(body.target);
  return {
    input: normalizedInput,
    input_mode: type,
    target,
    locale: String(body.locale || "und").trim().slice(0, 35) || "und",
    effective_prompt: effectivePrompt,
    question_source: questionSource,
    pipeline_version: DEVELOPER_API_PROTOTYPE_VERSION,
    profile_set_version: null
  };
}

function normalizeTarget(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new DeveloperApiError("invalid_request", "target must be an object");
  const name = value.name == null ? "" : boundedText(value.name, "target.name", 160);
  const url = value.url == null ? "" : normalizePublicHttpUrl(value.url, "target.url");
  if (!name && !url) throw new DeveloperApiError("invalid_request", "target requires name or url");
  return { name: name || null, url: url || null };
}

function buildMeasurement(job, engines, succeeded, completedAt, providerMode) {
  const successful = engines.filter((engine) => engine.status === "succeeded");
  const sources = uniqueSources(successful, job.request.target);
  const analysis = buildAnalysis(successful, job.request.target, sources, providerMode);
  return {
    measurement_id: job.measurement_id,
    tenant_id: job.tenant_id,
    status: succeeded ? "succeeded" : "failed",
    created_at: job.created_at,
    completed_at: completedAt,
    input_mode: job.request.input_mode,
    effective_prompt: job.request.effective_prompt,
    question_source: job.request.question_source,
    target: job.request.target,
    locale: job.request.locale,
    pipeline_version: job.request.pipeline_version,
    profile_set_version: job.request.profile_set_version,
    engines,
    sources,
    analysis,
    comparison: succeeded ? { status: "available", compared_profile_ids: engines.map((engine) => engine.profile_id) } : null,
    partial_results: succeeded ? null : successful,
    quota: { charged_rounds: succeeded ? 1 : 0 },
    provider_cost: summarizeProviderCosts(engines),
    limitations: providerMode === "fixture"
      ? ["fixture_only_no_live_provider_or_web_search"]
      : ["single_prompt_single_observation", "provider_billing_and_free_allowances_require_account_reconciliation"]
  };
}

function normalizeEngineResult(profile, response) {
  const answer = String(response?.answer || "").trim();
  if (classifyAnswerStatus(answer) !== "answered" || !response?.searchEvidence?.mode || response.searchEvidence.executed !== true) {
    return failedEngineResult(profile, new DeveloperApiError("provider_invalid_response", "Provider response was incomplete", 502), response);
  }
  const citations = Array.isArray(response.citations) ? response.citations.flatMap((citation) => {
    try {
      return [{
        url: normalizePublicHttpUrl(citation?.url, "citation.url"),
        title: String(citation?.title || "").slice(0, 300) || null
      }];
    } catch {
      return [];
    }
  }) : [];
  return {
    profile_id: profile.id,
    provider: profile.provider,
    model: profile.model,
    search_surface: profile.searchSurface,
    status: "succeeded",
    answer,
    citations,
    search_evidence: { mode: response.searchEvidence.mode },
    usage: response.usage || null,
    cost: response.cost || null,
    native_evidence: response.nativeEvidence || null,
    error: null
  };
}

function summarizeProviderCosts(engines) {
  let minimum = 0;
  let maximum = 0;
  let unknown = false;
  for (const engine of engines) {
    const cost = engine.cost;
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
    minimum_usd: Math.round(minimum * 100_000_000) / 100_000_000,
    maximum_usd: Math.round(maximum * 100_000_000) / 100_000_000,
    has_unknown_cost: unknown
  };
}

function failedEngineResult(profile, error, response = null) {
  return {
    profile_id: profile.id,
    provider: profile.provider,
    model: profile.model,
    search_surface: profile.searchSurface,
    status: "failed",
    answer: null,
    citations: [],
    search_evidence: null,
    usage: response?.usage || null,
    cost: response?.cost || null,
    native_evidence: response?.nativeEvidence || null,
    error: { code: error?.code || "provider_error" }
  };
}

function uniqueSources(engines, target) {
  const items = new Map();
  for (const engine of engines) {
    for (const citation of engine.citations) {
      const key = citation.url;
      const current = items.get(key) || {
        source_id: `src_${createHash("sha256").update(key).digest("hex").slice(0, 16)}`,
        url: citation.url,
        title: citation.title,
        type: classifySourceType(citation.url, targetHost(target), target ? [target.url].filter(Boolean) : []),
        cited_by: []
      };
      current.cited_by.push(engine.profile_id);
      items.set(key, current);
    }
  }
  return [...items.values()];
}

function buildAnalysis(engines, target, sources, providerMode) {
  if (!target) return { target_observation: null, limitations: ["target_not_provided"] };
  const terms = buildBrandTermSet({
    host: targetHost(target),
    masterTerms: target.name ? [target.name] : []
  });
  if (!terms.length) return { target_observation: null, limitations: ["target_identity_not_verifiable"] };
  return {
    target_observation: engines.map((engine) => ({
      profile_id: engine.profile_id,
      mentioned: matchTermsInText(engine.answer, terms).length > 0,
      first_party_citation: sources.some((source) => source.cited_by.includes(engine.profile_id) && isFirstParty(source.url, targetHost(target), [target.url].filter(Boolean)))
    })),
    limitations: providerMode === "fixture"
      ? ["fixture_evidence_is_not_a_live_search_observation"]
      : ["single_prompt_single_observation"]
  };
}

function targetHost(target) {
  if (!target?.url) return "";
  try { return new URL(target.url).hostname; } catch { return ""; }
}

function generatedPrompt(url, locale) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return String(locale || "").toLowerCase().startsWith("zh")
    ? `使用者在選擇 ${host} 提供的服務前，應了解哪些可靠資訊？`
    : `What reliable information should a prospective customer know before choosing services from ${host}?`;
}

function normalizePublicHttpUrl(value, field) {
  const raw = boundedText(value, field, 2_048);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new DeveloperApiError("invalid_request", `${field} must be an absolute http(s) URL`); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
    throw new DeveloperApiError("invalid_request", `${field} must be a public http(s) URL`);
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (parsed.port || hostname === "localhost" || hostname.endsWith(".localhost") || isIP(hostname)) {
    throw new DeveloperApiError("invalid_request", `${field} must use a public hostname and default http(s) port`);
  }
  return parsed.toString();
}

function boundedText(value, field, limit) {
  const text = String(value || "").trim();
  if (!text) throw new DeveloperApiError("invalid_request", `${field} is required`);
  if (text.length > limit) throw new DeveloperApiError("invalid_request", `${field} exceeds ${limit} characters`);
  return text;
}

function requiredTenant(value) {
  const tenant = String(value || "").trim();
  if (!tenant) throw new DeveloperApiError("auth_required", "Authentication is required", 401);
  return tenant;
}

function requiredIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (key.length < 8 || key.length > 200) throw new DeveloperApiError("invalid_request", "Idempotency-Key must be 8 to 200 characters");
  return key;
}

function hashRequest(request) {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

function publicJob(job) {
  return {
    job_id: job.job_id,
    measurement_id: job.measurement_id,
    status: job.status,
    created_at: job.created_at,
    completed_at: job.completed_at || null,
    error_code: job.error_code || null
  };
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  DEVELOPER_API_PROTOTYPE_VERSION,
  DeveloperApiError,
  buildMeasurement,
  createDeveloperApiPrototype,
  createFixtureProviders,
  failedEngineResult,
  hashRequest,
  normalizeEngineResult,
  normalizeMeasurementRequest,
  normalizeProviders,
  publicJob,
  requiredIdempotencyKey,
  requiredTenant
};
