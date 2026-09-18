import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../services/cloudflare/pages/worker.mjs';
const request=(host,path='/',method='GET')=>new Request(`https://${host}${path}`,{method});
const env={ASSETS:{fetch:async()=>new Response('asset')}};
test('legacy public hostname redirects once and preserves path and query',async()=>{
  for(const method of ['GET','HEAD']){
    const response=await worker.fetch(request('geocheck.lisheng.cv','/whitepaper?source=old',method),env);
    assert.equal(response.status,308);
    assert.equal(response.headers.get('location'),'https://geocheck.lslabs.tw/whitepaper?source=old');
  }
});
test('canonical pages pass through and API/auth methods are never redirected',async()=>{
  assert.equal(await (await worker.fetch(request('geocheck.lslabs.tw'),env)).text(),'asset');
  for(const route of ['/api/audit','/app-api/v1/auth/google/callback?code=test','/report/example','/v1/measurements','/internal/v1/measurements']){
    assert.equal((await worker.fetch(request('geocheck.lisheng.cv',route),env)).status,200);
  }
  assert.equal((await worker.fetch(request('geocheck.lisheng.cv','/','POST'),env)).status,200);
});
test('retired research and misplaced product links have usable destinations',async()=>{
  for(const suffix of ['','/','.html','/index.html']){
    const response=await worker.fetch(request('geocheck.lslabs.tw','/research/xinyi-dining-wave0'+suffix),env);
    assert.equal(response.headers.get('location'),'https://lslabs.tw/blog/');
  }
  for(const [from,to] of [['/developers','https://platform.lslabs.tw/'],['/developers/docs','https://platform.lslabs.tw/docs'],['/developers-console','https://platform.lslabs.tw/console'],['/app/','https://app.lslabs.tw/']]){
    assert.equal((await worker.fetch(request('geocheck.lisheng.cv',from),env)).headers.get('location'),to);
  }
});
test('public Pages includes a noindex 404 document',()=>{
  const html=fs.readFileSync(new URL('../apps/web/public/404.html',import.meta.url),'utf8');
  assert.match(html,/noindex/);
});
