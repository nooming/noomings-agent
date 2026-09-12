const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { getTracesRoot } = require('../../../../packages/platform/paths');
const {
  buildStoreZip,
  exportAllTracesZip,
  importAllTracesZip,
  safeSessTraceBasename,
  getTraceSession,
  deleteTraceSessions,
  resolveSessionFile,
  DEFAULT_CLASS_DIR,
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
  // Seed via flat write; ensureTracesRoot/migrate moves into class dir on next API call
  const flatSeed = path.join(tracesDir, fileName);
  const payload = {
    sessionId,
    classCode: null,
    events: [{ type: 'zip-import-smoke' }],
    marker: 'v1',
  };
  fs.writeFileSync(flatSeed, JSON.stringify(payload));

  try {
    const exported = exportAllTracesZip();
    assert(exported.ok && exported.buffer && exported.buffer.length > 0, 'export zip ok');
    // Index must not appear in ZIP names (flat sess-*.json only)
    assert(!exported.buffer.includes(Buffer.from('.traces-index.json')), 'export excludes index filename');

    const diskBefore = getTraceSession(sessionId);
    assert(diskBefore && diskBefore.marker === 'v1', 'migrated/readable after export bootstrap');
    const classFile = resolveSessionFile(sessionId);
    assert(classFile && classFile.includes(DEFAULT_CLASS_DIR), 'session under _default class dir');

    fs.writeFileSync(classFile, JSON.stringify({ sessionId, marker: 'old-overwrite-me' }));
    const singleZip = buildStoreZip([
      { name: fileName, data: Buffer.from(JSON.stringify(payload)) },
      { name: '../evil.json', data: Buffer.from('{"no":1}') },
      { name: 'notes.txt', data: Buffer.from('skip') },
    ]);
    const imported = importAllTracesZip(singleZip);
    assert(imported.ok, 'import ok');
    assert(imported.imported === 1, 'one sess imported');
    assert(imported.skipped >= 2, 'evil + notes skipped');
    const disk = getTraceSession(sessionId);
    assert(disk && disk.marker === 'v1', 'same-name overwrite');

    deleteTraceSessions([sessionId]);
    assert(!getTraceSession(sessionId), 'deleted before re-import');
    const roundTrip = importAllTracesZip(singleZip);
    assert(roundTrip.ok && roundTrip.imported === 1, 're-import after delete');
    assert(getTraceSession(sessionId), 'session file restored via index');

    // Nested classCode path: place by zip parent when JSON has no classCode
    const nestedId = `sess-test-${Date.now()}-zipnest`;
    const nestedPayload = { sessionId: nestedId, events: [], marker: 'nested-class' };
    const nestedZip = buildStoreZip([
      { name: `classA/${nestedId}.json`, data: Buffer.from(JSON.stringify(nestedPayload)) },
    ]);
    const nestedImp = importAllTracesZip(nestedZip);
    assert(nestedImp.ok && nestedImp.imported === 1, 'nested zip import');
    const nested = getTraceSession(nestedId);
    assert(nested && nested.classCode === 'classA', 'classCode from zip path');
    const nestedPath = resolveSessionFile(nestedId) || '';
    assert(/classA[/\\]/.test(nestedPath), 'file under classA dir');
    deleteTraceSessions([nestedId]);
  } finally {
    deleteTraceSessions([sessionId]);
    if (fs.existsSync(flatSeed)) fs.unlinkSync(flatSeed);
  }
}

module.exports = { run };
