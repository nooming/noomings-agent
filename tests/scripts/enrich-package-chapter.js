/**
 * Offline enrich + strategy repair + 图谱 export for one runtime package.
 *   node tests/scripts/enrich-package-chapter.js --id relativistic-collision-1d
 */
const fs = require('fs');
const path = require('path');
const { extractGameHints } = require('../../packages/generate/hints');
const { runAnalyzeThreeStep } = require('../../packages/generate/analyze-three-step');
const { enrichChapterContract } = require('../../packages/contract/enrich');
const { validateChapter, validateChapterQuality } = require('../../packages/contract');
const { repairSingleVariableStrategyRoutes } = require('../../packages/contract/repair/strategy-single-var-repair');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair');
const { repairStrategyRouteScores } = require('../../packages/contract/repair/strategy-route-score-repair');
const { repairMinStrategyRoutes } = require('../../packages/contract/repair/strategy-min-routes-repair');
const { repairStrategyConfoundVisual } = require('../../packages/contract/repair/strategy-confound-visual-repair');
const { applyStrategyMermaidSanitize } = require('../../packages/contract/strategy/strategy-sanitize');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot, getPackageGamePath } = require('../../packages/shared/data-paths');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function main() {
  const id = argValue('--id');
  if (!id) {
    console.error('Usage: node tests/scripts/enrich-package-chapter.js --id <packageId>');
    process.exit(1);
  }
  const gamePath = getPackageGamePath(id);
  const chapterPath = path.join(getPackagesRoot(), id, 'chapter.json');
  if (!fs.existsSync(gamePath) || !fs.existsSync(chapterPath)) {
    console.error('missing game.html or chapter.json for', id);
    process.exit(1);
  }
  const html = fs.readFileSync(gamePath, 'utf8');
  const sources = [{ path: 'game.html', content: html }];
  const gameHints = extractGameHints(sources);
  const threeStep = runAnalyzeThreeStep({ sources, gameHints });
  const hints = { ...gameHints, analyzeParse: threeStep.analyzeParse };

  let chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const skipEnrich = process.argv.includes('--strategy-only');
  if (!skipEnrich) chapter = enrichChapterContract(chapter, hints, sources);
  chapter = repairSingleVariableStrategyRoutes(chapter, hints);
  chapter = repairMinStrategyRoutes(chapter, hints);
  chapter = applyStrategyMermaidSanitize(chapter);
  chapter = repairStrategyConfoundVisual(chapter);
  chapter = repairStrategyRouteHighlights(chapter);
  chapter = repairStrategyRouteScores(chapter, hints);
  chapter = applyStrategyMermaidSanitize(chapter);

  const validation = validateChapter(chapter, hints);
  const quality = validation.ok
    ? validateChapterQuality(chapter, hints)
    : { ok: false, errors: validation.errors, score: 0 };

  fs.writeFileSync(chapterPath, JSON.stringify(chapter, null, 2), 'utf8');
  const outDir = path.join(getPackagesRoot(), id);
  const metaPath = path.join(outDir, 'meta.json');
  const title = chapter.inquiryScript?.title || chapter.kg?.title || id;
  fs.writeFileSync(metaPath, JSON.stringify({
    id,
    title,
    craft: 'pilot',
    topic: '相对论碰撞',
    knowledgeText: 'ΣE、Σp 守恒',
    enrichedAt: new Date().toISOString(),
    validation,
    quality,
  }, null, 2), 'utf8');

  const exportResult = writePriorityGraphFiles({
    chapter,
    title,
    runtimeDir: outDir,
    sampleDir: outDir,
  });

  console.log('enrich-package-chapter:', id);
  console.log('  validation:', validation.ok, validation.errors?.slice(0, 3));
  console.log('  quality:', quality.ok, 'score=', quality.score, quality.errors?.slice(0, 3));
  console.log('  export bytes:', exportResult.bytes);
  if (!validation.ok || !quality.ok) process.exit(1);
}

main();
