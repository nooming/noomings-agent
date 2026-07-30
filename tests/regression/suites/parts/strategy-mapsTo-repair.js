const { assert } = require('../../../lib/assert');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { repairStrategyMapsTo, pruneLevelKgNoise } = require('../../../../packages/contract/repair/scope-repair');
const { repairStratInvalidBranchPlacement } = require('../../../../packages/contract/repair/coupled-strategy-repair');
const { validateChapterQuality } = require('../../../../packages/contract/validate/validate-quality');
const { collectOffModeReachableIds } = require('../../../../packages/contract/strategy/strategy-rules');
const { isProgressCheckpointDecision } = require('../../../../packages/contract/repair/dt-branch-normalize');

function makeCollapsedOpsChapter() {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise |',
    kg: {
      title: '测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡理解目标' },
        { id: 'O1', label: '调参', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调整参数并锁定瞄准' },
        { id: 'O2', label: '击球', group: 'operation', layer: 'play', level: 1, r: 22, desc: '施加电场击球操作' },
        { id: 'O3', label: 'O3', group: 'operation', layer: 'play', level: 1, r: 22, desc: '多余操作三' },
        { id: 'O4', label: 'O4', group: 'operation', layer: 'play', level: 1, r: 22, desc: '多余操作四' },
        { id: 'O5', label: 'O5', group: 'operation', layer: 'play', level: 1, r: 22, desc: '多余操作五' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '判定是否达标' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '达成本关目标后过关' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'O2', tp: 'method' },
        { s: 'O2', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    dt: {
      title: 'DT',
      sub: '测试',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '全部进洞?', t: 'decision', d: '末级达标',
          children: [
            { _e: '否', n: '重试', t: 'retry', d: '调整后再试' },
            { _e: '是', n: '过关', t: 'result', d: '达成' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    strategy: {
      title: '策略',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Fire[操作]\nFire --> Observe{观察?}:::stratCond\nObserve --> Win[过关]:::stratResult',
      routes: [{
        id: 'route-a',
        label: '途径A',
        mapsTo: ['O1', 'O3', 'O4', 'O5', 'C1', 'R1'],
        highlightNodes: ['Start', 'Fire', 'Observe', 'Win'],
        highlightEdges: [],
      }],
    },
    traceMap: { controls: { action: { kgId: 'O2', role: 'operation' } } },
  };
}

function makeCoupledInvalidChapter() {
  const mermaid = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Mode{模式开启?}:::stratCond',
    'Mode -->|关闭| StrategySelect{选择?}:::stratCond',
    'Mode -->|开启| DragInvalid[无效参数]:::stratInvalid',
    'DragInvalid --> Mode',
    'StrategySelect --> RouteA[途径A]',
    'RouteA --> Fire[操作]',
    'Fire --> Win[过关]:::stratResult',
  ].join('\n');
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise |',
    kg: {
      title: '耦合测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '操作' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '约束' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '过关' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    dt: { title: 'DT', sub: 's', tree: { n: '根', t: 'root', d: '进入', children: [] } },
    winSync: { title: '过关', sub: 's' },
    strategy: { title: 's', mermaid, routes: [{ id: 'main', label: '主', mapsTo: ['P1', 'O1', 'R1'], highlightNodes: ['Start'], highlightEdges: [] }] },
    traceMap: { controls: {} },
  };
}

function run() {
  const hints = {
    levelContext: { focusMode: 'challenge', index: 2, config: { ballCount: 3 } },
    tunableInputCount: 3,
    actionTriggerControlIds: ['action'],
  };

  const pruned = pruneLevelKgNoise(makeCollapsedOpsChapter(), hints);
  const validIds = new Set(pruned.kg.nodes.map(n => n.id));
  assert(!validIds.has('O3') && !validIds.has('O4'), 'extra ops removed');
  for (const kid of pruned.strategy.routes[0].mapsTo) {
    assert(validIds.has(kid), `mapsTo ${kid} should be valid after prune`);
  }
  assert(!pruned.strategy.routes[0].mapsTo.includes('O3'), 'O3 removed from mapsTo');

  const manual = repairStrategyMapsTo(makeCollapsedOpsChapter(), new Map([
    ['O3', 'O1'], ['O4', 'O1'], ['O5', 'O2'],
  ]));
  assert(manual.strategy.routes[0].mapsTo.every(id => ['O1', 'O2', 'C1', 'R1'].includes(id)), 'manual mapsTo repair');

  assert(isProgressCheckpointDecision({ t: 'decision', n: '目标球进洞?', d: '' }), 'single pocket is progress checkpoint');
  assert(!isProgressCheckpointDecision({ t: 'decision', n: '3 颗全部进洞?', d: '' }), 'terminal goal is not progress checkpoint');

  const pipelineTree = {
    n: '根', t: 'root', d: '进入',
    children: [
      {
        n: '目标球进洞?', t: 'decision', d: '过程',
        children: [
          { _e: '是', n: '得分', t: 'step', d: '继续' },
          { _e: '否', n: '继续', t: 'step', d: '下一检查' },
        ],
      },
      {
        n: '全部进洞?', t: 'decision', d: '末级',
        children: [
          { _e: '否', n: '重试', t: 'retry', d: '调整' },
          { _e: '是', n: '过关', t: 'result', d: '达成' },
        ],
      },
    ],
  };
  const pipelineChapter = {
    ...makeCollapsedOpsChapter(),
    dt: { title: 'DT', sub: 's', tree: pipelineTree },
    strategy: {
      title: 's',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Fire[操作]\nFire --> Observe{观察结果?}:::stratCond\nObserve -->|进洞| CheckGoal{达标?}:::stratCond\nObserve -->|未进| Adjust[调整]\nAdjust --> Fire\nCheckGoal -->|是| Win[过关]:::stratResult',
      routes: [{ id: 'main', label: '主', mapsTo: ['P1', 'O1', 'C1', 'R1'], highlightNodes: ['Start'], highlightEdges: [] }],
    },
  };
  const enrichedPipeline = enrichChapterContract(pipelineChapter, hints, []);
  const qPipeline = validateChapterQuality(enrichedPipeline, hints);
  assert(
    !qPipeline.errors.some(e => /目标球进洞.*否-branch should be retry/.test(e)),
    `progress checkpoint should pass: ${qPipeline.errors.join('; ')}`,
  );

  const coupledHints = { hasCoupledControls: true, modeToggleCount: 1 };
  const coupled = makeCoupledInvalidChapter();
  const offBefore = collectOffModeReachableIds(coupled.strategy.mermaid);
  assert(!offBefore.has('DragInvalid'), 'DragInvalid misplaced before repair');
  const fixedCoupled = repairStratInvalidBranchPlacement(coupled, coupledHints);
  const offAfter = collectOffModeReachableIds(fixedCoupled.strategy.mermaid);
  assert(offAfter.has('DragInvalid'), 'DragInvalid moved to off branch');
  assert(
    /-->\|关闭\|\s*DragInvalid/.test(fixedCoupled.strategy.mermaid)
    || /-->\|否\|\s*DragInvalid/.test(fixedCoupled.strategy.mermaid),
    'invalid edge uses off label',
  );

  console.log('strategy-mapsTo-repair: OK');
}

module.exports = { run };
