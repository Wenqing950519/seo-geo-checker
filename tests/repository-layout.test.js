const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const at = value => path.join(root, value);

// Regression: moving files must not create a second scoring or provider instance.
for (const [old, canonical] of [
  ['mock-api/lib/ai-trust-index.js', 'packages/geo-core/scoring/ai-trust-index.js'],
  ['mock-api/lib/geo-measurement.js', 'services/api/application/geo-measurement.js'],
  ['mock-api/providers/perplexity.js', 'packages/ai-providers/perplexity.js'],
  ['mock-api/lib/real-lite-audit-v2-core.js', 'apps/web/report/real-lite-audit-v2-core.js']
]) {
  assert.ok(fs.existsSync(at(canonical)), `Missing canonical module: ${canonical}`);
  assert.strictEqual(require(at(old)), require(at(canonical)), `${old} must share canonical module state`);
}
const {hermeticBrowserPath} = require(at('packages/crawler/browser-runtime.js'));
assert.equal(hermeticBrowserPath(), at('node_modules/playwright-core/.local-browsers'));
const geoCore = require(at('packages/geo-core'));
assert.strictEqual(geoCore.scoring.aiTrustIndex, require(at('packages/geo-core/scoring/ai-trust-index.js')));
assert.strictEqual(geoCore.evidence.visibility, require(at('packages/geo-core/evidence/perplexity-visibility.js')));
const webReportSource = fs.readFileSync(at('apps/web/report/real-lite-audit-v2-core.js'), 'utf8');
assert.match(webReportSource, /require\(["']\.\.\/\.\.\/\.\.\/packages\/geo-core["']\)/);
assert.doesNotMatch(webReportSource, /packages\/geo-core\//, 'apps/web must consume the geo-core package entrypoint');
// A still reads the identical static UI, including its established API endpoint.
assert.match(fs.readFileSync(at('apps/web/public/home.html'),'utf8'), /\/api\/audit-real-lite/);
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]); }
for (const file of files(at('packages/geo-core')).filter(f=>f.endsWith('.js'))) {
  const source = fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source, /require\(["'](?:node:)?(?:fs|http|https|child_process)["']\)|\bfetch\s*\(|process\.env|mock-api|ai-providers/, `${file} must remain independent of I/O and adapters`);
}
console.log('repository layout compatibility tests passed');
