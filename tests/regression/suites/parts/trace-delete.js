const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { getTracesRoot } = require('../../../../packages/platform/paths');
const { deleteTraceSessions, getTraceSession } = require('../../../../packages/platform/trace-store');

function traceDeleteCheck() {
  const tracesDir = getTracesRoot();
  fs.mkdirSync(tracesDir, { recursive: true });
  const sessionId = `sess-test-${Date.now()}-del`;
  const file = path.join(tracesDir, `${sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify({ sessionId, events: [{ type: 'test' }] }));

  try {
    const r1 = deleteTraceSessions([sessionId]);
    assert(r1.ok && r1.count === 1, 'delete one session');
    assert(!fs.existsSync(file), 'session file removed');
    assert(!getTraceSession(sessionId), 'getTraceSession returns null');

    const r2 = deleteTraceSessions([sessionId, '../evil', 'bad-id']);
    assert(r2.deleted.length === 0, 'no delete for missing/invalid');
    assert(r2.invalid.includes('bad-id'), 'invalid id reported');
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  console.log('trace-delete-check: OK');
}

module.exports = { traceDeleteCheck };
