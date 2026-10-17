// Local byte-level evidence manifest; no network, secrets or raw answer output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base='research/outputs/xinyi-dining-h2-2026-wave1';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())walk(p);else if(p!==`${base}/manifest.json`)files.push(p);}}
if(!process.argv.includes('--verify')){
  for(const file of ['research/work/complete-october-discovery.mjs','research/work/audit-october-completion.mjs','research/work/finalize-october-wave1.mjs','research/work/audit-october-readiness.mjs','research/work/seal-october-evidence.mjs']){
    const target=`${base}/provenance/analysis/${file}`;fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);
  }
  walk(base);assert(!files.some(f=>f.endsWith('runner.lock')),'Active collector');
  const records=files.sort().map(file=>{const bytes=fs.readFileSync(file);return {path:file.slice(base.length+1),bytes:bytes.length,sha256:hash(bytes)};});
  fs.writeFileSync(`${base}/manifest.json`,JSON.stringify({sealed_at:new Date().toISOString(),scope:'All local Wave 1 artifacts except this manifest. Integrity does not certify truth or human approval.',files:records},null,2)+'\n');
}
const manifest=json(`${base}/manifest.json`);
for(const f of manifest.files){const bytes=fs.readFileSync(`${base}/${f.path}`);assert.equal(bytes.length,f.bytes);assert.equal(hash(bytes),f.sha256);}
if(process.argv.includes('--verify')){walk(base);assert.equal(files.length,manifest.files.length,'Unmanifested files');}
const primary=json(`${base}/summary.json`),supplement=json(`${base}/completion-supplement/summary.json`);
assert.equal(primary.cohort_rows,49);assert.equal(supplement.expected_slots,147);assert.equal(supplement.complete_answer_count,69);
assert.equal(primary.api_transport.actual_requests+supplement.actual_requests,184);
assert.equal(hash(fs.readFileSync(`${base}/results.jsonl`)),json(`${base}/methodology.json`).combined_results_file_sha256);
console.log(JSON.stringify({verified_files:manifest.files.length,cohort_rows:49,supplement_complete:69,actual_requests:184,publication_ready:false}));
