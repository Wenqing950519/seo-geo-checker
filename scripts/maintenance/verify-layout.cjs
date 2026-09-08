const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'docs/maintenance/layout-migration-2026-09-08.json'),'utf8'));
const hash = value=>crypto.createHash('sha256').update(value).digest('hex');
let unchanged=0, relocatedCode=0;
for(const entry of manifest.entries) {
  const target=path.resolve(root,entry.to);
  assert.ok(target.startsWith(root+path.sep),'Target must stay in repository');
  assert.ok(fs.existsSync(target),`Missing relocated file: ${entry.to}`);
  const current=hash(fs.readFileSync(target));
  if(current===entry.sha256) {unchanged++;continue;}
  assert.ok(/\.(?:js|mjs|cjs|py)$/.test(entry.to) || entry.to==='services/api/wrangler.jsonc' || entry.to==='services/api/OPERATIONS.md',`Raw evidence changed: ${entry.to}`);
  relocatedCode++;
}
// A's asset URLs must continue to map to the exact pre-migration bytes.
for(const entry of manifest.entries.filter(e=>e.from.startsWith('mock-api/public/'))) assert.equal(hash(fs.readFileSync(path.join(root,entry.to))),entry.sha256,entry.to);
const config=JSON.parse(fs.readFileSync(path.join(root,'services/api/wrangler.jsonc'),'utf8'));
assert.ok(fs.existsSync(path.resolve(root,'services/api',config.d1_databases[0].migrations_dir,'0001_audit_reports.sql')));
console.log(JSON.stringify({files:manifest.entries.length,byteIdentical:unchanged,pathUpdated:relocatedCode,rawEvidence:'preserved',staticAssets:'identical',migrationPath:'exists'}));
