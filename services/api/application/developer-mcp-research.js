const { randomUUID, createHash } = require('node:crypto');
const { DeveloperApiError, requiredIdempotencyKey } = require('./developer-api-prototype.js');
const { createOpaqueToken, hashToken, requirePepper } = require('../security/developer-credentials.js');

const SCOPES = Object.freeze(['measurements:write', 'measurements:read', 'usage:read']);
const TENANT = 'tnt_internal_agent';

function createMcpResearchService({ store, api, tokenPepper, now = () => new Date() }) {
  const pepper = requirePepper(tokenPepper);
  const timestamp = () => now().toISOString();
  const fail = (code, message, status = 400) => { throw new DeveloperApiError(code, message, status); };
  const audit = (eventType, metadata) => store.recordSecurityEvent({ eventId: `sec_${randomUUID()}`,
    tenantId: TENANT, eventType, severity: 'info', metadata, now: timestamp() });

  async function createGrant({ name }) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) fail('invalid_request', 'name must contain 1 to 80 characters');
    const token = createOpaqueToken('gcm_');
    const principalId = `mcp_${randomUUID()}`;
    await store.insertMcpGrant({ principalId, name: name.trim(), tokenHash: hashToken(token, pepper), scopes: SCOPES, now: timestamp() });
    await audit('mcp_grant_created', { principal_id: principalId });
    return { principal_id: principalId, name: name.trim(), token, scopes: [...SCOPES] };
  }
  async function rotateGrant({ principalId }) {
    const token = createOpaqueToken('gcm_');
    if (!await store.rotateMcpGrant({ principalId, tokenHash: hashToken(token, pepper), now: timestamp() })) fail('not_found', 'Research grant not found', 404);
    await audit('mcp_grant_rotated', { principal_id: principalId });
    return { principal_id: principalId, token };
  }
  async function revokeGrant({ principalId }) {
    if (!await store.revokeMcpGrant({ principalId, now: timestamp() })) fail('not_found', 'Research grant not found', 404);
    await audit('mcp_grant_revoked', { principal_id: principalId });
    return { principal_id: principalId, revoked: true };
  }
  async function authenticate(token, scope) {
    if (typeof token !== 'string' || !/^gcm_[A-Za-z0-9_-]{43}$/.test(token)) fail('auth_required', 'A valid research MCP credential is required', 401);
    const tokenHash = hashToken(token, pepper);
    const grant = await store.authenticateMcpGrant({ tokenHash, now: timestamp() });
    if (!grant) fail('auth_required', 'A valid research MCP credential is required', 401);
    if (scope && !grant.scopes.includes(scope)) fail('forbidden', 'Research permission is required', 403);
    const admission = await store.getMcpAdmission();
    if (!admission.enabled) fail('mcp_admission_closed', 'Research MCP is temporarily closed', 503);
    return { ...grant, tokenHash };
  }
  async function createMeasurement({ token, body }) {
    const grant = await authenticate(token, 'measurements:write');
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['study_id', 'input', 'locale', 'engine_ids', 'idempotency_key'].includes(key))) fail('invalid_request', 'Unexpected measurement fields');
    if (typeof body.study_id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(body.study_id)) fail('invalid_request', 'study_id must be a stable identifier (1 to 120 characters)');
    const operationKey = requiredIdempotencyKey(body.idempotency_key);
    const key = 'mcp:' + createHash('sha256').update(JSON.stringify([grant.principal_id, operationKey])).digest('hex');
    const accepted = await api.createInternalMeasurement({ caller: 'agent', idempotencyKey: key,
      body: { input: body.input, locale: body.locale, engine_ids: body.engine_ids },
      mcpResearch: { principalId: grant.principal_id, tokenHash: grant.tokenHash, studyId: body.study_id } });
    return { ...accepted.job, study_id: body.study_id, billing_mode: 'internal_research', idempotent_replay: !accepted.created };
  }
  async function getMeasurement({ token, measurementId }) {
    const grant = await authenticate(token, 'measurements:read');
    const job = await store.getJobByMeasurement({ tenantId: TENANT, measurementId: String(measurementId || '') });
    if (!job || job.mcp_principal_id !== grant.principal_id) fail('not_found', 'Measurement not found', 404);
    if (job.content_deleted_at) fail('result_deleted', 'Measurement content has been deleted', 410);
    const result = await api.getMeasurement({ tenantId: TENANT, measurementId });
    if (!result && ['succeeded', 'failed'].includes(job.status)) {
      const metadata = await store.getMcpResultMetadata({ principalId: grant.principal_id, measurementId });
      if ((metadata?.expires_at && metadata.expires_at <= timestamp()) || !job.error_code) fail('result_expired', 'Measurement result is no longer retained', 410);
    }
    return { ...(result || { measurement_id: job.measurement_id, status: job.status, error_code: job.error_code }),
      study_id: job.study_id, created_at: job.created_at, completed_at: job.completed_at,
      quota: { charged_rounds: 0 }, billing_mode: 'internal_research' };
  }
  async function getUsage({ token }) {
    const grant = await authenticate(token, 'usage:read');
    const usage = await store.getMcpUsage({ principalId: grant.principal_id });
    const shared = await api.getInternalSpend();
    return { principal_id: grant.principal_id, billing_mode: 'internal_research', ...usage,
      shared_internal_budget: { shared_with_other_internal_callers: true, windows: shared.windows.map((window) => ({
        ...window, remaining_twd: Math.max(0, window.limit_twd - window.used_twd - window.reserved_twd)
      })) } };
  }
  async function setAdmission({ enabled, reason }) {
    if (typeof enabled !== 'boolean' || typeof reason !== 'string' || !reason.trim() || reason.length > 200) fail('invalid_request', 'enabled and a short reason are required');
    const result = await store.setMcpAdmission({ enabled, reason, now: timestamp() });
    await audit('mcp_admission_changed', { enabled });
    return result;
  }
  return { authenticate, createGrant, rotateGrant, revokeGrant, createMeasurement, getMeasurement, getUsage, setAdmission };
}
module.exports = { createMcpResearchService };
