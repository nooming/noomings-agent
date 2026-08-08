/** CLI: node tests/scripts/batch-graph-quality-eval.js
 *  汇总 packages/{id}/meta.json 的事理图谱 quality 指标
 */
const fs = require('fs');
const path = require('path');
const { loadAllSamples } = require('../lib/html-samples-manifest');
const {
  getPackagesRoot,
  getPackageChapterPath,
  loadMetaForSample,
} = require('../../packages/shared/data-paths');

const REPORTS = path.join(getPackagesRoot(), 'reports');

const LAYER_RULES = [
  { layer: 'kg', re: /^(play|teach|verify|kg|nodeCount|coupledEnv|coupledStrat|chapterScope)/i },
  { layer: 'dt', re: /^(dt|mapping|winSync)/i },
  { layer: 'strategy', re: /^strategy/i },
  { layer: 'traceMap', re: /^traceMap/i },
  { layer: 'inquiry', re: /^(inquiry|physicsModel|gameSpec|telemetrySpec)/i },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function layerOfChecklistKey(key) {
  for (const { layer, re } of LAYER_RULES) {
    if (re.test(key)) return layer;
  }
  return 'other';
}

function layerOfError(msg) {
  const s = String(msg || '');
  if (/strategy/i.test(s)) return 'strategy';
  if (/\bDT\b|decision|retry|mapping|winSync/i.test(s)) return 'dt';
  if (/KG|play chain|playP1|node/i.test(s)) return 'kg';
  if (/traceMap|control/i.test(s)) return 'traceMap';
  if (/inquiry|physicsModel|formula|confound|output/i.test(s)) return 'inquiry';
  return 'other';
}

function analyzeRow(sample) {
  const meta = loadMetaForSample(sample.id);
  const hasChapter = fs.existsSync(getPackageChapterPath(sample.id));
  if (!meta?.quality && !hasChapter) {
    return {
      id: sample.id,
      topic: sample.topic,
      tags: sample.tags || [],
      hasChapter: false,
      hasMeta: false,
      qualityOk: false,
      qualityScore: null,
      errors: ['no chapter/meta'],
      warnings: [],
      failedChecklist: [],
    };
  }

  const q = meta?.quality || {};
  const checklist = q.checklist || {};
  const failedChecklist = Object.entries(checklist)
    .filter(([, ok]) => ok === false)
    .map(([key]) => ({ key, layer: layerOfChecklistKey(key) }));

  return {
    id: sample.id,
    topic: sample.topic,
    tags: sample.tags || [],
    hasChapter,
    hasMeta: !!meta,
    qualityOk: q.ok === true,
    qualityScore: typeof q.score === 'number' ? q.score : null,
    validationOk: meta?.validation?.ok !== false,
    errors: q.errors || [],
    warnings: q.warnings || [],
    failedChecklist,
  };
}

function aggregate(rows) {
  const withScore = rows.filter(r => r.qualityScore != null);
  const withQuality = rows.filter(r => r.hasMeta || r.hasChapter);
  const qualityOk = rows.filter(r => r.qualityOk).length;
  const avgScore = withScore.length
    ? withScore.reduce((s, r) => s + r.qualityScore, 0) / withScore.length
    : null;

  const checklistFails = {};
  const errorFails = {};
  for (const row of rows) {
    for (const f of row.failedChecklist) {
      const k = `${f.layer}:${f.key}`;
      checklistFails[k] = (checklistFails[k] || 0) + 1;
    }
    for (const e of row.errors) {
      const layer = layerOfError(e);
      const k = `${layer}:${e.slice(0, 120)}`;
      errorFails[k] = (errorFails[k] || 0) + 1;
    }
  }

  const topChecklist = Object.entries(checklistFails)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([key, count]) => ({ key, count }));

  const topErrors = Object.entries(errorFails)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([key, count]) => ({ key, count }));

  const byLayer = { kg: 0, dt: 0, strategy: 0, traceMap: 0, inquiry: 0, other: 0 };
  for (const row of rows) {
    for (const f of row.failedChecklist) {
      byLayer[f.layer] = (byLayer[f.layer] || 0) + 1;
    }
  }

  const tagStats = {};
  for (const row of rows) {
    for (const t of row.tags || ['untagged']) {
      const key = t || 'untagged';
      if (!tagStats[key]) tagStats[key] = { total: 0, qualityOk: 0 };
      tagStats[key].total++;
      if (row.qualityOk) tagStats[key].qualityOk++;
    }
  }

  return {
    total: rows.length,
    withMeta: withQuality.length,
    qualityOk,
    qualityPassRate: withQuality.length ? qualityOk / withQuality.length : 0,
    qualityScoreAvg: avgScore,
    qualityScoreMin: withScore.length ? Math.min(...withScore.map(r => r.qualityScore)) : null,
    qualityScoreMax: withScore.length ? Math.max(...withScore.map(r => r.qualityScore)) : null,
    failedRows: rows.filter(r => !r.qualityOk).map(r => ({
      id: r.id,
      score: r.qualityScore,
      errors: r.errors,
      failedChecklist: r.failedChecklist.map(f => f.key),
    })),
    checklistFailsByLayer: byLayer,
    topChecklistFails: topChecklist,
    topErrors,
    tagStats,
  };
}

function writeReports(rows, summary) {
  ensureDir(REPORTS);
  const payload = {
    generatedAt: new Date().toISOString(),
    track: 'design',
    summary,
    rows,
  };
  fs.writeFileSync(
    path.join(REPORTS, 'graph-quality-report.json'),
    JSON.stringify(payload, null, 2),
    'utf8',
  );

  const md = [
    '# 设计轨事理图谱质量报告',
    '',
    `生成时间：${payload.generatedAt}`,
    '',
    '## 汇总',
    '',
    '| 指标 | 值 |',
    '|------|-----|',
    `| 样本总数 | ${summary.total} |`,
    `| 有 meta/chapter | ${summary.withMeta} |`,
    `| quality.ok 通过 | ${summary.qualityOk} (${(summary.qualityPassRate * 100).toFixed(1)}%) |`,
    `| quality.score 均值 | ${summary.qualityScoreAvg != null ? summary.qualityScoreAvg.toFixed(1) : '—'} |`,
    `| score 范围 | ${summary.qualityScoreMin ?? '—'} – ${summary.qualityScoreMax ?? '—'} |`,
    '',
    '## checklist 失败按层',
    '',
    '| 层 | 失败项次数 |',
    '|----|-----------|',
    ...Object.entries(summary.checklistFailsByLayer)
      .filter(([, n]) => n > 0)
      .map(([layer, n]) => `| ${layer} | ${n} |`),
    '',
    '## Top checklist 失败',
    '',
    ...(summary.topChecklistFails.length
      ? summary.topChecklistFails.map(t => `- \`${t.key}\` × ${t.count}`)
      : ['- （无）']),
    '',
    '## Top quality.errors',
    '',
    ...(summary.topErrors.length
      ? summary.topErrors.map(t => `- \`${t.key}\` × ${t.count}`)
      : ['- （无）']),
    '',
    '## 未通过样本',
    '',
    ...(summary.failedRows.length
      ? summary.failedRows.map(r => `- **${r.id}** (score ${r.score ?? '—'}): ${(r.errors[0] || r.failedChecklist.join(', ') || '—')}`)
      : ['- （全部通过）']),
    '',
    '## 明细',
    '',
    '| id | quality | score | errors |',
    '|----|---------|-------|--------|',
    ...rows.map(r => `| ${r.id} | ${r.qualityOk ? '✓' : '✗'} | ${r.qualityScore ?? '—'} | ${r.errors.length ? r.errors[0].slice(0, 60) : '—'} |`),
  ].join('\n');

  fs.writeFileSync(path.join(REPORTS, 'graph-quality-report.md'), md, 'utf8');
}

function main() {
  const manifest = loadAllSamples();
  const rows = (manifest.samples || []).map(analyzeRow);
  const summary = aggregate(rows);
  writeReports(rows, summary);

  console.log('batch-graph-quality-eval: OK');
  console.log(`  samples: ${summary.total}`);
  console.log(`  quality pass: ${summary.qualityOk}/${summary.withMeta} (${(summary.qualityPassRate * 100).toFixed(1)}%)`);
  console.log(`  score avg: ${summary.qualityScoreAvg != null ? summary.qualityScoreAvg.toFixed(1) : 'n/a'}`);
  console.log(`  reports: ${REPORTS}/graph-quality-report.{json,md}`);
}

main();
