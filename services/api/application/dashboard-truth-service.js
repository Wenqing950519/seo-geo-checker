const { randomUUID } = require("node:crypto");
const { DashboardError, ENGINE_IDS } = require("./dashboard-service.js");
const { normalizeSource, TruthSourceError } = require("./dashboard-truth-source-fetcher.js");

const TRUTH_PARSER_VERSION = "truth-parser-v1";
const TRUTH_FIELDS = Object.freeze(["address", "phone", "hours"]);
const ENGINE_ALIASES = Object.freeze({
  "openai-web": "openai", "google-web": "gemini",
  "perplexity-sonar": "perplexity", "anthropic-web": "anthropic"
});

function createDashboardTruthService(options = {}) {
  const store = options.store;
  const dashboardApi = options.dashboardApi;
  const sourceFetcher = options.sourceFetcher;
  const now = options.now || (() => new Date());
  const enabled = options.enabled !== false;
  const allowlist = new Set((Array.isArray(options.allowlist) ? options.allowlist : String(options.allowlist || "").split(","))
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
  const schedule = options.schedule || ((task) => setImmediate(task));
  const executeCheck = typeof options.executeCheck === "function" ? options.executeCheck : null;
  if (!store || !dashboardApi || typeof dashboardApi.authenticateSession !== "function") {
    throw new TypeError("Brand Truth service requires the Dashboard API and store");
  }
  if (!sourceFetcher || typeof sourceFetcher.fetchSource !== "function") {
    throw new TypeError("Brand Truth service requires a source fetcher");
  }

  async function addTruthSources({ sessionToken, projectId, sources }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    ensureEnabled(session);
    if (!Array.isArray(sources) || sources.length < 1 || sources.length > 10) {
      throw new DashboardError("invalid_truth_sources", "sources must contain 1 to 10 URLs", 400);
    }
    const timestamp = iso(now());
    for (const raw of sources) {
      let normalized;
      try { normalized = normalizeSource(raw); } catch (error) { throw mapSourceError(error); }
      const sourceId = `dts_${randomUUID()}`;
      const saved = await store.insertTruthSource({
        sourceId, projectId, kind: normalized.kind, url: normalized.url, canonicalUrl: normalized.url, now: timestamp
      });
      try {
        const fetched = await sourceFetcher.fetchSource(normalized);
        await store.updateTruthSource({ sourceId: saved.sourceId, projectId, ...fetched, now: iso(now()) });
      } catch (error) {
        await store.updateTruthSource({ sourceId: saved.sourceId, projectId, status: "failed", failureCode: safeCode(error?.code, "source_fetch_failed"), now: iso(now()) });
      }
    }
    const savedSources = await store.listTruthSources(projectId);
    await setReadiness(projectId, savedSources.some((source) => ["succeeded", "partial"].includes(source.status)) ? "baseline_pending" : "sources_pending");
    return savedSources.map(publicSource);
  }

  async function listTruthSources({ sessionToken, projectId }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    ensureEnabled(session);
    return (await store.listTruthSources(projectId)).map(publicSource);
  }

  async function getTruthBaseline({ sessionToken, projectId, branchId = "primary" }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    ensureEnabled(session);
    const baseline = await store.getTruthBaseline(projectId, normalizeBranchId(branchId));
    return baseline ? publicBaseline(baseline) : null;
  }

  async function getTruthReadiness({ sessionToken, projectId }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    ensureEnabled(session);
    if (typeof store.getTruthReadiness !== "function") return "sources_pending";
    return store.getTruthReadiness(projectId);
  }

  async function confirmTruthBaseline({ sessionToken, projectId, branchId = "primary", branchName, fields, sourceIds = [] }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    ensureEnabled(session);
    const normalizedFields = normalizeFields(fields);
    const sources = await store.listTruthSources(projectId);
    const allowed = new Map(sources.map((source) => [source.sourceId, source]));
    const ids = normalizeSourceIds(sourceIds);
    if (!ids.length) throw new DashboardError("invalid_truth_baseline", "source_ids must contain at least one confirmed source", 400);
    if (ids.some((id) => !allowed.has(id))) throw new DashboardError("truth_source_not_found", "A baseline source does not belong to this Project", 400);
    if (ids.some((id) => !["succeeded", "partial"].includes(allowed.get(id).status))) {
      throw new DashboardError("truth_source_unavailable", "Baseline sources must have a completed public fetch", 409);
    }
    const timestamp = iso(now());
    const baseline = await store.createTruthBaseline({
      baselineId: `dtb_${randomUUID()}`, projectId, branchId: normalizeBranchId(branchId),
      branchName: branchName == null ? null : boundedText(branchName, 160, "branchName"),
      fields: normalizedFields, sourceIds: ids,
      sourceSnapshots: ids.map((id) => {
        const source = allowed.get(id);
        return { sourceId: source.sourceId, canonicalUrl: source.canonicalUrl, contentHash: source.contentHash,
          snippets: source.snippets, metadata: source.metadata };
      }),
      accountId: session.accountId,
      confirmedAt: timestamp, now: timestamp
    });
    await setReadiness(projectId, "ready");
    return publicBaseline(baseline);
  }

  async function startTruthCheck({ sessionToken, projectId, engineIds }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    ensureEnabled(session);
    const baseline = await store.getTruthBaseline(projectId, "primary");
    if (!baseline) throw new DashboardError("truth_baseline_required", "Confirm a Brand Truth baseline before starting a check", 409);
    const selected = normalizeEngineIds(engineIds);
    const timestamp = iso(now());
    const check = await store.createTruthCheck({
      checkId: `dtc_${randomUUID()}`, projectId, baselineId: baseline.baselineId,
      engineIds: selected, status: "queued", parserVersion: TRUTH_PARSER_VERSION,
      accountId: session.accountId, now: timestamp
    });
    if (executeCheck) {
      schedule(() => executeCheck({ check, baseline, engineIds: selected })
        .then((results) => recordTruthCheck({ checkId: check.checkId, results }))
        .catch((error) => store.finishTruthCheck({ checkId: check.checkId, status: "failed", errorCode: safeCode(error?.code, "truth_check_failed"), now: iso(now()) })));
    }
    return publicCheck(check);
  }

  // Trusted orchestration entry point. It is intentionally not mounted as a
  // browser route: raw claims and model responses must not be user-writable.
  async function recordTruthCheck({ checkId, results }) {
    const check = await store.getTruthCheck(checkId);
    if (!check) throw new DashboardError("truth_check_not_found", "Truth check was not found", 404);
    if (!["queued", "running"].includes(check.status)) return publicCheck(check);
    const baseline = await store.getTruthBaseline(check.projectId, "primary");
    const originalBaseline = baseline && baseline.baselineId === check.baselineId
      ? baseline : await loadBaselineById(check.baselineId);
    if (!originalBaseline) throw new DashboardError("truth_baseline_not_found", "Truth baseline was not found", 500);
    const sourceSnapshots = originalBaseline.sourceSnapshots?.length
      ? originalBaseline.sourceSnapshots
      : typeof store.listTruthSources === "function"
        ? (await store.listTruthSources(originalBaseline.projectId)).filter((source) => originalBaseline.sourceIds.includes(source.sourceId))
        : [];
    const selected = check.engineIds;
    const normalizedResults = normalizeResults(results, selected);
    const timestamp = iso(now());
    const claimCount = { measured: 0, failed: 0, unknown: 0 };
    for (const result of normalizedResults) {
      if (result.status === "measured") claimCount.measured += 1;
      else if (result.status === "failed") claimCount.failed += 1;
      else claimCount.unknown += 1;
      const claimsByField = new Map((result.claims || []).map((claim) => [claim.field, claim]));
      for (const field of TRUTH_FIELDS) {
        const claim = claimsByField.get(field);
        if (!claim) {
          await store.insertTruthFinding({
            findingId: `dtf_${randomUUID()}`, checkId, claimId: null, baselineId: originalBaseline.baselineId,
            field, status: result.status === "failed" ? "failed" : "not_mentioned", severity: "gray",
            confidence: "unknown", evidence: evidenceFor(result, null, originalBaseline, timestamp, sourceSnapshots), now: timestamp
          });
          continue;
        }
        const savedClaim = await store.insertTruthClaim({
          claimId: `dtc_claim_${randomUUID()}`, checkId, observationId: result.observationId,
          engine: result.engine, model: result.model, field, value: claim.value, text: claim.text,
          entityMatch: claim.entityMatch, condition: claim.condition, parserVersion: TRUTH_PARSER_VERSION, now: timestamp
        });
        const finding = compareClaim(field, claim, originalBaseline.fields[field], evidenceFor(result, claim, originalBaseline, timestamp, sourceSnapshots));
        await store.insertTruthFinding({
          findingId: `dtf_${randomUUID()}`, checkId, claimId: savedClaim.claimId, baselineId: originalBaseline.baselineId,
          field, ...finding, now: timestamp
        });
      }
    }
    const status = normalizedResults.length === 0 || claimCount.measured === 0 && claimCount.unknown === 0
      ? "failed" : claimCount.failed || claimCount.unknown || normalizedResults.length !== selected.length ? "partial" : "succeeded";
    return publicCheck(await store.finishTruthCheck({ checkId, status, now: timestamp }));
  }

  async function getTruthCheck({ sessionToken, projectId, checkId }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor", "viewer"]);
    ensureEnabled(session);
    const check = await store.getTruthCheck(checkId);
    if (!check || check.projectId !== projectId) throw new DashboardError("truth_check_not_found", "Truth check was not found", 404);
    return publicCheck(check);
  }

  async function reviewTruthFinding({ sessionToken, projectId, findingId, decision, reason }) {
    const session = await requiredProjectRole(sessionToken, projectId, ["owner", "editor"]);
    ensureEnabled(session);
    const finding = await store.getTruthFindingForProject(projectId, findingId);
    if (!finding) throw new DashboardError("truth_finding_not_found", "Truth finding was not found", 404);
    const selected = String(decision || "").trim().toLowerCase();
    if (!["accepted", "rejected", "needs_data"].includes(selected)) throw new DashboardError("invalid_truth_review", "decision must be accepted, rejected, or needs_data", 400);
    const note = boundedText(reason, 1_000, "reason");
    const reviewed = await store.reviewTruthFinding({
      reviewId: `dtr_${randomUUID()}`, findingId, projectId, accountId: session.accountId,
      decision: selected, reason: note, now: iso(now())
    });
    if (!reviewed) throw new DashboardError("truth_finding_already_reviewed", "Truth finding was already reviewed", 409);
    return publicFinding(reviewed);
  }

  async function requiredProjectRole(sessionToken, projectId, roles) {
    const session = await dashboardApi.authenticateSession(sessionToken);
    if (!session) throw new DashboardError("auth_required", "A valid Dashboard session is required", 401);
    const membership = await store.getMembership(String(projectId || ""), session.accountId);
    if (!membership || !roles.includes(membership.role)) throw new DashboardError("project_access_denied", "Project access is not granted", 404);
    return { ...session, role: membership.role };
  }

  function ensureEnabled(session) {
    if (!enabled) throw new DashboardError("truth_not_enabled", "Brand Truth is not enabled for this environment", 503);
    if (allowlist.size && !allowlist.has(String(session.email || "").toLowerCase())) {
      throw new DashboardError("truth_not_enabled", "Brand Truth is not enabled for this account", 404);
    }
  }

  async function loadBaselineById(baselineId) {
    if (typeof store.getTruthBaselineById === "function") return store.getTruthBaselineById(baselineId);
    return null;
  }

  async function setReadiness(projectId, readiness) {
    if (typeof store.setTruthReadiness === "function") await store.setTruthReadiness({ projectId, readiness, now: iso(now()) });
  }

  return { addTruthSources, listTruthSources, getTruthBaseline, getTruthReadiness, confirmTruthBaseline, startTruthCheck, recordTruthCheck, getTruthCheck, reviewTruthFinding };
}

function normalizeEngineIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw new DashboardError("invalid_truth_engines", "engine_ids must contain 1 to 4 engines", 400);
  const ids = [...new Set(value.map((entry) => String(entry || "").trim().toLowerCase()))];
  if (ids.length !== value.length || ids.some((id) => !ENGINE_IDS.includes(id))) throw new DashboardError("invalid_truth_engines", `engine_ids must use ${ENGINE_IDS.join(", ")}`, 400);
  return ids;
}

function normalizeFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DashboardError("invalid_truth_baseline", "fields are required", 400);
  const fields = {};
  for (const field of TRUTH_FIELDS) {
    const raw = value[field];
    if (raw == null) continue;
    const item = typeof raw === "string" ? { value: raw } : raw;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new DashboardError("invalid_truth_baseline", `${field} must be a value object`, 400);
    fields[field] = { value: boundedText(item.value, 1_000, `fields.${field}.value`), condition: item.condition || null };
  }
  if (!Object.keys(fields).length) throw new DashboardError("invalid_truth_baseline", "at least one baseline field is required", 400);
  return fields;
}

function normalizeSourceIds(value) {
  if (!Array.isArray(value) || value.length > 10) throw new DashboardError("invalid_truth_baseline", "source_ids must contain at most 10 items", 400);
  return [...new Set(value.map((entry) => boundedText(entry, 180, "source_id")))];
}

function normalizeResults(value, selected) {
  if (!Array.isArray(value)) throw new DashboardError("invalid_truth_results", "results must be an array", 400);
  const seen = new Set();
  const results = value.map((raw) => {
    const suppliedEngine = String(raw?.engine || "").trim().toLowerCase();
    const engine = ENGINE_ALIASES[suppliedEngine] || suppliedEngine;
    if (!selected.includes(engine) || seen.has(engine)) throw new DashboardError("invalid_truth_results", "result engine is not selected or is duplicated", 400);
    seen.add(engine);
    const status = String(raw?.status || "unknown").trim().toLowerCase();
    if (!["measured", "unknown", "failed"].includes(status)) throw new DashboardError("invalid_truth_results", "result status is invalid", 400);
    const claims = status === "measured" && Array.isArray(raw.claims) ? raw.claims.map(normalizeClaim).filter(Boolean) : [];
    return {
      engine, model: raw?.model == null ? null : boundedText(raw.model, 160, "result.model"),
      observationId: raw?.observation_id || raw?.observationId || null, status,
      rawAnswer: raw?.raw_answer || raw?.rawAnswer || null,
      failureCode: raw?.failure_code || raw?.failureCode || null, claims
    };
  });
  for (const engine of selected) {
    if (!seen.has(engine)) results.push({ engine, model: null, observationId: null, status: "failed", rawAnswer: null, failureCode: "missing_engine_result", claims: [] });
  }
  return results;
}

function normalizeClaim(raw) {
  const field = String(raw?.field || "").trim().toLowerCase();
  if (!TRUTH_FIELDS.includes(field)) return null;
  const text = boundedText(raw?.text || raw?.claim_text || raw?.value, 2_000, "claim.text");
  const value = raw?.value == null ? null : boundedText(raw.value, 1_000, "claim.value");
  const entityMatch = String(raw?.entity_match || raw?.entityMatch || "unknown").trim().toLowerCase();
  if (!["same", "different", "unknown"].includes(entityMatch)) throw new DashboardError("invalid_truth_results", "claim entity_match is invalid", 400);
  return { field, value, text, entityMatch, condition: raw?.condition || {} };
}

function compareClaim(field, claim, baseline, evidence) {
  if (!baseline?.value || claim.entityMatch !== "same" || !claim.value) {
    return { status: "insufficient", severity: "yellow", confidence: claim.entityMatch === "same" && claim.value ? "medium" : "unknown", evidence };
  }
  if (!conditionsMatch(baseline.condition, claim.condition)) {
    return { status: "insufficient", severity: "yellow", confidence: "low", evidence: { ...evidence, limitation: "claim condition does not match the confirmed baseline condition" } };
  }
  if (normalizeComparable(field, claim.value) === normalizeComparable(field, baseline.value)) {
    return { status: "supported", severity: "green", confidence: "high", evidence };
  }
  return { status: "contradiction", severity: "red", confidence: "high", evidence };
}

function conditionsMatch(expected, observed) {
  if (expected == null || (typeof expected === "object" && Object.keys(expected).length === 0)) return true;
  if (observed == null || typeof observed !== "object") return false;
  return JSON.stringify(expected) === JSON.stringify(observed);
}

function normalizeComparable(field, value) {
  const text = String(value || "").trim().replace(/臺/g, "台");
  if (field === "phone") return text.replace(/[^0-9]/g, "");
  return text.replace(/[\s\u3000，。；;、:：()（）\-~至]/g, "").toLowerCase();
}

function evidenceFor(result, claim, baseline, observedAt, sourceSnapshots = []) {
  return {
    source_ids: baseline?.sourceIds || [], baseline_id: baseline?.baselineId || null,
    baseline_version: baseline?.version || null, parser_version: TRUTH_PARSER_VERSION,
    source_snapshots: sourceSnapshots.map((source) => ({ source_id: source.sourceId, canonical_url: source.canonicalUrl,
      content_hash: source.contentHash, snippets: source.snippets })),
    engine: result.engine, model: result.model, observed_at: observedAt || iso(new Date()), observation_id: result.observationId,
    raw_answer: result.rawAnswer == null ? null : String(result.rawAnswer).slice(0, 4_000),
    claim_text: claim?.text || null, failure_code: result.failureCode || null,
    limitations: ["AI output is an auditable observation, not the confirmed baseline truth"]
  };
}

function publicSource(source) {
  return {
    source_id: source.sourceId, project_id: source.projectId, kind: source.kind, url: source.url,
    canonical_url: source.canonicalUrl, status: source.status, fetched_at: source.fetchedAt,
    content_hash: source.contentHash, metadata: source.metadata, snippets: source.snippets,
    candidate_fields: source.candidateFields, failure_code: source.failureCode
  };
}

function publicBaseline(baseline) {
  return {
    baseline_id: baseline.baselineId, project_id: baseline.projectId, branch_id: baseline.branchId,
    branch_name: baseline.branchName, version: baseline.version, fields: baseline.fields,
    source_ids: baseline.sourceIds, status: baseline.status, confirmed_by: baseline.confirmedBy,
    confirmed_at: baseline.confirmedAt, created_at: baseline.createdAt,
    source_snapshots: (baseline.sourceSnapshots || []).map((source) => ({ source_id: source.sourceId,
      canonical_url: source.canonicalUrl, content_hash: source.contentHash, snippets: source.snippets,
      metadata: source.metadata, captured_at: source.capturedAt }))
  };
}

function publicCheck(check) {
  return {
    check_id: check.checkId, project_id: check.projectId, baseline_id: check.baselineId,
    baseline_version: check.baselineVersion, engine_ids: check.engineIds, status: check.status,
    parser_version: check.parserVersion, created_at: check.createdAt, updated_at: check.updatedAt,
    completed_at: check.completedAt, error_code: check.errorCode,
    claims: (check.claims || []).map(publicClaim), findings: (check.findings || []).map(publicFinding)
  };
}

function publicClaim(claim) {
  return {
    claim_id: claim.claimId, check_id: claim.checkId, observation_id: claim.observationId,
    engine: claim.engine, model: claim.model, field: claim.field, value: claim.value,
    text: claim.text, entity_match: claim.entityMatch, condition: claim.condition,
    parser_version: claim.parserVersion, created_at: claim.createdAt
  };
}

function publicFinding(finding) {
  return {
    finding_id: finding.findingId, check_id: finding.checkId, claim_id: finding.claimId,
    baseline_id: finding.baselineId, field: finding.field, status: finding.status,
    severity: finding.severity, confidence: finding.confidence, evidence: finding.evidence,
    review_status: finding.reviewStatus, created_at: finding.createdAt, updated_at: finding.updatedAt
  };
}

function normalizeBranchId(value) { return boundedText(value || "primary", 80, "branchId"); }
function boundedText(value, max, label) { const text = String(value || "").trim(); if (!text || text.length > max) throw new DashboardError("invalid_request", `${label} must be 1 to ${max} characters`, 400); return text; }
function safeCode(value, fallback) { return /^[a-z0-9_]{1,80}$/i.test(String(value || "")) ? String(value) : fallback; }
function iso(value) { return new Date(value).toISOString(); }
function mapSourceError(error) { return error instanceof TruthSourceError ? new DashboardError(error.code, error.message, error.statusCode) : error; }

module.exports = { TRUTH_FIELDS, TRUTH_PARSER_VERSION, createDashboardTruthService };
