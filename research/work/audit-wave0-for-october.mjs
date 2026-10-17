// Offline audit only: no environment loading, provider calls, or source mutation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = 'research/outputs/xinyi-dining-h2-2026-wave0';
const output = path.join(root, 'research/outputs/xinyi-dining-h2-2026-wave1/preparation');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const jsonl = p => read(p).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const count = (rows, key) => rows.reduce((a, r) => { const k = r[key] ?? 'unknown'; a[k] = (a[k] ?? 0) + 1; return a; }, {});
const mean = (rows, key) => { const a = rows.map(r => r[key]).filter(Number.isFinite); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
const rows = jsonl(`${baseline}/results.jsonl`);
const methodology = json(`${baseline}/methodology.json`);
const events = jsonl(`${baseline}/api-usage-events.jsonl`);
const summary = json(`${baseline}/api-usage-summary.json`);
const queries = json('research/inputs/xinyi-restaurants-h2-2026/query-set.xinyi-dining-h2-2026.approved.json');
const success = rows.filter(r => r.measurement_status === 'success');
const failed = rows.filter(r => r.measurement_status !== 'success');
assert.equal(new Set(rows.map(r => r.domain)).size, rows.length, 'duplicate domain');
assert(failed.every(r => r.ai_trust_index === null && r.answer_adoption_rate === null && r.source_evidence_rate === null));

// Same field selection and insertion order as stableResearchRow in the batch CLI.
const fields = ['url', 'ai_trust_index', 'answer_adoption_rate', 'source_evidence_rate', 'legacy_geo_score', 'deepseek_profile', 'measurement_status', 'pipeline_version', 'profile_version', 'parser_version', 'scoring_version', 'evidence_hash'];
// JSONL is completion order; the CLI hashes rows in input-URL order.
const inputRows = read(methodology.input_file.replaceAll('\\', '/')).trim().split(/\r?\n/).slice(1).map(line => line.split(','));
const orderedRows = inputRows.map(([url, domain, , ids]) => {
  const matches = rows.filter(r => r.domain === domain || (ids.split(';').includes(r.store_id?.replace('XY-', ''))));
  assert.equal(matches.length, 1, `ambiguous baseline join: ${url}`);
  return matches[0];
});
assert.equal(new Set(orderedRows).size, rows.length, 'baseline join not one-to-one');
const datasetHash = hash(orderedRows.map(r => JSON.stringify(Object.fromEntries(fields.map(k => [k, r[k]])))).join('\n'));
// Preserve mismatches as audit findings rather than altering the frozen source.
const usageHash = hash(events.map(JSON.stringify).join('\n'));
assert.equal(usageHash, methodology.api_usage_events_sha256, 'usage hash mismatch');
assert.equal(events.length, summary.totals.requests);
assert.equal(new Set(events.map(e => e.id)).size, events.length, 'duplicate usage event id');

const detail = [];
for (const r of success) {
  const raw = json(`${baseline}/${r.raw_ref}`);
  assert.equal(raw.url, r.url);
  assert.equal(raw.query_set_version, queries.query_set_version);
  assert.equal(raw.search_evidence.discovery.length, queries.queries.length);
  for (const q of queries.queries) {
    const o = r.query_observations.find(o => o.queryId === q.id);
    const answer = raw.search_evidence.discovery.find(o => o.queryId === q.id);
    assert(o && answer, `missing query ${r.domain}/${q.id}`);
    assert.equal(o.query, q.text);
    assert.equal(answer.query, q.text);
    const valid = o.answerStatus === 'answered' && o.excluded === false;
    detail.push({ domain: r.domain, store_id: r.store_id, query_id: q.id,
      valid, brand_mentioned: valid ? o.brandMentioned : null,
      first_party_cited: valid ? o.firstPartyCited : null,
      raw_ref: `${baseline}/${r.raw_ref}`, raw_locator: `search_evidence.discovery[queryId=${q.id}]`,
      answer_sha256: hash(answer.answer ?? ''), answer_characters: (answer.answer ?? '').length,
      observation_answer_characters: (o.answer ?? '').length,
      response_model: answer.model ?? null, attempts: answer.attempts ?? null,
      citation_count: answer.citations?.length ?? 0 });
  }
  const d = detail.filter(d => d.domain === r.domain && d.valid);
  assert.equal(d.length, r.ai_trust_denominator.valid_runs);
}
const valid = detail.filter(d => d.valid);
const mentions = valid.filter(d => d.brand_mentioned === true).length;
const citations = valid.filter(d => d.first_party_cited === true).length;
const files = [
  'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.cohort_registry.reviewed.csv',
  'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.entity_master.reviewed.csv',
  'research/inputs/xinyi-restaurants-h2-2026/xinyi-49.sites.approved.csv',
  'research/inputs/xinyi-restaurants-h2-2026/query-set.xinyi-dining-h2-2026.approved.json',
  `${baseline}/results.jsonl`, `${baseline}/results.csv`, `${baseline}/methodology.json`,
  `${baseline}/api-usage-events.jsonl`, `${baseline}/wave0-baseline-report.md`,
  '.agents/skills/geo-whitepaper-research/scripts/run-ai-evidence-batch.mjs',
  ...success.map(r => `${baseline}/${r.raw_ref}`)
];
const byQuery = queries.queries.map(q => {
  const a = valid.filter(d => d.query_id === q.id);
  return { query_id: q.id, valid_runs: a.length,
    target_brand_mentioned_runs: a.filter(d => d.brand_mentioned === true).length,
    target_first_party_cited_runs: a.filter(d => d.first_party_cited === true).length,
    unique_exact_answer_hashes: new Set(a.map(d => d.answer_sha256)).size };
});
const ledgerDates = events.map(e => e.occurredAt).sort();
const resultDates = rows.map(r => r.measured_at).sort();
const report = {
  record_version: 'october-preparation-v1', recorded_at: new Date().toISOString(), timezone: 'Asia/Taipei',
  scope: 'Offline Wave 0 audit and October Wave 1 preparation; not October measurements',
  october_collection_status: 'not_collected_in_this_record', october_results: null,
  baseline: { path: baseline, result_rows: rows.length, successes: success.length,
    failed_or_unknown: failed.length, failure_stages: count(failed, 'error_stage'),
    result_record_window_utc: [resultDates[0], resultDates.at(-1)],
    ledger_window_utc: [ledgerDates[0], ledgerDates.at(-1)],
    valid_query_runs: valid.length, target_brand_mentioned_runs: mentions,
    target_first_party_cited_runs: citations, pooled_answer_adoption_percent: 100 * mentions / valid.length,
    pooled_first_party_evidence_percent: 100 * citations / valid.length,
    mean_stored_answer_adoption_percent: mean(success, 'answer_adoption_rate'),
    mean_stored_ai_trust_index: mean(success, 'ai_trust_index'),
    raw_files_referenced_and_checked: success.length,
    raw_response_models: count(detail, 'response_model'),
    parser_excerpts_shorter_than_raw: detail.filter(d => d.observation_answer_characters < d.answer_characters).length,
    semantic_dataset_sha256: datasetHash, recorded_dataset_sha256: methodology.dataset_sha256,
    dataset_hash_verified: datasetHash === methodology.dataset_sha256,
    usage_semantic_sha256: usageHash, usage_hash_verified: true, per_query: byQuery },
  usage: { events: events.length, by_provider: count(events, 'provider'), by_operation: count(events, 'operation'),
    by_status: count(events, 'status'), total_tokens: events.reduce((s, e) => s + (e.totalTokens ?? 0), 0),
    events_without_cost_configuration: events.filter(e => !e.costConfigured).length,
    complete_cost_usd: null, note: 'Ledger events are not one-to-one linked to final answers; zero unconfigured cost is not free usage.' },
  proposed_october_design: { status: 'pending_author_wave_freeze', sites: 49,
    query_set_version: queries.query_set_version, discovery_queries_per_site: queries.queries.length,
    planned_perplexity_logical_calls: 49 * (1 + queries.queries.length),
    planned_deepseek_profile_calls: 49, query_drafting_calls: 0,
    actual_request_cap_verified: false, monetary_budget_usd: null, collection_window: null,
    models: { perplexity: 'sonar (baseline label; October runtime not verified)', deepseek: 'deepseek-v4-flash (baseline label; October runtime not verified)' } },
  source_files: files.map(p => ({ path: p, bytes: fs.statSync(path.join(root, p)).size,
    sha256: hash(fs.readFileSync(path.join(root, p))) }))
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'baseline-audit.json'), JSON.stringify(report, null, 2) + '\n');
const columns = Object.keys(detail[0]);
const cell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
fs.writeFileSync(path.join(output, 'baseline-query-runs.csv'), [columns.join(','), ...detail.map(r => columns.map(k => cell(r[k])).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ baseline: report.baseline, usage: report.usage }, null, 2));
