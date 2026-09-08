// One-time, read-only inventory generator for the 2026-09-08 layout migration.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
if (fs.existsSync(path.join(root,'docs/maintenance/layout-migration-2026-09-08.json'))) throw new Error('Migration manifest already exists; do not overwrite provenance');
const moves = {};
const add = (from, to) => { if (fs.existsSync(path.join(root, from))) moves[from] = to; };
function tree(from, to) {
  if (!fs.existsSync(path.join(root, from))) return;
  for (const entry of fs.readdirSync(path.join(root, from), { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name === '.env' || entry.name.endsWith('.log')) continue;
    const old = `${from}/${entry.name}`, next = `${to}/${entry.name}`;
    if (entry.isDirectory()) tree(old, next); else if (entry.isFile()) add(old, next);
  }
}
const groups = {
  'packages/geo-core/evidence': ['brand-match', 'authority-evidence', 'perplexity-visibility'],
  'packages/geo-core/site-analyzer': ['content-evidence', 'crawl-quality', 'site-type'],
  'packages/geo-core/scoring': ['scoring-v2', 'scoring-v2-core', 'geo-assessment', 'ai-trust-index'],
  'packages/geo-core/query-generator': ['geo-probes'],
  'packages/crawler': ['html-v2', 'browser-fetch-v2', 'browser-runtime', 'scrapling-fetch', 'google-translate-fetch', 'technical-signals', 'citation-resolve', 'url-safety'],
  'packages/shared': ['errors', 'env'],
  'packages/ai-providers': ['usage-meter'],
  'services/api/application': ['geo-measurement', 'query-planner'],
  'services/api/storage': ['audit-cache', 'd1-report-store'],
  'services/api/guards': ['rate-limit'],
  'apps/web/report': ['real-lite-audit', 'real-lite-audit-v2-core'],
  'apps/web/analytics': ['funnel-events'],
  'research/lib': ['research-profile', 'entity-master']
};
for (const [dir, files] of Object.entries(groups)) for (const name of files) add(`mock-api/lib/${name}.js`, `${dir}/${name}.js`);
for (const name of ['deepseek','perplexity','brave','agnes','structured-router']) add(`mock-api/providers/${name}.js`, `packages/ai-providers/${name}.js`);
add('mock-api/server.js', 'services/api/server.js');
tree('mock-api/public', 'apps/web/public');
tree('mock-api/tests', 'tests/regression');
tree('mock-api/migrations', 'services/api/migrations');
add('mock-api/wrangler.jsonc', 'services/api/wrangler.jsonc');
add('mock-api/README.md', 'services/api/OPERATIONS.md');
for (const name of ['install-browser-runtime.js','install-scrapling-runtime.js']) add(`mock-api/scripts/${name}`, `scripts/runtime/${name}`);
add('mock-api/scripts/scrapling-fetch.py', 'packages/crawler/scripts/scrapling-fetch.py');
for (const name of ['audit-batch.js','run-blind-model-evaluation.js','validate-geo-v3-live.mjs']) add(`mock-api/scripts/${name}`, `research/scripts/${name}`);
for (const [old, next] of Object.entries({'research-input':'research/inputs', 'research-output':'research/outputs', 'research-sources':'research/sources', 'research-work':'research/work'})) tree(old, next);
tree('business_docs', 'docs/archive/business');
tree('seo-geo', 'archive/seo-geo');
add('seo-geo.skill', 'archive/seo-geo.skill');
for (const name of ['ALGORITHM_V2.md','ALGORITHM_V3.md']) add(name, `docs/archive/algorithms/${name}`);
for (const entry of fs.readdirSync(root)) {
  if (/^GEO.*\.docx$/.test(entry)) add(entry, `docs/archive/specifications/${entry}`);
  if (/^2026_.*\.md$/.test(entry)) add(entry, `docs/research/plans/${entry}`);
}
for (const name of ['COMPETITIVE_INTEL_2026-09-07.md','PRODUCT_STRATEGY_2026-09-07.md','ROADMAP_OPTIONS_2026-09-07.md','MULTI_ENGINE_API_SERVICE_BRIEF.md']) add(`docs/${name}`, `docs/strategy/${name}`);
for (const name of ['P1_CLAIM_AUDIT_2026-08-14.md','P1_CONSTRUCT_WORKING_NOTES.md','P1_HUMAN_WORK_REVIEW_2026-08-09.md']) add(`docs/${name}`, `docs/research/methodology/${name}`);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const entries = Object.entries(moves).map(([from,to]) => {
  const content = fs.readFileSync(path.join(root,from));
  return {from,to,bytes:content.length,sha256:hash(content)};
});
const byHash = new Map();
for (const e of entries) { const group = byHash.get(e.sha256) || []; group.push(e.from); byHash.set(e.sha256, group); }
const manifest = {date:'2026-09-08', status:'planned', policy:'No deletion. Raw research evidence keeps original bytes; moved executable paths may be updated.', entries, identicalGroups:[...byHash].filter(([,paths])=>paths.length>1).map(([sha256,paths])=>({sha256,paths}))};
fs.mkdirSync(path.join(root,'docs/maintenance'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/maintenance/layout-migration-2026-09-08.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:entries.length,bytes:entries.reduce((a,b)=>a+b.bytes,0),identicalGroups:manifest.identicalGroups.length}));
