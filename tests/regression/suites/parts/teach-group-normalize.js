/**
 * Teach layer nodes with group=teach are normalized to core before validateChapter.
 * npm run check:contract — suite: teach-group-normalize
 */
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { validateChapter } = require('../../../../packages/contract');

function miniChapterWithBadTeachGroups() {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise |',
    kg: {
      title: '归一化测试',
      sub: 'teach group 修复',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡目标说明' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '主操作控件调节说明' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '第一约束须满足条件' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '达成过关结果节点' },
        { id: 'S1', label: 'S1', group: 'teach', layer: 'teach', level: 1, r: 20, desc: '教案要点一说明文字' },
        { id: 'S2', label: 'S2', group: 'teach', layer: 'teach', level: 2, r: 20, desc: '教案要点二说明文字' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
        { s: 'S2', t: 'O1', tp: 'verify' },
      ],
    },
    dt: {
      title: 'DT',
      sub: '单约束',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: 'C1?', t: 'decision', d: '约束',
          children: [
            { _e: '否', n: '重试', t: 'retry', d: '再试' },
            { _e: '是', n: '过关', t: 'result', d: '过关' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: '完成' },
    traceMap: { controls: { step_0: { kgId: 'O1', role: 'operation' } } },
    strategy: {
      title: '策略',
      sub: '测试',
      mermaid: 'graph TD\n  Start([开始]):::stratStart\n  Start --> A[主路径]\n  A --> Win[过关]:::stratResult',
      routes: [
        { id: 'main', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'R1'], highlightNodes: ['Start', 'Win'], highlightEdges: [] },
        { id: 'alt', label: '备选', mapsTo: ['P1'], highlightNodes: ['A'], highlightEdges: [] },
      ],
    },
  };
}

function run() {
  const raw = miniChapterWithBadTeachGroups();
  const before = validateChapter(raw);
  if (before.ok) {
    console.error('teach-group-normalize-check: expected raw chapter to fail structure');
    process.exit(1);
  }
  if (!before.errors.some(e => /S1.*invalid group|S2.*invalid group/.test(e))) {
    console.error('teach-group-normalize-check: unexpected errors', before.errors);
    process.exit(1);
  }

  const enriched = enrichChapterContract(raw, { tier: 'generic', minNodes: 6 });
  const s1 = enriched.kg.nodes.find(n => n.id === 'S1');
  const s2 = enriched.kg.nodes.find(n => n.id === 'S2');
  if (s1?.group !== 'core' || s2?.group !== 'core') {
    console.error('teach-group-normalize-check: expected S1/S2 group=core', s1?.group, s2?.group);
    process.exit(1);
  }

  const after = validateChapter(enriched);
  if (!after.ok) {
    console.error('teach-group-normalize-check: enrich后结构仍失败', after.errors);
    process.exit(1);
  }

  console.log('teach-group-normalize-check: OK');
}

module.exports = { run };
