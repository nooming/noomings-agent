/** Regression: trace-store metrics + phase filter */
const assert = require('assert');
const { aggregateSessionMetrics } = require('../../../../packages/platform/trace-store');
const { filterEventsByChallengePhase } = require('../../../../packages/judge/trace-normalize');

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

  console.log('trace-phase-metrics-check: ok');
}

module.exports = { run };
