const { assert } = require('../../../lib/assert');
/**
 * 通用课件：traceMap 推断与非法 kgId 清洗。
 * npm run check:generate — suite: trace-map-infer
 */
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { validateChapter } = require('../../../../packages/contract');
const { extractGameHints } = require('../../../../packages/generate/hints');

/** 内联：多滑条 + HUD 元素，无 irrelevant 信号（测 traceMap 推断） */
const MULTI_SLIDER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>多滑条 HUD 测试页</title></head>
<body>
<h1>多滑条调参</h1>
<canvas id="gameCanvas" width="800" height="500"></canvas>
<div id="coordTooltip"></div>
<div id="bottomHint">调节参数使结果达标</div>
<div id="hud-time">0</div>
<div id="hud-speed">0</div>
<div id="hud-radius">0</div>
<div id="hud-score">0</div>
<script>
const paramInputs = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
paramInputs.forEach(key => {
  document.body.insertAdjacentHTML('beforeend',
    '<label>' + key + '</label><input type="range" id="input-' + key + '" min="0" max="100" value="50">');
});
function readParams() {
  return Object.fromEntries(paramInputs.map(k => [k, document.getElementById('input-' + k).value]));
}
document.getElementById('gameCanvas').addEventListener('click', () => { readParams(); });
</script>
</body>
</html>`;

function miniChapterNoTraceMap() {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise |',
    kg: {
      title: '多滑条推断测试',
      sub: '通用推断测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡并理解调参目标' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节多组 range 滑条参数' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '结果须达到目标约束方可过关' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '达成目标约束过关结果' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    dt: {
      title: 'DT',
      sub: '达标',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '达标?', t: 'decision', d: '是否达到目标',
          children: [
            { _e: '否', n: '重试', t: 'retry', d: '调整参数再试' },
            { _e: '是', n: '过关', t: 'result', d: '达到目标' },
          ],
        }],
      },
    },
    winSync: { title: '达到目标', sub: '过关' },
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

/** 模拟 LLM 将 HUD 映射到不存在的 I1–I12 */
function miniChapterBadTraceMap() {
  const base = miniChapterNoTraceMap();
  const badControls = {
    gameCanvas: { kgId: 'I1', role: 'irrelevant' },
    coordTooltip: { kgId: 'I2', role: 'irrelevant' },
    bottomHint: { kgId: 'I3', role: 'irrelevant' },
    targetX: { kgId: 'I4', role: 'irrelevant' },
    targetY: { kgId: 'I5', role: 'irrelevant' },
    targetH: { kgId: 'I6', role: 'irrelevant' },
    btnExitExplore: { kgId: 'I7', role: 'irrelevant' },
    levelIndicator: { kgId: 'I8', role: 'irrelevant' },
    'hud-time': { kgId: 'I9', role: 'irrelevant' },
    'hud-speed': { kgId: 'I10', role: 'irrelevant' },
    'hud-radius': { kgId: 'I11', role: 'irrelevant' },
    'hud-score': { kgId: 'I12', role: 'irrelevant' },
  };
  return { ...base, traceMap: { controls: badControls } };
}

function runCaseA(hints, sources) {
  const expected = ['input-alpha', 'input-beta', 'input-gamma', 'input-delta', 'input-epsilon'];
  const raw = miniChapterNoTraceMap();
  const before = validateChapter(raw);
  assert(!before.ok && before.errors.some(e => /traceMap missing/.test(e)), 'case A: raw should fail traceMap');

  const enriched = enrichChapterContract(raw, hints, sources);
  const controls = enriched.traceMap?.controls || {};
  for (const id of expected) {
    assert(controls[id]?.kgId === 'O1' && controls[id]?.role === 'operation', `case A: traceMap missing ${id}`);
  }
  const after = validateChapter(enriched);
  assert(after.ok, `case A structure failed: ${after.errors.join('; ')}`);
  return Object.keys(controls).length;
}

function runCaseB(hints, sources) {
  const expected = ['input-alpha', 'input-beta', 'input-gamma', 'input-delta', 'input-epsilon'];
  const raw = miniChapterBadTraceMap();
  const before = validateChapter(raw);
  assert(!before.ok, 'case B: bad traceMap should fail structure');
  assert(
    before.errors.filter(e => /invalid kgId/.test(e)).length >= 10,
    `case B: expected invalid kgId errors, got ${before.errors.join('; ')}`,
  );

  const enriched = enrichChapterContract(raw, hints, sources);
  const controls = enriched.traceMap?.controls || {};
  assert(!controls.gameCanvas, 'case B: gameCanvas should be removed');
  assert(!controls['hud-score'], 'case B: hud-score should be removed');
  for (const id of expected) {
    assert(controls[id]?.kgId === 'O1' && controls[id]?.role === 'operation', `case B: missing slider ${id}`);
  }

  const after = validateChapter(enriched);
  assert(after.ok, `case B structure failed: ${after.errors.join('; ')}`);
  return Object.keys(controls).length;
}

/** Case C：range id 无 input- 前缀 */
const GENERIC_RANGE_HTML = `<!DOCTYPE html><html><body>
<input type="range" id="paramAlpha" min="0" max="100">
<input type="range" id="paramBeta" min="0" max="100">
<script>
document.getElementById('paramAlpha').addEventListener('input', () => {});
</script></body></html>`;

function runCaseC(hints, sources) {
  const expected = ['paramAlpha', 'paramBeta'];
  const raw = miniChapterNoTraceMap();
  const enriched = enrichChapterContract(raw, hints, sources);
  const controls = enriched.traceMap?.controls || {};
  for (const id of expected) {
    assert(controls[id]?.kgId === 'O1' && controls[id]?.role === 'operation', `case C: missing ${id}`);
  }
  const after = validateChapter(enriched);
  assert(after.ok, `case C structure failed: ${after.errors.join('; ')}`);
  return Object.keys(controls).length;
}

function run() {
  const sources = [{ path: 'multi-slider-hud.html', lang: 'html', content: MULTI_SLIDER_HTML }];
  const hints = extractGameHints(sources);

  assert((hints.sliderControlIds || []).length >= 4, `expected slider ids, got ${JSON.stringify(hints.sliderControlIds)}`);
  const expected = ['input-alpha', 'input-beta', 'input-gamma', 'input-delta', 'input-epsilon'];
  for (const id of expected) {
    assert(hints.sliderControlIds.includes(id), `missing slider id ${id} in hints`);
  }
  assert(!hints.hasIrrelevant, 'multi-slider fixture should not signal hasIrrelevant');

  const nA = runCaseA(hints, sources);
  const nB = runCaseB(hints, sources);

  const rangeSources = [{ path: 'generic-range.html', content: GENERIC_RANGE_HTML }];
  const rangeHints = extractGameHints(rangeSources);
  assert(rangeHints.sliderControlIds.includes('paramAlpha'), 'case C: paramAlpha not in hints');
  const nC = runCaseC(rangeHints, rangeSources);

  console.log('trace-map-infer-check: ok', { caseA_controls: nA, caseB_controls: nB, caseC_controls: nC });
}

module.exports = { run };
