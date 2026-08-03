/**
 * Static + monte-carlo reachability guards for known unpassable-level bugs.
 * npm run check:generate -- --filter unpassable-levels-audit
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

function extractMaterials(html) {
  const block = html.match(/const MATERIALS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'photoelectric: MATERIALS block missing');
  const mats = [];
  const re = /\{\s*name:\s*'([^']+)'\s*,\s*W:\s*([0-9.]+)\s*\}/g;
  let m;
  while ((m = re.exec(block[1]))) {
    mats.push({ name: m[1], W: parseFloat(m[2]) });
  }
  assert.ok(mats.length >= 4, 'photoelectric: expected material entries');
  return mats;
}

function run() {
  // --- efield geometry / source ---
  const efield = readGame('efield-charge');
  assert.ok(
    /LAUNCH_Y_FRAC\s*=\s*0\.3[0-9]/.test(efield) || /const LAUNCH_Y_FRAC\s*=/.test(efield),
    'efield: LAUNCH_Y_FRAC missing',
  );
  assert.ok(/placeExploreTargetZone/.test(efield), 'efield: adaptive explore target missing');
  assert.ok(/someEqHitsZone/.test(efield), 'efield: challenge reachability assert missing');
  assert.ok(/不影响偏转|仅示意/.test(efield), 'efield: plate gap should be labeled cosmetic');

  const launchMatch = efield.match(/LAUNCH_Y_FRAC\s*=\s*([0-9.]+)/);
  const launchFrac = launchMatch ? parseFloat(launchMatch[1]) : 0.38;

  function placeExploreLikeGame(W, H) {
    const zoneH = Math.max(64, H * 0.14);
    const yComfort = R.efieldPredictScreenY(7, 650, W, H, { launchYFrac: launchFrac });
    let y = yComfort - zoneH * 0.45;
    const yMin = H * (launchFrac + 0.04);
    const yMax = Math.min(H * 0.88 - zoneH, R.efieldPredictScreenY(10, 1000, W, H, { launchYFrac: launchFrac }) - zoneH * 0.25);
    y = Math.max(yMin, Math.min(y, Math.max(yMin, yMax)));
    if (!R.efieldSomeEqHitsZone(y, zoneH, W, H, { launchYFrac: launchFrac })) {
      y = Math.max(yMin, R.efieldPredictScreenY(8, 800, W, H, { launchYFrac: launchFrac }) - zoneH * 0.5);
    }
    return { y, zoneH };
  }

  for (const [W, H] of [[500, 360], [700, 420], [400, 300]]) {
    const placed = placeExploreLikeGame(W, H);
    assert.ok(placed.y + 8 >= H * launchFrac, `efield explore above launch at ${W}x${H}`);
    const hit = R.efieldSomeEqHitsZone(placed.y, placed.zoneH, W, H, { launchYFrac: launchFrac });
    assert.ok(hit, `efield explore unreachable at ${W}x${H}`);

    // sample challenge locks: zone below launch, some (E,q) hits
    const zoneH = Math.max(36, H * 0.07);
    let hits = 0;
    for (let i = 0; i < 24; i++) {
      const yMin = R.efieldPredictScreenY(1, 80, W, H, { launchYFrac: launchFrac });
      const yMax = Math.min(H * 0.92, R.efieldPredictScreenY(10, 1000, W, H, { launchYFrac: launchFrac }) - zoneH * 0.35);
      const lo = Math.max(H * (launchFrac + 0.04), yMin);
      const hi = Math.max(lo + zoneH, yMax);
      const y = lo + ((i + 0.5) / 24) * Math.max(4, hi - lo);
      if (R.efieldSomeEqHitsZone(y, zoneH, W, H, { launchYFrac: launchFrac })) hits += 1;
    }
    assert.ok(hits >= 12, `efield challenge sample locks mostly unreachable at ${W}x${H} (hits=${hits})`);
  }

  // --- photoelectric ---
  const photo = readGame('photoelectric');
  assert.ok(/challengeMaterialPool/.test(photo), 'photoelectric: challengeMaterialPool missing');
  const materials = extractMaterials(photo);
  const fMaxMatch = photo.match(/F_MAX_UNITS\s*=\s*([0-9.]+)/);
  const fMax = fMaxMatch ? parseFloat(fMaxMatch[1]) : 10;
  const eMax = R.photoelectricEmax(fMax);
  const pool = R.photoelectricChallengePool(materials, { fMaxUnits: fMax, eps: 0.08 });
  assert.ok(pool.length >= 1, 'photoelectric: empty challenge pool');
  for (const m of pool) {
    assert.ok(m.W < eMax - 0.05, `photoelectric: pool material ${m.name} W=${m.W} not < E_max`);
  }
  // Cu/Ag must not be challenge-eligible at f_max=10
  const bad = materials.filter((m) => m.W >= eMax - 0.05);
  for (const m of bad) {
    assert.ok(!pool.some((p) => p.name === m.name), `photoelectric: ${m.name} must be filtered from challenge pool`);
  }
  // monte-carlo: every roll from pool is winnable at f_max
  for (let i = 0; i < 200; i++) {
    const m = pool[i % pool.length];
    assert.ok(H_ok(m.W, eMax), `photoelectric: material ${m.name} not winnable`);
  }

  // --- capacitor discrete band ---
  const cap = readGame('capacitor-confound-ui');
  assert.ok(/bandHasDiscreteSolution/.test(cap), 'capacitor: bandHasDiscreteSolution missing');
  const mc = R.capacitorMonteCarloMissRate(600);
  assert.ok(mc.rate < 0.005, `capacitor: miss rate ${mc.rate} too high (expected ≈0 with reroll)`);

  // --- pendulum envelope / noise defaults ---
  const pend = readGame('pendulum-target');
  assert.ok(/landingEnvelope/.test(pend), 'pendulum: landingEnvelope missing');
  assert.ok(/clampCartRange/.test(pend), 'pendulum: clampCartRange missing');
  assert.ok(/confuseScale/.test(pend), 'pendulum: confuseScale missing');
  assert.ok(/let confuseOn\s*=\s*false/.test(pend), 'pendulum: explore should default confuse off');
  const env = R.pendulumLandingEnvelope();
  assert.ok(env.maxX < 500, `pendulum envelope maxX=${env.maxX} still too far`);
  assert.ok(env.maxX > env.minX + 60, 'pendulum envelope too narrow');

  // --- projectile clamp ---
  const proj = readGame('projectile-basic');
  assert.ok(/viewW - marginPx|maxMetersRaw/.test(proj), 'projectile: visible clamp missing');
  for (const viewW of [280, 320, 480, 800]) {
    const r = R.projectileClampTargetX(viewW);
    assert.ok(r.inView, `projectile target out of view at viewW=${viewW}, x=${r.targetX}`);
    assert.ok(r.targetX <= viewW, `projectile targetX ${r.targetX} > viewW ${viewW}`);
  }

  console.log('unpassable-levels-audit: ok', {
    efield: { launchFrac, exploreAdaptive: true },
    photoelectric: { eMax: +eMax.toFixed(3), pool: pool.map((m) => m.name) },
    capacitorMissRate: mc.rate,
    pendulumEnv: env,
  });
}

function H_ok(W, eMax) {
  return W < eMax - 0.05;
}

module.exports = { run };

if (require.main === module) {
  run();
}
