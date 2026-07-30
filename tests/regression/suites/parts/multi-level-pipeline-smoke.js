const { assert } = require('../../../lib/assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { extractGameHints } = require('../../../../packages/generate/hints');
const { readChaptersFile } = require('../../../../packages/generate/incremental-bundle');

function miniChapter(title) {
  return {
    mapping: '| DT | KG | type |\n| 根 | P1 | premise | skip retry',
    kg: {
      title: title || '测试关',
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
      sub: title || '测试关',
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

async function run() {
  const file = path.join(__dirname, '../../../../packages/generate/multi-level-pipeline.js');
  const src = fs.readFileSync(file, 'utf8');
  assert(/require\(['"]\.\/pipeline['"]\)|pipelineMod/.test(src), 'multi-level-pipeline must use pipeline module');
  assert(/mapWithConcurrency/.test(src), 'multi-level-pipeline must use bounded concurrency');

  const {
    generateMultiLevelGraph,
    mapWithConcurrency,
    resolveLevelConcurrency,
  } = require('../../../../packages/generate/multi-level-pipeline');
  const pipelineMod = require('../../../../packages/generate/pipeline');
  const { configArrayStub } = require('../../../lib/html-stubs');
  const sources = [{ path: 'multi-level-detect-stub.html', content: configArrayStub }];
  const baseHints = extractGameHints(sources);

  assert(resolveLevelConcurrency({}) === 2, 'default concurrency should be 2');

  const order = [];
  const startTimes = [];
  const orig = pipelineMod.generateGraph;
  pipelineMod.generateGraph = async (body) => {
    startTimes.push(Date.now());
    order.push({ slot: body.title, t: Date.now() });
    await new Promise(r => setTimeout(r, 50));
    return {
      validation: { ok: false, errors: ['mock fail'] },
      chapter: null,
      attempts: 1,
      timings: { llmMs: 50, llmCalls: 1, enrichMs: 0 },
    };
  };

  const root = path.join(os.tmpdir(), `ml-parallel-${Date.now()}`);
  let root2;
  try {
    const t0 = Date.now();
    await generateMultiLevelGraph({
      sources,
      outputRoot: root,
      title: 'parallel-smoke',
      levelConcurrency: 3,
    });
    const elapsed = Date.now() - t0;
    assert(order.length === 3, `expected 3 generate calls, got ${order.length}`);
    assert(startTimes.length === 3, 'expected 3 parallel starts');
    const span = startTimes[2] - startTimes[0];
    assert(span < 150, `levels should start concurrently (span ${span}ms)`);
    assert(elapsed < 250, `expected parallel wall clock <250ms, got ${elapsed}ms`);

    pipelineMod.generateGraph = async (body) => {
      const levelHints = body.gameHints;
      const chapter = enrichChapterContract(miniChapter(body.title), levelHints || baseHints, sources);
      return {
        validation: { ok: true },
        chapter,
        quality: { ok: true, score: 1, checklist: {}, errors: [] },
        attempts: 1,
        timings: { llmMs: 1, llmCalls: 1, enrichMs: 0 },
      };
    };

    root2 = path.join(os.tmpdir(), `ml-append-${Date.now()}`);
    const result = await generateMultiLevelGraph({
      sources,
      outputRoot: root2,
      title: 'append-order-smoke',
      levelConcurrency: 3,
    });
    assert(result.stats?.passed === 3, `expected 3 passed, got ${result.stats?.passed}`);
    const chapters = readChaptersFile(path.join(root2, result.projectId));
    const ok = chapters.filter(c => c.ok && c.kg).sort((a, b) => a.ch - b.ch);
    assert(ok.length === 3, `expected 3 ok chapters, got ${ok.length}`);
    assert(ok.map(c => c.ch).join(',') === '0,1,2', 'chapters should be appended in index order');
    assert(result.timings?.perLevel?.length === 3, 'timings.perLevel should have 3 entries');
  } finally {
    pipelineMod.generateGraph = orig;
    fs.rmSync(root, { recursive: true, force: true });
    if (root2) fs.rmSync(root2, { recursive: true, force: true });
  }

  const parallelResults = await mapWithConcurrency([1, 2, 3], 2, async n => n * 2);
  assert(JSON.stringify(parallelResults) === '[2,4,6]', 'mapWithConcurrency order preserved');
}

module.exports = { run };
