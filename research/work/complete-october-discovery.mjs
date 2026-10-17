// Supplemental collection: identical approved questions, only response length changes; no scoring.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {parseCsvLine}=require('../lib/entity-master.js');
const {createResearchTransportRecorder}=require('../lib/transport-recorder.js');
const base='research/outputs/xinyi-dining-h2-2026-wave1';
const out=`${base}/completion-supplement`;
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const rows=fs.readFileSync(`${base}/query-runs.csv`,'utf8').trim().split(/\r?\n/).map(parseCsvLine);
const queries=rows.slice(1).map(c=>Object.fromEntries(rows[0].map((k,i)=>[k,c[i]]))).filter(q=>q.transport_request);
assert.equal(queries.length,69);
const jobs=queries.map((q,i)=>({id:i+1,input_url:q.input_url,store_id:q.store_id,query_id:q.query_id,
  original_request:q.transport_request,original_response:q.transport_response,
  payload:{...json(q.transport_request).payload,max_tokens:4096}}));
const runId='whitepaper-xinyi-wave1-2026-10-15-completion-supplement';
fs.mkdirSync(out,{recursive:true});
const plan={run_id:runId,kind:'completion_quality_supplement_not_primary_score',query_set_version:'xinyi-dining-2026h2-v2.0',
  authorization:'User requested continuing verification and completing the data; retains the approved questions and existing 23-site observed subset.',
  selection:'All 69 discovery slots from the 23 successfully measured sites, including originally complete answers. The other 26 original cohort inputs remain unknown.',
  only_payload_change:'max_tokens: 260 -> 4096',model:'sonar',actual_request_cap:69,retries:0,concurrency:3,min_start_interval_ms:1500,
  no_profile_calls:true,no_new_scores:true,no_replacement_of_original_evidence:true,
  interpretation:'Later repeated observations, not recovered missing tails. Cannot identify a causal token-limit effect because answers may vary over time. Do not merge with September primary scores.',
  jobs,script_sha256:sha(fs.readFileSync('research/work/complete-october-discovery.mjs'))};
const planFile=`${out}/protocol.json`;
if(fs.existsSync(planFile)) assert.deepEqual(json(planFile).frozen,plan,'Frozen supplement changed');
else fs.writeFileSync(planFile,JSON.stringify({frozen_at:new Date().toISOString(),frozen:plan},null,2)+'\n');
if(!process.argv.includes('--collect')){console.log(JSON.stringify({jobs:jobs.length,requests_max:69,collect:false}));process.exit(0);}
assert.equal(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),'2026-10-15');
require('../../packages/shared/env.js').loadEnvFiles();
const config=require('../../packages/ai-providers/perplexity.js').getPerplexityConfig();
assert.equal(config.baseUrl+config.endpoint,'https://api.perplexity.ai/chat/completions');assert.equal(config.model,'sonar');
const lock=`${out}/runner.lock`;fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
const recorder=createResearchTransportRecorder({dir:`${out}/transport`,runId,caps:{perplexity:69},
  endpoints:{perplexity:config.baseUrl+config.endpoint},nativeFetch:globalThis.fetch});
let cursor=0,gate=Promise.resolve();
async function reserveStart(){const prior=gate;let release;gate=new Promise(r=>release=r);await prior;await new Promise(r=>setTimeout(r,1500));release();}
async function worker(){while(cursor<jobs.length){const job=jobs[cursor++];const jobFile=`${out}/job-${String(job.id).padStart(3,'0')}.json`;
  if(fs.existsSync(jobFile))continue; // Reserved attempts, including ambiguous interrupted ones, are never silently reissued.
  await reserveStart();
  const sequence=recorder.counts.perplexity+1;
  const entry={...job,payload:undefined,sequence,started_at:new Date().toISOString(),status:'reserved',human_review_status:'pending'};
  fs.writeFileSync(jobFile,JSON.stringify(entry,null,2)+'\n',{flag:'wx'});
  try{const response=await recorder.fetch(config.baseUrl+config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},
      body:JSON.stringify(job.payload),signal:AbortSignal.timeout(120000)});
    const data=await response.json();entry.http_status=response.status;entry.response_id=data.id??null;
    entry.finish_reason=data.choices?.[0]?.finish_reason??null;entry.returned_model=data.model??null;
    entry.status=response.ok&&entry.finish_reason==='stop'&&data.choices?.[0]?.message?.content?'complete_answer':entry.finish_reason==='length'?'truncated':'unknown';
  }catch(e){entry.status='unknown';entry.error=String(e.message).slice(0,200);}
  entry.completed_at=new Date().toISOString();fs.writeFileSync(jobFile,JSON.stringify(entry,null,2)+'\n');
  console.log(`[${job.id}/69] ${job.query_id} ${entry.status}`);
}}
try{await Promise.all([worker(),worker(),worker()]);}
finally{fs.unlinkSync(lock);}
const results=jobs.map(j=>json(`${out}/job-${String(j.id).padStart(3,'0')}.json`));
const counts=results.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{});
fs.writeFileSync(`${out}/collection-summary.json`,JSON.stringify({run_id:runId,generated_at:new Date().toISOString(),slots:69,
  counts,actual_requests:recorder.counts.perplexity,publication_ready:false,review_status:'pending'},null,2)+'\n');
console.log(JSON.stringify(counts));
