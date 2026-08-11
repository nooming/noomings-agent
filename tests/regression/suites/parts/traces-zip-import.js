const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { getTracesRoot } = require('../../../../packages/platform/paths');
const {
  buildStoreZip,
  exportAllTracesZip,
  importAllTracesZip,
  safeSessTraceBasename,
} = require('../../../../packages/platform/trace-store');

function run() {
  assert(safeSessTraceBasename('sess-abc-1.json') === 'sess-abc-1.json', 'accept flat sess json');
  assert(safeSessTraceBasename('nested/sess-abc-1.json') === 'sess-abc-1.json', 'accept nested basename');
  assert(safeSessTraceBasename('../sess-abc-1.json') === null, 'reject traversal');
  assert(safeSessTraceBasename('foo/../../sess-abc-1.json') === null, 'reject nested traversal');
  assert(safeSessTraceBasename('readme.txt') === null, 'reject non-sess');
  assert(safeSessTraceBasename('sess-evil.json.bak') === null, 'reject bad suffix');

  const tracesDir = getTracesRoot();
  fs.mkdirSync(tracesDir, { recursive: true });
  const sessionId = `sess-test-${Date.now()}-zipimp`;
  const fileName = `${sessionId}.json`;
  const file = path.join(tracesDir, fileName);
  const payload = { sessionId, events: [{ type: 'zip-import-smoke' }], marker: 'v1' };
  fs.writeFileSync(file, JSON.stringify(payload));

  try {
    const exported = exportAllTracesZip();
    assert(exported.ok && exported.buffer && exported.buffer.length > 0, 'export zip ok');

    fs.writeFileSync(file, JSON.stringify({ sessionId, marker: 'old-overwrite-me' }));
    const singleZip = buildStoreZip([
      { name: fileName, data: Buffer.from(JSON.stringify(payload)) },
      { name: '../evil.json', data: Buffer.from('{"no":1}') },
      { name: 'notes.txt', data: Buffer.from('skip') },
    ]);
    const imported = importAllTracesZip(singleZip);
    assert(imported.ok, 'import ok');
    assert(imported.imported === 1, 'one sess imported');
    assert(imported.skipped >= 2, 'evil + notes skipped');
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert(disk.marker === 'v1', 'same-name overwrite');

    fs.unlinkSync(file);
    const roundTrip = importAllTracesZip(singleZip);
    assert(roundTrip.ok && roundTrip.imported === 1, 're-import after delete');
    assert(fs.existsSync(file), 'session file restored');
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

module.exports = { run };
