/** CLI: node tests/scripts/html-sft-eval.js [--compare] */
const fs = require('fs');
const path = require('path');
const { validateGeneratedHtml } = require('../../packages/generate/html-post-validate');
const { loadAllSamples } = require('../lib/html-samples-manifest');
const {
  getPackageGamePath,
  loadChapterForSample,
  getDatasetTrainingRoot,
  getPackagesRoot,
  getReportsRoot,
} = require('../../packages/shared/data-paths');

require('../../packages/shared/load-env').loadEnv();

const ROOT = path.resolve(__dirname, '../..');
const TRAINING_V2 = path.join(getDatasetTrainingRoot(), 'v2-packages/summary.json');
const TRAINING_V1 = path.join(getDatasetTrainingRoot(), 'v1/summary.json');

const EVAL_IDS = ['multi-kp', 'series-parallel', 'heat-conduction', 'capacitor-confound-ui'];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function evalHtmlPass(id) {
  const chapter = loadChapterForSample(id);
  const htmlPath = getPackageGamePath(id);
  if (!chapter || !fs.existsSync(htmlPath)) {
    return { id, ok: false, reason: 'missing artifact' };
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const v = validateGeneratedHtml(html, chapter);
  const winOk = /winOk:\s*true/.test(html);
  return {
    id,
    ok: v.ok,
    errors: v.errors,
    winOk,
  };
}

function printEvalSet(label) {
  console.log(`${label}:`);
  const rows = EVAL_IDS.map(evalHtmlPass);
  const pass = rows.filter(r => r.ok).length;
  const winOkCount = rows.filter(r => r.winOk).length;
  for (const r of rows) {
    const detail = r.errors?.length ? ` (${r.errors.join(', ')})` : (r.reason ? ` (${r.reason})` : '');
    console.log(`  ${r.id}: ${r.ok ? 'PASS' : 'FAIL'}${detail}`);
  }
  console.log(`  → html validate: ${pass}/${rows.length}, winOk: ${winOkCount}/${rows.length}`);
  return { pass, total: rows.length, rows };
}

function main() {
  const compare = hasFlag('--compare');
  const finetuned = process.env.FINETUNED_MODEL_ID || process.env.HTMLGEN_MODEL;

  console.log('html-sft-eval: eval set (4 samples)');
  console.log(`  packages: ${getPackagesRoot()}`);
  if (finetuned) console.log(`  model env: ${finetuned}`);
  console.log('');

  const result = printEvalSet('current artifacts');

  const manifest = loadAllSamples();
  const trainCount = manifest.samples.filter(s => s.split !== 'eval').length;
  console.log('');
  console.log(`manifest: ${manifest.samples.length} samples (${trainCount} train split)`);

  const summaryPath = fs.existsSync(TRAINING_V2) ? TRAINING_V2 : TRAINING_V1;
  if (fs.existsSync(summaryPath)) {
    const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    console.log(`training (${path.relative(ROOT, summaryPath)}): parse ${s.parse?.train}/${s.parse?.eval}, html ${s.html?.train}/${s.html?.eval} (reject ${s.html?.reject || 0})`);
  }

  if (compare) {
    console.log('');
    console.log('Compare workflow:');
    console.log('  1. Baseline: unset FINETUNED_MODEL_ID, batch eval ids with --force');
    console.log('  2. Fine-tuned: set FINETUNED_MODEL_ID, repeat batch on eval ids');
    console.log('  3. Re-run: npm run html-sft-eval');
    const reportPath = path.join(getReportsRoot(), 'html-sft-compare.json');
    if (fs.existsSync(reportPath)) {
      const cmp = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      console.log('');
      console.log('saved compare:', JSON.stringify(cmp, null, 2));
    }
  } else {
    console.log('');
    console.log('Fine-tune:');
    console.log('  npm run export-training-jsonl');
    console.log('  npm run upload-html-finetune -- --dry-run');
    console.log('  npm run upload-html-finetune -- --poll');
    console.log('  FINETUNED_MODEL_ID=... npm run batch-html-dataset -- --id multi-kp --force');
  }

  if (result.pass < result.total) process.exit(1);
}

main();
