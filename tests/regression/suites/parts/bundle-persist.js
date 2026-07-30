const { assert } = require('../../../lib/assert');
/**
 * Bundle 持久化 round-trip：traceMap 与 enrich 字段一致。
 * npm run check:generate — suite: bundle-persist
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { validateChapter } = require('../../../../packages/contract');
const { extractGameHints } = require('../../../../packages/generate/hints');
const { appendChapterToBundle, createGraphProject, readChaptersFile } = require('../../../../packages/generate/incremental-bundle');

const MULTI_SLIDER_HTML = `<!DOCTYPE html><html><body>
<input type="range" id="input-a" min="0" max="100">
<input type="range" id="input-b" min="0" max="100">
<script>
document.getElementById('input-a').addEventListener('input', () => {});
</script></body></html>`;

function miniChapter() {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise | skip retry',
    kg: {
      title: '持久化测试关',
      sub: '测试',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡并理解调参目标' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节 range 滑条参数并操作' },
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
      sub: '测试关',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '达标?', t: 'decision', d: '是否达到目标',
          children: [
            { _e: '否', n: '调整参数再试', t: 'retry', d: '回到调参重试' },
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

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bundle-persist-'));
  const sources = [{ path: 'stub.html', content: MULTI_SLIDER_HTML }];
  const hints = extractGameHints(sources);
  const enriched = enrichChapterContract(miniChapter(), hints, sources);
  assert(enriched.traceMap?.controls && Object.keys(enriched.traceMap.controls).length >= 1, 'enrich should produce traceMap.controls');

  const project = createGraphProject({ root, title: 'bundle-persist-test' });
  const append = appendChapterToBundle({
    root,
    projectId: project.projectId,
    slotName: '持久化测试关',
    chapter: miniChapter(),
    title: '持久化测试关',
    gameHints: hints,
    sources,
    skipQuality: true,
  });
  assert(append.ok, `append failed: ${(append.errors || []).join('; ')}`);

  const chapters = readChaptersFile(path.join(root, project.projectId));
  const entry = chapters.find(c => c.slotName === '持久化测试关');
  assert(entry?.traceMap?.controls, 'chapters.json entry missing traceMap');
  assert(Object.keys(entry.traceMap.controls).length >= 1, 'traceMap.controls empty in bundle');
  assert(entry.quality?.checklist && typeof entry.quality.checklist === 'object', 'quality.checklist not persisted');
  assert(Array.isArray(entry.quality.errors), 'quality.errors not persisted');

  const roundTrip = {
    mapping: entry.mapping,
    kg: entry.kg,
    dt: entry.dt,
    winSync: entry.winSync,
    strategy: entry.strategy,
    traceMap: entry.traceMap,
  };
  const v = validateChapter(roundTrip);
  assert(v.ok, `round-trip validate failed: ${v.errors.join('; ')}`);

  fs.rmSync(root, { recursive: true, force: true });
  console.log('bundle-persist-check: ok');
}

module.exports = { run };
