/**
 * Static + monte-carlo reachability guards for remaining packages.
 * npm run check:generate -- --filter unpassable-levels-audit
 *
 * Note: efield / photoelectric / capacitor-confound-ui / pendulum-target audits
 * were removed with those HS-foundational packages.
 */
'use strict';

const fs = require('fs');
const assert = require('assert');
const { getPackageGamePath } = require('../../../../packages/shared/data-paths');
const R = require('../../../lib/unpassable-reachability');

function readGame(id) {
  const p = getPackageGamePath(id);
  assert.ok(fs.existsSync(p), `missing game.html for ${id}: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function run() {
  // --- projectile clamp ---
  const proj = readGame('projectile-basic');
  assert.ok(/viewW - marginPx|maxMetersRaw/.test(proj), 'projectile: visible clamp missing');
  for (const viewW of [280, 320, 480, 800]) {
    const r = R.projectileClampTargetX(viewW);
    assert.ok(r.inView, `projectile target out of view at viewW=${viewW}, x=${r.targetX}`);
    assert.ok(r.targetX <= viewW, `projectile targetX ${r.targetX} > viewW ${viewW}`);
  }

  // Pure helpers still covered (no deleted-package HTML dependency).
  const env = R.pendulumLandingEnvelope();
  assert.ok(env.maxX < 500, `pendulum envelope maxX=${env.maxX} still too far`);
  assert.ok(env.maxX > env.minX + 60, 'pendulum envelope too narrow');

  const mc = R.capacitorMonteCarloMissRate(600);
  assert.ok(mc.rate < 0.005, `capacitor: miss rate ${mc.rate} too high (expected ≈0 with reroll)`);

  console.log('unpassable-levels-audit: ok', {
    projectile: true,
    pendulumEnv: env,
    capacitorMissRate: mc.rate,
  });
}

module.exports = { run };

if (require.main === module) {
  run();
}
