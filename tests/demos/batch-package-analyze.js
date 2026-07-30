/** CLI: node tests/demos/batch-package-analyze.js [--id projectile-basic] [--dry-run] [--resume] [--skip-export]
 *  全量 packages manifest → 三步解析 → generateGraph → packages/{id}/chapter.json
 *  并导出 Strategy-first + priority 图谱.html → runtime + 样本html/{dir}/
 */
const fs = require('fs');
const path = require('path');
const { generateGraph } = require('../../packages/generate/pipeline');
const { extractGameHints } = require('../../packages/generate/hints');
const { runAnalyzeThreeStep } = require('../../packages/generate/analyze-three-step');
const { getPackagesRoot, getPackageGamePath } = require('../../packages/shared/data-paths');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const YANG_MAP = require('../lib/yangben-sample-map');

require('../../packages/shared/load-env').loadEnv();

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml'); // 样本html
const MANIFEST = path.join(getPackagesRoot(), 'manifest.json');
const REPORTS = path.join(getPackagesRoot(), 'reports');

const opts = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
};

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function sampleEntryForId(id) {
  return YANG_MAP.find(e => e.id === id) || null;
}

function loadSamples() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let samples = manifest.samples || [];
  const filterId = argValue('--id');
  if (filterId) samples = samples.filter(s => s.id === filterId);
  // Prefer catalog samples (清单) when no --id; still allow manifest-only extras if filtered
  if (!filterId) {
    const catalogIds = new Set(YANG_MAP.map(e => e.id));
    samples = samples.filter(s => catalogIds.has(s.id));
  }
  return samples;
}

function exportGraphFor(sample, chapter, meta) {
  if (hasFlag('--dry-run') || hasFlag('--skip-export')) {
    return { skipped: true };
  }
  if (!chapter?.strategy?.mermaid?.trim()) {
    return { ok: false, error: 'strategy.mermaid missing — skip export' };
  }
  const entry = sampleEntryForId(sample.id);
  const runtimeDir = path.join(getPackagesRoot(), sample.id);
  const sampleDir = entry ? path.join(YANG, entry.dir) : null;
  const title = meta?.title
    || chapter.kg?.title
    || chapter.strategy?.title
    || sample.topic
    || sample.id;
  try {
    const result = writePriorityGraphFiles({
      chapter,
      title,
      runtimeDir,
      sampleDir,
    });
    return { ok: true, bytes: result.bytes, outs: result.outs };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function analyzeOne(sample) {
  const gamePath = getPackageGamePath(sample.id);
  if (!gamePath || !fs.existsSync(gamePath)) {
    return { id: sample.id, ok: false, error: 'game.html missing' };
  }
  const content = fs.readFileSync(gamePath, 'utf8');
  const sources = [{ path: 'game.html', content }];
  const gameHints = extractGameHints(sources);
  const threeStep = runAnalyzeThreeStep({ sources, gameHints });
  const gen = await generateGraph({
    sources,
    gameHints,
    analyzeParse: threeStep.analyzeParse,
    title: sample.topic || sample.id,
  }, opts);
  const outDir = path.join(getPackagesRoot(), sample.id);
  fs.mkdirSync(outDir, { recursive: true });
  const chapterPath = path.join(outDir, 'chapter.json');
  if (gen.chapter && !hasFlag('--dry-run')) {
    fs.writeFileSync(chapterPath, JSON.stringify(gen.chapter, null, 2), 'utf8');
  }
  const metaPath = path.join(outDir, 'meta.json');
  const meta = {
    id: sample.id,
    title: sample.topic || sample.id,
    analyzedAt: new Date().toISOString(),
    validation: gen.validation,
    quality: gen.quality,
    analyzeSteps: threeStep.steps,
  };
  if (!hasFlag('--dry-run')) {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }

  const exportResult = gen.chapter
    ? exportGraphFor(sample, gen.chapter, meta)
    : { ok: false, error: 'no chapter' };

  return {
    id: sample.id,
    ok: !!(gen.validation?.ok && gen.quality?.ok),
    validationOk: gen.validation?.ok,
    qualityOk: gen.quality?.ok,
    qualityScore: gen.quality?.score,
    errors: [...(gen.validation?.errors || []), ...(gen.quality?.errors || [])],
    exportOk: exportResult.ok !== false || exportResult.skipped,
    export: exportResult,
  };
}

async function main() {
  if (!opts.apiKey && !hasFlag('--dry-run')) {
    console.error('DEEPSEEK_API_KEY required');
    process.exit(1);
  }
  const samples = loadSamples();
  fs.mkdirSync(REPORTS, { recursive: true });
  const rows = [];
  for (const sample of samples) {
    if (hasFlag('--resume')) {
      const cp = path.join(getPackagesRoot(), sample.id, 'meta.json');
      if (fs.existsSync(cp)) {
        const m = JSON.parse(fs.readFileSync(cp, 'utf8'));
        if (m.quality?.ok) {
          // Still ensure graph export exists
          const chapterPath = path.join(getPackagesRoot(), sample.id, 'chapter.json');
          let exportResult = { skipped: true };
          if (fs.existsSync(chapterPath) && !hasFlag('--skip-export')) {
            const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
            exportResult = exportGraphFor(sample, chapter, m);
          }
          rows.push({
            id: sample.id,
            skipped: true,
            ok: true,
            exportOk: exportResult.ok !== false || exportResult.skipped,
            export: exportResult,
          });
          console.log('Skip (resume)', sample.id, exportResult.ok === false ? `export FAIL: ${exportResult.error}` : 'export ok');
          continue;
        }
      }
    }
    console.log('Analyzing', sample.id, '...');
    try {
      const row = await analyzeOne(sample);
      rows.push(row);
      const exportNote = row.export?.skipped
        ? 'export skipped'
        : (row.export?.ok ? `export ${row.export.bytes}B` : `export FAIL: ${row.export?.error}`);
      console.log(' ', row.ok ? 'OK' : 'FAIL', row.errors?.slice(0, 2).join('; ') || '', '|', exportNote);
    } catch (e) {
      rows.push({ id: sample.id, ok: false, error: e.message, exportOk: false });
      console.error(' ', e.message);
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    passed: rows.filter(r => r.ok).length,
    exportPassed: rows.filter(r => r.exportOk !== false).length,
    rows,
  };
  fs.writeFileSync(path.join(REPORTS, 'batch-package-analyze.json'), JSON.stringify(report, null, 2));
  console.log(`Done: ${report.passed}/${report.total} quality-passed; export ${report.exportPassed}/${report.total}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
