const { assert } = require('../../../lib/assert');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');

function miniChapter(routes, mermaid, links) {
  return {
    mapping: '| DT | KG | type |\n| 调参 | O1 | operation | play |\n|---|---|---|',
    kg: {
      title: '测试',
      sub: '测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡理解调参目标与约束' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节多个滑条并执行操作' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '结果须达到目标约束方可过关' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '达成目标约束过关结果' },
        { id: 'S1', label: 'S1', group: 'core', layer: 'teach', level: 0, r: 22, desc: 'E = Ek + Ep' },
      ],
      links: links || [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
      ],
    },
    dt: {
      title: 'DT',
      sub: '测试',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: 'O1', t: 'step', d: '调节多个滑条并执行操作',
          children: [{
            n: '达标?', t: 'decision', d: '是否达标',
            children: [
              { _e: '否', n: '重试', t: 'retry', d: '再试' },
              { _e: '是', n: '过关', t: 'result', d: '达标' },
            ],
          }],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    traceMap: {
      controls: {
        'input-a': { kgId: 'O1', role: 'operation' },
        'input-b': { kgId: 'O1', role: 'operation' },
      },
    },
    inquiryScript: {
      summary: '测试',
      knowledgePoints: [{ id: 'KP1', label: '测试点', formulas: ['E = Ek + Ep'], mapsToKg: ['S1'] }],
      adjustmentVariables: [
        { id: 'AV1', controlId: 'input-a', label: '参数A', priorityRank: 1, monotonicity: 'monotone', mapsToKg: 'O1' },
        { id: 'AV2', controlId: 'input-b', label: '参数B', priorityRank: 2, monotonicity: 'monotone', mapsToKg: 'O1' },
      ],
      confoundingVariables: [],
      outputVariables: [{ id: 'OV1', label: '过关结果', mapsToKg: 'R1' }],
      inquiryFlow: ['KP1', 'AV1', 'AV2'],
    },
    strategy: {
      title: '策略',
      sub: '策略',
      mermaid: mermaid || [
        'graph TD',
        'Start([开始]):::stratStart --> StrategySelect{选择?}:::stratCond',
        'StrategySelect -->|单变量·参数A| AdjustA[调A]',
        'StrategySelect -->|单变量·参数B| AdjustB[调B]',
        'StrategySelect -->|多参盲调| Trap[盲调]',
        'AdjustA --> Fire[测]',
        'AdjustB --> Fire',
        'Trap --> Fire',
        'Fire --> Observe{观察?}:::stratCond',
        'Observe -->|偏低| AdjustA',
        'Observe -->|达标| Win[过关]:::stratResult',
      ].join('\n'),
      routes,
    },
  };
}

function run() {
  const hints = {
    sliderControlIds: ['input-a', 'input-b', 'input-c'],
    variableKindSummary: { sliderCount: 3, discreteCount: 0 },
    minStrategyRoutes: 2,
  };

  const bare = miniChapter([
    { id: 'alt', label: '盲调', mapsTo: ['P1', 'O1', 'R1'], highlightNodes: ['Start'], highlightEdges: [] },
    { id: 'main_single_1', label: '单变量·b', mapsTo: ['P1', 'O1', 'R1'], highlightNodes: ['Start'], highlightEdges: [] },
  ]);
  const enriched = enrichChapterContract(bare, hints, []);
  const routes = enriched.strategy?.routes || [];
  assert(routes.some(r => r.id === 'main'), 'repair adds main id');
  // Multi-AV: keep distinct 单变量·{label} routes (meeting: 按变量拆分子分支)
  assert(routes.filter(r => /单变量·/.test(r.label || '')).length >= 2, 'per-AV single-var routes kept');
  const trap = routes.find(r => r.id === 'trap' || /盲调|多参|多滑/.test(r.label || ''));
  assert(trap, 'repair adds trap route');
  assert(trap.warn && /难归因|混调|盲调/.test(trap.warn), 'trap has warn');

  const preferred = routes.filter(r => r.id !== 'trap' && r.tier !== 'suboptimal');
  const scores = preferred.map(r => r.score).filter(s => s != null);
  assert(scores.length >= 2 && new Set(scores).size >= 2, `differentiated scores: ${scores}`);

  const main = routes.find(r => r.id === 'main');
  assert(main.mapsTo[0] === 'P1' && main.mapsTo.includes('O1'), 'mapsTo ordered P1→O1→…');

  const skip = enrichChapterContract(bare, { sliderControlIds: ['input-a'], variableKindSummary: { sliderCount: 1 } }, []);
  assert((skip.strategy?.routes || []).length <= 3 || skip.strategy.routes[0].id === 'alt', 'single slider no full multi-AV repair');

  console.log('strategy-single-var-repair-check: OK', {
    routes: routes.map(r => `${r.label}@${r.score}`),
  });
}

module.exports = { run };
