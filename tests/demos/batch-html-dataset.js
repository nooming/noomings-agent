/** CLI: node tests/demos/batch-html-dataset.js [--id <id>] [--dry-run] [--resume] [--force] */
const fs = require('fs');
const path = require('path');
const { generateDesignGraph } = require('../../packages/generate/design-pipeline');
const { generateGameHtml } = require('../../packages/generate/html-codegen');
const { validateGeneratedHtml } = require('../../packages/generate/html-post-validate');
const { evaluateDesignSample } = require('../lib/design-sample-eval');
const {
  getPackageManifestPath,
  getPackageGamePath,
  getPackageChapterPath,
  getPackageDir,
  getPackagesRoot,
  resolveRepoRelative,
} = require('../../packages/shared/data-paths');

require('../../packages/shared/load-env').loadEnv();

const MANIFEST = getPackageManifestPath();
const REPORTS = path.join(getPackagesRoot(), 'reports');

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

function loadManifest() {
  const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const filterId = argValue('--id');
  let samples = data.samples || [];
  if (filterId) {
    samples = samples.filter(s => s.id === filterId);
    if (!samples.length) {
      console.error(`Sample not found: ${filterId}`);
      process.exit(1);
    }
  }
  return samples;
}

function pathsFor(sample) {
  const chapterDir = getPackageDir(sample.id);
  return {
    htmlPath: getPackageGamePath(sample.id),
    chapterDir,
    chapterPath: getPackageChapterPath(sample.id),
    metaPath: path.join(chapterDir, 'meta.json'),
  };
}

function copyExistingHtml(sample, htmlPath) {
  const src = resolveRepoRelative(sample.existingHtml);
  if (!fs.existsSync(src)) throw new Error(`existingHtml missing: ${sample.existingHtml}`);
  ensureDir(path.dirname(htmlPath));
  fs.copyFileSync(src, htmlPath);
  return src;
}

function loadChapter(chapterPath) {
  if (!fs.existsSync(chapterPath)) return null;
  return JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
}

function validateRow(sample, chapter, html, htmlPath) {
  const evalInput = chapter
    ? { inquiryDraft: chapter.inquiryScript, chapter, quality: { ok: true, errors: [] }, promptBundle: { user: '物理模型三要素' } }
    : null;
  const threeElem = evalInput
    ? evaluateDesignSample(sample, evalInput, { maxQualityErrors: 99 })
    : { pass: false, failures: ['no chapter'], checks: [] };

  let htmlOk = false;
  let htmlErrors = [];
  if (html && chapter) {
    const hv = validateGeneratedHtml(html, chapter);
    htmlOk = hv.ok;
    htmlErrors = hv.errors || [];
  } else if (sample.existingHtml && fs.existsSync(htmlPath)) {
    htmlOk = true;
    htmlErrors = ['skipped html-post-validate for existingHtml'];
  }

  const graphOk = !!chapter;
  const pass = threeElem.pass && graphOk && (htmlOk || !!sample.existingHtml);

  return {
    threeElemPass: threeElem.pass,
    threeElemScore: `${threeElem.score}/${threeElem.total}`,
    graphOk,
    htmlOk: htmlOk || !!sample.existingHtml,
    pass,
    failures: [
      ...threeElem.failures,
      ...(!graphOk ? ['no chapter'] : []),
      ...(!htmlOk && !sample.existingHtml ? htmlErrors : []),
    ],
    checks: threeElem.checks,
  };
}

async function runSample(sample, flags) {
  const { htmlPath, chapterDir, chapterPath, metaPath } = pathsFor(sample);
  const start = Date.now();
  const row = {
    id: sample.id,
    topic: sample.topic,
    existingHtml: sample.existingHtml || null,
    skipped: false,
    generated: false,
  };

  if (flags.resume && fs.existsSync(htmlPath) && fs.existsSync(chapterPath) && !flags.force) {
    row.skipped = true;
    const chapter = loadChapter(chapterPath);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const v = validateRow(sample, chapter, html, htmlPath);
    return { ...row, ...v, elapsedMs: Date.now() - start };
  }

  if (flags.dryRun) {
    const chapter = loadChapter(chapterPath);
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : null;
    if (!chapter && !html && sample.existingHtml) {
      const src = resolveRepoRelative(sample.existingHtml);
      if (fs.existsSync(src)) {
        row.existingHtmlOk = true;
        return { ...row, pass: false, threeElemPass: false, graphOk: false, htmlOk: true, failures: ['no chapter (dry-run)'], elapsedMs: Date.now() - start };
      }
    }
    const v = validateRow(sample, chapter, html, htmlPath);
    return { ...row, ...v, elapsedMs: Date.now() - start };
  }

  if (!opts.apiKey) {
    throw new Error('DEEPSEEK_API_KEY required (use --dry-run to validate existing artifacts only)');
  }

  const body = {
    knowledgePoints: sample.knowledgeText,
    hint: sample.hint,
    title: sample.topic,
  };

  const graphResult = await generateDesignGraph(body, opts);
  if (!graphResult.chapter) {
    return {
      ...row,
      pass: false,
      threeElemPass: false,
      graphOk: false,
      htmlOk: false,
      failures: ['generateDesignGraph: no chapter'],
      elapsedMs: Date.now() - start,
    };
  }

  ensureDir(chapterDir);
  fs.writeFileSync(chapterPath, JSON.stringify(graphResult.chapter, null, 2), 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify({
    id: sample.id,
    savedAt: new Date().toISOString(),
    validation: graphResult.validation,
    quality: graphResult.quality,
  }, null, 2), 'utf8');

  let html;
  if (sample.existingHtml && !flags.force) {
    copyExistingHtml(sample, htmlPath);
    html = fs.readFileSync(htmlPath, 'utf8');
    row.htmlSource = 'existingHtml';
  } else {
    const htmlResult = await generateGameHtml({
      chapter: graphResult.chapter,
      promptBundle: graphResult.promptBundle,
      title: graphResult.inquiryDraft?.title || sample.topic,
      save: false,
    }, opts);
    html = htmlResult.html;
    ensureDir(path.dirname(htmlPath));
    fs.writeFileSync(htmlPath, html, 'utf8');
    row.htmlSource = 'generated';
    row.generated = true;
  }

  const evalResult = evaluateDesignSample(sample, graphResult, { maxQualityErrors: 2 });
  const hv = sample.existingHtml && !flags.force
    ? { ok: true, errors: [] }
    : validateGeneratedHtml(html, graphResult.chapter);

  const pass = evalResult.pass && graphResult.validation?.ok !== false && hv.ok;

  return {
    ...row,
    pass,
    threeElemPass: evalResult.pass,
    threeElemScore: `${evalResult.score}/${evalResult.total}`,
    graphOk: true,
    htmlOk: hv.ok || !!sample.existingHtml,
    qualityOk: graphResult.quality?.ok,
    failures: evalResult.failures.concat(hv.ok ? [] : (hv.errors || [])),
    elapsedMs: Date.now() - start,
  };
}

function printTable(rows) {
  const idW = Math.max(4, ...rows.map(r => r.id.length));
  console.log('');
  console.log(`${'id'.padEnd(idW)}  pass  3elem  graph  html  ms`);
  console.log('-'.repeat(idW + 40));
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(idW)}  ${String(r.pass).padEnd(5)}  ${String(r.threeElemPass ?? '—').padEnd(5)}  ${String(r.graphOk ?? '—').padEnd(5)}  ${String(r.htmlOk ?? '—').padEnd(4)}  ${r.elapsedMs ?? '—'}`,
    );
  }
  const passed = rows.filter(r => r.pass).length;
  console.log('');
  console.log(`Summary: ${passed}/${rows.length} passed`);
}

function writeReports(rows) {
  ensureDir(REPORTS);
  const summary = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    passed: rows.filter(r => r.pass).length,
    threeElemPassRate: rows.length ? rows.filter(r => r.threeElemPass).length / rows.length : 0,
    htmlPassRate: rows.length ? rows.filter(r => r.htmlOk).length / rows.length : 0,
    rows,
  };
  fs.writeFileSync(path.join(REPORTS, 'agent-a-report.json'), JSON.stringify(summary, null, 2), 'utf8');

  const md = [
    '# Agent A 批跑报告',
    '',
    `生成时间：${summary.generatedAt}`,
    '',
    `| 指标 | 值 |`,
    `|------|-----|`,
    `| 样本总数 | ${summary.total} |`,
    `| 全通过 | ${summary.passed} |`,
    `| 三要素通过率 | ${(summary.threeElemPassRate * 100).toFixed(0)}% |`,
    `| HTML 通过率 | ${(summary.htmlPassRate * 100).toFixed(0)}% |`,
    '',
    '| id | pass | 三要素 | 图谱 | HTML |',
    '|----|------|--------|------|------|',
    ...rows.map(r => `| ${r.id} | ${r.pass ? '✓' : '✗'} | ${r.threeElemPass ? '✓' : '✗'} | ${r.graphOk ? '✓' : '✗'} | ${r.htmlOk ? '✓' : '✗'} |`),
  ].join('\n');
  fs.writeFileSync(path.join(REPORTS, 'agent-a-report.md'), md, 'utf8');
  console.log(`Reports: ${REPORTS}/agent-a-report.{json,md}`);
}

async function main() {
  const flags = {
    dryRun: hasFlag('--dry-run'),
    resume: hasFlag('--resume'),
    force: hasFlag('--force'),
  };
  const samples = loadManifest();
  ensureDir(getPackagesRoot());
  ensureDir(REPORTS);

  console.log(`batch-html-dataset: ${samples.length} sample(s)`);
  if (flags.dryRun) console.log('  mode: dry-run');
  if (flags.resume) console.log('  mode: resume');
  if (flags.force) console.log('  mode: force');

  const rows = [];
  for (const sample of samples) {
    process.stdout.write(`  ${sample.id} … `);
    try {
      const row = await runSample(sample, flags);
      rows.push(row);
      console.log(row.pass ? 'OK' : 'FAIL');
    } catch (err) {
      rows.push({
        id: sample.id,
        pass: false,
        failures: [err.message],
        elapsedMs: 0,
      });
      console.log('ERROR', err.message);
    }
  }

  printTable(rows);
  writeReports(rows);
  const blocking = rows.filter((r, i) => !r.pass && !samples[i]?.knownNonBlocking);
  if (blocking.length) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
