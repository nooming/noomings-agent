const { assert } = require('../../../lib/assert');
const {
  countConstraintGateTypes,
  isParamGateLabel,
  isOutcomeGateText,
  slotRefContained,
} = require('../../../../packages/contract/classify/constraint-gate-classify');
const { validateChapterQuality } = require('../../../../packages/contract/validate/validate-quality');

function run() {
  const mixed = [
    { label: '飞出边界?', desc: '粒子是否越界' },
    { label: '参数在范围?', desc: '主参数须在滑条范围内' },
    { label: '命中目标?', desc: '是否击中挡板区域' },
  ];
  const counts = countConstraintGateTypes(mixed);
  assert(counts.outcomeGates === 2, `outcome gates: ${counts.outcomeGates}`);
  assert(counts.paramGates === 1, `param gates: ${counts.paramGates}`);

  const descOnlyParam = [
    { label: '坐标约束', desc: 'x 须在 520±50 范围内' },
    { label: '飞出边界?', desc: '是否飞出 canvas' },
  ];
  const descCounts = countConstraintGateTypes(descOnlyParam);
  assert(descCounts.paramGates === 0, 'desc 内「范围内」不得计 param');
  assert(descCounts.outcomeGates === 1, 'label 飞出边界 计 outcome');

  assert(isParamGateLabel('参数在范围?'), 'param label');
  assert(!isParamGateLabel('坐标约束'), 'non-param label');
  assert(isOutcomeGateText('飞出边界?', ''), 'outcome label');
  assert(isOutcomeGateText('', '命中挡板区域'), 'outcome desc when label empty');

  assert(slotRefContained('第3关：外部磁场', '第 3 关'), 'slot space normalize');
  assert(!slotRefContained('第1关', '第 3 关'), 'different levels');

  const chapter = {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise | skip retry',
    kg: {
      title: '测试关',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '操作' },
        { id: 'C1', label: '飞出边界?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '越界判定' },
        { id: 'C2', label: '参数在范围?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '参数 gate' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '过关结果' },
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
      sub: '测试',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '飞出边界?', t: 'decision', d: '越界',
          children: [
            { _e: '否', n: '继续', t: 'step', d: '…' },
            { _e: '是', n: '重试', t: 'retry', d: '…' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    strategy: {
      title: 's',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Observe{观察}:::stratCond\nObserve -->|出界| Adjust[调整]\nAdjust --> Fire[操作]\nFire --> Observe\nObserve -->|达标| Win[过关]:::stratResult',
      routes: [
        { id: 'main', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'C2', 'R1'], highlightNodes: ['Start'], highlightEdges: [] },
        { id: 'alt', label: '备选', mapsTo: ['P1', 'O1'], highlightNodes: ['Start'], highlightEdges: [] },
      ],
    },
    traceMap: { controls: { param: { kgId: 'O1', role: 'operation' } } },
  };

  const qGood = validateChapterQuality(chapter, {
    actionObserveLoop: true,
    minConstraints: 1,
    minNodes: 5,
    minTeachNodes: 0,
    minVerifyLinks: 0,
  });
  assert(qGood.checklist.dtOutcomeOriented === true, 'outcome >= param should pass');

  const qBad = validateChapterQuality({
    ...chapter,
    kg: {
      ...chapter.kg,
      nodes: [
        ...chapter.kg.nodes.filter(n => n.id !== 'C1'),
        { id: 'C1', label: '参数 A 在范围?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: 'A 范围' },
        { id: 'C3', label: '参数 B 在范围?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: 'B 范围' },
      ],
    },
  }, {
    actionObserveLoop: true,
    minConstraints: 1,
    minNodes: 6,
    minTeachNodes: 0,
    minVerifyLinks: 0,
  });
  assert(qBad.checklist.dtOutcomeOriented === false, 'param-only chain should fail');
}

module.exports = { run };
