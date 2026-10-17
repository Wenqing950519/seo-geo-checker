// Operator CLI. Credentials are read from ignored local env files, never argv.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadEnvFiles, requireEnv } = require('../../packages/shared/env.js');
loadEnvFiles();
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'https://platform.lslabs.tw';
const ENV_FILE = path.join(ROOT, '.env');
const action = process.argv[2];
const flag = (name) => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined; };

async function admin(route, body) {
  const response = await fetch(`${ORIGIN}/v1/admin/mcp/${route}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': requireEnv('ADMIN_TOKEN') },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.code || `admin_http_${response.status}`);
  return result;
}
function saveCredential(result) {
  if (!/^gcm_[A-Za-z0-9_-]{43}$/.test(result.token)) throw new Error('Invalid research credential response');
  // Keep unrelated env contents byte-for-byte, including their existing line endings.
  let contents = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  for (const [name, value] of Object.entries({ GEOCHECK_MCP_RESEARCH_TOKEN: result.token, GEOCHECK_MCP_RESEARCH_PRINCIPAL_ID: result.principal_id })) {
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    if (pattern.test(contents)) contents = contents.replace(pattern, `${name}=${value}`);
    else contents += (contents && !contents.endsWith('\n') ? newline : '') + `${name}=${value}${newline}`;
  }
  fs.writeFileSync(ENV_FILE, contents, { mode: 0o600 });
  console.log(JSON.stringify({ principal_id: result.principal_id, credential_file: ENV_FILE, token_saved: true }));
}
async function rpc(method, params) {
  const id = randomUUID();
  const response = await fetch(`${ORIGIN}/mcp`, { method: 'POST', headers: {
    Authorization: `Bearer ${requireEnv('GEOCHECK_MCP_RESEARCH_TOKEN')}`,
    Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json'
  }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  const result = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6))).find((item) => item.id === id)
    : JSON.parse(text);
  if (!response.ok || result?.error) throw new Error(result?.error?.code || `mcp_http_${response.status}`);
  if (result?.result?.isError) {
    const error = JSON.parse(result.result.content[0].text).error;
    throw new Error(error.code || 'mcp_tool_failed');
  }
  return result.result;
}
async function tool(name, args) { return (await rpc('tools/call', { name, arguments: args })).structuredContent; }

async function main() {
  if (action === 'create') return saveCredential(await admin('grants', { name: flag('name') || 'grokbot-research' }));
  const principalId = flag('principal-id') || process.env.GEOCHECK_MCP_RESEARCH_PRINCIPAL_ID;
  if (action === 'rotate' || action === 'revoke') {
    if (!/^mcp_[a-f0-9-]{36}$/.test(principalId || '')) throw new Error('A valid principal ID is required');
    const result = await admin(`grants/${principalId}/${action}`, {});
    if (action === 'rotate') return saveCredential(result);
    console.log(JSON.stringify(result)); return;
  }
  if (action === 'admission') {
    const enabled = flag('enabled');
    if (!['true', 'false'].includes(enabled)) throw new Error('--enabled true or false is required');
    console.log(JSON.stringify(await admin('admission', { enabled: enabled === 'true', reason: flag('reason') || 'operator action' })));
    return;
  }
  if (action === 'probe' || action === 'smoke') {
    if (action === 'smoke' && !process.argv.includes('--allow-paid')) throw new Error('smoke requires explicit --allow-paid');
    const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'lslabs-mcp-verifier', version: '0.1.0' } });
    const tools = (await rpc('tools/list', {})).tools.map((item) => item.name);
    const before = await tool('get_usage', {});
    if (action === 'probe') { console.log(JSON.stringify({ server: initialized.serverInfo, tools, usage: before }, null, 2)); return; }
    const evidencePath = path.join(ROOT, 'docs/developer-api/evidence', `mcp-research-smoke-${new Date().toISOString().slice(0, 10)}.json`);
    if (fs.existsSync(evidencePath)) throw new Error('Smoke evidence already exists; refusing to overwrite or repeat a paid run');
    const request = { study_id: 'mcp-controlled-acceptance', input: { type: 'prompt', text: '請介紹台灣的國家圖書館，並附上官方資料來源。' }, idempotency_key: `mcp-smoke-${randomUUID()}` };
    // Persist the operation key before the paid POST: a timeout must not lead
    // to a second paid run with a fresh key and no record of the first one.
    const evidence = { captured_at: new Date().toISOString(), origin: ORIGIN, request, usage_before: before, state: 'submitting' };
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
    const accepted = await tool('create_measurement', request);
    evidence.accepted = accepted;
    evidence.state = 'accepted';
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    let result;
    const deadline = Date.now() + 120000;
    do {
      result = await tool('get_measurement', { measurement_id: accepted.measurement_id });
      if (!['queued', 'running'].includes(result.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } while (Date.now() < deadline);
    const after = await tool('get_usage', {});
    fs.writeFileSync(evidencePath, JSON.stringify({ ...evidence, completed_at: new Date().toISOString(), state: 'recorded', result, usage_after: after }, null, 2) + '\n');
    console.log(JSON.stringify({ measurement_id: accepted.measurement_id, status: result.status, evidence_path: evidencePath }));
    if (result.status !== 'succeeded') process.exitCode = 1;
    return;
  }
  throw new Error('Use create, rotate, revoke, admission, probe or smoke. No credential values belong in command arguments.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
