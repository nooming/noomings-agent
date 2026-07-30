const { assert } = require('../../../lib/assert');
/** CLI: level-detect regression */
const {
  configArrayStub,
  selectThreeStub,
  selectManyStub,
  branchStub,
  challengeLevelsStub,
} = require('../../../lib/html-stubs');
const { detectLevels } = require('../../../../packages/generate/level-detect/index');
const { extractGameHints, buildLevelGameHints } = require('../../../../packages/generate/hints');
const { validateChapterScope } = require('../../../../packages/contract/validate/validate-scope');

function readSources(content, name) {
  return [{ path: name, content }];
}

function run() {
  const stub = detectLevels(configArrayStub);
  assert(stub.hasMultipleLevels, 'stub should detect multiple levels');
  assert(stub.levelCount >= 2, `stub levelCount >= 2, got ${stub.levelCount}`);
  assert(stub.levels[0].slotName === '入门', `first slotName 入门, got ${stub.levels[0].slotName}`);
  assert(stub.levels[1].slotName === '进阶', `second slotName 进阶, got ${stub.levels[1].slotName}`);
  assert(stub.levels[2].isFreeMode, 'third level should be free mode');
  assert(stub.levels[2].slotName === '自由探索', `free mode slotName, got ${stub.levels[2].slotName}`);
  assert(stub.levels[0].config.locked?.includes('speed'), 'locked params parsed');
  assert(stub.detectionSource?.includes('configArray'), `stub detectionSource configArray, got ${stub.detectionSource}`);

  const hints = extractGameHints(readSources(configArrayStub, 'multi-level-detect-stub.html'));
  assert(hints.hasMultipleLevels, 'extractGameHints hasMultipleLevels');
  assert(hints.levelCount === 3, `hints levelCount 3, got ${hints.levelCount}`);
  assert(hints.detectionSource?.includes('configArray'), 'hints detectionSource');

  const levelHints = buildLevelGameHints(hints, hints.levels[1]);
  assert(levelHints.levelContext?.slotName === '进阶', 'buildLevelGameHints slotName');
  assert(levelHints.levelContext?.summary?.includes('targetX=200'), 'level context summary');
  assert(levelHints.levelContext?.siblingSlotNames?.includes('入门'), 'siblingSlotNames includes 入门');
  assert(levelHints.levelContext?.focusMode === 'challenge', 'focusMode challenge for indexed level');

  const scopeLeak = validateChapterScope(
    { kg: { title: '进阶', sub: 'x' }, strategy: { mermaid: 'graph TD\nStart --> 入门\n', routes: [] } },
    levelHints,
  );
  assert(scopeLeak.errors.some(e => /sibling level/.test(e)), 'scope catches sibling leak in strategy');

  const scopeOk = validateChapterScope(
    { kg: { title: '进阶关', sub: '进阶' }, dt: { sub: '进阶' }, strategy: { mermaid: 'graph TD\nStart --> Win', routes: [] } },
    levelHints,
  );
  assert(scopeOk.errors.length === 0, `scope ok for matching chapter: ${scopeOk.errors.join('; ')}`);

  const selectStub = detectLevels(selectThreeStub);
  assert(selectStub.hasMultipleLevels, 'select stub multiple levels');
  assert(selectStub.levelCount === 3, `select stub count 3, got ${selectStub.levelCount}`);
  assert(selectStub.detectionSource?.includes('selectOptions'), `select source, got ${selectStub.detectionSource}`);
  assert(selectStub.levels[0].slotName.includes('入门'), `select slotName, got ${selectStub.levels[0].slotName}`);
  assert(selectStub.levels[2].isFreeMode, 'select stub free mode');

  const selectManyResult = detectLevels(selectManyStub);
  assert(selectManyResult.levelCount === 6, `select-many stub 6 levels, got ${selectManyResult.levelCount}`);
  assert(selectManyResult.detectionSource?.includes('selectOptions'), `select-many source, got ${selectManyResult.detectionSource}`);
  assert(selectManyResult.levels[0].slotName.includes('变体 1'), `select-many slotName, got ${selectManyResult.levels[0].slotName}`);

  const branchResult = detectLevels(branchStub);
  assert(branchResult.hasMultipleLevels, 'branch stub multiple levels');
  assert(branchResult.levelCount === 3, `branch stub count 3, got ${branchResult.levelCount}`);
  assert(
    branchResult.detectionSource?.includes('branchSwitch') || branchResult.detectionSource?.includes('uiTotal'),
    `branch source, got ${branchResult.detectionSource}`,
  );

  const challengeStub = detectLevels(challengeLevelsStub);
  assert(challengeStub.hasMultipleLevels, 'challenge stub multiple levels');
  assert(challengeStub.levelCount === 3, `challenge stub count 3, got ${challengeStub.levelCount}`);
  assert(challengeStub.detectionSource?.includes('configArray'), `challenge source, got ${challengeStub.detectionSource}`);
  assert(challengeStub.levels[0].config.ballCount === 1, 'challenge stub ballCount L1');
  assert(challengeStub.levels[2].config.hasObstacle === true, 'challenge stub L3 obstacle');
  assert(Array.isArray(challengeStub.levels[0].config.pocketIndices), 'challenge stub pocketIndices');

  console.log('level-detect-check: OK');
}

module.exports = { run };
