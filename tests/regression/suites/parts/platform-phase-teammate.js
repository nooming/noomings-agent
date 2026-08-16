/** Regression: platform explore/challenge shell + teammate sample win hooks */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getPackagesRoot } = require('../../../../packages/shared/data-paths');
const { hasWinEmit, hasExecutableTraceHook } = require('../../../../packages/platform/legacy-trace-inject');
const {
  filterEventsByChallengePhase,
  filterEventsByExplorePhase,
} = require('../../../../packages/judge/trace-normalize');
const { aggregateSessionMetrics } = require('../../../../packages/platform/trace-store');

const ROOT = path.resolve(__dirname, '../../../..');
const TEAM_MAP = require('../../../lib/teammate-sample-map');
const TEAM_IDS = TEAM_MAP.map((s) => s.id);

function run() {
  const playHtml = fs.readFileSync(
    path.join(ROOT, 'apps/web/ui/pages/student-play.html'),
    'utf8',
  );
  // Phase UI moved into-game; shell syncs via notePhaseFromGame / adapter.setPhase
  assert.ok(playHtml.includes('notePhaseFromGame'), 'student-play missing notePhaseFromGame');
  assert.ok(playHtml.includes('dataset.playPhase'), 'missing playPhase dataset sync');
  assert.ok(/phase\s*===\s*['"]challenge['"]/.test(playHtml), 'missing challenge phase handling');
  assert.ok(playHtml.includes('PlatformTraceAdapter.setPhase'), 'missing adapter setPhase');

  const adapter = fs.readFileSync(
    path.join(ROOT, 'apps/web/ui/trace-adapter-platform.js'),
    'utf8',
  );
  assert.ok(adapter.includes('lastPhase'), 'setPhase should dedupe');
  assert.ok(adapter.includes('phase_change'), 'adapter must emit phase_change');

  const pkgRoot = getPackagesRoot();
  for (const id of TEAM_IDS) {
    const gamePath = path.join(pkgRoot, id, 'game.html');
    assert.ok(fs.existsSync(gamePath), `${id}: game.html missing`);
    const html = fs.readFileSync(gamePath, 'utf8');
    assert.ok(hasExecutableTraceHook(html) || html.includes('__emit'), `${id}: missing emit hook`);
    assert.ok(hasWinEmit(html), `${id}: missing win emit`);
    assert.ok(!/fonts\.googleapis\.com/.test(html), `${id}: must not hard-depend on Google Fonts`);
  }

  const target = fs.readFileSync(path.join(pkgRoot, 'pendulum-target', 'game.html'), 'utf8');
  assert.ok(target.includes('id="s-length"'), 'pendulum-target needs s-length');
  assert.ok(
    /hintKey:\s*['"]pendulum_(?:target|rush|hit)['"]/.test(target),
    'pendulum-target win hint',
  );

  const clock = fs.readFileSync(path.join(pkgRoot, 'pendulum-clock', 'game.html'), 'utf8');
  assert.ok(/endpoint\s*=\s*qs\.get\('ep'\)\s*\|\|\s*''/.test(clock), 'clock telemetry endpoint disabled');
  assert.ok(clock.includes("hintKey: 'pendulum_clock'"), 'clock win hint');

  const cannon = fs.readFileSync(path.join(pkgRoot, 'projectile-cannon', 'game.html'), 'utf8');
  assert.ok(
    cannon.includes("hintKey: 'cannon_fort_hit'") || cannon.includes("hintKey: 'cannon_hit'"),
    'cannon win hint',
  );
  assert.ok(/interim:\s*interim|levelsCleared/.test(cannon), 'cannon win carries interim/levelsCleared');

  const events = [
    { type: 'phase_change', payload: { phase: 'explore' } },
    { type: 'tuning', payload: { control: 's-length', value: 1 } },
    { type: 'phase_change', payload: { phase: 'challenge' } },
    { type: 'tuning', payload: { control: 's-angle', value: 40 } },
    { type: 'action', payload: { control: 'fire' } },
    { type: 'win', payload: { winOk: true } },
  ];
  const challengeOnly = filterEventsByChallengePhase(events);
  assert.strictEqual(
    challengeOnly.filter(e => e.type === 'tuning').length,
    1,
    'challenge filter should drop explore tuning',
  );
  assert.ok(challengeOnly.some(e => e.type === 'win'), 'win kept in challenge');

  const exploreOnly = filterEventsByExplorePhase(events);
  assert.strictEqual(
    exploreOnly.filter(e => e.type === 'tuning').length,
    1,
    'explore filter should keep explore tuning',
  );
  assert.ok(
    exploreOnly.some(e => e.type === 'tuning' && e.payload.control === 's-length'),
    'explore keeps s-length',
  );
  assert.ok(
    !exploreOnly.some(e => e.type === 'tuning' && e.payload.control === 's-angle'),
    'explore drops challenge angle',
  );

  const metrics = aggregateSessionMetrics(events);
  assert.strictEqual(metrics.currentPhase, 'challenge');
  assert.strictEqual(metrics.controlTuningCounts['s-length'], 1);
  assert.strictEqual(metrics.controlTuningCounts['s-angle'], 1);

  console.log('platform-phase-teammate-check: ok', { packages: TEAM_IDS });
}

module.exports = { run };
