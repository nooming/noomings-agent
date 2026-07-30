const { assert } = require('../../../lib/assert');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { buildPlayPathMapsTo } = require('../../../../packages/contract/repair/strategy-mapsTo-repair');
const { orderedPlayPathIds } = require('../../../../packages/contract/graph/play-graph');

function makeChapter() {
  return {
    mapping: '| DT | KG | type |\n| 调参 | O1 | operation | play |\n| 模式 | Cenv | constraint | env |',
    kg: {
      title: '测试',
      sub: '测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入' },
        { id: 'Cenv', label: '模式开启', group: 'constraint', layer: 'play', level: 1, r: 22, desc: '环境模式设定' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '操作' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '结果判定' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '过关' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'Cenv', tp: 'premise' },
        { s: 'Cenv', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    dt: {
      title: 'DT', sub: '测试',
      tree: {
        n: '模式开启?', t: 'decision', d: '环境',
        children: [
          { _e: '否', n: '关', t: 'step', d: '关态', children: [] },
          {
            _e: '是', n: '流程', t: 'step', d: '开态',
            children: [{
              n: '达标?', t: 'decision', d: '判定',
              children: [
                { _e: '否', n: '重试', t: 'retry', d: '再试' },
                { _e: '是', n: '过关', t: 'result', d: '达标' },
              ],
            }],
          },
        ],
      },
    },
    winSync: { title: '过关', sub: 's' },
    traceMap: { controls: { modeToggle: { kgId: 'Cenv', role: 'operation' }, 'input-a': { kgId: 'O1', role: 'operation' } } },
    strategy: {
      title: '策略', sub: '策略',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Env{模式?}:::stratCond\nEnv --> StrategySelect{选择?}:::stratCond\nStrategySelect -->|控制变量法| CtrlAdj[调参]\nStrategySelect -->|多滑条盲调| BlindAdj[盲调]',
      routes: [
        { id: 'main', label: '控制变量法', mapsTo: ['O1', 'C1', 'P1', 'R1'], highlightNodes: ['Start'], highlightEdges: [] },
        { id: 'trap', label: '多滑条盲调', mapsTo: ['R1', 'O1', 'C1'], warn: '同时调节多个滑条效率低、难归因，不如每次只动一个变量', highlightNodes: ['Start'], highlightEdges: [] },
      ],
    },
  };
}

function run() {
  const hints = {
    sliderControlIds: ['input-a', 'input-b'],
    variableKindSummary: { sliderCount: 2, discreteCount: 0 },
    minStrategyRoutes: 2,
  };

  const enriched = enrichChapterContract(makeChapter(), hints, []);
  const path = orderedPlayPathIds(enriched.kg.nodes, enriched.kg.links);
  assert(path.indexOf('Cenv') < path.indexOf('O1'), 'enrich fixes env before O1');

  const main = enriched.strategy.routes.find(r => r.id === 'main');
  assert(main.mapsTo[0] === 'P1', 'main mapsTo starts at P1');
  assert(main.mapsTo.indexOf('Cenv') < main.mapsTo.indexOf('O1'), 'main mapsTo env before O1');

  const expected = buildPlayPathMapsTo(enriched, { includeResult: true });
  assert(main.mapsTo.join(',') === expected.join(','), 'main mapsTo matches play path');

  const trap = enriched.strategy.routes.find(r => r.id === 'trap');
  assert(!trap.mapsTo.includes('R1'), 'trap omits result');

  console.log('strategy-kg-linkage-check: OK');
}

module.exports = { run };
