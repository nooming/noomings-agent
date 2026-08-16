/** CLI: node tests/demos/batch-analyze-graph-eval.js [--id <id>] [--resume] [--dry-run]
 *  分析轨：existingHtml → generateGraph → quality 报告
 */
const fs = require('fs');
const path = require('path');
const { generateGraph } = require('../../packages/generate/pipeline');
const { extractGameHints } = require('../../packages/generate/hints');

require('../../packages/shared/load-env').loadEnv();

const ROOT = path.resolve(__dirname, '../..');
const { getPackagesRoot, getPackageManifestPath, getDatasetHtmlSamplesRoot, getReportsRoot } = require('../../packages/shared/data-paths');
const MANIFEST = getPackageManifestPath();
const OUT_ROOT = path.join(getDatasetHtmlSamplesRoot(), 'analyze-track');
const REPORTS = getReportsRoot();
const DESIGN_REPORT = path.join(REPORTS, 'graph-quality-report.json');

const opts = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
};

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadExistingHtmlSamples() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let samples = (manifest.samples || []).filter(s => s.existingHtml);
  const filterId = argValue('--id');
  if (filterId) {
    samples = samples.filter(s => s.id === filterId);
    if (!samples.length) {
      console.error(`Sample not found or no existingHtml: ${filterId}`);
      process.exit(1);
    }
  }
  return samples;
}

function pathsFor(sample) {
  const dir = path.join(OUT_ROOT, sample.id);
  return {
    dir,
    chapterPath: path.join(dir, 'chapter.json'),
    metaPath: path.join(dir, 'meta.json'),
    htmlSrc: path.join(ROOT, sample.existingHtml),
  };
}

function loadSavedRow(sample) {
  const { chapterPath, metaPath } = pathsFor(sample);
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return {
    id: sample.id,
    topic: sample.topic,
    existingHtml: sample.existingHtml,
    skipped: true,
    validationOk: meta.validation?.ok === true,
    qualityOk: meta.quality?.ok === true,
    qualityScore: meta.quality?.score ?? null,
    errors: meta.quality?.errors || meta.validation?.errors || [],
    warnings: meta.quality?.warnings || [],
    elapsedMs: meta.elapsedMs || 0,
  };
}

function loadDesignSummary() {
  if (!fs.existsSync(DESIGN_REPORT)) return null;
  return JSON.parse(fs.readFileSync(DESIGN_REPORT, 'utf8')).summary || null;
}

async function runSample(sample, flags) {
  const { dir, chapterPath, metaPath, htmlSrc } = pathsFor(sample);
  const start = Date.now();

  if (flags.resume && fs.existsSync(metaPath) && !flags.force) {
    const saved = loadSavedRow(sample);
    if (saved) return saved;
  }

  if (flags.dryRun) {
    if (fs.existsSync(metaPath)) return loadSavedRow(sample);
    return {
      id: sample.id,
      topic: sample.topic,
      existingHtml: sample.existingHtml,
      validationOk: false,
      qualityOk: false,
      qualityScore: null,
      errors: ['no analyze-track artifact (dry-run)'],
      warnings: [],
      elapsedMs: 0,
    };
  }

  if (!opts.apiKey) {
    throw new Error('DEEPSEEK_API_KEY required (use --dry-run for saved artifacts)');
  }
  if (!fs.existsSync(htmlSrc)) {
    throw new Error(`existingHtml missing: ${sample.existingHtml}`);
  }

  const content = fs.readFileSync(htmlSrc, 'utf8');
  const sources = [{ path: path.basename(htmlSrc), content }];
  const gameHints = extractGameHints(sources);

  const gen = await generateGraph({
    sources,
    gameHints,
    title: sample.topic || sample.id,
  }, opts);

  ensureDir(dir);
  if (gen.chapter) {
    fs.writeFileSync(chapterPath, JSON.stringify(gen.chapter, null, 2), 'utf8');
  }
  const meta = {
    id: sample.id,
    track: 'analyze',
    existingHtml: sample.existingHtml,
    savedAt: new Date().toISOString(),
    validation: gen.validation,
    quality: gen.quality,
    elapsedMs: Date.now() - start,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  return {
    id: sample.id,
    topic: sample.topic,
    existingHtml: sample.existingHtml,
    skipped: false,
    validationOk: gen.validation?.ok === true,
    qualityOk: gen.quality?.ok === true,
    qualityScore: gen.quality?.score ?? null,
    errors: gen.quality?.errors || gen.validation?.errors || [],
    warnings: gen.quality?.warnings || [],
    elapsedMs: meta.elapsedMs,
  };
}

function aggregate(rows) {
  const withQuality = rows.filter(r => r.qualityScore != null || r.qualityOk != null);
  const scores = rows.filter(r => typeof r.qualityScore === 'number').map(r => r.qualityScore);
  const errorCounts = {};
  for (const row of rows) {
    for (const e of row.errors) {
      const k = String(e).slice(0, 100);
      errorCounts[k] = (errorCounts[k] || 0) + 1;
    }
  }
  return {
    total: rows.length,
    validationOk: rows.filter(r => r.validationOk).length,
    qualityOk: rows.filter(r => r.qualityOk).length,
    qualityPassRate: withQuality.length ? rows.filter(r => r.qualityOk).length / rows.length : 0,
    qualityScoreAvg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    topErrors: Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({ key, count })),
    failedRows: rows.filter(r => !r.qualityOk).map(r => ({
      id: r.id,
      score: r.qualityScore,
      errors: r.errors.slice(0, 3),
    })),
  };
}

function writeReports(rows, summary, designSummary) {
  ensureDir(REPORTS);
  const payload = {
    generatedAt: new Date().toISOString(),
    track: 'analyze',
    summary,
    designComparison: designSummary
      ? {
        designQualityPassRate: designSummary.qualityPassRate,
        designQualityScoreAvg: designSummary.qualityScoreAvg,
        designTotal: designSummary.total,
      }
      : null,
    rows,
  };
  fs.writeFileSync(
    path.join(REPORTS, 'analyze-track-report.json'),
    JSON.stringify(payload, null, 2),
    'utf8',
  );

  const md = [
    '# 分析轨事理图谱质量报告',
    '',
    `生成时间：${payload.generatedAt}`,
    '',
    '从 **existingHtml** 源码经 analyze 轨 `generateGraph` 抽取 KG/DT/strategy。',
    '',
    '## 汇总',
    '',
    '| 指标 | 值 |',
    '|------|-----|',
    `| 样本数（legacy HTML） | ${summary.total} |`,
    `| validation.ok | ${summary.validationOk}/${summary.total} |`,
    `| quality.ok | ${summary.qualityOk}/${summary.total} (${(summary.qualityPassRate * 100).toFixed(1)}%) |`,
    `| quality.score 均值 | ${summary.qualityScoreAvg != null ? summary.qualityScoreAvg.toFixed(1) : '—'} |`,
    '',
  ];

  if (payload.designComparison) {
    md.push(
      '## 与设计轨对照',
      '',
      '| 维度 | 设计轨（50） | 分析轨（legacy） |',
      '|------|-------------|----------------|',
      `| quality 通过率 | ${(payload.designComparison.designQualityPassRate * 100).toFixed(1)}% | ${(summary.qualityPassRate * 100).toFixed(1)}% |`,
      `| quality 均分 | ${payload.designComparison.designQualityScoreAvg?.toFixed(1) ?? '—'} | ${summary.qualityScoreAvg?.toFixed(1) ?? '—'} |`,
      '',
      '论文表述：设计轨用于可控样本集；分析轨验证「已有 HTML → 事理图谱」可行性，两者互补。',
      '',
    );
  }

  md.push(
    '## Top errors',
    '',
    ...(summary.topErrors.length
      ? summary.topErrors.map(t => `- \`${t.key}\` × ${t.count}`)
      : ['- （无）']),
    '',
    '## 明细',
    '',
    '| id | validation | quality | score |',
    '|----|------------|---------|-------|',
    ...rows.map(r => `| ${r.id} | ${r.validationOk ? '✓' : '✗'} | ${r.qualityOk ? '✓' : '✗'} | ${r.qualityScore ?? '—'} |`),
  );

  fs.writeFileSync(path.join(REPORTS, 'analyze-track-report.md'), md.join('\n'), 'utf8');
}

async function main() {
  const flags = {
    dryRun: hasFlag('--dry-run'),
    resume: hasFlag('--resume'),
    force: hasFlag('--force'),
  };
  const samples = loadExistingHtmlSamples();
  ensureDir(OUT_ROOT);
  ensureDir(REPORTS);

  console.log(`batch-analyze-graph-eval: ${samples.length} legacy HTML sample(s)`);
  if (flags.dryRun) console.log('  mode: dry-run');
  if (flags.resume) console.log('  mode: resume');

  const rows = [];
  for (const sample of samples) {
    process.stdout.write(`  ${sample.id} … `);
    try {
      const row = await runSample(sample, flags);
      rows.push(row);
      console.log(row.qualityOk ? 'OK' : 'FAIL');
    } catch (err) {
      rows.push({
        id: sample.id,
        qualityOk: false,
        validationOk: false,
        errors: [err.message],
        elapsedMs: 0,
      });
      console.log('ERROR', err.message);
    }
  }

  const summary = aggregate(rows);
  const designSummary = loadDesignSummary();
  writeReports(rows, summary, designSummary);

  console.log('');
  console.log(`quality pass: ${summary.qualityOk}/${summary.total}`);
  console.log(`reports: ${REPORTS}/analyze-track-report.{json,md}`);

  if (!flags.dryRun && summary.qualityOk < summary.total) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
