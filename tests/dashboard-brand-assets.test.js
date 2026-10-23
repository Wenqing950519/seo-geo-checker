const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('standalone Dashboard ships its referenced brand assets',()=>{
 execFileSync(process.execPath,['scripts/cloudflare/build-dashboard-static.cjs'],{cwd:root});
 for(const name of ['assets/logo-mark.svg','favicon.svg','favicon.png']){
  assert.deepEqual(fs.readFileSync(path.join(root,'dist/dashboard',name)),fs.readFileSync(path.join(root,'apps/web/public',name)));
 }
});
