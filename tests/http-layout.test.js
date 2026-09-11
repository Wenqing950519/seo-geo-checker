// Exercise the relocated HTTP wiring without DNS, providers, D1, or product ledgers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname,'..');
async function availablePort() {
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function check(entry) {
  const port=await availablePort();
  const preload=`
    const {AppError}=require('./packages/shared/errors.js');
    const {createFetchLimitedReport}=require('./apps/web/report/real-lite-audit-v2-core.js');
    require('./packages/crawler/url-safety.js').assertSafePublicUrl=async url=>url;
    require('./apps/web/analytics/funnel-events.js').createFunnelRecorder=()=>({record(){}});
    require('./services/api/storage/d1-report-store.js').createD1ReportStore=()=>({getByCacheKey:async()=>null,getById:async()=>null,set:async()=>false,state:()=>({enabled:false})});
    require('./apps/web/report/real-lite-audit.js').runRealLiteAudit=async url=>createFetchLimitedReport(url,new AppError('fixture crawl unavailable',{stage:'fetch_homepage'}));
    global.fetch=()=>{throw new Error('Unexpected external fetch in layout test');};
    require(${JSON.stringify('./'+entry)});
  `;
  const child=spawn(process.execPath,['-e',preload],{cwd:root,env:{...process.env,PORT:String(port),LEGACY_HOST:'unused.invalid'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',data=>{stderr+=data;});
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Server readiness timeout: '+stderr)),10000);
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+stderr));});
      child.stdout.on('data',data=>{if(String(data).includes(`localhost:${port}`)){clearTimeout(timer);resolve();}});
    });
    const base=`http://127.0.0.1:${port}`;
    for(const [route,file] of [
      ['/','home.html'],
      ['/analytics.js','analytics.js'],
      ['/favicon.svg','favicon.svg'],
      ['/og-image.png','og-image.png'],
      ['/assets/real-site-apoint.png','assets/real-site-apoint.png'],
      ['/developers','developers.html'],
      ['/developers/docs','developers/docs.html'],
      ['/developers/console','developers-console.html']
    ]) {
      const response=await fetch(base+route);
      assert.equal(response.status,200,`${entry}: ${route}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),fs.readFileSync(path.join(root,'apps/web/public',file)),`${route} must serve original asset bytes`);
    }
    const response=await fetch(base+'/api/audit-real-lite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com/'})});
    assert.equal(response.status,200);
    const report=await response.json();
    assert.ok(report.id);
    const json=await fetch(base+'/api/report/'+report.id);
    assert.equal(json.status,200);
    assert.equal((await json.json()).id,report.id);
    for(const suffix of ['', '/markdown']) {
      const result=await fetch(base+'/report/'+report.id+suffix);
      assert.equal(result.status,200);
      assert.ok((await result.text()).length>100);
    }
  } finally {
    const stopped=new Promise(resolve=>child.once('exit',resolve));
    child.kill();
    if(child.exitCode===null) await stopped;
  }
}
(async()=>{await check('services/api/server.js');await check('mock-api/server.js');console.log('HTTP layout tests passed (both entrypoints; no external calls)');})().catch(error=>{console.error(error);process.exitCode=1;});
