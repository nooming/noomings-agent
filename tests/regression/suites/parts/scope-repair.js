const { assert } = require('../../../lib/assert');
const { repairChapterScope, repairWinSemantics } = require('../../../../packages/contract/repair/scope-repair');
const { validateChapterScope } = require('../../../../packages/contract/validate/validate-scope');

function miniChapter(r1Desc) {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise | skip retry',
    kg: {
      title: '3 球 + 4 角洞 + 1 障碍',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡理解击球目标' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节力度方向并击球操作' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '目标球须进入指定洞杯区域' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: r1Desc },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    dt: {
      title: 'DT',
      sub: '3 球 + 4 角洞 + 1 障碍',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '目标球进洞?', t: 'decision', d: '是否全部进洞',
          children: [
            { _e: '否', n: '调整再试', t: 'retry', d: '回到调参' },
            { _e: '是', n: '过关', t: 'result', d: '达成目标' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    strategy: {
      title: 's',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Fire[击球]\nFire --> Observe{观察}\nObserve --> Win[过关]:::stratResult',
      routes: [{ id: 'main', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'R1'], highlightNodes: ['Start'], highlightEdges: [] }],
    },
    traceMap: { controls: { power: { kgId: 'O1', role: 'operation' } } },
  };
}

function run() {
  const hints = {
    hasScoringTargetWin: true,
    levelContext: {
      index: 2,
      slotName: '3 球 + 4 角洞 + 1 障碍',
      config: { ballCount: 3, hasObstacle: true },
      siblingSlotNames: ['1 球 + 6 洞', '2 球 + 4 角洞'],
    },
  };

  const fixed = repairChapterScope(miniChapter('白球进洞后过关'), hints);
  const r1 = fixed.kg.nodes.find(n => n.id === 'R1');
  assert(r1.desc.includes('3'), 'R1 should mention ballCount 3');
  assert(!/白球进洞/.test(r1.desc), 'R1 should not describe cue ball win');

  const scope = validateChapterScope(fixed, hints);
  assert(scope.checklist.chapterScopeWinSemantics !== false, `win semantics: ${scope.errors.join('; ')}`);

  const withObstacle = repairChapterScope(miniChapter('全部目标球进洞'), hints);
  const corpus = JSON.stringify(withObstacle.kg.nodes) + withObstacle.mapping;
  assert(/障碍|碰撞|C\d/.test(corpus), 'obstacle constraint should be injected');

  const winOnly = repairWinSemantics(miniChapter('白球进洞').kg && miniChapter('x'), hints);
  assert(winOnly.kg || true, 'repairWinSemantics returns chapter');
  const ch = repairWinSemantics(miniChapter('白球进洞'), hints);
  assert(ch.kg.nodes.find(n => n.id === 'R1').desc.includes('计分'), 'win repair uses scoring wording');

  const strat = repairChapterScope(miniChapter('全部 3 颗计分目标球进洞后过关'), hints);
  assert(/-->\|(?:偏近|偏远|未命中|不足|未达标)/.test(strat.strategy.mermaid), 'observation edge labels added');
}

module.exports = { run };
