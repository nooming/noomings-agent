const { assert } = require('../../../lib/assert');
const fs = require('fs');
const path = require('path');
const {
  extractGameHints,
  buildLevelGameHints,
  inferLevelActiveToggles,
} = require('../../../../packages/generate/hints');
const { getGamesLegacyRoot } = require('../../../../packages/shared/data-paths');

const GOLF_HTML = path.join(getGamesLegacyRoot(), '高尔夫球斜抛入洞.html');

function run() {
  if (!fs.existsSync(GOLF_HTML)) {
    console.log('level-active-toggles-check: skip (golf HTML not in data/games/legacy)');
    return;
  }
  const html = fs.readFileSync(GOLF_HTML, 'utf8');
  const base = extractGameHints([{ path: 'golf.html', content: html }]);
  assert(base.hasCoupledControls, 'global coupled should be true for golf HTML');
  assert(base.levelCount === 6, `expected 6 levels, got ${base.levelCount}`);

  const l1 = buildLevelGameHints(base, base.levels[0]);
  assert(!l1.hasCoupledControls, 'L1 should disable coupled');
  assert(l1.modeToggleCount === 0, 'L1 modeToggleCount 0');
  assert(!l1.levelContext.activeToggles.airResistance, 'L1 no air');
  assert(!l1.levelContext.activeToggles.planetSelect, 'L1 no planet');

  const l2 = buildLevelGameHints(base, base.levels[1]);
  assert(l2.hasCoupledControls, 'L2 coupled');
  assert(l2.levelContext.activeToggles.airResistance, 'L2 air on');

  const l3 = buildLevelGameHints(base, base.levels[2]);
  assert(!l3.hasCoupledControls, 'L3 no checkbox coupled');
  assert(l3.levelContext.activeToggles.planetSelect, 'L3 planet on');
  assert(l3.levelContext.envSelectMode, 'L3 envSelectMode');

  const l4 = buildLevelGameHints(base, base.levels[3]);
  assert(!l4.hasCoupledControls, 'L4 no coupled');

  const l5 = buildLevelGameHints(base, base.levels[4]);
  assert(l5.hasCoupledControls, 'L5 coupled air');

  const l6 = buildLevelGameHints(base, base.levels[5]);
  assert(l6.levelContext.activeToggles.planetSelect, 'L6 planet');

  assert(inferLevelActiveToggles(html, 2).airResistance, 'infer L2 air');
  assert(!inferLevelActiveToggles(html, 1).airResistance, 'infer L1 no air');

  console.log('level-active-toggles-check: OK');
}

module.exports = { run };
