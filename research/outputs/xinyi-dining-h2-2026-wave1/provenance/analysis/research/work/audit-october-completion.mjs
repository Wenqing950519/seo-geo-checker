import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {loadEntityMaster,parseCsvLine}=require('../lib/entity-master.js');
const {buildBrandTermSet,matchTermsInText,isFirstParty,classifyAnswerStatus}=require('../../packages/geo-core/evidence/brand-match.js');
const base='research/outputs/xinyi-dining-h2-2026-wave1',out=`${base}/completion-supplement`;
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const readCsv=p=>{const r=fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(parseCsvLine);return r.slice(1).map(c=>Object.fromEntries(r[0].map((k,i)=>[k,c[i]])));};
const writeJson=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const csv=(p,rows)=>{const keys=Object.keys(rows[0]);const cell=v=>{const s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};fs.writeFileSync(p,[keys.join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\n')+'\n');};
assert(!fs.existsSync(`${out}/runner.lock`),'Supplement still running');
const plan=json(`${out}/protocol.json`).frozen;
assert.equal(plan.script_sha256,sha(fs.readFileSync('research/work/complete-october-discovery.mjs')));
const collection=json(`${out}/collection-summary.json`);
const original=fs.readFileSync(`${base}/results.jsonl`,'utf8').trim().split(/\r?\n/).map(JSON.parse);
const master=loadEntityMaster('research/inputs/xinyi-restaurants-h2-2026/xinyi-70.entity_master.reviewed.csv');
const ledger=[],reviews=[];
const all=readCsv(`${base}/query-runs.csv`).map(q=>{
  const job=plan.jobs.find(j=>j.input_url===q.input_url&&j.query_id===q.query_id);
  if(!job)return{input_url:q.input_url,store_id:q.store_id,query_id:q.query_id,status:q.completion_quality,brand_mentioned:null,
    matched_terms:[],official_citation_urls:[],official_search_result_urls:[],response_id:null,finish_reason:null,requested_at:null,
    response_ref:null,answer_sha256:null,human_review_status:'pending'};
  const r=json(`${out}/job-${String(job.id).padStart(3,'0')}.json`),prefix=String(r.sequence).padStart(4,'0');
  const requestRef=`${out}/transport/${prefix}-request.json`,responseRef=`${out}/transport/${prefix}-response.txt`;
  const request=json(requestRef),terminal=json(`${out}/transport/${prefix}-result.json`);
  assert.deepEqual(request.payload,job.payload);assert.deepEqual({...json(job.original_request).payload,max_tokens:4096},job.payload);
  const response=fs.existsSync(responseRef)?json(responseRef):null,answer=response?.choices?.[0]?.message?.content??'';
  assert.equal(r.response_id??null,response?.id??null);
  const old=original.find(o=>o.input_url===job.input_url),entity=master.rows.find(e=>e.store_id===job.store_id);
  const terms=buildBrandTermSet({masterTerms:old.brand_terms});
  const complete=r.status==='complete_answer'&&classifyAnswerStatus(answer)==='answered';
  const matched=complete?matchTermsInText(answer,terms).map(t=>t.value):[];
  const official=urls=>urls.filter(url=>isFirstParty(url,new URL(old.url).hostname,entity.official_domains));
  const record={input_url:q.input_url,store_id:q.store_id,query_id:q.query_id,status:complete?'complete_answer':r.status==='complete_answer'?'unknown_answer_status':r.status,
    brand_mentioned:complete?matched.length>0:null,matched_terms:matched,
    official_citation_urls:official(response?.citations??[]),official_search_result_urls:official((response?.search_results??[]).map(s=>s.url).filter(Boolean)),
    response_id:response?.id??null,finish_reason:response?.choices?.[0]?.finish_reason??null,requested_at:request.reserved_at,
    response_ref:response?responseRef:null,answer_sha256:answer?sha(answer):null,human_review_status:'pending'};
  ledger.push({sequence:r.sequence,provider:'perplexity',requested_model:request.payload.model,returned_model:response?.model??null,
    request_ref:requestRef,response_ref:response?responseRef:null,requested_at:request.reserved_at,completed_at:terminal.completed_at,
    http_status:terminal.http_status??null,input_tokens:response?.usage?.prompt_tokens??null,output_tokens:response?.usage?.completion_tokens??null,
    total_tokens:response?.usage?.total_tokens??null,cost_usd:response?.usage?.cost?.total_cost??null});
  if(matched.length||record.official_citation_urls.length||record.official_search_result_urls.length)reviews.push({...record,answer,citations:response?.citations??[],search_results:response?.search_results??[]});
  return record;
});
assert.equal(all.length,147);assert.equal(ledger.length,69);assert.equal(new Set(ledger.map(l=>l.sequence)).size,69);
assert.equal(fs.readdirSync(`${out}/transport`).filter(n=>n.endsWith('-request.json')).length,69);
assert.equal(collection.actual_requests,69);
const observed=all.filter(r=>r.status==='complete_answer');
const counts=all.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{});
const cost=ledger.reduce((s,r)=>s+(r.cost_usd??0),0);
csv(`${out}/query-runs.csv`,all);csv(`${out}/transport-ledger.csv`,ledger);
writeJson(`${out}/positive-answer-review.json`,reviews);
writeJson(`${out}/summary.json`,{generated_at:new Date().toISOString(),scope:'Separate completion supplement, no primary scores or September comparison',
  cohort_rows:49,expected_slots:147,attempted_slots:69,complete_answer_count:observed.length,status_counts:counts,
  observed_brand_mentions:observed.filter(r=>r.brand_mentioned).length,observed_official_citation_slots:observed.filter(r=>r.official_citation_urls.length).length,
  observed_official_search_result_slots:observed.filter(r=>r.official_search_result_urls.length).length,
  unique_response_ids:new Set(observed.map(r=>r.response_id)).size,distinct_answer_hashes:new Set(observed.map(r=>r.answer_sha256)).size,
  actual_requests:ledger.length,provider_reported_cost_usd:ledger.every(r=>Number.isFinite(r.cost_usd))?cost:null,partial_reported_cost_usd:cost,
  collection_window_utc:[ledger.map(r=>r.requested_at).sort()[0],ledger.map(r=>r.completed_at).sort().at(-1)],
  no_payload_drift_except_max_tokens:true,all_request_caps_verified:true,human_review_complete:false,publication_ready:false,
  caveat:'Mentions are automatic text matches, not verified recommendation, correct branch, citation support, independent trials or population visibility. No new score is computed. Original and supplemental observations must not be pooled.'});
console.log(fs.readFileSync(`${out}/summary.json`,'utf8'));
