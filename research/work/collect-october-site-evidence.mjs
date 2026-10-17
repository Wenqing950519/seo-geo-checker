// Bounded, public HTTP evidence only. No environment loading or AI provider calls.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { loadEntityMaster, parseCsvLine } = require('../lib/entity-master.js');
const { assertSafePublicUrl } = require('../../packages/crawler/url-safety.js');
const { extractMetadata, stripHtml } = require('../../packages/crawler/html-v2.js');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const base = 'research/outputs/xinyi-dining-h2-2026-wave1/site-evidence';
const out = path.join(root, base);
const masterPath = 'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.entity_master.reviewed.csv';
const sitesPath = 'research/inputs/xinyi-restaurants-h2-2026/xinyi-49.sites.approved.csv';
const master = loadEntityMaster(path.join(root, masterPath));
const candidates = new Map();
function add(url, kind, storeId = null) {
  const parsed = new URL(url); parsed.hash = '';
  const normalized = parsed.toString();
  if (!candidates.has(normalized)) candidates.set(normalized, { url: normalized, roles: [], store_ids: [] });
  const target = candidates.get(normalized);
  if (!target.roles.includes(kind)) target.roles.push(kind);
  if (storeId && !target.store_ids.includes(storeId)) target.store_ids.push(storeId);
}
const roots = fs.readFileSync(path.join(root, sitesPath), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map(parseCsvLine);
roots.forEach(([url]) => add(url, 'approved_root_input'));
master.rows.filter(r => r.include_status === 'included').forEach(r => r.owned_urls.forEach(url => add(url, 'reviewed_owned_url', r.store_id)));
if (candidates.size > 120) throw new Error('Public URL scope exceeds 120; inspect inputs before collection');
if (!process.argv.includes('--collect')) {
  console.log(JSON.stringify({ urls: candidates.size, roots: roots.length, included_stores: master.rows.filter(r => r.include_status === 'included').length, paid_calls: 0 }));
  process.exit(0);
}
fs.mkdirSync(path.join(out, 'raw'), { recursive: true });
const ledger = path.join(out, 'fetch-events.jsonl');
const previous = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
const done = new Set(previous.map(r => r.input_url));
const pending = [...candidates.values()].filter(r => !done.has(r.url));
const plan = { created_at: new Date().toISOString(), timezone: 'Asia/Taipei', mode: 'public_http_only',
  paid_ai_calls: 0, concurrency: 3, timeout_ms_per_url: 20000, maximum_redirects: 5, maximum_bytes: 2000000,
  source_files: [masterPath, sitesPath].map(p => ({ path: p, sha256: hash(fs.readFileSync(path.join(root, p))) })),
  urls: [...candidates.values()], interpretation: 'HTTP reachability and returned content only; no automatic operating-status or ownership approval.' };
if (!fs.existsSync(path.join(out, 'collection-plan.json'))) fs.writeFileSync(path.join(out, 'collection-plan.json'), JSON.stringify(plan, null, 2) + '\n');
let next = 0;
async function collect(target) {
  const event = { input_url: target.url, roles: target.roles, store_ids: target.store_ids,
    started_at: new Date().toISOString(), redirect_chain: [], human_review_status: 'pending' };
  let current = target.url;
  const signal = AbortSignal.timeout(20000);
  try {
    for (let hop = 0; hop <= 5; hop++) {
      await assertSafePublicUrl(current);
      const response = await fetch(current, { redirect: 'manual', signal,
        headers: { 'User-Agent': 'GeoCheck-Research/1.0 (public website evidence)', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' } });
      event.redirect_chain.push({ url: current, status: response.status, location: response.headers.get('location') });
      if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
        await response.body?.cancel();
        if (hop === 5) throw new Error('redirect_limit');
        current = new URL(response.headers.get('location'), current).toString(); continue;
      }
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body ?? []) {
        bytes += chunk.length;
        if (bytes > 2000000) throw new Error('response_size_limit');
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      const name = hash(target.url).slice(0, 24) + '.bin';
      fs.writeFileSync(path.join(out, 'raw', name), body);
      const contentType = response.headers.get('content-type') || '';
      Object.assign(event, { status: 'response_saved', final_url: current, http_status: response.status,
        content_type: contentType, bytes: body.length, raw_ref: `${base}/raw/${name}`, raw_sha256: hash(body),
        etag: response.headers.get('etag'), last_modified: response.headers.get('last-modified'),
        text_decoding: 'UTF-8 preview; raw bytes preserved',
        metadata: /html/i.test(contentType) ? extractMetadata(body.toString('utf8')) : null,
        text_preview: /html/i.test(contentType) ? stripHtml(body.toString('utf8')).slice(0, 12000) : null });
      break;
    }
  } catch (e) { Object.assign(event, { status: 'fetch_failed', error: String(e.message).slice(0, 300), error_code: e.cause?.code ?? e.code ?? null, last_url: current }); }
  event.finished_at = new Date().toISOString();
  fs.appendFileSync(ledger, JSON.stringify(event) + '\n');
  console.log(`${event.status} ${event.http_status ?? event.error_code ?? ''} ${target.url}`);
}
await Promise.all(Array.from({ length: 3 }, async () => { while (next < pending.length) await collect(pending[next++]); }));
const events = fs.readFileSync(ledger, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const summary = { completed_at: new Date().toISOString(), planned_urls: candidates.size, recorded_urls: events.length,
  unique_urls: new Set(events.map(r => r.input_url)).size,
  saved_responses: events.filter(e => e.status === 'response_saved').length,
  http_2xx: events.filter(e => e.http_status >= 200 && e.http_status < 300).length,
  fetch_failures: events.filter(e => e.status === 'fetch_failed').length, paid_ai_calls: 0,
  events_file_sha256: hash(fs.readFileSync(ledger)) };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
