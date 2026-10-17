const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createD1DeveloperPlatformStore } = require('../services/api/storage/developer-platform-d1-store.js');
const { createDeveloperPlatformService } = require('../services/api/application/developer-platform-service.js');
const { createFixtureProviders } = require('../services/api/application/developer-api-prototype.js');
const { listOfficialEngineProfiles } = require('../services/api/application/official-engine-profiles.js');
const { createMcpResearchService } = require('../services/api/application/developer-mcp-research.js');

const PEPPER = 'mcp-research-test-pepper-at-least-32-bytes';
const NOW = new Date('2026-10-15T04:00:00Z');
const INPUT = { study_id: 'mcp-acceptance', input: { type: 'prompt', text: '台北有哪些咖啡店？' }, idempotency_key: 'first-operation' };
const rejects = (fn, code) => assert.rejects(fn, (error) => error.code === code, code);

function harness({ official = false, partial = false, unknown = false, enqueue } = {}) {
  const db = new DatabaseSync(':memory:');
  const migrationDir = path.join(__dirname, '../services/api/developer-api-migrations');
  for (const file of fs.readdirSync(migrationDir).sort()) db.exec(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
  const run = ({ sql, params = [] }) => ({ success: true, results: db.prepare(sql).all(...params) });
  const store = createD1DeveloperPlatformStore({ execute: async (payload) => {
    if (!payload.batch) return [run(payload)];
    db.exec('BEGIN');
    try { const result = payload.batch.map(run); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } });
  const providers = official ? listOfficialEngineProfiles().map((profile, index) => ({
    id: profile.id, mode: 'official', async execute() {
      if (partial && index === 0) throw Object.assign(new Error('fixture failure'), { code: 'provider_failed' });
      return { answer: 'fixture answer', citations: [{ url: 'https://example.com', title: 'Fixture' }],
        searchEvidence: { mode: 'native_search', profile_id: profile.id, executed: true },
        usage: unknown ? {} : { estimated_cost_usd: 0.02 } };
    }
  })) : createFixtureProviders();
  const api = createDeveloperPlatformService({ store, providers, tokenPepper: PEPPER, now: () => NOW,
    quotaWindowStrategy: 'rolling_24h', resultRetentionDays: 30, trialDays: 7, freeRoundsPerWindow: 3,
    dailyBudgetTwd: 60, monthlyBudgetTwd: 600, maxJobCostTwd: 12, twdPerUsd: 31.535,
    internalDailyBudgetTwd: 500, internalMonthlyBudgetTwd: 3000, enqueue: enqueue || (async () => {}) });
  const research = createMcpResearchService({ store, api, tokenPepper: PEPPER, now: () => NOW });
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  const open = () => db.exec("UPDATE developer_runtime_controls SET control_value='true' WHERE control_key IN ('mcp_admission_enabled','internal_admission_enabled')");
  return { db, store, api, research, count, open };
}

async function main() {
  {
    const h = harness();
    const grant = await h.research.createGrant({ name: 'Grok research' });
    assert.match(grant.token, /^gcm_/);
    assert.ok(!JSON.stringify(h.db.prepare('SELECT * FROM developer_mcp_research_grants').all()).includes(grant.token));
    for (const token of ['', 'invalid', 'gck_customer', 'gcint_internal']) {
      await rejects(() => h.research.createMeasurement({ token, body: INPUT }), 'auth_required');
    }
    await rejects(() => h.research.createMeasurement({ token: grant.token, body: INPUT }), 'mcp_admission_closed');
    h.open();
    assert.equal((await h.research.authenticate(grant.token)).principal_id, grant.principal_id);
    await rejects(() => h.research.createMeasurement({ token: grant.token, body: { ...INPUT, free: true } }), 'invalid_request');
    const job = await h.research.createMeasurement({ token: grant.token, body: INPUT });
    const repeat = await h.research.createMeasurement({ token: grant.token, body: INPUT });
    assert.equal(job.measurement_id, repeat.measurement_id);
    assert.equal(repeat.idempotent_replay, true);
    await rejects(() => h.research.createMeasurement({ token: grant.token, body: { ...INPUT, study_id: 'changed' } }), 'idempotency_conflict');
    assert.equal(h.count('developer_quota_reservations'), 0);
    assert.equal(h.count('developer_quota_windows'), 0);
    const row = h.db.prepare('SELECT * FROM developer_jobs').get();
    assert.equal(row.caller, 'agent');
    assert.equal(row.tenant_id, 'tnt_internal_agent');
    assert.equal(row.mcp_principal_id, grant.principal_id);
    assert.equal(row.study_id, INPUT.study_id);
    const other = await h.research.createGrant({ name: 'Other researcher' });
    await rejects(() => h.research.getMeasurement({ token: other.token, measurementId: job.measurement_id }), 'not_found');
    assert.equal((await h.research.getMeasurement({ token: grant.token, measurementId: job.measurement_id })).status, 'queued');
    const rotated = await h.research.rotateGrant({ principalId: grant.principal_id });
    await rejects(() => h.research.getMeasurement({ token: grant.token, measurementId: job.measurement_id }), 'auth_required');
    assert.equal((await h.research.getMeasurement({ token: rotated.token, measurementId: job.measurement_id })).status, 'queued');
    await h.research.revokeGrant({ principalId: grant.principal_id });
    await rejects(() => h.research.getUsage({ token: rotated.token }), 'auth_required');
    assert.ok(!JSON.stringify(h.db.prepare('SELECT * FROM developer_security_events').all()).includes(rotated.token));
    h.db.close();
  }
  {
    const h = harness({ official: true }); h.open();
    const grant = await h.research.createGrant({ name: 'Race' });
    const submissions = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
      h.research.createMeasurement({ token: grant.token, body: { ...INPUT, idempotency_key: `race-operation-${i}` } })));
    assert.equal(submissions.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(submissions.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'mcp_concurrency_limit'));
    assert.equal(h.count('developer_jobs'), 1);
    assert.equal(h.count('developer_cost_reservations'), 1);
    const queued = submissions.find((r) => r.status === 'fulfilled').value;
    await h.api.runJob(queued.job_id);
    const result = await h.research.getMeasurement({ token: grant.token, measurementId: queued.measurement_id });
    assert.equal(result.status, 'succeeded');
    assert.equal(result.engines.length, 4);
    assert.equal(result.quota.charged_rounds, 0);
    const usage = await h.research.getUsage({ token: grant.token });
    assert.equal(usage.jobs.succeeded, 1);
    assert.ok(usage.cost.settled_twd > 0);
    assert.equal(usage.billing_mode, 'internal_research');
    assert.equal(usage.shared_internal_budget.windows.length, 2);
    h.db.exec("UPDATE developer_cost_budget_windows SET used_twd_micros=limit_twd_micros WHERE scope='internal'");
    await rejects(() => h.research.createMeasurement({ token: grant.token, body: { ...INPUT, idempotency_key: 'over-budget' } }), 'internal_budget_exhausted');
    h.db.close();
  }
  {
    const h = harness({ official: true, partial: true }); h.open();
    const grant = await h.research.createGrant({ name: 'Partial' });
    const job = await h.research.createMeasurement({ token: grant.token, body: INPUT });
    await h.api.runJob(job.job_id);
    const result = await h.research.getMeasurement({ token: grant.token, measurementId: job.measurement_id });
    assert.equal(result.status, 'failed');
    assert.ok(result.partial_results.length > 0);
    assert.equal(h.count('developer_quota_reservations'), 0);
    assert.equal((await h.research.getUsage({ token: grant.token })).cost.has_unknown_cost, true);
    h.db.close();
  }
  {
    const h = harness({ official: true, unknown: true }); h.open();
    const grant = await h.research.createGrant({ name: 'Unknown cost' });
    const job = await h.research.createMeasurement({ token: grant.token, body: INPUT });
    await h.api.runJob(job.job_id);
    const usage = await h.research.getUsage({ token: grant.token });
    assert.equal(usage.cost.has_unknown_cost, true);
    assert.equal(usage.cost.settled_twd, 12);
    h.db.close();
  }
  {
    const h = harness(); h.open();
    const grant = await h.research.createGrant({ name: 'Switches' });
    h.db.exec("UPDATE developer_runtime_controls SET control_value='false' WHERE control_key='internal_admission_enabled'");
    await rejects(() => h.research.createMeasurement({ token: grant.token, body: INPUT }), 'internal_admission_closed');
    h.open(); await h.research.setAdmission({ enabled: false, reason: 'test shutdown' });
    await rejects(() => h.research.getUsage({ token: grant.token }), 'mcp_admission_closed');
    assert.equal(h.db.prepare("SELECT control_value FROM developer_runtime_controls WHERE control_key='internal_admission_enabled'").get().control_value, 'true');
    assert.equal(h.count('developer_jobs'), 0);
    h.db.close();
  }
  {
    const h = harness(); h.open();
    const grant = await h.research.createGrant({ name: 'Read only' });
    h.db.prepare('UPDATE developer_mcp_research_grants SET scopes_json=? WHERE principal_id=?').run('["usage:read"]', grant.principal_id);
    await rejects(() => h.research.createMeasurement({ token: grant.token, body: INPUT }), 'forbidden');
    assert.equal((await h.research.getUsage({ token: grant.token })).shared_internal_budget.windows.length, 2);
    assert.equal(h.count('developer_jobs'), 0);
    h.db.close();
  }
  {
    const h = harness(); h.open();
    const grant = await h.research.createGrant({ name: 'Revoked during admission' });
    const admitJob = h.store.admitJob;
    h.store.admitJob = async (input) => {
      await h.research.revokeGrant({ principalId: grant.principal_id });
      return admitJob(input);
    };
    await rejects(() => h.research.createMeasurement({ token: grant.token, body: INPUT }), 'auth_required');
    assert.equal(h.count('developer_jobs'), 0);
    h.db.close();
  }
  {
    const h = harness({ official: true, partial: true }); h.open();
    const first = await h.research.createGrant({ name: 'First' });
    const second = await h.research.createGrant({ name: 'Second' });
    const jobs = await Promise.all([first, second].map((grant) => h.research.createMeasurement({ token: grant.token, body: INPUT })));
    assert.notEqual(jobs[0].measurement_id, jobs[1].measurement_id, 'Idempotency is principal scoped');
    await h.api.runJob(jobs[0].job_id);
    h.db.exec("UPDATE developer_measurement_results SET expires_at='2020-01-01T00:00:00.000Z'");
    await rejects(() => h.research.getMeasurement({ token: first.token, measurementId: jobs[0].measurement_id }), 'result_expired');
    h.db.close();
  }
  console.log('developer MCP research tests passed');
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { harness, INPUT };
