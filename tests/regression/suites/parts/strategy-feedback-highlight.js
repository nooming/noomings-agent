const { assert } = require('../../../lib/assert');
const {
  expandRouteHighlight,
  parseStrategyMermaidEdges,
} = require('../../../../packages/shared/strategy-mermaid-parse.js');
const { compactStrategyMacroGraph, countNumberedParallelCopies } = require('../../../../packages/contract/strategy/strategy-compact');
const { repairStrategyRouteHighlights } = require('../../../../packages/contract/repair/strategy-route-repair');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');

const NUMBERED_PARALLEL_MERMAID = [
  'graph TD',
  'Start([开始]):::stratStart',
  'Start --> StrategySelect{选择?}:::stratCond',
  'StrategySelect -->|A| RouteA[途径A]',
  'StrategySelect -->|B| RouteB[途径B]',
  'RouteA --> Fire[操作]',
  'RouteB --> Fire2[操作2]',
  'Fire --> Observe{观察?}:::stratCond',
  'Fire2 --> Observe2{观察2?}:::stratCond',
  'Observe -->|未达标| AdjustFine[微调]',
  'Observe2 -->|未达标| AdjustFine2[微调2]',
  'AdjustFine --> Fire',
  'AdjustFine2 --> Fire2',
  'Observe -->|达标| CheckGoal{达标?}:::stratCond',
  'Observe2 -->|达标| CheckGoal2{达标2?}:::stratCond',
  'CheckGoal -->|否| Continue[继续]',
  'CheckGoal2 -->|否| Continue2[继续2]',
  'Continue --> Fire',
  'Continue2 --> Fire2',
  'CheckGoal -->|是| Win[过关]:::stratResult',
  'CheckGoal2 -->|是| Win2[过关]:::stratResult',
].join('\n');

function makeChapter(mermaid, routes) {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise |',
    kg: {
      title: '测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡理解目标' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '执行操作并观察结果变化' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '判定是否达到本关目标' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '达成本关 puzzle 目标后过关' },
      ],
      links: [{ s: 'P1', t: 'O1', tp: 'premise' }, { s: 'O1', t: 'C1', tp: 'premise' }, { s: 'C1', t: 'R1', tp: 'core' }],
    },
    dt: {
      title: 'DT', sub: '测试',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '达标?', t: 'decision', d: '判定',
          children: [
            { _e: '否', n: '重试', t: 'retry', d: '调整后再试' },
            { _e: '是', n: '过关', t: 'result', d: '达成' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    strategy: { title: '策略', sub: '策略', mermaid, routes },
    traceMap: { controls: { action: { kgId: 'O1', role: 'operation' } } },
  };
}

const ROUTE_A = {
  id: 'route-a',
  label: '途径A',
  mapsTo: ['P1', 'O1', 'C1', 'R1'],
  highlightNodes: ['Start', 'StrategySelect', 'RouteA', 'Fire', 'Observe', 'CheckGoal', 'Win'],
  highlightEdges: [
    ['Start', 'StrategySelect'], ['StrategySelect', 'RouteA'], ['RouteA', 'Fire'],
    ['Fire', 'Observe'], ['Observe', 'CheckGoal'], ['CheckGoal', 'Win'],
  ],
};

function run() {
  assert(countNumberedParallelCopies(NUMBERED_PARALLEL_MERMAID) >= 2, 'fixture has parallel copies');

  const exp = expandRouteHighlight(ROUTE_A, NUMBERED_PARALLEL_MERMAID, { resultKgIds: new Set(['R1']) });
  assert(exp.edgeKeys.has('Observe->AdjustFine'), 'Observe→AdjustFine highlighted');
  assert(exp.edgeKeys.has('AdjustFine->Fire'), 'AdjustFine→Fire highlighted');
  assert(exp.edgeKeys.has('CheckGoal->Continue'), 'CheckGoal→Continue highlighted');
  assert(exp.edgeKeys.has('Continue->Fire'), 'Continue→Fire highlighted');

  const hints = { levelContext: { focusMode: 'challenge', index: 1 } };
  const compacted = compactStrategyMacroGraph(
    makeChapter(NUMBERED_PARALLEL_MERMAID, [ROUTE_A, { ...ROUTE_A, id: 'route-b', highlightNodes: ['Start', 'StrategySelect', 'RouteB', 'Fire2', 'Observe2', 'CheckGoal2', 'Win2'] }]),
    hints,
  );
  const compactEdges = parseStrategyMermaidEdges(compacted.strategy.mermaid);
  assert(!compactEdges.some(e => e.from === 'Fire2' || e.to === 'Observe2'), 'numbered copies merged');
  assert(compactEdges.some(e => e.from === 'Fire' && e.to === 'Observe'), 'shared Fire→Observe');

  const repaired = repairStrategyRouteHighlights(compacted);
  const r0 = repaired.strategy.routes[0];
  assert(r0.highlightFailureBranches === true, 'highlightFailureBranches set');
  assert(r0.highlightNodes.includes('AdjustFine') || r0.highlightEdges.some(p => p[1] === 'AdjustFine'), 'Adjust persisted');

  const enriched = enrichChapterContract(
    makeChapter(NUMBERED_PARALLEL_MERMAID, [ROUTE_A]),
    hints,
    [{ path: 'stub.html', content: '<html></html>' }],
  );
  assert(enriched.strategy?.mermaid, 'enrich preserves strategy');

  console.log('strategy-feedback-highlight: OK');
}

module.exports = { run };
