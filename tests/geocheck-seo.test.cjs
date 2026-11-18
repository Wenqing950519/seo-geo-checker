const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const publicDir = path.resolve(__dirname,'../apps/web/public');
test('the public whitepaper has truthful, complete metadata',()=>{
  for(const name of ['whitepaper']) {
    const html = fs.readFileSync(path.join(publicDir,`${name}.html`),'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="https://geocheck.lslabs.tw/${name}"`));
    assert.match(html,/<meta name="description" content="[^"<>]+"/);
    assert.match(html,/<meta property="og:title" content="[^"<>]+"/);
    assert.ok(html.includes(`<meta property="og:url" content="https://geocheck.lslabs.tw/${name}"`));
    assert.match(html,/<meta name="twitter:card" content="summary_large_image"/);
    if(name==='demo') assert.match(html,/name="description"[^>]*介面示範/);
    if(name==='whitepaper') {
      assert.match(html,/name="description"[^>]*MCAC/);
      assert.doesNotMatch(html,/name="description"[^>]*65\/35/,'the 65/35 index is the retired Classic method, not the lead');
    }
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

test('the whitepaper presents the current MCAC method throughout',()=>{
  const html=fs.readFileSync(path.join(publicDir,'whitepaper.html'),'utf8');
  assert.ok(html.includes('https://lslabs.tw/blog/AI搜尋時代的檢索機制報告/'), 'the method must link the retrieval report');
  assert.match(html,/MCAC 0\.2\.0/);
  for (const phrase of ['推薦題','事實題','行動題','四項分開判讀','四項都量到才給分','和你的頁面不一致','無法核對']) {
    assert.ok(html.includes(phrase), `the whitepaper must explain MCAC: ${phrase}`);
  }
  assert.doesNotMatch(html, /sec-classic|AI Trust Index|AI 信任值|可見答案採用率|Classic/i);
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(html.includes(`id="${id}"`), `missing whitepaper anchor: ${id}`);
  }
});
