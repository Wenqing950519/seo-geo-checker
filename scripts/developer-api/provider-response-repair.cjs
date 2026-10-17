// Scoped maintenance release: patch the deployed sources, retaining models/assets/bindings.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const Module = require('node:module');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'tmp/provider-response-repair');
const BASE = '/accounts/d94ae08a9389415ba3fcf231db7fc909/workers/scripts/geocheck-developer-api';
const DB = '/accounts/d94ae08a9389415ba3fcf231db7fc909/d1/database/cebce923-e5a4-460e-abf3-68bf5096e67c/query';
const PROVIDERS = 'services/api/application/official-search-providers.js';
const NORMALIZER = 'services/api/application/developer-api-prototype.js';
const hash = (s) => createHash('sha256').update(s).digest('hex');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const manifestPath = path.join(OUT, 'manifest.json');
const save = (x) => fs.writeFileSync(manifestPath, JSON.stringify(x, null, 2) + '\n');
function token() {
  return /^oauth_token\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8'))[1];
}
async function cf(route, options = {}) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + route, { ...options,
    headers: { Authorization: `Bearer ${token()}`, ...options.headers }, signal: AbortSignal.timeout(45000) });
  const d = await r.json();
  if (!r.ok || !d.success) throw Error(`Cloudflare operation failed: HTTP ${r.status}; codes ${(d.errors || []).map(e => e.code).join(',')}`);
  return d.result;
}
async function current() {
  const d = (await cf(BASE + '/deployments')).deployments[0];
  assert.equal(d.versions.length, 1); assert.equal(d.versions[0].percentage, 100);
  return d.versions[0].version_id;
}
async function d1(sql, params = []) {
  const d = await cf(DB, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }) });
  assert.ok(d.every(x => x.success !== false)); return d[0].results;
}
async function snapshot() {
  const pages = {};
  for (const p of ['/', '/docs', '/pricing', '/terms', '/privacy', '/refund', '/console', '/robots.txt', '/sitemap.xml', '/v1/usage']) {
    const r = await fetch('https://platform.lslabs.tw' + p, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    pages[p] = { status: r.status, location: r.headers.get('location'), sha256: hash(await r.text()) };
  }
  const customer = (await d1(`SELECT
    (SELECT COUNT(*) FROM developer_jobs j JOIN developer_tenants t ON t.tenant_id=j.tenant_id WHERE t.kind='customer') AS jobs,
    (SELECT COUNT(*) FROM developer_quota_reservations) AS reservations,
    (SELECT COALESCE(SUM(used_rounds),0) FROM developer_quota_windows) AS used_rounds,
    (SELECT COALESCE(SUM(reserved_rounds),0) FROM developer_quota_windows) AS reserved_rounds,
    (SELECT COUNT(*) FROM developer_cost_events c JOIN developer_tenants t ON t.tenant_id=c.tenant_id WHERE t.kind='customer') AS cost_events`))[0];
  const controls = await d1('SELECT control_key,control_value FROM developer_runtime_controls ORDER BY control_key');
  return { pages, customer, controls };
}
function repairProviderSource(live, working) {
  const old = 'const answer = String(firstText(response.content) || "").trim();';
  assert.equal(live.split(old).length, 2, 'Expected exactly one deployed Claude parser');
  const helper = working.slice(working.indexOf('function anthropicAnswer('), working.indexOf('function firstText('));
  assert.ok(helper.startsWith('function anthropicAnswer('));
  assert.ok(!live.includes('function anthropicAnswer('));
  return live.replace(old, 'const answer = anthropicAnswer(response.content);').replace('function firstText(', helper + 'function firstText(');
}
function compileSources(selected, filename) {
  const file = path.join(ROOT, filename), m = new Module(file, module);
  m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  const cache = selected._modules ||= new Map();
  cache.set(file, m);
  m.require = (id) => {
    if (id.startsWith('.')) {
      const resolved = require.resolve(path.resolve(path.dirname(file), id));
      const relative = path.relative(ROOT, resolved).replaceAll('\\', '/');
      if (selected.has(relative)) return (cache.get(resolved) || compileSources(selected, relative)).exports;
    }
    return require(id);
  };
  m._compile(selected.get(filename), file); return m;
}
async function regression(selected) {
  const config = Object.fromEntries(['OPENAI_API_KEY','GEMINI_API_KEY','PERPLEXITY_API_KEY','ANTHROPIC_API_KEY'].map(k => [k, 'fixture']));
  const { createOfficialProvidersFromEnv } = compileSources(selected, PROVIDERS).exports;
  let sent;
  const providers = createOfficialProvidersFromEnv({ config, fetch: async (_, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ content: [{ type: 'text', text: 'Let me search.' }, { type: 'web_search_tool_result', content: [] },
      { type: 'text', text: 'The final ' }, { type: 'text', text: 'answer.' }], usage: { server_tool_use: { web_search_requests: 1 } }, stop_reason: 'end_turn' });
  } });
  const result = await providers.find(p => p.id === 'anthropic-web').execute({ prompt: 'unchanged prompt' });
  assert.equal(result.answer, 'The final answer.');
  assert.equal(sent.model, 'claude-haiku-4-5-20251001'); assert.equal(sent.max_tokens, 1024);
  assert.equal(sent.output_config, undefined); assert.equal(sent.tool_choice, undefined);
  const { normalizeEngineResult } = compileSources(selected, NORMALIZER).exports;
  const profile = { id: 'openai-web', provider: 'openai', model: 'gpt-6-luna', searchSurface: 'openai_web_search' };
  const noSearch = normalizeEngineResult(profile, { answer: 'Direct model answer', searchEvidence: { mode: 'openai_web_search', executed: false },
    usage: { search_requests: 0 }, cost: { status: 'estimated_list_price', estimated_usd: 0.001 } });
  assert.equal(noSearch.error.code, 'provider_search_not_executed'); assert.equal(noSearch.response_observation.answer, 'Direct model answer');
  assert.equal(noSearch.status, 'failed'); assert.equal(noSearch.cost.estimated_usd, 0.001);
}
async function prepare() {
  fs.mkdirSync(OUT, { recursive: true });
  const base = await current(), detail = await cf(BASE + '/versions/' + base);
  const r = await fetch('https://api.cloudflare.com/client/v4' + BASE, { headers: { Authorization: `Bearer ${token()}` } });
  assert.ok(r.ok); const form = await r.formData();
  const part = [...form].find(([name]) => name.endsWith('.map'))?.[1]; assert.ok(part);
  const map = JSON.parse(typeof part === 'string' ? part : await part.text());
  const selected = new Map();
  map.sources.forEach((name, i) => {
    const relative = name.replace(/^(\.\.\/)+/, '');
    if (/^(services|packages)\//.test(relative)) { assert.ok(!relative.includes('..')); selected.set(relative, map.sourcesContent[i]); }
  });
  assert.ok(selected.size >= 15);
  // Only these two project modules may change. All other project code is live.
  const before = Object.fromEntries([...selected].map(([p, s]) => [p, hash(s)]));
  const prototype = read(NORMALIZER);
  assert.equal(selected.get(NORMALIZER), require('node:child_process').execFileSync('git', ['-c', `safe.directory=${ROOT}`, 'show', 'HEAD:' + NORMALIZER], { cwd: ROOT, encoding: 'utf8' }),
    'Unexpected live normalizer drift');
  selected.set(NORMALIZER, prototype);
  selected.set(PROVIDERS, repairProviderSource(selected.get(PROVIDERS), read(PROVIDERS)));
  await regression(selected);
  await require('esbuild').build({ absWorkingDir: ROOT, entryPoints: ['services/cloudflare/developer-api/src/worker.js'], outfile: path.join(OUT, 'worker.mjs'),
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', mainFields: ['module','main'], conditions: ['workerd','worker','browser'],
    external: ['cloudflare:*'], sourcemap: 'external', sourcesContent: true, logLevel: 'silent', plugins: [{ name: 'live-only', setup(build) {
      build.onResolve({ filter: /^node:/ }, a => a.kind === 'require-call' ? { path: a.path, namespace: 'mcp-node-shim' } : { path: a.path, external: true });
      build.onLoad({ filter: /.*/, namespace: 'mcp-node-shim' }, a => ({ contents: `import libDefault from '${a.path}';\nmodule.exports = libDefault;`, loader: 'js' }));
      build.onLoad({ filter: /\.(m?js|cjs)$/ }, a => {
        const relative = path.relative(ROOT, a.path).replaceAll('\\', '/');
        if (!/^(services|packages)\//.test(relative)) return;
        assert.ok(selected.has(relative), 'Unexpected new project import: ' + relative);
        return { contents: selected.get(relative), loader: 'js', resolveDir: path.dirname(a.path) };
      });
    } }] });
  const code = fs.readFileSync(path.join(OUT,'worker.mjs'));
  assert.ok(!code.includes('claude-haiku-5-5')); assert.ok(code.includes('claude-haiku-4-5-20251001'));
  const compiled = await import(pathToFileURL(path.join(OUT,'worker.mjs')).href + '?sha=' + hash(code));
  for (const name of ['fetch','queue','scheduled']) assert.equal(typeof compiled.default[name], 'function');
  const changes = [...selected].filter(([p,s]) => before[p] !== hash(s)).map(([p]) => p);
  assert.deepEqual(changes.sort(), [PROVIDERS,NORMALIZER].sort());
  save({ prepared_at: new Date().toISOString(), state: 'prepared', base_version: base, bundle_sha256: hash(code),
    runtime: detail.resources.script_runtime, binding_names: detail.resources.bindings.map(b=>b.name),
    sources: [...selected].map(([p,s]) => ({ path:p, before_sha256:before[p], after_sha256:hash(s) })), regression_passed: true, before: await snapshot() });
  console.log(JSON.stringify({ prepared:true, base_version:base, changed_modules:changes, deployed_models_preserved:true, regression_passed:true }));
}
async function deploy() {
  assert.ok(process.argv.includes('--allow-deploy'), 'Use --allow-deploy for the authorized maintenance release');
  const m = JSON.parse(fs.readFileSync(manifestPath)); assert.equal(m.state,'prepared'); assert.equal(await current(),m.base_version);
  assert.equal((await cf(BASE+'/versions')).items[0].id,m.base_version, 'Unreviewed pending version');
  const code=fs.readFileSync(path.join(OUT,'worker.mjs')); assert.equal(hash(code),m.bundle_sha256);
  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify({ main_module:'worker.mjs',keep_assets:true,compatibility_date:m.runtime.compatibility_date,
    compatibility_flags:m.runtime.compatibility_flags,bindings:m.binding_names.map(name=>({ name,type:'inherit' })),
    annotations:{ 'workers/message':'Fix research provider diagnostics and Claude final-answer parsing; preserve models and budgets' } })],{type:'application/json'}));
  form.set('worker.mjs',new Blob([code],{type:'application/javascript+module'}),'worker.mjs');
  form.set('worker.mjs.map',new Blob([fs.readFileSync(path.join(OUT,'worker.mjs.map'))],{type:'application/source-map'}),'worker.mjs.map');
  const version=await cf(BASE+'/versions?bindings_inherit=strict',{method:'POST',body:form});
  m.uploaded_version=version.id; save(m);
  const detail=await cf(BASE+'/versions/'+version.id); assert.deepEqual(detail.resources.script_runtime,m.runtime);
  assert.equal(await current(),m.base_version);
  const d=await cf(BASE+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',
    versions:[{version_id:version.id,percentage:100}],annotations:{'workers/message':'Scoped provider-response repair; no model/prompt/tool-choice changes'}})});
  m.deployment_id=d.id; m.deployed_at=new Date().toISOString(); m.state='deployed';save(m);
  console.log(JSON.stringify({deployed:true,version:version.id,deployment:d.id}));
}
async function verify() {
  const m=JSON.parse(fs.readFileSync(manifestPath));assert.equal(await current(),m.uploaded_version);
  m.after=await snapshot(); assert.deepEqual(m.after,m.before,'Public pages, customer accounting or admission changed');
  m.verified_at=new Date().toISOString();m.state='verified';save(m);
  const evidence=path.join(ROOT,'docs/developer-api/evidence/provider-response-repair-2026-10-16.json');
  const observed=JSON.parse(fs.readFileSync(path.join(OUT,'observed.json')));
  fs.writeFileSync(evidence,JSON.stringify({...m,observed,historical_full_raw_retained:false,paid_validation_performed:false},null,2)+'\n');
  console.log(JSON.stringify({verified:true,version:m.uploaded_version,public_and_customer_unchanged:true,evidence}));
}
async function smoke() {
  assert.ok(process.argv.includes('--allow-paid'), 'Three controlled measurements require --allow-paid');
  const m=JSON.parse(fs.readFileSync(manifestPath));assert.equal(m.state,'verified');assert.equal(await current(),m.uploaded_version);
  require('../../packages/shared/env.js').loadEnvFiles();
  const { Client,StreamableHTTPClientTransport }=await import('@modelcontextprotocol/client');
  const client=new Client({name:'provider-response-repair',version:'1.0.0'});
  const structured=r=>{assert.ok(!r.isError,'MCP tool failed');return r.structuredContent||JSON.parse(r.content[0].text);};
  const observations=[];
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('https://platform.lslabs.tw/mcp'),{requestInit:{headers:{Authorization:`Bearer ${process.env.GEOCHECK_MCP_RESEARCH_TOKEN}`}}}));
    const usage=structured(await client.callTool({name:'get_usage',arguments:{}}));
    for(const w of usage.shared_internal_budget.windows) assert.ok(w.remaining_twd>=36,'Insufficient shared budget for three bounded validation jobs');
    for(const [id,text] of [['R01-002','ga4 是什麼'],['R01-029','SEO 工具推薦 繁體中文'],['R01-096','附近 咖啡廳 可以久坐 有插座']]) {
      const request={study_id:'provider-response-repair-2026-10-16',input:{type:'prompt',text},idempotency_key:'provider-response-repair-20261016-'+id};
      const accepted=structured(await client.callTool({name:'create_measurement',arguments:request}));
      let result;
      const deadline=Date.now()+120000;
      do {
        result=structured(await client.callTool({name:'get_measurement',arguments:{measurement_id:accepted.measurement_id}}));
        if(['succeeded','failed'].includes(result.status))break;
        await new Promise(r=>setTimeout(r,2500));
      }while(Date.now()<deadline);
      const row={case:id,request,accepted,result};observations.push(row);
      fs.writeFileSync(path.join(OUT,'validation.json'),JSON.stringify(observations,null,2)+'\n');
      assert.ok(['succeeded','failed'].includes(result.status),'Validation timed out; keep measurement ID and do not resubmit');
      assert.equal(result.quota.charged_rounds,0);assert.equal(result.billing_mode,'internal_research');
      const jobs=await d1('SELECT job_id,mcp_principal_id,study_id FROM developer_jobs WHERE measurement_id=?',[result.measurement_id]);
      assert.equal(jobs[0].study_id,request.study_id);assert.equal(jobs[0].mcp_principal_id,process.env.GEOCHECK_MCP_RESEARCH_PRINCIPAL_ID);
      const attempts=await d1('SELECT profile_id,status,error_code,usage_json,cost_json FROM developer_provider_attempts WHERE job_id=?',[jobs[0].job_id]);assert.equal(attempts.length,4);
      row.attempts=attempts;
      for(const e of result.engines) {
        if(e.status==='failed') {
          assert.equal(e.error.code,'provider_search_not_executed','Unexplained provider failure: '+e.profile_id);
          assert.equal(e.response_observation.search_executed,false);assert.ok(e.response_observation.answer);
        }
        if(e.profile_id==='anthropic-web'&&e.status==='succeeded')assert.ok(e.answer.length>100,'Claude final answer suspiciously short');
      }
      console.log(JSON.stringify({case:id,measurement_id:result.measurement_id,status:result.status,engines:result.engines.map(e=>({id:e.profile_id,status:e.status,error:e.error?.code,answer_length:e.answer?.length||e.response_observation?.answer?.length,search_requests:e.usage?.search_requests}))}));
    }
  }finally{
    await client.close();
    fs.writeFileSync(path.join(OUT,'validation.json'),JSON.stringify(observations,null,2)+'\n');
  }
  const evidencePath=path.join(ROOT,'docs/developer-api/evidence/provider-response-repair-2026-10-16.json');
  const evidence=JSON.parse(fs.readFileSync(evidencePath));evidence.paid_validation_performed=true;evidence.validation=observations;
  evidence.after_validation=await snapshot();assert.deepEqual(evidence.after_validation,m.before,'Customer accounting/public surface changed');
  evidence.validation_completed_at=new Date().toISOString();fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({validated:true,measurements:observations.length,customer_unchanged:true}));
}
if(require.main===module) ({prepare,deploy,verify,smoke}[process.argv[2]]||(()=>{throw Error('Use prepare, deploy, verify, smoke');}))().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={repairProviderSource};
