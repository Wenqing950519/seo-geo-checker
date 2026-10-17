const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('../../packages/shared/errors.js');

// One runner owns this directory. Reserve synchronously before fetch, including failed attempts.
function createResearchTransportRecorder({ dir, runId, caps, endpoints, nativeFetch }) {
  fs.mkdirSync(dir, { recursive: true });
  const counts = Object.fromEntries(Object.keys(caps).map(p => [p, 0]));
  let sequence = 0;
  for (const name of fs.readdirSync(dir).filter(n => /^\d+-request\.json$/.test(n))) {
    const request = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (request.run_id !== runId || !(request.provider in caps)) throw new Error('transport ledger scope mismatch');
    counts[request.provider]++; sequence = Math.max(sequence, request.sequence);
  }
  const stop = message => new AppError(message, { stage: 'research_budget', statusCode: 409, retryable: false });
  return {
    counts,
    async fetch(input, options = {}) {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      const provider = Object.entries(endpoints).find(([, endpoint]) => endpoint === url)?.[0];
      if (!provider) {
        const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
        if (headers.has('authorization')) throw stop('unapproved authenticated endpoint in research run');
        return nativeFetch(input, options);
      }
      if (String(options.method || 'GET').toUpperCase() !== 'POST') throw stop('unapproved provider method');
      if (counts[provider] >= caps[provider]) throw stop(`research request budget exhausted for ${provider}: ${counts[provider]}/${caps[provider]}`);
      const payload = JSON.parse(options.body);
      counts[provider]++;
      const id = ++sequence;
      const prefix = String(id).padStart(4, '0');
      const request = { run_id: runId, sequence: id, provider, endpoint: url,
        reserved_at: new Date().toISOString(), payload };
      fs.writeFileSync(path.join(dir, `${prefix}-request.json`), JSON.stringify(request, null, 2) + '\n', { flag: 'wx' });
      try {
        const response = await nativeFetch(input, options);
        const raw = await response.clone().text();
        fs.writeFileSync(path.join(dir, `${prefix}-response.txt`), raw, { flag: 'wx' });
        fs.writeFileSync(path.join(dir, `${prefix}-result.json`), JSON.stringify({ run_id: runId, sequence: id, provider,
          completed_at: new Date().toISOString(), http_status: response.status,
          request_id: response.headers.get('x-request-id'), content_type: response.headers.get('content-type'),
          response_file: `${prefix}-response.txt` }, null, 2) + '\n', { flag: 'wx' });
        return response;
      } catch (error) {
        const resultPath = path.join(dir, `${prefix}-result.json`);
        if (!fs.existsSync(resultPath)) fs.writeFileSync(resultPath, JSON.stringify({ run_id: runId, sequence: id, provider,
          completed_at: new Date().toISOString(), transport_error: String(error.message).slice(0, 300) }, null, 2) + '\n', { flag: 'wx' });
        throw error;
      }
    }
  };
}
module.exports = { createResearchTransportRecorder };
