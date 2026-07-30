const { assert } = require('../../../lib/assert');

const PORT = Number(process.env.AGENT_PORT) || 3001;
const BASE = `http://127.0.0.1:${PORT}`;

async function run() {
  if (process.env.AGENT_SKIP_HTTP === '1') {
    console.log('graph-preview-api-smoke: skip (AGENT_SKIP_HTTP=1)');
    return;
  }

  const url = `${BASE}/api/graph-preview?graphId=${encodeURIComponent('half-life')}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.log('graph-preview-api-smoke: skip (server not running on port ' + PORT + ')');
    return;
  }

  const text = await res.text();
  assert(res.headers.get('content-type')?.includes('json'), 'Content-Type should be JSON');

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`expected JSON, got: ${text.slice(0, 80)}`);
  }

  assert(res.ok, `HTTP ${res.status}: ${body.error || text.slice(0, 80)}`);
  assert(body.ok === true, 'payload ok');
  assert(Array.isArray(body.kgChapters) && body.kgChapters.length >= 1, 'kgChapters');

  const legacy = await fetch(`${BASE}/api/graph-preview?graphId=${encodeURIComponent('html-samples-half-life')}`);
  const legacyBody = await legacy.json();
  assert(legacyBody.ok === true, 'legacy graphId alias');

  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json();
  assert(healthBody.graphPreview === true, 'health graphPreview flag');

  console.log('graph-preview-api-smoke: OK');
}

module.exports = { run };
