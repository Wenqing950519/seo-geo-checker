import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const require = createRequire(import.meta.url);
require('../../packages/shared/env.js').loadEnvFiles();
const root = path.resolve(import.meta.dirname, '../..');
const origin = 'https://platform.lslabs.tw';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tmp/mcp-release/manifest.json'), 'utf8'));
const smoke = JSON.parse(fs.readFileSync(path.join(root, 'docs/developer-api/evidence/mcp-research-smoke-2026-10-15.json'), 'utf8'));
assert.equal(smoke.result.status, 'succeeded', 'A real successful observation is required before handoff');
const credential = process.env.GEOCHECK_MCP_RESEARCH_TOKEN;
assert.match(credential || '', /^gcm_[A-Za-z0-9_-]{43}$/);

async function d1(sql, params) {
  const config = fs.readFileSync(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
  const token = /^oauth_token\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/d94ae08a9389415ba3fcf231db7fc909/d1/database/cebce923-e5a4-460e-abf3-68bf5096e67c/query', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  if (!response.ok || !data.success || data.result.some((item) => item.success === false)) throw Error('D1 verification operation failed');
  return data.result[0].results;
}
async function rpc(token, method, params) {
  const response = await fetch(`${origin}/mcp`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {})
  }, body: JSON.stringify({ jsonrpc: '2.0', id: 'verify', method, params }), signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6))).find((item) => item.id === 'verify')
    : JSON.parse(text);
  return { status: response.status, data };
}
function errorCode(response) {
  return response.data.error?.code || (response.data.result?.isError ? JSON.parse(response.data.result.content[0].text).error.code : null);
}
function structured(result) {
  assert.ok(!result.isError, 'Standard MCP client tool operation must succeed');
  return result.structuredContent || JSON.parse(result.content[0].text);
}

const checks = {};
for (const [label, token] of [['anonymous', null], ['invalid', 'gcm_' + 'x'.repeat(43)], ['customer_key', 'gck_customer'], ['internal_secret', 'gcint_internal']]) {
  const response = await rpc(token, 'tools/list', {});
  assert.equal(response.status, 401, label);
  checks[label] = { status: response.status, code: errorCode(response) };
}
const client = new Client({ name: 'lslabs-handoff-verifier', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${credential}` } } });
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
  assert.deepEqual(tools, ['create_measurement', 'get_measurement', 'get_usage']);
  const usage = structured(await client.callTool({ name: 'get_usage', arguments: {} }));
  assert.equal(usage.billing_mode, 'internal_research');
  const read = structured(await client.callTool({ name: 'get_measurement', arguments: { measurement_id: smoke.accepted.measurement_id } }));
  assert.equal(read.status, 'succeeded');
  assert.equal(read.engines.length, 4);
  assert.ok(read.engines.every((engine) => engine.status === 'succeeded' && engine.answer && engine.citations?.length));
  assert.equal(read.quota.charged_rounds, 0);
  const replay = structured(await client.callTool({ name: 'create_measurement', arguments: smoke.request }));
  assert.equal(replay.measurement_id, read.measurement_id);
  assert.equal(replay.idempotent_replay, true);
  const forged = await rpc(credential, 'tools/call', { name: 'create_measurement', arguments: { ...smoke.request, free: true } });
  assert.ok(forged.data.error || forged.data.result?.isError, 'Client free flags must never grant privileges');
  checks.standard_client = { server: client.getServerVersion(), tools, measurement_id: read.measurement_id,
    all_four_succeeded_with_citations: true, customer_rounds_charged: 0, idempotent_replay: true,
    usage, models: read.engines.map((engine) => ({ profile: engine.profile_id, model: engine.model })) };
} finally { await client.close(); }

// A disposable read-only principal proves live tenant separation and revocation.
const testPrincipal = 'mcp_' + randomUUID();
const testToken = 'gcm_' + randomBytes(32).toString('base64url');
const digest = createHmac('sha256', process.env.GEOCHECK_MCP_TOKEN_PEPPER).update(testToken).digest('hex');
await d1(`INSERT INTO developer_mcp_research_grants(principal_id,name,token_hash,scopes_json,status,created_at)
  VALUES (?,?,?,?,'active',?)`, [testPrincipal, 'disposable-live-auth-verifier', digest, JSON.stringify(['measurements:read','usage:read']), new Date().toISOString()]);
try {
  const cross = await rpc(testToken, 'tools/call', { name: 'get_measurement', arguments: { measurement_id: smoke.accepted.measurement_id } });
  assert.equal(errorCode(cross), 'not_found');
  const write = await rpc(testToken, 'tools/call', { name: 'create_measurement', arguments: smoke.request });
  assert.equal(errorCode(write), 'forbidden');
  checks.cross_principal = { code: errorCode(cross) };
  checks.read_only_write = { code: errorCode(write) };
} finally {
  await d1("UPDATE developer_mcp_research_grants SET status='revoked',revoked_at=? WHERE principal_id=?", [new Date().toISOString(), testPrincipal]);
}
const revoked = await rpc(testToken, 'tools/list', {});
assert.equal(revoked.status, 401);
checks.revoked_credential = { status: revoked.status, code: errorCode(revoked) };
const attempts = (await d1('SELECT COUNT(*) AS count FROM developer_provider_attempts WHERE job_id=?', [smoke.accepted.job_id]))[0].count;
assert.equal(attempts, 4, 'Replay must not create additional provider attempts');
checks.provider_attempts = attempts;
const filename = path.join(root, 'docs/developer-api/evidence/mcp-release-2026-10-15.json');
const evidence = { verified_at: new Date().toISOString(), ...manifest, checks,
  real_smoke_evidence: 'mcp-research-smoke-2026-10-15.json', credentials_excluded: true };
const serialized = JSON.stringify(evidence, null, 2) + '\n';
for (const secret of [credential, testToken, process.env.GEOCHECK_MCP_TOKEN_PEPPER]) assert.ok(!serialized.includes(secret), 'Evidence must not contain credentials');
fs.writeFileSync(filename, serialized);
console.log(JSON.stringify({ verified: true, standard_client: true, four_engine_measurement: smoke.accepted.measurement_id,
  auth_checks_passed: true, provider_attempts: attempts, evidence_path: filename, credentials_printed: false }));
