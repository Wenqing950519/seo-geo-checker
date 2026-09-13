// Row mappers shared by the SQLite (Node) and D1 (Cloudflare Worker) Dashboard stores.
// This module must stay free of `node:sqlite` so the Workers bundle can import it.

function mapGoogleConnection(row) {
  return { connectionId: row.connection_id, projectId: row.project_id, accountId: row.account_id,
    googleEmail: row.google_email, propertyUri: row.property_uri, ciphertext: row.refresh_token_ciphertext,
    iv: row.refresh_token_iv, tag: row.refresh_token_tag, scopes: parseJson(row.scopes_json, []), createdAt: row.created_at };
}

function boolToSql(value) {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function mapAccount(row) {
  return { accountId: row.account_id, email: row.email_normalized, status: row.status };
}

function mapProject(row) {
  return {
    projectId: row.project_id, name: row.name, siteUrl: row.site_url, timezone: row.timezone,
    cadence: row.cadence, enabled: Boolean(row.enabled), nextRunAt: row.next_run_at,
    truthReadiness: row.truth_readiness || "sources_pending",
    role: row.role || null, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function mapEntitlement(row) {
  return {
    accountId: row.account_id, plan: row.plan, status: row.status,
    activeProjectLimit: Number(row.active_project_limit), manualRunLimit: Number(row.manual_run_limit),
    periodStart: row.period_start || null, periodEnd: row.period_end || null,
    graceEndsAt: row.grace_ends_at || null, cancelAt: row.cancel_at || null
  };
}

function mapTrackingJob(row) {
  return {
    jobId: row.job_id, accountId: row.account_id, projectId: row.project_id, kind: row.kind,
    status: row.status, reservationId: row.reservation_id || null, createdAt: row.created_at,
    completedAt: row.completed_at || null
  };
}

function mapQuestionSet(row) {
  return {
    questionSetId: row.question_set_id, projectId: row.project_id, version: Number(row.version),
    locale: row.locale, status: row.status, createdAt: row.created_at
  };
}

function mapQuestion(row) {
  return {
    questionId: row.question_id, questionSetId: row.question_set_id, text: row.text,
    intent: row.intent, tags: parseJson(row.tags_json, []), createdAt: row.created_at
  };
}

function mapRun(row) {
  return {
    runId: row.run_id, projectId: row.project_id, questionSetId: row.question_set_id,
    scheduledAt: row.scheduled_at, observedAt: row.observed_at, state: row.state,
    coverage: {
      expected: Number(row.expected_observations), measured: Number(row.measured_observations),
      unknown: Number(row.unknown_observations), failed: Number(row.failed_observations)
    },
    createdAt: row.created_at
  };
}

function mapObservation(row) {
  return {
    observationId: row.observation_id, runId: row.run_id, questionId: row.question_id,
    question: { text: row.question_text, intent: row.question_intent, tags: parseJson(row.question_tags_json, []) },
    questionSetVersion: Number(row.question_set_version), engine: row.engine, model: row.model,
    status: row.status, brandMentioned: sqlToBool(row.brand_mentioned),
    officialCitation: sqlToBool(row.official_citation), rawAnswer: row.raw_answer,
    citations: parseJson(row.citations_json, []), observedAt: row.observed_at, failureCode: row.failure_code
  };
}

function mapAnnotation(row) {
  return {
    annotationId: row.annotation_id, projectId: row.project_id, occurredAt: row.occurred_at,
    note: row.note, createdAt: row.created_at
  };
}

function mapTruthSource(row) {
  return {
    sourceId: row.source_id, projectId: row.project_id, kind: row.source_kind,
    url: row.source_url, canonicalUrl: row.canonical_url, status: row.status,
    fetchedAt: row.fetched_at || null, contentHash: row.content_hash || null,
    metadata: parseJson(row.metadata_json, {}), snippets: parseJson(row.snippets_json, []),
    candidateFields: parseJson(row.candidate_fields_json, {}), failureCode: row.failure_code || null,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function mapTruthBaseline(row) {
  return {
    baselineId: row.baseline_id, projectId: row.project_id, branchId: row.branch_id,
    branchName: row.branch_name || null, version: Number(row.version),
    fields: parseJson(row.fields_json, {}), sourceIds: parseJson(row.source_ids_json, []),
    sourceSnapshots: parseJson(row.source_snapshots_json, []),
    status: row.status, confirmedBy: row.confirmed_by, confirmedAt: row.confirmed_at,
    createdAt: row.created_at
  };
}

function mapTruthCheck(row) {
  return {
    checkId: row.check_id, projectId: row.project_id, baselineId: row.baseline_id,
    baselineVersion: Number(row.baseline_version || 0), engineIds: parseJson(row.engine_ids_json, []),
    status: row.status, parserVersion: row.parser_version, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at || null,
    errorCode: row.error_code || null
  };
}

function mapTruthClaim(row) {
  return {
    claimId: row.claim_id, checkId: row.check_id, observationId: row.observation_id || null,
    engine: row.engine, model: row.model || null, field: row.field_name,
    value: row.claim_value || null, text: row.claim_text, entityMatch: row.entity_match,
    condition: parseJson(row.condition_json, {}), parserVersion: row.parser_version,
    createdAt: row.created_at
  };
}

function mapTruthFinding(row) {
  return {
    findingId: row.finding_id, checkId: row.check_id, claimId: row.claim_id || null,
    baselineId: row.baseline_id, field: row.field_name, status: row.status,
    severity: row.severity, confidence: row.confidence,
    evidence: parseJson(row.evidence_json, {}), reviewStatus: row.review_status,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function mapTruthReview(row) {
  return {
    reviewId: row.review_id, findingId: row.finding_id, projectId: row.project_id,
    accountId: row.account_id, decision: row.decision, reason: row.reason, createdAt: row.created_at
  };
}

function sqlToBool(value) {
  return value === null || value === undefined ? null : Boolean(value);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function clampLimit(value) {
  return Math.max(1, Math.min(100, Number(value) || 50));
}

module.exports = {
  mapGoogleConnection, boolToSql, mapAccount, mapProject, mapEntitlement, mapTrackingJob,
  mapQuestionSet, mapQuestion, mapRun, mapObservation, mapAnnotation,
  mapTruthSource, mapTruthBaseline, mapTruthCheck, mapTruthClaim, mapTruthFinding, mapTruthReview,
  sqlToBool, parseJson, clampLimit
};
