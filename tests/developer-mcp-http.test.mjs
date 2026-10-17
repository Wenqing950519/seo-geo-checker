import assert from 'node:assert/strict';
import { handleResearchMcp } from '../services/cloudflare/developer-api/src/research-mcp.mjs';
import fixtureModule from './developer-mcp-research.test.js';
import sourceWorker from '../services/cloudflare/developer-api/src/worker.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
const worker = process.env.MCP_TEST_WORKER_BUNDLE
  ? (await import(pathToFileURL(process.env.MCP_TEST_WORKER_BUNDLE))).default : sourceWorker;

const accepted = { measurement_id: 'msr_fixture', job_id: 'job_fixture', status: 'queued' };
let submits = 0;
let calls = 0;
const research = {
  async authenticate(token) {
    calls++;
    if (token !== 'fixture-token') throw Object.assign(new Error('Credential required'), { code: 'auth_required', statusCode: 401 });
    return { principal_id: 'fixture' };
  },
  async createMeasurement({ body }) { submits++; assert.equal(body.study_id, 'test'); return accepted; },
  async getMeasurement() { return { ...accepted, status: 'succeeded', engines: [{ answer: 'fixture' }] }; },
  async getUsage() { return { billing_mode: 'internal_research' }; }
};
const url = 'https://platform.lslabs.tw/mcp';
async function send(body, { token = 'fixture-token', origin, raw } = {}) {
  const headers = { Host: 'platform.lslabs.tw', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` };
  if (origin) headers.Origin = origin;
  return handleResearchMcp(new Request(url, { method: 'POST', headers, body: raw || JSON.stringify(body) }), { research });
}
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
async function payload(response) {
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    return text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6))).find((message) => message.id === 1);
  }
  return JSON.parse(text);
}
assert.equal((await send(rpc('tools/list'), { token: '' })).status, 401);
assert.equal((await send(rpc('tools/list'), { token: 'gck_customer' })).status, 401);
assert.equal((await send(rpc('tools/list'), { origin: 'https://evil.example' })).status, 403);
assert.equal((await send({}, { raw: ' '.repeat(65537) })).status, 413);
const initialized = await send(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
assert.equal(initialized.status, 200, await initialized.clone().text());
assert.ok((await payload(initialized)).result.serverInfo);
const list = await payload(await send(rpc('tools/list')));
assert.deepEqual(list.result.tools.map((tool) => tool.name).sort(), ['create_measurement', 'get_measurement', 'get_usage']);
const created = await payload(await send(rpc('tools/call', { name: 'create_measurement', arguments: {
  study_id: 'test', input: { type: 'prompt', text: 'fixture' }, idempotency_key: 'operation-1'
} })));
assert.equal(created.result.structuredContent.measurement_id, accepted.measurement_id);
const fakeFree = await payload(await send(rpc('tools/call', { name: 'create_measurement', arguments: {
  study_id: 'test', input: { type: 'prompt', text: 'fixture' }, idempotency_key: 'operation-2', free: true
} })));
assert.ok(fakeFree.error || fakeFree.result?.isError);
assert.equal(submits, 1);
assert.ok(calls >= 6, 'Each protocol request authenticates independently');
console.log('developer MCP HTTP tests passed');

// Exercise the real protocol, authorization, D1 admission and provider runner together.
for (const partial of [false, true]) {
  const h = fixtureModule.harness({ official: true, partial }); h.open();
  const grant = await h.research.createGrant({ name: 'Protocol integration' });
  const invoke = async (name, args) => payload(await handleResearchMcp(new Request(url, {
    method: 'POST', headers: { Host: 'platform.lslabs.tw', 'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream', Authorization: `Bearer ${grant.token}` },
    body: JSON.stringify(rpc('tools/call', { name, arguments: args }))
  }), { research: h.research }));
  const created = await invoke('create_measurement', fixtureModule.INPUT);
  assert.equal(created.result.structuredContent.status, 'queued');
  const accepted = created.result.structuredContent;
  await h.api.runJob(accepted.job_id);
  const read = await invoke('get_measurement', { measurement_id: accepted.measurement_id });
  assert.equal(read.result.structuredContent.status, partial ? 'failed' : 'succeeded');
  const usage = await invoke('get_usage', {});
  assert.equal(usage.result.structuredContent.jobs[partial ? 'failed' : 'succeeded'], 1);
  assert.equal(h.count('developer_quota_reservations'), 0);
  h.db.close();
}
console.log('developer MCP protocol integration tests passed');

// Real Worker routing/admin authentication with an in-memory D1 binding.
{
  const h = fixtureModule.harness();
  const queued = [];
  function statement(sql, params = []) {
    return { bind: (...values) => statement(sql, values),
      all: async () => ({ success: true, results: h.db.prepare(sql).all(...params) }),
      first: async () => h.db.prepare(sql).get(...params) || null };
  }
  const config = JSON.parse(await readFile(new URL('../services/cloudflare/developer-api/wrangler.jsonc', import.meta.url), 'utf8'));
  const env = { ...config.vars, ADMIN_TOKEN: 'fixture-admin-token-at-least-20-bytes', DEVELOPER_API_TOKEN_PEPPER: 'worker-test-pepper-at-least-32-bytes',
    MCP_RESEARCH_TOKEN_PEPPER: 'independent-research-pepper-at-least-32-bytes',
    OPENAI_API_KEY: 'fixture', GEMINI_API_KEY: 'fixture', PERPLEXITY_API_KEY: 'fixture', ANTHROPIC_API_KEY: 'fixture',
    DEVELOPER_DB: { prepare: statement, batch: async (statements) => {
      h.db.exec('BEGIN');
      try { const results = []; for (const item of statements) results.push(await item.all()); h.db.exec('COMMIT'); return results; }
      catch (error) { h.db.exec('ROLLBACK'); throw error; }
    } }, DEVELOPER_MEASUREMENTS: { send: async (body) => { queued.push(body); } },
    ASSETS: { fetch: () => { throw new Error('MCP must not reach static asset routing'); } } };
  const admin = (pathname, body, authorized = true) => worker.fetch(new Request(`https://platform.lslabs.tw${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': authorized ? env.ADMIN_TOKEN : 'wrong' }, body: JSON.stringify(body)
  }), env);
  assert.equal((await admin('/v1/admin/mcp/grants', { name: 'Denied' }, false)).status, 401);
  assert.equal(h.count('developer_mcp_research_grants'), 0);
  const response = await admin('/v1/admin/mcp/grants', { name: 'Worker integration' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const grant = await response.json();
  assert.equal(h.db.prepare('SELECT token_hash FROM developer_mcp_research_grants WHERE principal_id=?').get(grant.principal_id).token_hash,
    createHmac('sha256', env.MCP_RESEARCH_TOKEN_PEPPER).update(grant.token).digest('hex'), 'Research credentials use a separate pepper when provisioned');
  const mcpRequest = (host = 'platform.lslabs.tw', token = grant.token) => new Request(`https://${host}/mcp`, {
    method: 'POST', headers: { Host: host, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify(rpc('tools/call', { name: 'create_measurement', arguments: fixtureModule.INPUT }))
  });
  assert.equal((await worker.fetch(mcpRequest('api.geocheck.lisheng.cv'), env)).status, 404);
  assert.equal((await worker.fetch(mcpRequest(), env)).status, 503);
  assert.equal((await admin('/v1/admin/mcp/admission', { enabled: true, reason: 'fixture' })).status, 200);
  h.db.exec("UPDATE developer_runtime_controls SET control_value='true' WHERE control_key='internal_admission_enabled'");
  assert.equal((await worker.fetch(mcpRequest('platform.lslabs.tw', 'gck_customer'), env)).status, 401);
  const result = await payload(await worker.fetch(mcpRequest(), env));
  assert.equal(result.result.structuredContent.status, 'queued');
  assert.equal(queued.length, 1);
  await admin(`/v1/admin/mcp/grants/${grant.principal_id}/revoke`, {});
  assert.equal((await worker.fetch(mcpRequest(), env)).status, 401);
  h.db.close();
}
console.log('developer MCP Worker routing and admin tests passed');
