const path = require('node:path');
const PRESERVE = new Set(['official-engine-profiles.js', 'official-search-providers.js', 'provider-costs.js'].map((name) => `services/api/application/${name}`));
const MCP_EDITS = new Set(['services/api/application/developer-platform-service.js',
  'services/api/storage/developer-platform-d1-store.js', 'services/cloudflare/developer-api/src/worker.js']);
const NEW_MCP = new Set(['services/api/application/developer-mcp-research.js', 'services/cloudflare/developer-api/src/research-mcp.mjs']);
const normalize = (text) => text.replace(/\r/g, '');

function selectReleaseSources({ root, sourceMap, readHead, readWorking }) {
  const selected = new Map();
  for (let index = 0; index < sourceMap.sources.length; index++) {
    const source = sourceMap.sources[index];
    if (source.includes('.wrangler/')) continue;
    const absolute = path.resolve(root, 'services/cloudflare/developer-api', source);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (!relative.startsWith('services/') && !relative.startsWith('packages/')) throw Error('Unexpected production source path');
    const live = sourceMap.sourcesContent[index];
    if (typeof live !== 'string') throw Error('Production source map lacks source contents');
    if (PRESERVE.has(relative)) { selected.set(absolute, live); continue; }
    if (normalize(readHead(absolute)) !== normalize(live)) throw Error(`Production baseline differs from HEAD: ${relative}`);
    const working = readWorking(absolute);
    if (!MCP_EDITS.has(relative) && normalize(working) !== normalize(live)) throw Error(`Unrelated working edit: ${relative}`);
    selected.set(absolute, MCP_EDITS.has(relative) ? working : live);
  }
  return selected;
}
module.exports = { selectReleaseSources, NEW_MCP, PRESERVE };
