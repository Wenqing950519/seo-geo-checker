import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pagesWorker from '../services/cloudflare/pages/worker.mjs';

// GeoCheck Classic public-page checks that used to sit inside platform-legal.test.mjs and platform-seo.test.mjs.
// The Platform halves (Worker routing, legal pages, sitemap, canonical tags) moved to ls-labs tests/platform
// with the code (LSL-D-009, 2026-10-21); what remains here concerns apps/web/public as GeoCheck serves it.

const publicDir = new URL('../apps/web/public/', import.meta.url);
const env = { ASSETS: { fetch: async (request) => {
  const pathname = new URL(request.url).pathname;
  const filename = pathname.endsWith('.html') ? pathname : `${pathname.replace(/\/$/, '')}.html`;
  const file = new URL(`.${filename}`, publicDir);
  if (!fs.existsSync(file)) return new Response('missing', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : fs.readFileSync(file, 'utf8'), { headers: { 'Content-Type': 'text/html' } });
} } };

test('public pages use me@lslabs.tw as the only contact address', () => {
  const htmlFiles = fs.readdirSync(publicDir, { recursive: true }).filter((name) => String(name).endsWith('.html'));
  // Seven pages remain after the Platform pages left (404, admin, brand, home, privacy, terms, whitepaper).
  assert.ok(htmlFiles.length >= 7, `only ${htmlFiles.length} public pages were scanned`);
  for (const name of htmlFiles) {
    const html = fs.readFileSync(new URL(String(name).replaceAll(String.fromCharCode(92), '/'), publicDir), 'utf8');
    assert.doesNotMatch(html, /zzz\.lisheng|dev@lslabs\.tw/, `${name} still exposes a retired contact address`);
  }
});

test('Product A/shared legal source remains reachable on its existing host', async () => {
  const response = await pagesWorker.fetch(new Request('https://geocheck.lslabs.tw/terms'), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /GeoCheck 服務條款/);
});

test('public research links reach their final pages directly', () => {
  const home = fs.readFileSync(new URL('home.html', publicDir), 'utf8');
  const whitepaper = fs.readFileSync(new URL('whitepaper.html', publicDir), 'utf8');
  assert.doesNotMatch(home, /href="https:\/\/lslabs\.tw\/research\/"/);
  assert.match(home, /href="https:\/\/lslabs\.tw\/blog\/category\/research\/"/);
  assert.doesNotMatch(whitepaper, /href="\/brand"/);
  assert.match(whitepaper, /href="https:\/\/lslabs\.tw\/brand\/"/);
});
