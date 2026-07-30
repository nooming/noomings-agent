const { assert } = require('../../../lib/assert');
/**
 * traceMap HUD/模式按钮清洗回归。
 * npm run check:generate — suite: trace-map-hud-purge
 */
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { extractGameHints } = require('../../../../packages/generate/hints');

const HUD_POLLUTION_HTML = `<!DOCTYPE html><html><body>
<input type="range" id="paramAlpha" min="0" max="50">
<button id="submitAction">提交</button>
<button id="switchFreeBtn">自由</button>
<button id="toggleGuideBtn">辅助线</button>
<div id="score">0</div>
<div id="gameCanvas"></div>
<script>
document.getElementById('submitAction').addEventListener('click', () => {});
document.getElementById('paramAlpha').addEventListener('input', () => {});
</script></body></html>`;

function miniChapterWithBadTraceMap() {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise | skip retry',
    kg: {
      title: 'HUD 清洗测试',
      sub: '测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡并理解调参目标' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节参数并提交测试' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '主目标是否达标判定' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '全部 scoring 目标达标过关' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    dt: {
      title: 'DT',
      sub: '测试',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '达标?', t: 'decision', d: '主目标达标',
          children: [
            { _e: '否', n: '调整再试', t: 'retry', d: '回到调参' },
            { _e: '是', n: '过关', t: 'result', d: '过关' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    strategy: {
      title: 's',
      sub: 's',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Win[过关]:::stratResult',
      routes: [
        { id: 'main', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'R1'], highlightNodes: ['Start'], highlightEdges: [] },
        { id: 'alt', label: '备选', mapsTo: ['P1'], highlightNodes: ['Start'], highlightEdges: [] },
      ],
    },
    traceMap: {
      controls: {
        paramAlpha: { kgId: 'O1', role: 'operation' },
        submitAction: { kgId: 'O1', role: 'operation' },
        switchFreeBtn: { kgId: 'O1', role: 'operation' },
        toggleGuideBtn: { kgId: 'O1', role: 'operation' },
        score: { kgId: 'O1', role: 'operation' },
        gameCanvas: { kgId: 'O1', role: 'operation' },
      },
    },
  };
}

function run() {
  const sources = [{ path: 'hud-pollution.html', content: HUD_POLLUTION_HTML }];
  const hints = extractGameHints(sources);
  const enriched = enrichChapterContract(miniChapterWithBadTraceMap(), hints, sources);
  const controls = enriched.traceMap?.controls || {};

  assert(controls.paramAlpha?.role === 'operation', 'paramAlpha should remain');
  assert(controls.submitAction?.role === 'operation', 'submitAction should remain');
  assert(!controls.switchFreeBtn, 'switchFreeBtn should be purged');
  assert(!controls.toggleGuideBtn, 'toggleGuideBtn should be purged');
  assert(!controls.score, 'score should be purged');
  assert(!controls.gameCanvas, 'gameCanvas should be purged');

  console.log('trace-map-hud-purge-check: ok', { controls: Object.keys(controls) });
}

module.exports = { run };
