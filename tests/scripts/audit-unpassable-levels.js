/** CLI: node tests/scripts/audit-unpassable-levels.js [--json] */
'use strict';

const path = require('path');
const fs = require('fs');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const R = require('../lib/unpassable-reachability');

const asJson = process.argv.includes('--json');
const REPORT_JSON = path.join(getPackagesRoot(), 'reports', 'unpassable-levels-report.json');

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    efield: {},
    photoelectric: {},
    capacitor: {},
    pendulum: {},
    projectile: {},
  };

  const launchFrac = 0.38;
  const exploreFrac = 0.62;
  report.efield.explore = {};
  for (const [W, H] of [[500, 360], [700, 420], [400, 300]]) {
    report.efield.explore[`${W}x${H}`] = R.efieldExploreReachable(W, H, {
      launchYFrac: launchFrac,
      exploreTargetYFrac: exploreFrac,
    });
  }

  const materials = [
    { name: '钠', W: 2.3 },
    { name: '钾', W: 2.0 },
    { name: '铯', W: 1.9 },
    { name: '锌', W: 3.3 },
    { name: '铜', W: 4.5 },
    { name: '银', W: 4.3 },
  ];
  const eMax = R.photoelectricEmax(10);
  const pool = R.photoelectricChallengePool(materials, { fMaxUnits: 10, eps: 0.08 });
  const poolNames = new Set(pool.map((m) => m.name));
  report.photoelectric = {
    eMax,
    pool: pool.map((m) => m.name),
    filteredOut: materials.filter((m) => !poolNames.has(m.name)).map((m) => m.name),
  };

  report.capacitor = R.capacitorMonteCarloMissRate(1000);
  report.pendulum = R.pendulumLandingEnvelope();
  report.projectile = [280, 320, 480, 800].map((w) => ({ viewW: w, ...R.projectileClampTargetX(w) }));

  // Also run the suite part for structural asserts
  const suite = require('../regression/suites/parts/unpassable-levels-audit');
  suite.run();

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('audit-unpassable-levels: OK');
    console.log('  photoelectric pool:', report.photoelectric.pool.join(', '));
    console.log('  capacitor miss rate:', report.capacitor.rate);
    console.log('  pendulum envelope:', report.pendulum);
    console.log('  report:', REPORT_JSON);
  }
}

main();
