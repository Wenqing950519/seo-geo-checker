const assert = require('node:assert/strict');
const path = require('node:path');
const { selectReleaseSources } = require('../scripts/developer-api/mcp-release-lib.cjs');
const root = path.resolve(__dirname, '..');
const entries = [
  ['../../api/application/official-engine-profiles.js', 'live-model'],
  ['../../api/application/developer-platform-service.js', 'old-service'],
  ['../../api/security/developer-credentials.js', 'stable']
];
const sourceMap = { sources: entries.map(([name]) => name), sourcesContent: entries.map(([, value]) => value) };
const originals = new Map(entries.map(([name, value]) => [path.resolve(root, 'services/cloudflare/developer-api', name), value]));
const readHead = (file) => originals.get(file);
const readWorking = (file) => file.includes('official-engine-profiles') ? 'unreleased-model' : file.includes('developer-platform-service') ? 'MCP-service' : 'stable';
const selected = selectReleaseSources({ root, sourceMap, readHead, readWorking });
assert.equal(selected.get(path.join(root, 'services/api/application/official-engine-profiles.js')), 'live-model');
assert.equal(selected.get(path.join(root, 'services/api/application/developer-platform-service.js')), 'MCP-service');
assert.throws(() => selectReleaseSources({ root, sourceMap, readHead: () => 'different-base', readWorking }), /baseline/);
assert.throws(() => selectReleaseSources({ root, sourceMap, readHead, readWorking: () => 'unrelated-edit' }), /Unrelated/);
const { repairProviderSource } = require('../scripts/developer-api/provider-response-repair.cjs');
const live = 'model: "claude-haiku-4-5-20251001", max_tokens: 1024;\nconst answer = String(firstText(response.content) || "").trim();\nfunction firstText(value) {}';
const working = 'model: "claude-haiku-5-5";\nfunction anthropicAnswer(content) { return "final"; }\nfunction firstText(value) {}';
const repaired = repairProviderSource(live, working);
assert.match(repaired, /model: "claude-haiku-4-5-20251001", max_tokens: 1024/);
assert.doesNotMatch(repaired, /claude-haiku-5-5/);
assert.match(repaired, /const answer = anthropicAnswer\(response.content\)/);
assert.throws(() => repairProviderSource(repaired, working), /exactly one/);
assert.throws(() => repairProviderSource(live + live, working), /exactly one/);
console.log('MCP isolated release source tests passed');
