// Uses the canonical batch unchanged in scoring, prompts and models; adds a bounded transport evidence layer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const { loadEntityMaster, assertReviewedEntityCoverage, parseCsvLine, findEntityForUrl } = require('../lib/entity-master.js');
const { createResearchTransportRecorder } = require('../lib/transport-recorder.js');
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const base = 'research/outputs/xinyi-dining-h2-2026-wave1';
const batchDir = `${base}/ai-evidence`;
const masterFile = 'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.entity_master.reviewed.csv';
const sitesFile = 'research/inputs/xinyi-restaurants-h2-2026/xinyi-49.sites.approved.csv';
const queryFile = 'research/inputs/xinyi-restaurants-h2-2026/query-set.xinyi-dining-h2-2026.approved.json';
const master = loadEntityMaster(masterFile);
const queries = JSON.parse(fs.readFileSync(queryFile, 'utf8'));
if (queries.review_status !== 'approved' || queries.query_set_version !== 'xinyi-dining-2026h2-v2.0' || queries.queries.length !== 3) throw new Error('Pinned approved query set mismatch');
const urls = fs.readFileSync(sitesFile, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map(parseCsvLine).map(r => r[0]);
const valid = [], blocked = [];
for (const url of urls) {
  try { assertReviewedEntityCoverage([url], master); valid.push(url); }
  catch(e) { blocked.push({ input_url: url, domain: new URL(url).hostname.replace(/^www\./, ''),
    historical_selected_store_id: findEntityForUrl(master, url)?.row.store_id ?? null,
    measurement_status: 'unknown', error_stage: 'entity_mapping_preflight', error_message: e.message,
    ai_trust_index: null, answer_adoption_rate: null, source_evidence_rate: null, provider_calls: 0 }); }
}
if (urls.length !== 49 || valid.length !== 33 || blocked.length !== 16) throw new Error('Review cohort changes before collection');
fs.mkdirSync(batchDir, { recursive: true });
const subsetFile = `${base}/preparation/sites-passing-existing-approval.csv`;
const subset = 'url\n' + valid.join('\n') + '\n';
if (fs.existsSync(subsetFile) && fs.readFileSync(subsetFile, 'utf8') !== subset) throw new Error('Frozen subset changed');
fs.writeFileSync(subsetFile, subset);
fs.writeFileSync(`${base}/preparation/blocked-entity-rows.json`, JSON.stringify(blocked, null, 2) + '\n');
require('../../packages/shared/env.js').loadEnvFiles();
const p = require('../../packages/ai-providers/perplexity.js').getPerplexityConfig();
const d = require('../../packages/ai-providers/deepseek.js').getDeepSeekConfig();
if (p.model !== 'sonar' || d.model !== 'deepseek-v4-flash' || d.modelRelease !== '0731' || d.thinkingEnabled) throw new Error('Baseline model settings have drifted; review before collection');
if (p.baseUrl !== 'https://api.perplexity.ai' || p.endpoint !== '/chat/completions' || d.baseUrl !== 'https://api.deepseek.com') throw new Error('Unapproved provider endpoint');
const sourceFiles = [sitesFile, masterFile, queryFile, subsetFile,
  '.agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs',
  'research/lib/entity-master.js', 'research/lib/transport-recorder.js',
  'research/work/run-october-wave1.mjs', 'services/api/application/geo-measurement.js',
  'packages/ai-providers/perplexity.js', 'packages/ai-providers/deepseek.js',
  'packages/geo-core/evidence/brand-match.js', 'packages/geo-core/evidence/perplexity-visibility.js',
  'packages/geo-core/scoring/ai-trust-index.js'];
const runId = 'whitepaper-xinyi-wave1-2026-10-15-v2q';
const caps = { perplexity: 132, deepseek: 33 };
const frozen = { run_id: runId, timezone: 'Asia/Taipei', collection_date: '2026-10-15',
  authorization: 'User requested continuing derivation, verification and completing the dataset in this chat; existing approved cohort and query text retained.',
  cohort_size: 49, passing_existing_entity_coverage: valid.length, preflight_unknown: blocked.length,
  cohort_policy: 'All 49 original inputs remain in final denominators. Ambiguous rows have no provider calls and remain unknown; no new entities or approval records.',
  query_set_version: queries.query_set_version, models: { perplexity: p.model, deepseek: d.model, deepseek_release: d.modelRelease },
  actual_http_request_caps_including_retries: caps, drafting_calls: 0, provider_fallback: false,
  prompt_policy: 'Canonical batch request bodies are captured verbatim without authentication headers; same system/user prompts and 260-token Perplexity setting as baseline code.',
  concurrency: 1, delay_ms: 500, representative_pages: 3,
  interpretation: 'One monthly snapshot; unknown is not zero; HTTP truncation/finish reasons and cohort mapping require separate quality review.',
  source_head: execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  source_files: sourceFiles.map(file => ({ path: file, sha256: hash(fs.readFileSync(file)) })) };
const protocolFile = `${base}/protocol.json`;
if (fs.existsSync(protocolFile)) {
  const existing = JSON.parse(fs.readFileSync(protocolFile, 'utf8'));
  if (JSON.stringify(existing.frozen) !== JSON.stringify(frozen)) throw new Error('Protocol/source changed since freeze; do not silently resume');
} else fs.writeFileSync(protocolFile, JSON.stringify({ frozen_at: new Date().toISOString(), frozen }, null, 2) + '\n');
console.log(JSON.stringify({ run_id: runId, cohort:49, eligible:valid.length, unknown:blocked.length, caps, collect:process.argv.includes('--collect') }));
if (!process.argv.includes('--collect')) process.exit(0);
if (new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Taipei'}) !== '2026-10-15') throw new Error('Collection window expired; review protocol');
const lock = path.join(batchDir, 'runner.lock');
const fd = fs.openSync(lock, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd);
const originalFetch = globalThis.fetch;
const recorder = createResearchTransportRecorder({ dir: `${batchDir}/transport`, runId, caps,
  endpoints: { perplexity: p.baseUrl + p.endpoint, deepseek: d.baseUrl + '/chat/completions' }, nativeFetch: originalFetch });
globalThis.fetch = recorder.fetch;
process.argv = [process.execPath, path.resolve('.agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs'),
  '--input', subsetFile, '--master', masterFile, '--query-set', queryFile, '--output-dir', batchDir,
  '--run-id', runId, '--max-perplexity-calls', '132', '--max-deepseek-calls', '33', '--concurrency', '1', '--delay-ms', '500'];
try { await import(pathToFileURL(process.argv[1]).href); }
finally { globalThis.fetch = originalFetch; fs.unlinkSync(lock); }
