/** CLI: node tests/scripts/export-llm-training-jsonl.js [--out data/datasets/training/v1] */
const fs = require('fs');
const path = require('path');
const { buildLlmPromptBundle, HTMLGEN_SYSTEM } = require('../../packages/generate/export/llm-prompt-bundle');
const { PARSE_SYSTEM } = require('../../packages/generate/design-pipeline');
const { validateGeneratedHtml } = require('../../packages/generate/html-post-validate');

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST = path.join(ROOT, 'data/datasets/html-samples/manifest.json');
const CHAPTER_ROOT = path.join(ROOT, 'data/datasets/html-samples/chapters');
const HTML_ROOT = path.join(ROOT, 'data/datasets/html-samples/generated');

const DEFAULT_EVAL_IDS = new Set([
  'multi-kp',
  'series-parallel',
  'heat-conduction',
  'capacitor-confound-ui',
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonl(file, rows) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function loadChapter(id) {
  const p = path.join(CHAPTER_ROOT, id, 'chapter.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function splitOf(sample) {
  if (sample.split === 'eval' || sample.split === 'train') return sample.split;
  return DEFAULT_EVAL_IDS.has(sample.id) ? 'eval' : 'train';
}

function exportParseRows(sample, chapter) {
  const script = chapter?.inquiryScript;
  if (!script?.knowledgePoints?.length) return null;
  const userParts = [
    sample.knowledgeText,
    sample.hint ? `\n补充：${sample.hint}` : '',
    sample.topic ? `\n主题：${sample.topic}` : '',
  ].filter(Boolean).join('');
  return {
    id: sample.id,
    task: 'parse_sft',
    messages: [
      { role: 'system', content: PARSE_SYSTEM },
      { role: 'user', content: userParts },
      { role: 'assistant', content: JSON.stringify(script, null, 2) },
    ],
  };
}

function exportHtmlRows(sample, chapter, html) {
  if (!chapter || !html) return null;
  const bundle = buildLlmPromptBundle(chapter);
  const validation = validateGeneratedHtml(html, chapter);
  return {
    id: sample.id,
    task: 'html_sft',
    htmlValidation: validation,
    messages: [
      { role: 'system', content: HTMLGEN_SYSTEM },
      { role: 'user', content: bundle.user },
      { role: 'assistant', content: html },
    ],
  };
}

function exportHtmlDpoReject(sample, chapter, html) {
  if (!chapter || !html) return null;
  const bundle = buildLlmPromptBundle(chapter);
  const validation = validateGeneratedHtml(html, chapter);
  if (validation.ok) return null;
  return {
    id: sample.id,
    task: 'html_dpo_reject',
    errors: validation.errors,
    messages: [
      { role: 'system', content: HTMLGEN_SYSTEM },
      { role: 'user', content: bundle.user },
      { role: 'assistant', content: html },
    ],
    rejected: true,
    reject_reason: validation.errors.join('; '),
  };
}

function main() {
  const outRoot = process.argv.includes('--out')
    ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
    : path.join(ROOT, 'data/datasets/training/v1');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const parseTrain = [];
  const parseEval = [];
  const htmlTrain = [];
  const htmlEval = [];
  const htmlReject = [];
  const skipped = [];

  for (const sample of manifest.samples || []) {
    const chapter = loadChapter(sample.id);
    const htmlPath = path.join(HTML_ROOT, `${sample.id}.html`);
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : null;
    const split = splitOf(sample);

    const parseRow = exportParseRows(sample, chapter);
    if (parseRow) {
      (split === 'eval' ? parseEval : parseTrain).push(parseRow);
    } else if (chapter) {
      skipped.push(`${sample.id}: parse (no inquiryScript)`);
    }

    const htmlRow = exportHtmlRows(sample, chapter, html);
    if (htmlRow) {
      if (htmlRow.htmlValidation.ok) {
        (split === 'eval' ? htmlEval : htmlTrain).push(htmlRow);
      } else {
        const rej = exportHtmlDpoReject(sample, chapter, html);
        if (rej) htmlReject.push(rej);
        skipped.push(`${sample.id}: html validation ${htmlRow.htmlValidation.errors.join(',')}`);
      }
    } else if (!html) {
      skipped.push(`${sample.id}: no html`);
    }
  }

  writeJsonl(path.join(outRoot, 'parse/train.jsonl'), parseTrain);
  writeJsonl(path.join(outRoot, 'parse/eval.jsonl'), parseEval);
  writeJsonl(path.join(outRoot, 'html/train.jsonl'), htmlTrain);
  writeJsonl(path.join(outRoot, 'html/eval.jsonl'), htmlEval);
  writeJsonl(path.join(outRoot, 'html/reject.jsonl'), htmlReject);

  const summary = {
    exportedAt: new Date().toISOString(),
    parse: { train: parseTrain.length, eval: parseEval.length },
    html: { train: htmlTrain.length, eval: htmlEval.length, reject: htmlReject.length },
    skipped,
  };
  fs.writeFileSync(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('export-llm-training-jsonl: OK');
  console.log(`  out: ${outRoot}`);
  console.log(`  parse train/eval: ${parseTrain.length}/${parseEval.length}`);
  console.log(`  html  train/eval/reject: ${htmlTrain.length}/${htmlEval.length}/${htmlReject.length}`);
  if (skipped.length) console.log(`  skipped: ${skipped.length}`);
}

main();
