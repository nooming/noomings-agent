const { assert } = require('../../../lib/assert');
/**
 * 关卡 config（ballCount/hasObstacle）与 scope/quality 回归。
 * npm run check:generate — suite: level-config-scope
 */
const { extractGameHints, buildLevelGameHints } = require('../../../../packages/generate/hints');
const { validateChapterScope } = require('../../../../packages/contract/validate/validate-scope');
const { validateChapterQuality } = require('../../../../packages/contract/validate/validate-quality');

const { challengeLevelsStub } = require('../../../lib/html-stubs');
const SCORING_WIN_STUB = `<!DOCTYPE html><html><body><script>
function isScoringBall(b) { return !b.isWhite; }
let remaining = 1;
if (remaining === 0) { /* win */ }
</script></body></html>`;

function goodChapter(title, r1desc, extraNodes = []) {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise | skip retry',
    kg: {
      title,
      sub: title,
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡开始闯关' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节参数并提交测试' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: 'scoring 目标是否达标判定' },
        { id: 'C2', label: 'C2', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '主目标是否越界判定' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: r1desc },
        ...extraNodes,
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'C2', tp: 'core' },
        { s: 'C2', t: 'R1', tp: 'core' },
      ],
    },
    dt: {
      title: 'DT',
      sub: title,
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '达标?', t: 'decision', d: 'scoring 目标达标',
          children: [
            { _e: '否', n: '调整', t: 'retry', d: '回到调参' },
            { _e: '是', n: '过关', t: 'result', d: '过关' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    strategy: {
      title: 's',
      sub: 's',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Observe{观察达标?}:::stratCond\nObserve -->|否| Adjust[调整]\nAdjust --> Submit[提交]\nSubmit --> Observe\nObserve -->|是| Win[过关]:::stratResult',
      routes: [
        { id: 'main', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'C2', 'R1'], highlightNodes: ['Start', 'Observe', 'Adjust', 'Submit', 'Win'], highlightEdges: [] },
        { id: 'alt', label: '备选', mapsTo: ['P1', 'O1'], highlightNodes: ['Start'], highlightEdges: [] },
      ],
    },
    traceMap: { controls: { param: { kgId: 'O1', role: 'operation' } } },
  };
}

function run() {
  const stubText = challengeLevelsStub;
  const hints = extractGameHints([{ path: 'challenge-levels-stub.html', content: stubText }]);
  const level3 = hints.levels[2];
  assert(level3.config.ballCount === 3, 'level3 ballCount');
  assert(level3.config.hasObstacle === true, 'level3 hasObstacle');
  assert(level3.config.pocketIndices?.length === 2, 'level3 pocketIndices');

  const levelHints = buildLevelGameHints(hints, level3);
  assert(levelHints.levelContext.summary.includes('ballCount=3'), 'summary ballCount');
  assert(levelHints.levelContext.summary.includes('hasObstacle=true'), 'summary obstacle');

  const levelTitle = '第 3 关：ballCount=3, hasObstacle=true';
  const badWin = goodChapter(levelTitle, '主目标球达标即可过关');
  const scopeBad = validateChapterScope(badWin, levelHints);
  assert(scopeBad.errors.some(e => /white ball|白球|scoring\/target|主目标球/i.test(e)), 'reject primary-target win');

  const badObstacle = goodChapter(levelTitle, 'ballCount=3 全部 scoring 目标达标');
  const scopeObs = validateChapterScope(badObstacle, levelHints);
  assert(scopeObs.errors.some(e => /hasObstacle/i.test(e)), 'reject missing obstacle');

  const good = goodChapter(
    levelTitle,
    'ballCount=3 全部 scoring 目标达标且绕过障碍物',
    [{ id: 'C3', label: '障碍碰撞?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '实体与矩形障碍物碰撞须反弹' }],
  );
  good.kg.links.push({ s: 'C2', t: 'C3', tp: 'core' }, { s: 'C3', t: 'R1', tp: 'core' });
  const scopeGood = validateChapterScope(good, levelHints);
  assert(scopeGood.errors.length === 0, `scope good: ${scopeGood.errors.join('; ')}`);

  const scoringHints = extractGameHints([{ path: 'scoring-win-stub.html', content: SCORING_WIN_STUB }]);
  assert(scoringHints.hasScoringTargetWin === true, 'detectScoringTargetWin');

  const paramGateChapter = goodChapter('测试关', '1 个 scoring 目标达标');
  paramGateChapter.kg.nodes = paramGateChapter.kg.nodes.filter(n => !['C2'].includes(n.id));
  paramGateChapter.kg.nodes.push(
    { id: 'C2', label: '参数 A 在范围?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '参数 A 须在范围内' },
    { id: 'C3', label: '参数 B 在范围?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '参数 B 须在范围内' },
  );
  paramGateChapter.kg.links = [
    { s: 'P1', t: 'O1', tp: 'premise' },
    { s: 'O1', t: 'C1', tp: 'method' },
    { s: 'C1', t: 'C2', tp: 'core' },
    { s: 'C2', t: 'C3', tp: 'core' },
    { s: 'C3', t: 'R1', tp: 'core' },
  ];
  const qBad = validateChapterQuality(paramGateChapter, { ...scoringHints, minConstraints: 1, minNodes: 6, minTeachNodes: 0, minVerifyLinks: 0 });
  assert(qBad.checklist.dtOutcomeOriented === false, 'param gate chain should fail dtOutcomeOriented');

  const toggleChapter = goodChapter('测试关', '1 个 scoring 目标达标');
  toggleChapter.kg.nodes.push({
    id: 'C4', label: '辅助线开关?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '须开启辅助线',
  });
  toggleChapter.kg.links.push({ s: 'C2', t: 'C4', tp: 'core' }, { s: 'C4', t: 'R1', tp: 'core' });
  const qToggle = validateChapterQuality(toggleChapter, {
    ...scoringHints,
    optionalUiToggleIds: ['toggleGuideBtn'],
    optionalToggleWinCoupled: { toggleGuideBtn: false },
    minConstraints: 1,
    minNodes: 6,
    minTeachNodes: 0,
    minVerifyLinks: 0,
  });
  assert(qToggle.checklist.optionalToggleNotConstraint === false, 'aux toggle constraint should fail');

  console.log('level-config-scope-check: ok');
}

module.exports = { run };
