const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createResearchTransportRecorder } = require('../../research/lib/transport-recorder.js');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-budget-'));
  try {
    let sent = 0;
    const config = { dir, runId: 'test', caps: { perplexity: 1 }, endpoints: { perplexity: 'https://api.perplexity.ai/chat/completions' },
      nativeFetch: async () => { sent++; return new Response(JSON.stringify({ id: 'resp-test', choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }), { status: 200 }); } };
    const recorder = createResearchTransportRecorder(config);
    const options = { method: 'POST', headers: { Authorization: 'Bearer PRIVATE-KEY' }, body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'test query' }], max_tokens: 260 }) };
    const response = await recorder.fetch('https://api.perplexity.ai/chat/completions', options);
    assert.equal((await response.json()).id, 'resp-test');
    await assert.rejects(() => recorder.fetch('https://api.perplexity.ai/chat/completions', options), /budget/);
    assert.equal(sent, 1, 'budget reservation must block before network');
    const resumed = createResearchTransportRecorder(config);
    await assert.rejects(() => resumed.fetch('https://api.perplexity.ai/chat/completions', options), /budget/);
    assert.equal(sent, 1, 'resume must retain spent reservations');
    const records = fs.readdirSync(dir).filter(n => /\.(json|txt)$/.test(n)).map(n => fs.readFileSync(path.join(dir,n),'utf8')).join('\n');
    assert(!records.includes('PRIVATE-KEY'), 'Authorization must never be persisted');
    assert(records.includes('length') && records.includes('resp-test'), 'original response metadata must survive');
    await assert.rejects(() => recorder.fetch('https://unknown-provider.example/api', options), /unapproved/);
    const failingDir = path.join(dir, 'failure');
    const failed = createResearchTransportRecorder({ ...config, dir: failingDir, nativeFetch: async () => { throw new Error('transport error'); } });
    await assert.rejects(() => failed.fetch('https://api.perplexity.ai/chat/completions', options), /transport error/);
    await assert.rejects(() => failed.fetch('https://api.perplexity.ai/chat/completions', options), /budget/, 'failed request still consumes a reservation');
    console.log('research transport budget tests passed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
