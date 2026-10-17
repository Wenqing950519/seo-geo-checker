// Derive an all-49-row record, keeping canonical pipeline values and completion-quality evidence separate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadEntityMaster, parseCsvLine } = require('../lib/entity-master.js');
const { isFirstParty } = require('../../packages/geo-core/evidence/brand-match.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'research/outputs/xinyi-dining-h2-2026-wave1';
const batch = `${base}/ai-evidence`;
const baseline = 'research/outputs/xinyi-dining-h2-2026-wave0';
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const jsonl = p => read(p).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const writeJson = (name, v) => fs.writeFileSync(path.join(root, base, name), JSON.stringify(v, null, 2) + '\n');
const count = (a, k) => a.reduce((o, r) => { const key=r[k] ?? 'unknown'; o[key]=(o[key] ?? 0)+1; return o; },{});
function csv(name, rows) {
  const cols = Object.keys(rows[0]);
  const cell = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(s) ? '"'+s.replaceAll('"','""')+'"' : s; };
  fs.writeFileSync(path.join(root,base,name), [cols.join(','),...rows.map(r=>cols.map(k=>cell(r[k])).join(','))].join('\n')+'\n');
}
if (fs.existsSync(path.join(root,batch,'runner.lock'))) throw new Error('Collection is still running; finalize only after terminal completion');
const method = json(`${batch}/methodology.json`);
const protocol = json(`${base}/protocol.json`);
const rawRows = jsonl(`${batch}/results.jsonl`);
const blocked = json(`${base}/preparation/blocked-entity-rows.json`);
const roots = read('research/inputs/xinyi-restaurants-h2-2026/xinyi-49.sites.approved.csv').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map(parseCsvLine).map(r=>r[0]);
const querySet = json('research/inputs/xinyi-restaurants-h2-2026/query-set.xinyi-dining-h2-2026.approved.json');
const master = loadEntityMaster(path.join(root,'research/inputs/xinyi-restaurants-h2-2026/xinyi-70.entity_master.reviewed.csv'));
const byInput = new Map([...rawRows, ...blocked].map(r=>[r.input_url||r.url,r]));
assert.equal(byInput.size,49); assert.equal(rawRows.length,33); assert.equal(blocked.length,16);
const allRows = roots.map(url=>{
  const r=byInput.get(url); assert(r,`missing cohort row ${url}`);
  return {...r,input_url:url, observation_wave:'2026-10-wave1',
    raw_ref:r.raw_ref ? `${batch}/${r.raw_ref}` : null,
    collected_at:r.measured_at ?? null,
    research_review_status:r.error_stage==='entity_mapping_preflight'?'unknown_entity_mapping':'pending_completion_and_human_review'};
});
const transportDir = path.join(root,batch,'transport');
const transport = fs.readdirSync(transportDir).filter(n=>/request\.json$/.test(n)).sort().map(name=>{
  const request=json(`${batch}/transport/${name}`);
  const prefix=name.replace('-request.json','');
  const resultPath=`${batch}/transport/${prefix}-result.json`;
  assert(fs.existsSync(path.join(root,resultPath)),`unresolved request reservation ${prefix}`);
  const result=json(resultPath);
  let response=null;
  if(result.response_file){try{response=json(`${batch}/transport/${result.response_file}`);}catch{}}
  return {request,result,response,prefix};
});
for (const [provider,cap] of Object.entries(protocol.frozen.actual_http_request_caps_including_retries)) assert(transport.filter(t=>t.request.provider===provider).length<=cap,'request cap exceeded');
const queryRows=[];
for(const r of allRows){
  const raw=r.raw_ref?json(r.raw_ref):null;
  const entity=master.rows.find(e=>e.store_id===r.store_id);
  const nextSiteStartedAt=rawRows.map(x=>x.measured_at).filter(t=>t>r.measured_at).sort()[0]??null;
  for(const q of querySet.queries){
    const obs=r.query_observations?.find(o=>o.queryId===q.id);
    const answer=raw?.search_evidence?.discovery?.find(o=>o.queryId===q.id);
    const matches=answer?.enabled?transport.filter(t=>t.request.provider==='perplexity'
      && t.request.reserved_at>=r.measured_at && (!nextSiteStartedAt || t.request.reserved_at<nextSiteStartedAt)
      && t.request.payload.messages.at(-1)?.content===q.text
      && t.response?.choices?.[0]?.message?.content===answer.answer
      && t.response?.usage?.prompt_tokens===answer.usage?.inputTokens
      && t.response?.usage?.completion_tokens===answer.usage?.outputTokens):[];
    const t=matches.length===1?matches[0]:null;
    const finish=t?.response?.choices?.[0]?.finish_reason??null;
    const status=r.error_stage==='entity_mapping_preflight'?'unknown_entity_mapping'
      :!answer?.enabled?'unknown_unavailable'
      :!t?'unknown_transport_join'
      :finish==='length'?'truncated'
      :finish==='stop'&&obs?.answerStatus==='answered'?'complete_answer':'unknown_completion';
    const resolve=url=>raw?.citation_resolution?.[url]||url;
    const official=urls=>entity?urls.map(resolve).filter(url=>isFirstParty(url,new URL(r.url).hostname,entity.official_domains)):[];
    queryRows.push({input_url:r.input_url,store_id:r.store_id??r.historical_selected_store_id??null,query_id:q.id,
      collection_status:r.measurement_status,completion_quality:status,
      pipeline_answer_status:obs?.answerStatus??null,pipeline_brand_mentioned:obs?.brandMentioned??null,
      pipeline_first_party_evidence:obs?.firstPartyCited??null,
      visible_prefix_brand_mentioned:obs?.answerStatus==='answered'?obs.brandMentioned:null,
      complete_answer_brand_mentioned:status==='complete_answer'?obs.brandMentioned:null,
      official_citation_urls:official(answer?.citations||[]),
      official_search_result_urls:official((answer?.searchResults||[]).map(s=>s.url).filter(Boolean)),
      provider_response_id:t?.response?.id??null,requested_at:t?.request.reserved_at??null,
      completed_at:t?.result.completed_at??null,requested_model:t?.request.payload.model??null,
      returned_model:t?.response?.model??null,max_tokens:t?.request.payload.max_tokens??null,
      finish_reason:finish,transport_match_count:matches.length,
      transport_request:t?`${batch}/transport/${t.prefix}-request.json`:null,
      transport_response:t?`${batch}/transport/${t.prefix}-response.txt`:null,
      raw_ref:r.raw_ref,raw_locator:raw?`search_evidence.discovery[queryId=${q.id}]`:null,
      answer_sha256:answer?.answer?hash(answer.answer):null,
      error_stage:r.error_stage??answer?.error?.stage??null,human_review_status:'pending'});
  }
}
assert.equal(queryRows.length,147);assert.equal(new Set(queryRows.map(r=>`${r.input_url}|${r.query_id}`)).size,147);
assert(queryRows.filter(r=>r.completion_quality.startsWith('unknown')).every(r=>r.complete_answer_brand_mentioned===null));
const prior=jsonl(`${baseline}/results.jsonl`);
const mappingRows=read(`${base}/preparation/root-entity-review.csv`).trim().split(/\r?\n/).map(parseCsvLine);
const mapping=mappingRows.slice(1).map(cells=>Object.fromEntries(mappingRows[0].map((k,i)=>[k,cells[i]])));
const panel=allRows.map(r=>{
  const map=mapping.find(m=>m.input_url===r.input_url); const old=prior.find(p=>p.url===map.baseline_final_url);
  assert(old,`baseline join unresolved ${r.input_url}`);
  const both=old.measurement_status==='success'&&r.measurement_status==='success';
  return {input_url:r.input_url,baseline_store_id:old.store_id,october_store_id:r.store_id??r.historical_selected_store_id,
    september_status:old.measurement_status,october_status:r.measurement_status,october_error_stage:r.error_stage??null,
    both_pipeline_success:both,identity_consistent:old.store_id===(r.store_id??r.historical_selected_store_id),
    september_pipeline_ai_trust:old.ai_trust_index,october_pipeline_ai_trust:r.ai_trust_index,
    pipeline_delta:both?r.ai_trust_index-old.ai_trust_index:null,
    october_complete_answers:queryRows.filter(q=>q.input_url===r.input_url&&q.completion_quality==='complete_answer').length,
    september_finish_reason_available:false,
    research_comparison_status:'descriptive_pipeline_only; September completion quality unknown; no causal interpretation'};
});
const transportRows=transport.map(t=>({sequence:t.request.sequence,provider:t.request.provider,
  requested_model:t.request.payload.model,returned_model:t.response?.model??null,
  requested_at:t.request.reserved_at,completed_at:t.result.completed_at,http_status:t.result.http_status??null,
  transport_error:t.result.transport_error??null,response_id:t.response?.id??null,
  finish_reason:t.response?.choices?.[0]?.finish_reason??null,
  input_tokens:t.response?.usage?.prompt_tokens??null,output_tokens:t.response?.usage?.completion_tokens??null,
  provider_reported_cost_usd:Number.isFinite(t.response?.usage?.cost?.total_cost)?t.response.usage.cost.total_cost:null,
  request_ref:`${batch}/transport/${t.prefix}-request.json`,response_ref:t.result.response_file?`${batch}/transport/${t.result.response_file}`:null}));
const success=allRows.filter(r=>r.measurement_status==='success');
const valid=queryRows.filter(q=>q.pipeline_answer_status==='answered');
const allComplete=queryRows.filter(q=>q.completion_quality==='complete_answer');
const sourceVerification=protocol.frozen.source_files.map(f=>{
  const bytes=fs.readFileSync(path.join(root,f.path));const matches=hash(bytes)===f.sha256;
  if(matches){const destination=path.join(root,base,'provenance/source',f.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);}
  return {...f,matches_frozen_source:matches,snapshot_ref:matches?`${base}/provenance/source/${f.path}`:null};
});
const summary={generated_at:new Date().toISOString(),timezone:'Asia/Taipei',wave:'2026-10-wave1',cohort_rows:49,
  pipeline_status_counts:count(allRows,'measurement_status'),unknown_and_failure_stages:count(allRows.filter(r=>r.measurement_status!=='success'),'error_stage'),
  pipeline_successful_sites:success.length,expected_discovery_rows:147,quality_counts:count(queryRows,'completion_quality'),
  preserved_pipeline_results:{valid_answer_rows:valid.length,brand_mentioned_rows:valid.filter(q=>q.pipeline_brand_mentioned).length,
    first_party_evidence_rows:valid.filter(q=>q.pipeline_first_party_evidence).length,
    caveat:'Includes truncated answers accepted by the historical parser; not validated complete-answer visibility rates.'},
  completion_quality_diagnostic:{complete_answers:allComplete.length,brand_mentioned_in_complete_answers:allComplete.filter(q=>q.complete_answer_brand_mentioned).length,
    caveat:'Completion-based filtering may be selective; this is a quality diagnostic, not a newly approved primary metric.'},
  cross_wave_panel:{same_input_rows:panel.length,both_pipeline_success:panel.filter(p=>p.both_pipeline_success).length,
    identity_mismatches:panel.filter(p=>!p.identity_consistent).length,september_finish_reason:'unknown'},
  api_transport:{actual_requests:transport.length,by_provider:count(transportRows,'provider'),returned_models:count(transportRows,'returned_model'),
    reported_cost_usd_partial:transportRows.reduce((sum,t)=>sum+(t.provider_reported_cost_usd??0),0),
    responses_without_reported_cost:transportRows.filter(t=>t.provider_reported_cost_usd===null).length,
    complete_cost_usd:transportRows.every(t=>t.provider_reported_cost_usd!==null)?transportRows.reduce((sum,t)=>sum+t.provider_reported_cost_usd,0):null,
    transport_all_terminal:true,caps_verified:true},
  collection_window_utc:transport.length?[transport[0].request.reserved_at,transport.at(-1).result.completed_at]:null,
  public_http_evidence:json(`${base}/site-evidence/summary.json`),
  readiness:{technical_record_complete:true,all_cohort_visibility_observed:false,human_review_complete:false,
    publication_ready:false,reason:'Ambiguous entity rows, website failures, truncated answers, historical completion uncertainty and human review remain explicit.'},
  source_verification:sourceVerification};
fs.writeFileSync(path.join(root,base,'results.jsonl'),allRows.map(JSON.stringify).join('\n')+'\n');
csv('results.csv',allRows.map(r=>({input_url:r.input_url,final_url:r.url??null,store_id:r.store_id??r.historical_selected_store_id,
  measurement_status:r.measurement_status,error_stage:r.error_stage??null,ai_trust_index:r.ai_trust_index,
  answer_adoption_rate:r.answer_adoption_rate,source_evidence_rate:r.source_evidence_rate,collected_at:r.collected_at,raw_ref:r.raw_ref})));
csv('query-runs.csv',queryRows);csv('matched-panel.csv',panel);csv('transport-ledger.csv',transportRows);
writeJson('summary.json',summary);
writeJson('methodology.json',{...method,scope:'All 49 inherited root inputs, including 16 preflight-unknown rows',
  input_file:'research/inputs/xinyi-restaurants-h2-2026/xinyi-49.sites.approved.csv',
  collected_subset_input_file:method.input_file,raw_evidence_dir:`${batch}/raw`,
  api_usage_summary_file:`${batch}/api-usage-summary.json`,api_usage_events_file:`${batch}/api-usage-events.jsonl`,
  requested_models:protocol.frozen.models,returned_models:summary.api_transport.returned_models,
  historical_configuration_continuity:'Unverified: September full request bodies, finish reasons and execution source commit were not preserved. The frozen protocol baseline-code statement describes current code, not proven historical request equivalence.',
  site_count:49,result_count:49,canonical_batch_methodology:`${batch}/methodology.json`,protocol_ref:`${base}/protocol.json`,
  primary_outputs:'Original pipeline values retained; query-runs.csv separately identifies truncation, actual citations, retrieved sources, and unknowns.',
  source_head:protocol.frozen.source_head,source_verification:sourceVerification,
  combined_results_file_sha256:hash(fs.readFileSync(path.join(root,base,'results.jsonl'))),
  canonical_subset_dataset_sha256:method.dataset_sha256,dataset_sha256:null,
  hash_definition:'Use combined_results_file_sha256 for the full-cohort file; the canonical semantic hash applies only to the 33-row subset.'});
console.log(JSON.stringify({...summary,source_verification:sourceVerification.map(s=>({path:s.path,matches:s.matches_frozen_source}))},null,2));
