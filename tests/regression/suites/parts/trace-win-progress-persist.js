/**
 * Win progress fields (interim/final/levelsCleared/level) must survive ingest → disk.
 */
const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const {
  cloneTraceEvents,
  listPresentWinProgressKeys,
} = require('../../../../packages/platform/trace-win-fields');
const { ingestTrace, getTraceSession } = require('../../../../packages/platform/trace-store');
const { getTracesRoot } = require('../../../../packages/platform/paths');

function run() {
  const winPayload = {
    winOk: true,
    interim: true,
    final: false,
    level: 2,
    levelsCleared: 2,
    levelsTotal: 4,
    hintKey: 'cannon_fort_hit',
  };

  // Unit: clone keeps progress keys (no allowlist strip)
  const cloned = cloneTraceEvents([
    { ts: 1, type: 'win', payload: { ...winPayload } },
  ]);
  assert(cloned[0].payload.interim === true, 'clone keeps interim');
  assert(cloned[0].payload.levelsCleared === 2, 'clone keeps levelsCleared');
  assert(cloned[0].payload.final === false, 'clone keeps final=false');

  const sessionId = `sess-test-winprog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const snapPayload = {
    controls: { 'in-angle': '45' },
    ...winPayload,
  };

  const result = ingestTrace({
    sessionId,
    catalogId: 'demo-projectile-cannon',
    graphId: 'projectile-cannon',
    studentLabel: 'synth-win-progress',
    events: [
      { ts: 1, type: 'puzzle_open', payload: {}, ch: 0 },
      { ts: 2, type: 'snapshot', payload: snapPayload, ch: 0 },
      { ts: 3, type: 'win', payload: winPayload, ch: 0 },
    ],
  });
  assert(result.ok, `ingest ok: ${result.error || ''}`);

  const session = getTraceSession(sessionId);
  assert(session, 'session readable');
  const win = (session.events || []).find((e) => e.type === 'win');
  const snap = (session.events || []).find((e) => e.type === 'snapshot');
  assert(win, 'win event present');
  assert(snap, 'snapshot present');

  for (const key of ['interim', 'final', 'levelsCleared', 'level', 'levelsTotal', 'winOk']) {
    assert(win.payload?.[key] === winPayload[key], `win.${key} persisted, got ${JSON.stringify(win.payload?.[key])}`);
    assert(snap.payload?.[key] === snapPayload[key], `snapshot.${key} persisted, got ${JSON.stringify(snap.payload?.[key])}`);
  }
  const present = listPresentWinProgressKeys(win.payload);
  assert(present.includes('interim') && present.includes('levelsCleared'), `keys ${present.join(',')}`);

  // Smoke: cannon runtime emit still carries progress fields
  const cannonHtml = fs.readFileSync(
    path.join(__dirname, '../../../../data/runtime/packages/projectile-cannon/game.html'),
    'utf8',
  );
  assert(/levelsCleared/.test(cannonHtml), 'cannon game.html emits levelsCleared');
  assert(/interim:\s*interim/.test(cannonHtml) || /interim:\s*interim,/.test(cannonHtml), 'cannon emits interim');

  try {
    const file = path.join(getTracesRoot(), `${sessionId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_) { /* ignore */ }

  console.log('trace-win-progress-persist: OK', { persisted: present });
}

module.exports = { run };
