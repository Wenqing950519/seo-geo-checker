// Offline reconciliation and provenance audit. Does not change source datasets.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { loadEntityMaster, findEntityForUrl, assertReviewedEntityCoverage, parseCsvLine } = require('../lib/entity-master.js');
const { buildBrandTermSet, matchTermsInText, isFirstParty, classifyAnswerStatus, getRegistrableDomain } = require('../../packages/geo-core/evidence/brand-match.js');
const { computeAiTrustIndex } = require('../../packages/geo-core/scoring/ai-trust-index.js');
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const jsonl = p => read(p).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const json = p => JSON.parse(read(p));
const counts = (a, key) => a.reduce((out, r) => { const k = r[key] ?? 'unknown'; out[k] = (out[k] ?? 0) + 1; return out; }, {});
const writeJson = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
function csv(name, rows) {
  const keys = Object.keys(rows[0] || {});
  const cell = x => { const s = x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x); return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
  fs.writeFileSync(path.join(out, name), [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n') + '\n');
}
const v0 = 'research/outputs/xinyi-dining-h2-2026-wave0';
const archive = 'research/outputs/xinyi-dining-h2-2026-wave0-v1-archive';
const out = path.join(root, 'research/outputs/xinyi-dining-h2-2026-wave1/preparation');
fs.mkdirSync(out, { recursive: true });
const rows = jsonl(`${v0}/results.jsonl`);
const events = jsonl(`${v0}/api-usage-events.jsonl`);
const old = jsonl(`${archive}/api-usage-events.jsonl`);
assert.deepEqual(events.slice(0, old.length), old, 'archive must match the exact ledger prefix');
const current = events.slice(old.length);
const oldIds = new Set(old.map(e => e.id));
assert(!current.some(e => oldIds.has(e.id)), 'phases must be disjoint');
assert.equal(current.length, 185);
const masterPath = 'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.entity_master.reviewed.csv';
const sitesPath = 'research/inputs/xinyi-restaurants-h2-2026/xinyi-49.sites.approved.csv';
const master = loadEntityMaster(path.join(root, masterPath));
const siteLines = read(sitesPath).replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(parseCsvLine);
const sites = siteLines.slice(1).map(cells => Object.fromEntries(siteLines[0].map((k, i) => [k, cells[i]])));
const mapping = sites.map(s => {
  const entity = findEntityForUrl(master, s.url);
  const legacyMatches = rows.filter(r => r.domain === s.root_domain || s.candidate_ids.split('|').includes(r.store_id?.replace('XY-', '')));
  // Root-domain redirects have retained the selected store ID; join fallback is explicit.
  const historical = legacyMatches.length === 1 ? legacyMatches[0] : rows.find(r => r.store_id === entity?.row.store_id);
  let issue = null;
  try { assertReviewedEntityCoverage([s.url], master); } catch (e) { issue = e.message.split('\n').slice(1).join(' '); }
  return { input_url: s.url, root_domain: s.root_domain, candidate_ids: s.candidate_ids,
    selected_store_id: entity?.row.store_id ?? null, selected_brand: entity?.row.official_name_zh ?? null,
    shared_domain: entity?.sharedDomain ?? null, exact_owned_url_match: entity?.exactOwnedUrlMatch ?? null,
    preflight_status: issue ? 'blocked' : 'pass', issue, reviewed_owned_urls: entity?.row.owned_urls ?? [],
    baseline_result_status: historical?.measurement_status ?? 'unresolved_join', baseline_final_url: historical?.url ?? null,
    human_review_status: issue ? 'required' : 'historical_approval_only' };
});
const storeChecks = master.rows.filter(r => r.include_status === 'included').map(r => {
  const checks = r.owned_urls.map(url => { try { assertReviewedEntityCoverage([url], master); return { url, status: findEntityForUrl(master, url).row.store_id === r.store_id ? 'pass' : 'wrong_entity' }; } catch(e) { return { url, status: 'blocked', error: e.message }; } });
  return { store_id: r.store_id, official_name_zh: r.official_name_zh, brand_id: r.brand_id,
    official_domains: r.official_domains, owned_urls: r.owned_urls,
    exact_mapping_status: checks.some(c => c.status === 'pass') ? 'pass' : 'blocked', checks,
    human_review_status: 'pending_current_page_review' };
});
const mappedIds = new Set(sites.flatMap(s => s.candidate_ids.split(/[|;]/).map(id => `XY-${id}`)));
const siteEvidencePath = 'research/outputs/xinyi-dining-h2-2026-wave1/site-evidence/fetch-events.jsonl';
const siteEvidence = fs.existsSync(path.join(root, siteEvidencePath)) ? jsonl(siteEvidencePath) : [];
for (const e of siteEvidence.filter(e => e.raw_ref)) assert.equal(hash(fs.readFileSync(path.join(root, e.raw_ref))), e.raw_sha256, `page hash mismatch ${e.input_url}`);
const storeEvidence = master.rows.filter(r => r.include_status === 'included').map(r => {
  const pages = siteEvidence.filter(e => e.store_ids.includes(r.store_id));
  const terms = buildBrandTermSet({ masterTerms: [r.official_name_zh, r.official_name_en, ...r.aliases].filter(Boolean) });
  return { store_id: r.store_id, brand_name: r.official_name_zh, branch_name: r.branch_name,
    mapped_in_49_root_inputs: mappedIds.has(r.store_id), official_domains: r.official_domains,
    exact_owned_mapping: storeChecks.find(s => s.store_id === r.store_id).exact_mapping_status,
    pages: pages.map(p => ({ input_url:p.input_url, final_url:p.final_url ?? null, http_status:p.http_status ?? null,
      status:p.status, title:p.metadata?.title ?? null, error:p.error ?? null,
      brand_terms_in_saved_preview: matchTermsInText(p.text_preview || '', terms).map(t => t.value),
      raw_ref:p.raw_ref ?? null, raw_sha256:p.raw_sha256 ?? null })),
    has_http_2xx: pages.some(p => p.http_status >= 200 && p.http_status < 300),
    human_review_status: 'pending', interpretation: 'HTTP 2xx and text matches do not establish current operation, location or ownership.' };
});
const proposals = mapping.filter(r=>r.preflight_status==='blocked').map(r=>({
  input_url:r.input_url, root_domain:r.root_domain, issue:r.issue,
  proposed_action:'Resolve each intended restaurant against its exact owned page; retain current unknown until author review. No automatic exclusion or approval.',
  candidate_entities:master.rows.filter(e=>e.include_status==='included'&&e.official_domains.some(d=>getRegistrableDomain(d)===getRegistrableDomain(r.root_domain))).map(e=>({
    store_id:e.store_id,official_name:e.official_name_zh,branch_name:e.branch_name,owned_urls:e.owned_urls,
    source_reviewed_by:e.reviewed_by,source_reviewed_at:e.reviewed_at,
    current_evidence:storeEvidence.find(s=>s.store_id===e.store_id)?.pages??[],
    october_review_status:'pending_author_review'})),
  recommendation_status:'proposal_only'
}));
const key = (operation, usage, model, latency) => JSON.stringify([operation, model, usage.inputTokens, usage.outputTokens, usage.totalTokens, latency]);
const joins = []; const checks = []; const positives = [];
let replayedScores = 0;
for (const r of rows.filter(r => r.measurement_status === 'success')) {
  const rawPath = `${v0}/${r.raw_ref}`;
  const raw = json(rawPath);
  const profile = master.rows.find(e => e.store_id === r.store_id);
  const searches = [{ result: raw.search_evidence.authority, operation: 'geo_authority' },
    ...raw.search_evidence.discovery.map((result, i) => ({ result, operation: `geo_discovery_${i + 1}` }))];
  for (const {result: q, operation} of searches) {
    const matched = current.filter(e => e.provider === 'perplexity' && e.status === 'success' && key(e.operation, e, e.model, e.latencyMs) === key(operation, q.usage, q.model, q.latencyMs));
    joins.push({ domain: r.domain, store_id: r.store_id, operation, query_id: q.queryId ?? null,
      match_count: matched.length, ledger_event_id: matched.length === 1 ? matched[0].id : null,
      join_basis: 'operation+model+usage+latency; inferred, not provider response ID', raw_ref: rawPath,
      raw_locator: operation === 'geo_authority' ? 'search_evidence.authority' : `search_evidence.discovery[queryId=${q.queryId}]`,
      response_id_recorded: Boolean(q.id || q.responseId || q.response_id), finish_reason_recorded: Boolean(q.finishReason || q.finish_reason) });
  }
  const terms = buildBrandTermSet({ masterTerms: r.brand_terms });
  const masterTerms = buildBrandTermSet({ masterTerms: [profile.official_name_zh, profile.official_name_en, ...profile.aliases].filter(Boolean) });
  const replayObservations = [];
  for (const q of raw.search_evidence.discovery) {
    const previous = r.query_observations.find(o => o.queryId === q.queryId);
    assert(previous, 'missing stored query observation');
    const status = classifyAnswerStatus(q.answer);
    const matched = status === 'answered' ? matchTermsInText(q.answer, terms).map(t => t.value) : [];
    const masterMatched = status === 'answered' ? matchTermsInText(q.answer, masterTerms).map(t => t.value) : [];
    const resolution = raw.citation_resolution || {};
    const official = urls => urls.map(url => resolution[url] || url).filter(url => isFirstParty(url, new URL(r.url).hostname, profile.official_domains));
    const cited = official(q.citations || []);
    const retrieved = official((q.searchResults || []).map(v => v.url).filter(Boolean));
    const replayFirstParty = !r.input_unit_warning && (cited.length > 0 || retrieved.length > 0);
    const replay = { ...previous, answerStatus: status, brandMentioned: matched.length > 0, firstPartyCited: replayFirstParty };
    replayObservations.push(replay);
    const detail = { domain: r.domain, store_id: r.store_id, query_id: q.queryId,
      stored_answer_status: previous.answerStatus, replay_answer_status: status,
      stored_brand_mentioned: previous.brandMentioned, replay_brand_mentioned: matched.length > 0,
      master_only_brand_mentioned: masterMatched.length > 0, master_only_terms: masterMatched,
      stored_first_party: previous.firstPartyCited, replay_first_party: replayFirstParty,
      official_citation_urls: cited, official_search_result_urls: retrieved,
      exact_answer_preserved: previous.answer === q.answer,
      matches: previous.answerStatus === status && previous.brandMentioned === (matched.length > 0) && previous.firstPartyCited === replayFirstParty,
      raw_ref: rawPath, raw_locator: `search_evidence.discovery[queryId=${q.queryId}]` };
    checks.push(detail);
    if (previous.brandMentioned || masterMatched.length) positives.push({ ...detail, official_name: profile.official_name_zh, answer: q.answer, review_status: 'pending_human_semantic_review' });
  }
  const valid = replayObservations.filter(o => o.answerStatus === 'answered');
  const score = computeAiTrustIndex({ measuredQueryCount: valid.length,
    queryCount: raw.search_evidence.discovery.length,
    excludedQueryCount: replayObservations.length - valid.length,
    mentionRate: valid.length ? Math.round(100 * valid.filter(o => o.brandMentioned).length / valid.length) : null,
    citationRate: valid.length ? Math.round(100 * valid.filter(o => o.firstPartyCited).length / valid.length) : null });
  if (score.value === r.ai_trust_index) replayedScores++;
}
const matchedIds = joins.map(r => r.ledger_event_id).filter(Boolean);
// Check a bounded set of explicit historical report counts using reviewed master aliases.
// These are text mentions across stored answers, not validated recommendations or population estimates.
const claimSpecs = [
  ['XY-046','dating-celebration-01',37,'寶艾西餐廳'],['XY-057','dating-celebration-01',37,'WILDWOOD Live Fire'],
  ['XY-067','dating-celebration-01',24,'JK STUDIO'],['XY-042','dating-celebration-01',19,'莫爾頓牛排館'],
  ['XY-021','dating-celebration-01',13,'勞瑞斯牛肋排餐廳'],['XY-032','gathering-general-01',37,'饗食天堂（信義店）'],
  ['XY-020','gathering-general-01',17,'探索廚房 Latest'],['XY-010','gathering-general-01',15,'泰市場 Spice'],
  ['XY-015','gathering-general-01',14,'饗饗 INPARADISE'],['XY-060','hotpot-bbq-01',24,'橘色涮涮屋（新光A9館）'],
  ['XY-005','hotpot-bbq-01',16,'合‧shabu 頂級鍋物']
];
const reportLines = read(`${v0}/wave0-baseline-report.md`).split(/\r?\n/);
const historicalClaims = claimSpecs.map(([id,qid,expected,needle])=>{
  const entity=master.rows.find(r=>r.store_id===id);
  const terms=buildBrandTermSet({masterTerms:[entity.official_name_zh,entity.official_name_en,...entity.aliases].filter(Boolean)});
  const answers=rows.filter(r=>r.raw_ref).map(r=>({r,answer:json(`${v0}/${r.raw_ref}`).search_evidence.discovery.find(q=>q.queryId===qid)}));
  const matched=answers.filter(({answer})=>answer&&matchTermsInText(answer.answer,terms).length);
  return {store_id:id,query_id:qid,reported_count:expected,reported_denominator:37,
    recomputed_text_mentions:matched.length,available_raw_answers:answers.length,numeric_agreement:matched.length===expected,
    report_ref:`${v0}/wave0-baseline-report.md`,report_line:reportLines.findIndex(l=>l.startsWith('- **')&&l.includes(needle))+1,
    evidence_refs:matched.map(({r})=>`${v0}/${r.raw_ref}`),
    interpretation:'Text mention only; recommendation strength, branch correctness and independent sampling are not established.',human_review_status:'pending'};
});
const sourceFiles = [masterPath, sitesPath, `${v0}/results.jsonl`, `${v0}/api-usage-events.jsonl`, `${archive}/api-usage-events.jsonl`, `${archive}/methodology.json`, `${archive}/summary.json`];
const report = { generated_at: new Date().toISOString(), timezone: 'Asia/Taipei',
  ledger_reconciliation: { exact_archive_prefix_verified: true,
    archive_query_version: json(`${archive}/methodology.json`).query_set_version, archive_events: old.length,
    final_query_version: json(`${v0}/methodology.json`).query_set_version, final_phase_events: current.length,
    final_phase_provider_counts: counts(current, 'provider'), final_phase_operation_counts: counts(current, 'operation'),
    raw_perplexity_responses: joins.length, unique_fingerprint_matches: joins.filter(j => j.match_count === 1).length,
    distinct_joined_ledger_ids: new Set(matchedIds).size,
    unlinked_final_phase_events: current.filter(e => !matchedIds.includes(e.id)).map(e => e.id),
    note: 'Archive membership is exact by event bytes/IDs. Raw-answer joins use usage+latency fingerprints; profile events have no row-level original usage linkage. Unrecorded HTTP retries cannot be reconstructed.' },
  replay: { query_rows: checks.length, matching_stored_observations: checks.filter(c => c.matches).length,
    stored_score_matches: replayedScores, measured_sites: rows.filter(r => r.measurement_status === 'success').length,
    master_only_disagreements: checks.filter(c => c.master_only_brand_mentioned !== c.stored_brand_mentioned).length,
    limitation: 'Replaying deterministic code confirms reproducibility, not semantic validity of restaurant/branch identity, recommendation, or citation support.' },
  historical_report_claim_check:{claims_checked:historicalClaims.length,numeric_agreement:historicalClaims.filter(c=>c.numeric_agreement).length,
    numeric_disagreement:historicalClaims.filter(c=>!c.numeric_agreement).length,interpretation:'Bounded check; does not validate the whole historical report.'},
  mapping: { root_inputs: mapping.length, pass: mapping.filter(r => r.preflight_status === 'pass').length,
    blocked: mapping.filter(r => r.preflight_status === 'blocked').length,
    blocked_baseline_successes: mapping.filter(r => r.preflight_status === 'blocked' && r.baseline_result_status === 'success').length,
    included_store_rows: storeChecks.length, root_input_mapped_store_count: mappedIds.size,
    stores_without_root_mapping: master.rows.filter(r => r.include_status === 'included' && !mappedIds.has(r.store_id)).map(r => r.store_id),
    store_owned_url_pass: storeChecks.filter(r => r.exact_mapping_status === 'pass').length,
    store_owned_url_blocked: storeChecks.filter(r => r.exact_mapping_status !== 'pass').length },
  public_site_evidence: { urls_recorded:siteEvidence.length, raw_files_verified:siteEvidence.filter(e => e.raw_ref).length,
    http_status_counts:counts(siteEvidence, 'http_status'), store_rows:storeEvidence.length,
    stores_with_at_least_one_http_2xx:storeEvidence.filter(r => r.has_http_2xx).length, human_review:'pending' },
  october_ai_collection: fs.existsSync(path.join(root, 'research/outputs/xinyi-dining-h2-2026-wave1/ai-evidence/methodology.json')) ? 'batch_finished_requires_quality_review' : 'see_protocol_and_transport_for_execution_status',
  source_files: sourceFiles.map(p => ({ path: p, sha256: hash(fs.readFileSync(path.join(root, p))) })) };
writeJson('readiness-audit.json', report);
writeJson('positive-answer-review.json', positives);
writeJson('entity-resolution-proposals.json', proposals);
csv('historical-report-claim-checks.csv',historicalClaims);
csv('root-entity-review.csv', mapping);
csv('store-owned-url-review.csv', storeChecks);
csv('store-current-evidence.csv', storeEvidence);
csv('wave0-answer-ledger-links.csv', joins);
csv('wave0-observation-replay.csv', checks);
csv('wave0-ledger-phases.csv', events.map((e, i) => ({ ...e, phase: i < old.length ? 'archived_query_v1' : 'final_query_v2' })));
console.log(JSON.stringify({ ledger_reconciliation: {...report.ledger_reconciliation, unlinked_final_phase_events: report.ledger_reconciliation.unlinked_final_phase_events.length}, replay: report.replay, mapping: report.mapping }, null, 2));
