const { assert } = require('../../../lib/assert');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { countSemanticStrategyRoutes } = require('../../../../packages/generate/strategy-route-plan');

function run() {
  const hints = {
    sliderControlIds: ['input-a', 'input-b', 'input-c'],
    variableKindSummary: { sliderCount: 3 },
    minStrategyRoutes: 4,
    tunableInputCount: 5,
    modeToggleCount: 0,
    hasCoupledControls: false,
    sourceComplexity: 'moderate',
  };

  const chapter = {
    mapping: '| DT | KG |\n| x | O1 | operation |',
    kg: {
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '' },
        { id: 'O1', label: '调参', group: 'operation', layer: 'play', level: 1, r: 22, desc: '' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    strategy: {
      mermaid: [
        'graph TD',
        'Start([开始]):::stratStart',
        'StrategySelect{选择?}:::stratCond',
        'StrategySelect -->|控制变量法：固定其余滑条，每次只调一项，观察反馈再迭代| Tune1',
        'StrategySelect -->|多滑条盲调| Tune1',
        'Tune1[调] --> Adjust1[调]',
        'Adjust1 --> Fire1[射]',
        'Fire1 --> Observe1{观察?}:::stratCond',
        'Observe1 -->|偏近| Adjust1',
      ].join('\n'),
      routes: [
        {
          id: 'main',
          label: '控制变量法：固定其余滑条，每次只调一项（a/b 等），观察反馈再迭代',
          mapsTo: ['P1', 'O1', 'C1', 'R1'],
          highlightNodes: ['Start', 'StrategySelect'],
        },
        {
          id: 'main_observe',
          label: '观察反馈法',
          mapsTo: ['P1', 'O1', 'C1', 'R1'],
          highlightNodes: ['Start'],
        },
        {
          id: 'trap',
          label: '多滑条盲调',
          tier: 'suboptimal',
          warn: '难归因',
          mapsTo: ['P1', 'O1', 'C1'],
          highlightNodes: ['Start'],
        },
      ],
    },
    dt: { tree: { n: '根', t: 'step', children: [] } },
    traceMap: { controls: { a: { kgId: 'O1', role: 'operation' } } },
  };

  const enriched = enrichChapterContract(chapter, hints, []);
  const routes = enriched.strategy.routes;
  assert(!routes.some(r => /观察反馈法/.test(r.label)), 'dedupe observe route');
  assert(routes.some(r => r.id === 'main' && /控制变量：每次只改一项/.test(r.label)), 'short main label');
  assert(enriched.strategy.mermaid.includes('控制变量：每次只改一项'), 'mermaid label synced');

  const semantic = countSemanticStrategyRoutes(enriched, { ...hints, minStrategyRoutes: 2 });
  assert(semantic >= 2, `semantic routes ${semantic}`);

  console.log('strategy-min-routes-repair: OK');
}

module.exports = { run };
