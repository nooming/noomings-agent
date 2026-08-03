/** Regression: trace-store metrics + phase filter + explore coverage */
const assert = require('assert');
const {
  aggregateSessionMetrics,
  buildPhaseVariableAdjustCounts,
  summarizeSessionEvents,
} = require('../../../../packages/platform/trace-store');
const {
  filterEventsByChallengePhase,
  filterEventsByExplorePhase,
} = require('../../../../packages/judge/trace-normalize');
const { tracePathAlign } = require('../../../../packages/judge/trace-path-align');

const FIXTURE_CHAPTER = {
  kg: {
    nodes: [
      { id: 'P1', group: 'premise', label: '进入' },
      { id: 'O1', group: 'operation', label: '调参' },
      { id: 'C1', group: 'constraint', label: '落入筐中' },
      { id: 'R1', group: 'result', label: '过关' },
    ],
  },
  traceMap: {
    controls: {
      's-speed': { role: 'operation', kgId: 'O1' },
      's-angle': { role: 'operation', kgId: 'O1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
  },
  strategy: {
    routes: [
      { id: 'main', label: '控制变量：每次只改一项', mapsTo: ['P1', 'O1', 'C1', 'R1'] },
      { id: 'trap', label: '多参盲调', mapsTo: ['P1', 'O1', 'C1'] },
    ],
  },
};

function run() {
  const events = [
    { type: 'tuning', payload: { control: 's-speed', value: 5 } },
    { type: 'phase_change', payload: { phase: 'challenge' } },
    { type: 'tuning', payload: { control: 's-speed', value: 6 } },
    { type: 'tuning', payload: { control: 's-angle', value: 45 } },
    { type: 'action', payload: { control: 'btn-fire' } },
  ];

  const metrics = aggregateSessionMetrics(events);
  assert.strictEqual(metrics.controlTuningCounts['s-speed'], 2);
  assert.strictEqual(metrics.controlTuningCounts['s-angle'], 1);
  assert.strictEqual(metrics.currentPhase, 'challenge');

  const filtered = filterEventsByChallengePhase(events);
  assert.strictEqual(filtered.filter(e => e.type === 'tuning').length, 2);
  assert.ok(!filtered.some(e => e.type === 'tuning' && e.payload.value === 5));
  assert.ok(filtered.some(e => e.type === 'tuning' && e.payload.control === 's-angle'));

  // explore filter: angle in explore, only v0 in challenge → coverage includes angle
  const phased = [
    { ts: 1, type: 'phase_change', payload: { phase: 'explore' }, ch: 0 },
    { ts: 2, type: 'tuning', payload: { control: 's-angle', value: '40' }, ch: 0 },
    { ts: 3, type: 'tuning', payload: { control: 's-speed', value: '12' }, ch: 0 },
    { ts: 4, type: 'phase_change', payload: { phase: 'challenge' }, ch: 0 },
    { ts: 5, type: 'tuning', payload: { control: 's-speed', value: '14' }, ch: 0 },
    { ts: 6, type: 'tuning', payload: { control: 's-speed', value: '16' }, ch: 0 },
    { ts: 7, type: 'action', payload: { control: 'btn-fire' }, ch: 0 },
    {
      ts: 8,
      type: 'snapshot',
      payload: { decisions: { C1: false }, hintKey: 'retry' },
      ch: 0,
    },
  ];
  const exploreOnly = filterEventsByExplorePhase(phased);
  assert.strictEqual(
    exploreOnly.filter(e => e.type === 'tuning').length,
    2,
    'explore filter keeps explore tunings',
  );
  assert.ok(
    !exploreOnly.some(e => e.type === 'tuning' && e.payload.control === 's-speed' && e.payload.value === '14'),
    'explore filter drops challenge tunings',
  );

  const inquiryPath = tracePathAlign({ events: phased }, FIXTURE_CHAPTER, 0);
  assert.strictEqual(inquiryPath.metrics.parameterCoverageSource, 'explore');
  assert.ok(inquiryPath.metrics.tunedControls.includes('s-angle'), 'coverage includes explore angle');
  assert.ok(inquiryPath.metrics.tunedControls.includes('s-speed'), 'coverage includes explore speed');
  assert.strictEqual(inquiryPath.metrics.parameterCoverage, 1, 'explore coverage full');
  assert.strictEqual(
    inquiryPath.metrics.parameterCoverageChallenge,
    0.5,
    'challenge-only coverage still half (speed only)',
  );
  // singleVariableRate stays on challenge: only s-speed there
  assert.strictEqual(inquiryPath.metrics.singleVariableRate, 1, 'challenge single-var ignores explore mix');

  // challenge-only session (no explore tunings) → union fallback, not spurious 0
  const challengeOnly = [
    { ts: 1, type: 'phase_change', payload: { phase: 'explore' }, ch: 0 },
    { ts: 2, type: 'phase_change', payload: { phase: 'challenge' }, ch: 0 },
    { ts: 3, type: 'tuning', payload: { control: 's-speed', value: '10' }, ch: 0 },
    { ts: 4, type: 'tuning', payload: { control: 's-angle', value: '30' }, ch: 0 },
  ];
  const unionPath = tracePathAlign({ events: challengeOnly }, FIXTURE_CHAPTER, 0);
  assert.strictEqual(unionPath.metrics.parameterCoverageSource, 'union');
  assert.strictEqual(unionPath.metrics.parameterCoverage, 1, 'union fallback covers challenge tunings');

  // teacher view: phase-split variable adjust counts
  const phaseCounts = buildPhaseVariableAdjustCounts(phased, FIXTURE_CHAPTER);
  assert.strictEqual(phaseCounts.phaseSplit, true, 'phaseSplit when phase_change present');
  const exploreSpeed = phaseCounts.explore.find(r => r.controlId === 's-speed')?.adjustCount || 0;
  const exploreAngle = phaseCounts.explore.find(r => r.controlId === 's-angle')?.adjustCount || 0;
  const challengeSpeed = phaseCounts.challenge.find(r => r.controlId === 's-speed')?.adjustCount || 0;
  const challengeAngle = phaseCounts.challenge.find(r => r.controlId === 's-angle')?.adjustCount || 0;
  assert.strictEqual(exploreSpeed, 1, 'explore: speed×1');
  assert.strictEqual(exploreAngle, 1, 'explore: angle×1');
  assert.strictEqual(challengeSpeed, 2, 'challenge: speed×2');
  assert.strictEqual(challengeAngle, 0, 'challenge: no angle');
  const fullSpeed = phaseCounts.full.find(r => r.controlId === 's-speed')?.adjustCount;
  assert.strictEqual(fullSpeed, 3, 'full session still aggregates');

  const noPhaseCounts = buildPhaseVariableAdjustCounts([
    { type: 'tuning', payload: { control: 's-speed', value: 1 } },
  ], FIXTURE_CHAPTER);
  assert.strictEqual(noPhaseCounts.phaseSplit, false, 'no phase_change → no split');
  assert.strictEqual(noPhaseCounts.scopeNote, 'no_phase_change');
  assert.ok(noPhaseCounts.explore == null && noPhaseCounts.challenge == null);

  const summary = summarizeSessionEvents({ events: phased }, FIXTURE_CHAPTER);
  assert.ok(summary.variableAdjustCountsByPhase?.phaseSplit, 'summarize exposes by-phase');
  assert.ok(summary.variableAdjustCounts?.length, 'full counts kept for compat');

  console.log('trace-phase-metrics-check: ok');
}

module.exports = { run };
