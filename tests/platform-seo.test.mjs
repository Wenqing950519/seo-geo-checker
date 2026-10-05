import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../services/cloudflare/developer-api/src/worker.js';

const publicDir = new URL('../apps/web/public/', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('../services/cloudflare/developer-api/wrangler.jsonc', import.meta.url), 'utf8'));
const homePaths = ['/', '/developers', '/developers/', '/developers.html'];
const docsPaths = ['/docs', '/docs/', '/docs.html', '/developers/docs', '/developers/docs/', '/developers/docs.html'];
const publicPaths = [...homePaths, ...docsPaths, '/pricing', '/terms/', '/privacy.html', '/refund', '/sitemap.xml', '/robots.txt'];
const env = { ASSETS: { fetch: async request => {
  const pathname = new URL(request.url).pathname;
  const filename = /\.(html|xml|txt)$/.test(pathname) ? pathname : `${pathname.replace(/\/$/, '')}.html`;
  const file = new URL(`.${filename}`, publicDir);
  return fs.existsSync(file) ? new Response(request.method === 'HEAD' ? null : fs.readFileSync(file, 'utf8')) : new Response('missing', {status:404});
} } };

test('public HTTP GET and HEAD preserve path and query in one HTTPS redirect', async () => {
  for (const pathname of publicPaths) for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request(`http://platform.lslabs.tw${pathname}?utm_source=ahrefs&x=1`, {method}), env);
    assert.equal(response.status, 301, `${method} ${pathname}`);
    assert.equal(response.headers.get('location'), `https://platform.lslabs.tw${pathname}?utm_source=ahrefs&x=1`);
    assert.ok(config.assets.run_worker_first.includes(pathname), `${pathname} must reach Worker before ASSETS`);
  }
});

test('homepage and docs aliases retain one canonical and usable social metadata', async () => {
  for (const [paths, canonical] of [[homePaths, 'https://platform.lslabs.tw/'], [docsPaths, 'https://platform.lslabs.tw/docs']]) {
    for (const pathname of paths) {
      const response = await worker.fetch(new Request(`https://platform.lslabs.tw${pathname}`), env);
      assert.equal(response.status, 200, pathname);
      const html = await response.text();
      const tags = html.match(/<link\b[^>]*rel="canonical"[^>]*>/g) || [];
      assert.equal(tags.length, 1, pathname);
      assert.ok(tags[0].includes(`href="${canonical}"`), pathname);
      assert.match(html, /<meta property="og:title" content="[^"<>]+"/);
      assert.match(html, /<meta property="og:description" content="[^"<>]+"/);
      assert.ok(html.includes(`<meta property="og:url" content="${canonical}"`));
      assert.match(html, /<meta property="og:image" content="https:\/\/platform\.lslabs\.tw\/og-image\.png"/);
      assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
      assert.match(html, /<meta name="twitter:image" content="https:\/\/platform\.lslabs\.tw\/og-image\.png"/);
    }
  }
});

test('public sitemap lists only indexable canonical homepage and docs', async () => {
  const sitemap = await (await worker.fetch(new Request('https://platform.lslabs.tw/sitemap.xml'), env)).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, ['https://platform.lslabs.tw/', 'https://platform.lslabs.tw/docs']);
  for (const url of urls) {
    const html = await (await worker.fetch(new Request(url), env)).text();
    assert.doesNotMatch(html, /name="robots"[^>]*noindex/);
  }
});

test('HTTP API POST and OAuth keep their existing fail-closed behavior', async () => {
  for (const [path, method] of [['/v1/measurements', 'POST'], ['/v1/auth/google/start', 'GET'], ['/internal/v1/measurements', 'POST']]) {
    const response = await worker.fetch(new Request(`http://platform.lslabs.tw${path}`, {method}), env);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get('location'), null, path);
  }
  const consoleResponse = await worker.fetch(new Request('http://platform.lslabs.tw/console'), env);
  assert.equal(consoleResponse.status, 200);
  assert.equal(consoleResponse.headers.get('location'), null);
});
