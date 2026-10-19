const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const publicDir = path.resolve(__dirname,'../apps/web/public');
test('the historical whitepaper has truthful, complete metadata',()=>{
  for(const name of ['whitepaper']) {
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
  for(const name of ['privacy','terms']) {
    const html=fs.readFileSync(path.join(publicDir,`${name}.html`),'utf8');
    assert.match(html,/name="robots" content="noindex,follow"/);
    assert.ok(html.includes(`rel="canonical" href="https://geocheck.lslabs.tw/${name}"`));
    assert.match(html,/<meta name="description" content="[^"<>]+"/);
    const sitemap=fs.readFileSync(path.join(publicDir,'sitemap.xml'),'utf8');
    assert.ok(!sitemap.includes(`https://geocheck.lslabs.tw/${name}</loc>`));
  }
});

test('the retired demo prototype is gone from the site, the sitemap and the homepage',()=>{
  assert.ok(!fs.existsSync(path.join(publicDir,'demo.html')), 'the outdated demo prototype must not be published');
  const home=fs.readFileSync(path.join(publicDir,'home.html'),'utf8');
  assert.ok(!home.includes('href="/demo"'), 'Homepage must not link the retired demo');
  const sitemap=fs.readFileSync(path.join(publicDir,'sitemap.xml'),'utf8');
  assert.ok(!sitemap.includes('https://geocheck.lslabs.tw/demo<'), 'the retired demo must leave the sitemap');
});

test('the whitepaper points readers to the later retrieval report',()=>{
  const html=fs.readFileSync(path.join(publicDir,'whitepaper.html'),'utf8');
  assert.match(html,/後續研究補充/);
  assert.ok(html.includes('https://lslabs.tw/blog/AI搜尋時代的檢索機制報告/'), 'the notice must link the retrieval report');
});
