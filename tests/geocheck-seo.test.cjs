const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const publicDir = path.resolve(__dirname,'../apps/web/public');
test('indexable demo and historical whitepaper have truthful, complete metadata',()=>{
  for(const name of ['demo','whitepaper']) {
    const html = fs.readFileSync(path.join(publicDir,`${name}.html`),'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="https://geocheck.lslabs.tw/${name}"`));
    assert.match(html,/<meta name="description" content="[^"<>]+"/);
    assert.match(html,/<meta property="og:title" content="[^"<>]+"/);
    assert.ok(html.includes(`<meta property="og:url" content="https://geocheck.lslabs.tw/${name}"`));
    assert.match(html,/<meta name="twitter:card" content="summary_large_image"/);
    if(name==='demo') assert.match(html,/name="description"[^>]*介面示範/);
    if(name==='whitepaper') assert.match(html,/name="description"[^>]*65\/35/);
  }
});
test('legal pages retain deliberate noindex, follow and matching HTTPS canonical',()=>{
  for(const name of ['privacy','terms','refund']) {
    const html=fs.readFileSync(path.join(publicDir,`${name}.html`),'utf8');
    assert.match(html,/name="robots" content="noindex,follow"/);
    assert.ok(html.includes(`rel="canonical" href="https://geocheck.lslabs.tw/${name}"`));
    assert.match(html,/<meta name="description" content="[^"<>]+"/);
    const sitemap=fs.readFileSync(path.join(publicDir,'sitemap.xml'),'utf8');
    assert.ok(!sitemap.includes(`https://geocheck.lslabs.tw/${name}</loc>`));
  }
});

test('the indexable interface demo is reachable from the public homepage',()=>{
  const home=fs.readFileSync(path.join(publicDir,'home.html'),'utf8');
  assert.ok(home.includes('href="/demo"'), 'Homepage must provide a real link to its sitemap-listed demo');
});
