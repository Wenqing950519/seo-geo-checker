import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../services/cloudflare/developer-api/src/worker.js';
import pagesWorker from '../services/cloudflare/pages/worker.mjs';

const publicDir = new URL('../apps/web/public/', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('../services/cloudflare/developer-api/wrangler.jsonc', import.meta.url)));
const pages = ['pricing', 'terms', 'privacy', 'refund'];
const env = { ASSETS: { fetch: async (request) => {
  const pathname = new URL(request.url).pathname;
  const filename = pathname.endsWith('.html') ? pathname : `${pathname.replace(/\/$/, '')}.html`;
  const file = new URL(`.${filename}`, publicDir);
  if (!fs.existsSync(file)) return new Response('missing', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : fs.readFileSync(file, 'utf8'), { headers: { 'Content-Type': 'text/html' } });
} } };

test('anonymous Platform legal URLs serve Product B content, including old HTML aliases', async () => {
  for (const page of pages) for (const suffix of ['', '/', '.html']) {
    const pathname = `/${page}${suffix}`;
    assert.ok(config.assets.run_worker_first.includes(pathname), `${pathname}: static assets must not bypass host routing`);
    const response = await worker.fetch(new Request(`https://platform.lslabs.tw${pathname}?source=review`), env);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /LS-Labs Platform/);
    assert.doesNotMatch(html, /330|藍新|GeoCheck Track|每月自動扣款/);
    assert.match(html, new RegExp(`https://platform\\.lslabs\\.tw/${page}`));
    assert.match(html, /zzz\.lisheng/);
    const head = await worker.fetch(new Request(`https://platform.lslabs.tw${pathname}`, { method: 'HEAD' }), env);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  }
});

test('prelaunch pricing cannot sell an invented plan and legal pages link to each other', async () => {
  for (const page of pages) {
    const html = await (await worker.fetch(new Request(`https://platform.lslabs.tw/${page}`), env)).text();
    assert.match(html, /尚未開放付款/);
    for (const target of pages) assert.ok(html.includes(`href="/${target}"`), `${page} links to ${target}`);
    assert.doesNotMatch(html, /<form|AioCheckOut|立即購買/);
  }
  const home = fs.readFileSync(new URL('developers.html', publicDir), 'utf8');
  for (const page of pages) assert.ok(home.includes(`href="/${page}"`), `landing links to ${page}`);
});

test('Product A/shared legal source remains reachable on its existing host', async () => {
  const response = await pagesWorker.fetch(new Request('https://geocheck.lslabs.tw/terms'), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /GeoCheck 服務條款/);
});

test('Console and docs distinguish quota from payment and result deletion from all data', () => {
  const consolePage = fs.readFileSync(new URL('developers-console.html', publicDir), 'utf8');
  assert.doesNotMatch(consolePage, /<strong>0 計費<\/strong>/);
  assert.ok(consolePage.includes('href="/privacy"'));
  const docs = fs.readFileSync(new URL('developers/docs.html', publicDir), 'utf8');
  assert.doesNotMatch(docs, /所有搜尋快照與文字回答即刻永久刪除/);
  assert.ok(docs.includes('href="/privacy"'));
});
