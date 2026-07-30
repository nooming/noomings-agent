/**
 * 章节质量冒烟（默认 coupled-mode-aligned fixture；可传 output 草稿路径）
 * npm run check:contract — suite: draft-quality
 */
const fs = require('fs');
const path = require('path');
const { loadHints, loadChapter } = require('../../../lib/fixture-loader');
const COUPLED_MODE_HINTS = loadHints('coupledMode');
const {
  validateChapter,
  validateChapterQuality,
  applyStrategyMermaidSanitize,
} = require('../../../../packages/contract');
const {
  sanitizeStrategyMermaid,
  hasInvalidStrategyMermaidSyntax,
} = require('../../../../packages/shared/strategy-mermaid-parse.js');


function withSampleTraceMap(chapter) {
  if (chapter.traceMap?.controls && Object.keys(chapter.traceMap.controls).length) {
    return chapter;
  }
  return {
    ...chapter,
    traceMap: {
      controls: {
        modeToggle: { kgId: 'O1', role: 'operation' },
        paramA: { kgId: 'O1', role: 'operation' },
        paramB: { kgId: 'O1', role: 'operation' },
        paramC: { kgId: 'O1', role: 'operation' },
        decoyCtrl: { kgId: 'I1', role: 'irrelevant' },
      },
    },
  };
}

function run() {
  const draftArg = process.argv.slice(2).find(a => a && !a.startsWith('-'));
  const draftPath = draftArg && fs.existsSync(draftArg) ? draftArg : null;
  const hints = COUPLED_MODE_HINTS;
  let chapter = withSampleTraceMap(
    draftPath ? JSON.parse(fs.readFileSync(draftPath, 'utf8')) : loadChapter('judge', 'coupledAligned'),
  );
  if (chapter.strategy?.mermaid) {
    chapter = {
      ...chapter,
      strategy: {
        ...chapter.strategy,
        mermaid: sanitizeStrategyMermaid(chapter.strategy.mermaid),
      },
    };
  }
  chapter = applyStrategyMermaidSanitize(chapter);

  const stratBody = chapter.strategy?.mermaid || '';
  if (hasInvalidStrategyMermaidSyntax(stratBody)) {
    throw new Error('strategy.mermaid still has invalid syntax after sanitize');
  }
  if (!stratBody.includes('["关态误调参数 B 迷思"]') && /关态误调参数 B 迷思/.test(stratBody)) {
    throw new Error('expected quoted label for stratInvalid node');
  }

  const validation = validateChapter(chapter);
  const quality = validation.ok
    ? validateChapterQuality(chapter, hints)
    : { ok: false, errors: validation.errors, warnings: [], checklist: {} };

  console.log('draft:', draftPath ? path.basename(draftPath, '.json') : 'coupledAligned-fixture');
  console.log('hints.minNodes:', hints.minNodes, 'nodes:', chapter.kg?.nodes?.length);
  console.log('struct:', validation.ok, validation.errors?.length ? validation.errors : 'ok');
  console.log('quality:', quality.ok, 'score:', quality.score);
  if (!quality.ok) console.log('quality.errors:', quality.errors);
  if (quality.warnings?.length) console.log('quality.warnings:', quality.warnings);

  if (!validation.ok) process.exit(1);
  if (!quality.checklist?.nodeCount) {
    throw new Error('nodeCount should pass with minNodes=' + hints.minNodes);
  }
  if (!quality.checklist?.strategyMermaid) {
    throw new Error('strategyMermaid checklist failed');
  }

  console.log('verify-draft-quality: OK (nodeCount + mermaid sanitize)');
  if (!quality.ok) {
    console.log('note: other quality items may still fail until expand repair / regen:', quality.errors);
  }
}

module.exports = { run };
