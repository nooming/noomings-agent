const { assert } = require('../../../lib/assert');
const { validateChapterQuality } = require('../../../../packages/contract/validate/validate-quality');
const { normalizeDtChapter, normalizeDtBranchPolarity } = require('../../../../packages/contract/repair/dt-branch-normalize');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { loadHints, loadChapter } = require('../../../lib/fixture-loader');

const GENERIC_QUALITY_HINTS = loadHints('genericQuality');

function invertedFailureTree() {
  return {
    n: '进入',
    t: 'root',
    d: '…',
    children: [{
      n: '飞出边界?',
      t: 'decision',
      d: '…',
      children: [
        { _e: '否', n: '飞出重试', t: 'retry', d: '…' },
        { _e: '是', n: '过关', t: 'result', d: '…' },
      ],
    }],
  };
}

function buildMiniChapter(tree) {
  return {
    mapping: '| DT | KG | type | note |\n| --- | --- | --- | --- |',
    kg: {
      title: 't',
      sub: 's',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡开始游玩' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节参数并操作控件' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '主要约束判定条件说明' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '达成目标过关结果' },
        { id: 'S1', label: 'S1', group: 'core', layer: 'teach', level: 1, r: 22, desc: '教学要点一说明文字' },
        { id: 'S2', label: 'S2', group: 'core', layer: 'teach', level: 1, r: 22, desc: '教学要点二说明文字' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
        { s: 'S2', t: 'O1', tp: 'verify' },
      ],
    },
    dt: { title: 't', sub: 's', tree },
    winSync: { title: '过关', sub: 's' },
    strategy: {
      title: 's',
      sub: 's',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> A[主路径]\nA --> Win[过关]:::stratResult',
      routes: [
        { id: 'main', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'R1'], highlightNodes: ['Start', 'Win'], highlightEdges: [] },
        { id: 'alt', label: '补偿法', mapsTo: ['P1', 'O1', 'C1', 'R1'], warn: '注意未达标' },
      ],
    },
    traceMap: { controls: { param: { kgId: 'O1', role: 'operation' } } },
  };
}

function tier0DtPolarityUnit() {
  const tree = invertedFailureTree();
  const fixed = normalizeDtBranchPolarity(tree);
  const inner = fixed.children[0];
  const yesB = inner.children.find(c => c._e === '是');
  const noB = inner.children.find(c => c._e === '否');
  assert(yesB.t === 'retry', 'inverted failure: 是-branch -> retry');
  assert(noB.t === 'result', 'inverted failure: 否-branch -> result');
}

function tier1MiniChapterEnrich() {
  const miniChapter = buildMiniChapter(invertedFailureTree());
  const before = validateChapterQuality(miniChapter, GENERIC_QUALITY_HINTS);
  assert(
    before.errors.some(e => /failure decision.*是[- ]branch should be retry/.test(e)),
    `fixture has branch errors before normalize: ${before.errors.join('; ')}`,
  );

  const normalized = enrichChapterContract(normalizeDtChapter(miniChapter), GENERIC_QUALITY_HINTS, []);
  const after = validateChapterQuality(normalized, GENERIC_QUALITY_HINTS);
  assert(
    !after.errors.some(e => /failure decision.*branch/.test(e)),
    `branch errors remain: ${after.errors.filter(e => /decision/.test(e)).join('; ')}`,
  );
}

function tier2ParallelExitFixture() {
  const raw = loadChapter('judge', 'parallelExit');
  const enriched = enrichChapterContract(normalizeDtChapter(raw), GENERIC_QUALITY_HINTS, []);
  const q = validateChapterQuality(enriched, GENERIC_QUALITY_HINTS);

  assert(q.ok, `parallel-exit fixture quality failed: ${q.errors.join('; ')}`);
  assert(q.checklist.strategyFeedbackLoop, 'parallel-exit fixture feedback loop');
  assert(
    !q.errors.some(e => /decision.*branch/.test(e)),
    `parallel-exit DT branch errors: ${q.errors.filter(e => /decision/.test(e)).join('; ')}`,
  );

  const c2r1 = enriched.kg.links.find(l => l.s === 'C2' && l.t === 'R1');
  assert(c2r1?.tp === 'core', 'constraint→result link tp should be core after normalizeKgLinkTypes');

  assert(
    q.warnings.some(w => w.includes('嵌套') && w.includes('飞出边界')),
    'nested failure decision warning expected',
  );
}

function tier3DtFeedbackToOperation() {
  const hints = { ...GENERIC_QUALITY_HINTS, actionObserveLoop: true, minConstraints: 1, minNodes: 6 };
  const good = buildMiniChapter(invertedFailureTree());
  good.mapping = '| 调整 | O1 | operation | skip retry\n| --- | --- | --- | --- |';
  good.dt.tree.children[0].children[0].d = '回到调参重试';
  const qGood = validateChapterQuality(good, hints);
  assert(qGood.checklist.dtFeedbackToOperation === true, 'good retry to operation');

  const bad = buildMiniChapter(invertedFailureTree());
  bad.dt.tree.children[0].children[0].d = '检查下一约束';
  bad.dt.tree.children[0].children[0].n = '再查';
  const qBad = validateChapterQuality(bad, hints);
  assert(qBad.checklist.dtFeedbackToOperation === false, 'gate-only retry fails dtFeedbackToOperation');
}

function run() {
  tier0DtPolarityUnit();
  tier1MiniChapterEnrich();
  tier2ParallelExitFixture();
  tier3DtFeedbackToOperation();
  console.log('chapter-enrich-quality: OK');
}

module.exports = { run };
