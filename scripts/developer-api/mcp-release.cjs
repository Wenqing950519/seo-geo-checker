// Scoped release operator: keep production providers, assets, secrets and budgets.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, createHmac, randomBytes, randomUUID } = require('node:crypto');
const esbuild = require('esbuild');
const { selectReleaseSources, NEW_MCP, PRESERVE } = require('./mcp-release-lib.cjs');
const { loadEnvFiles } = require('../../packages/shared/env.js');
const { pathToFileURL } = require('node:url');
loadEnvFiles();
const ROOT = path.resolve(__dirname, '../..');
const ACCOUNT = 'd94ae08a9389415ba3fcf231db7fc909';
const DB = 'cebce923-e5a4-460e-abf3-68bf5096e67c';
const SCRIPT = 'geocheck-developer-api';
const BASE = `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}`;
const OUT = path.join(ROOT, 'tmp/mcp-release');
const MANIFEST = path.join(OUT, 'manifest.json');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const action = process.argv[2];
const readManifest = () => JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
function save(manifest) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n'); }
function auth() {
  const config = path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml');
  const token = /^oauth_token\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(config, 'utf8'))?.[1];
  if (!token) throw Error('Run wrangler whoami to refresh the existing operator login');
  return token;
}
async function cf(route, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${route}`, { ...options,
    headers: { Authorization: `Bearer ${auth()}`, ...(options.headers || {}) }, signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  if (!response.ok || data.success !== true) {
    let detail = (data.errors || []).map((error) => `${error.code}: ${error.message}`).join(',');
    for (const value of [auth(), process.env.GEOCHECK_MCP_TOKEN_PEPPER, process.env.GEOCHECK_MCP_RESEARCH_TOKEN]) {
      if (value) detail = detail.replaceAll(value, '[REDACTED]');
    }
    throw Error(`Cloudflare operation failed (${response.status}): ${detail.slice(0,800)}`);
  }
  return data.result;
}
async function d1(sql, params = []) {
  const result = await cf(`/accounts/${ACCOUNT}/d1/database/${DB}/query`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }) });
  if (result.some((item) => item.success === false)) throw Error('D1 operation failed');
  return result[0]?.results || [];
}
async function deployed() {
  const data = await cf(`${BASE}/deployments`);
  const versions = data.deployments[0].versions;
  if (versions.length !== 1 || versions[0].percentage !== 100) throw Error('Refuse to overwrite an ongoing gradual deployment');
  return versions[0].version_id;
}
async function snapshot() {
  const result = {};
  for (const pathname of ['/', '/docs', '/pricing', '/terms', '/privacy', '/refund', '/console', '/robots.txt', '/sitemap.xml', '/v1/usage']) {
    const response = await fetch(`https://platform.lslabs.tw${pathname}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    result[pathname] = { status: response.status, location: response.headers.get('location'), sha256: hash(await response.text()) };
  }
  return result;
}
function localValues(values) {
  const filename = path.join(ROOT, '.env');
  execFileSync('git', ['-c', `safe.directory=${ROOT}`, 'check-ignore', '--quiet', filename], { cwd: ROOT });
  let text = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    if (pattern.test(text)) text = text.replace(pattern, `${name}=${value}`);
    else text += `${text && !text.endsWith('\n') ? '\n' : ''}${name}=${value}\n`;
    process.env[name] = value;
  }
  fs.writeFileSync(filename, text, { mode: 0o600 });
}
function allowMutation() { if (!process.argv.includes('--allow-deploy')) throw Error('This operator action requires --allow-deploy'); }

async function prepare() {
  const baseVersion = await deployed();
  const detail = await cf(`${BASE}/versions/${baseVersion}`);
  const response = await fetch(`https://api.cloudflare.com/client/v4${BASE}`, { headers: { Authorization: `Bearer ${auth()}` } });
  if (!response.ok) throw Error('Cannot download the deployed source map');
  const form = await response.formData();
  const map = JSON.parse(await form.get('worker.js.map').text());
  const selected = selectReleaseSources({ root: ROOT, sourceMap: map,
    readHead: (file) => execFileSync('git', ['-c', `safe.directory=${ROOT}`, 'show', `HEAD:${path.relative(ROOT, file).replaceAll('\\', '/')}`], { cwd: ROOT, encoding: 'utf8' }),
    readWorking: (file) => fs.readFileSync(file, 'utf8') });
  for (const name of PRESERVE) if (!selected.has(path.join(ROOT, name))) throw Error('Production provider source is missing');
  const profile = selected.get(path.join(ROOT, 'services/api/application/official-engine-profiles.js'));
  if (!profile.includes('claude-haiku-4-5-20251001') || profile.includes('claude-haiku-5-5')) throw Error('Production model baseline changed; review before release');
  fs.mkdirSync(OUT, { recursive: true });
  await esbuild.build({ absWorkingDir: ROOT, entryPoints: ['services/cloudflare/developer-api/src/worker.js'],
    outfile: path.join(OUT, 'worker.mjs'), bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    mainFields: ['module', 'main'], conditions: ['workerd', 'worker', 'browser'], external: ['cloudflare:*'],
    sourcemap: 'external', sourcesContent: true, logLevel: 'silent', plugins: [{ name: 'production-source-boundary', setup(build) {
      build.onResolve({ filter: /^node:/ }, (args) => args.kind === 'require-call'
        ? { path: args.path, namespace: 'mcp-node-shim' } : { path: args.path, external: true });
      build.onLoad({ filter: /.*/, namespace: 'mcp-node-shim' }, (args) => ({
        contents: `import libDefault from '${args.path}';\nmodule.exports = libDefault;`, loader: 'js'
      }));
      build.onLoad({ filter: /\.(?:m?js|cjs)$/ }, (args) => {
        const relative = path.relative(ROOT, args.path).replaceAll('\\', '/');
        if (!relative.startsWith('services/') && !relative.startsWith('packages/')) return;
        if (selected.has(args.path)) return { contents: selected.get(args.path), loader: 'js', resolveDir: path.dirname(args.path) };
        if (!NEW_MCP.has(relative)) throw Error(`Unreviewed project import: ${relative}`);
      });
    } }] });
  const code = fs.readFileSync(path.join(OUT, 'worker.mjs'), 'utf8');
  if (code.includes('claude-haiku-5-5') || !code.includes('claude-haiku-4-5-20251001')) throw Error('Release artifact changed production model');
  const compiled = await import(pathToFileURL(path.join(OUT, 'worker.mjs')).href + '?sha=' + hash(code));
  if (!['fetch','queue','scheduled'].every((name) => typeof compiled.default?.[name] === 'function')) throw Error('Release startup handlers are incomplete');
  const manifest = { prepared_at: new Date().toISOString(), base_version: baseVersion, bundle_sha256: hash(code),
    source_hashes: Object.fromEntries([...selected].map(([file, text]) => [path.relative(ROOT, file).replaceAll('\\', '/'), hash(text)])),
    runtime: detail.resources.script_runtime, binding_names: detail.resources.bindings.map((binding) => binding.name),
    public_before: await snapshot(), preserved_provider_modules: [...PRESERVE], startup_checked: true, state: 'prepared' };
  save(manifest);
  console.log(JSON.stringify({ state: manifest.state, base_version: baseVersion, bundle_sha256: manifest.bundle_sha256, models_preserved: true, assets_upload: false }));
}
async function upload() {
  allowMutation(); const manifest = readManifest();
  if (await deployed() !== manifest.base_version) throw Error('Production changed since prepare; do not overwrite another release');
  const versions = await cf(`${BASE}/versions`);
  if (versions.items?.[0]?.id !== manifest.base_version) throw Error('An undeployed version exists; review inheritance before release');
  const code = fs.readFileSync(path.join(OUT, 'worker.mjs'));
  if (hash(code) !== manifest.bundle_sha256) throw Error('Release artifact hash mismatch');
  // A separate research pepper lets the authorized Cloudflare operator provision
  // a research-only grant without reading/rotating existing app admin secrets.
  const pepper = process.env.GEOCHECK_MCP_TOKEN_PEPPER || randomBytes(48).toString('base64url');
  localValues({ GEOCHECK_MCP_TOKEN_PEPPER: pepper });
  const metadata = { main_module: 'worker.mjs', keep_assets: true,
    compatibility_date: manifest.runtime.compatibility_date, compatibility_flags: manifest.runtime.compatibility_flags,
    bindings: [...manifest.binding_names.map((name) => ({ name, type: 'inherit' })),
      { name: 'MCP_RESEARCH_TOKEN_PEPPER', type: 'secret_text', text: pepper }],
    annotations: { 'workers/message': 'Research MCP only; preserve deployed providers/assets; admission closed', 'workers/tag': 'mcp-research-v1' } };
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.set('worker.mjs', new Blob([code], { type: 'application/javascript+module' }), 'worker.mjs');
  form.set('worker.mjs.map', new Blob([fs.readFileSync(path.join(OUT, 'worker.mjs.map'))], { type: 'application/source-map' }), 'worker.mjs.map');
  const result = await cf(`${BASE}/versions?bindings_inherit=strict`, { method: 'POST', body: form });
  manifest.uploaded_version = result.id; manifest.state = 'uploaded'; save(manifest);
  const detail = await cf(`${BASE}/versions/${result.id}`);
  if (hash(JSON.stringify(detail.resources.script_runtime.assets)) !== hash(JSON.stringify(manifest.runtime.assets))) throw Error('Uploaded assets/routing differ; version has NOT been deployed');
  console.log(JSON.stringify({ state: manifest.state, version: result.id, assets_preserved: true, traffic_changed: false }));
}
async function migrate() {
  allowMutation(); const manifest = readManifest();
  if (!manifest.uploaded_version) throw Error('Upload and validate the closed version first');
  execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'wrangler.cmd', 'd1', 'migrations', 'apply', SCRIPT, '--remote', '--config', 'services/cloudflare/developer-api/wrangler.jsonc'],
    { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  const controls = await d1("SELECT control_key,control_value FROM developer_runtime_controls WHERE control_key IN ('mcp_admission_enabled','internal_admission_enabled')");
  if (!controls.some((row) => row.control_key === 'mcp_admission_enabled' && row.control_value === 'false')) throw Error('MCP must be closed before deployment');
  manifest.state = 'migrated'; save(manifest); console.log(JSON.stringify({ state: manifest.state, controls }));
}
async function deploy() {
  allowMutation(); const manifest = readManifest();
  if (manifest.state !== 'migrated' || await deployed() !== manifest.base_version) throw Error('Deployment prerequisites changed');
  const result = await cf(`${BASE}/deployments`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: manifest.uploaded_version, percentage: 100 }], annotations: { 'workers/message': 'Research MCP v1; internal admission remains controlled' } }) });
  manifest.deployment_id = result.id; manifest.state = 'deployed_closed'; save(manifest);
  console.log(JSON.stringify({ state: manifest.state, deployment_id: result.id }));
}
async function verify() {
  const manifest = readManifest();
  if (await deployed() !== manifest.uploaded_version) throw Error('Expected MCP version is not serving 100% traffic');
  const after = await snapshot();
  if (JSON.stringify(after) !== JSON.stringify(manifest.public_before)) throw Error('A public page or customer API changed during release');
  const detail = await cf(`${BASE}/versions/${manifest.uploaded_version}`);
  if (hash(JSON.stringify(detail.resources.script_runtime.assets)) !== hash(JSON.stringify(manifest.runtime.assets))) throw Error('Static assets configuration changed');
  manifest.verified_at = new Date().toISOString(); manifest.public_after = after; manifest.public_preserved = true; save(manifest);
  console.log(JSON.stringify({ state: manifest.state, public_preserved: true, assets_preserved: true, version: manifest.uploaded_version }));
}
async function activate() {
  allowMutation(); const manifest = readManifest();
  if (!manifest.public_preserved || await deployed() !== manifest.uploaded_version) throw Error('Verify the deployed version before granting access');
  let principal = process.env.GEOCHECK_MCP_RESEARCH_PRINCIPAL_ID;
  if (!principal) {
    const token = 'gcm_' + randomBytes(32).toString('base64url');
    principal = 'mcp_' + randomUUID();
    const pepper = process.env.GEOCHECK_MCP_TOKEN_PEPPER;
    if (!pepper) throw Error('Research pepper is missing locally');
    localValues({ GEOCHECK_MCP_RESEARCH_TOKEN: token, GEOCHECK_MCP_RESEARCH_PRINCIPAL_ID: principal });
  }
  const digest = createHmac('sha256', process.env.GEOCHECK_MCP_TOKEN_PEPPER).update(process.env.GEOCHECK_MCP_RESEARCH_TOKEN).digest('hex');
  const now = new Date().toISOString();
  const existing = await d1('SELECT token_hash,status FROM developer_mcp_research_grants WHERE principal_id=?', [principal]);
  if (existing.length && (existing[0].token_hash !== digest || existing[0].status !== 'active')) throw Error('Existing research grant does not match local credentials');
  if (!existing.length) await d1(`INSERT INTO developer_mcp_research_grants
    (principal_id,name,token_hash,scopes_json,status,created_at) VALUES (?,?,?,?, 'active',?)`,
    [principal, 'grokbot-research', digest, JSON.stringify(['measurements:write','measurements:read','usage:read']), now]);
  const internal = await d1("SELECT control_value FROM developer_runtime_controls WHERE control_key='internal_admission_enabled'");
  if (internal[0]?.control_value !== 'true') throw Error('Existing internal channel is closed; operator review required');
  await d1("UPDATE developer_runtime_controls SET control_value='true',reason='authorized Grok research MCP',updated_at=? WHERE control_key='mcp_admission_enabled'", [now]);
  await d1(`INSERT INTO developer_security_events(event_id,tenant_id,event_type,severity,metadata_json,created_at) VALUES (?,?,?,'info',?,?)`,
    ['sec_'+randomUUID(),'tnt_internal_agent','mcp_operator_provisioned',JSON.stringify({principal_id:principal,operator:'cloudflare-owner'}),now]);
  manifest.principal_id = principal; manifest.state = 'active'; save(manifest);
  console.log(JSON.stringify({ state: manifest.state, principal_id: principal, credential_file: path.join(ROOT,'.env'), token_printed: false }));
}
async function capture() {
  const manifest = readManifest();
  const customer = (await d1(`SELECT
    (SELECT COUNT(*) FROM developer_jobs j JOIN developer_tenants t ON t.tenant_id=j.tenant_id WHERE t.kind='customer') AS jobs,
    (SELECT COUNT(*) FROM developer_quota_reservations) AS quota_reservations,
    (SELECT COALESCE(SUM(used_rounds),0) FROM developer_quota_windows) AS used_rounds,
    (SELECT COALESCE(SUM(reserved_rounds),0) FROM developer_quota_windows) AS reserved_rounds,
    (SELECT COUNT(*) FROM developer_cost_events c JOIN developer_tenants t ON t.tenant_id=c.tenant_id WHERE t.kind='customer') AS cost_events`))[0];
  if (!manifest.customer_before) manifest.customer_before = customer;
  else {
    manifest.customer_after = customer;
    manifest.customer_unchanged = JSON.stringify(customer) === JSON.stringify(manifest.customer_before);
    if (!manifest.customer_unchanged) { save(manifest); throw Error('Customer aggregate changed; investigate attribution before claiming isolation'); }
  }
  save(manifest);
  console.log(JSON.stringify({ snapshot: manifest.customer_after ? 'after' : 'before', customer, unchanged: manifest.customer_unchanged }));
}
async function shutdown() {
  allowMutation();
  await d1("UPDATE developer_runtime_controls SET control_value='false',reason='MCP operator shutdown',updated_at=? WHERE control_key='mcp_admission_enabled'", [new Date().toISOString()]);
  console.log(JSON.stringify({ mcp_enabled: false, other_admission_unchanged: true }));
}
async function rollback() {
  allowMutation(); const manifest = readManifest();
  await shutdown();
  await cf(`${BASE}/deployments`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: manifest.base_version, percentage: 100 }] }) });
  manifest.state = 'rolled_back'; save(manifest);
  console.log(JSON.stringify({ version: manifest.base_version, additive_migration_retained: true }));
}
async function credential() {
  allowMutation(); const manifest = readManifest();
  const principal = process.env.GEOCHECK_MCP_RESEARCH_PRINCIPAL_ID;
  if (!principal) throw Error('Research principal is not configured locally');
  if (action === 'rotate') {
    const token = 'gcm_' + randomBytes(32).toString('base64url');
    const digest = createHmac('sha256', process.env.GEOCHECK_MCP_TOKEN_PEPPER).update(token).digest('hex');
    const rows = await d1("UPDATE developer_mcp_research_grants SET token_hash=?,rotated_at=? WHERE principal_id=? AND status='active' RETURNING principal_id", [digest, new Date().toISOString(), principal]);
    if (!rows.length) throw Error('Active research grant not found');
    localValues({ GEOCHECK_MCP_RESEARCH_TOKEN: token });
  } else {
    await d1("UPDATE developer_mcp_research_grants SET status='revoked',revoked_at=? WHERE principal_id=? AND status='active'", [new Date().toISOString(), principal]);
  }
  manifest.credential_last_action = action; save(manifest);
  console.log(JSON.stringify({ principal_id: principal, action, token_printed: false }));
}
async function main() {
  const actions = { prepare, upload, migrate, deploy, verify, activate, capture, shutdown, rollback, rotate: credential, revoke: credential };
  if (!actions[action]) throw Error('Use prepare, upload, migrate, deploy, verify, activate, capture, shutdown, rollback, rotate or revoke');
  await actions[action]();
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
