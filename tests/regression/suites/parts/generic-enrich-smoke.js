const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { extractGameHints } = require('../../../../packages/generate/hints');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { getGamesPresetRoot } = require('../../../../packages/shared/data-paths');

const SAMPLES_DIR = getGamesPresetRoot();

function minimalChapter() {
  return {
    mapping: '| DT | KG |\n| 操作 | O1 | operation | skip retry',
    kg: {
      nodes: [
        { id: 'P1', label: '进入', group: 'premise', layer: 'play', level: 0, r: 22, desc: '' },
        { id: 'O1', label: '调参操作', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节' },
        { id: 'C1', label: '判定', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '' },
        { id: 'R1', label: '过关', group: 'result', layer: 'play', level: 3, r: 22, desc: '' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'R1', tp: 'core' },
      ],
    },
    dt: {
      tree: {
        n: '开始',
        t: 'step',
        children: [{
          n: '调参操作',
          t: 'step',
          d: '调节',
          children: [{
            n: '判定',
            t: 'decision',
            children: [
              { n: '是', t: 'result', _e: '是', children: [] },
              { n: '否', t: 'retry', _e: '否', children: [] },
            ],
          }],
        }],
      },
    },
    strategy: {
      mermaid: [
        'graph TD',
        'Start([开始]):::stratStart',
        'StrategySelect{选择?}:::stratCond',
        'StrategySelect -->|控制变量：每次只改一项| Tune1',
        'StrategySelect -->|多参盲调| Tune1',
        'Tune1[T] --> Adjust1[A]',
        'Adjust1 --> Fire1[F]',
        'Fire1 --> Observe1{观察?}:::stratCond',
        'Observe1 -->|偏近| Adjust1',
        'Observe1 -->|偏远| Adjust1',
      ].join('\n'),
      routes: [
        { id: 'main', label: '控制变量：每次只改一项', mapsTo: ['P1', 'O1', 'C1', 'R1'], highlightNodes: ['Start'] },
        { id: 'trap', label: '多参盲调', tier: 'suboptimal', warn: '难归因', mapsTo: ['P1', 'O1', 'C1'], highlightNodes: ['Start'] },
      ],
    },
    traceMap: { controls: {} },
  };
}

function run() {
  if (!fs.existsSync(SAMPLES_DIR)) {
    console.log('generic-enrich-smoke: skip (no samples dir)');
    return;
  }
  const files = fs.readdirSync(SAMPLES_DIR).filter(f => f.endsWith('.html'));
  assert(files.length >= 1, 'need at least one sample html');

  for (const file of files) {
    const html = fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8');
    const hints = extractGameHints([{ path: file, content: html }]);
    assert(hints && typeof hints === 'object', `hints for ${file}`);
    const enriched = enrichChapterContract(minimalChapter(), hints, [{ path: file, content: html }]);
    assert(enriched.strategy?.routes?.length >= 1, `enrich routes for ${file}`);
  }

  console.log(`generic-enrich-smoke: OK (${files.length} samples)`);
}

module.exports = { run };
