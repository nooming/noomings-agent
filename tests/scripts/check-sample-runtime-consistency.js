/**
 * runtime ↔ 样本html ↔ 图谱 一致性校验
 * 用法: node tests/scripts/check-sample-runtime-consistency.js
 * 输出: data/runtime/analysis/reports/sample-runtime-consistency.json (+ .md)
 */
const fs = require('fs');
const path = require('path');
const { getReportsRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const PKG_ROOT = path.join(ROOT, 'data/runtime/packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');
const MANIFEST = path.join(SAMPLE_ROOT, '清单.md');
const OUT_JSON = path.join(getReportsRoot(), 'sample-runtime-consistency.json');
const OUT_MD = path.join(getReportsRoot(), 'sample-runtime-consistency.md');

function parseManifest() {
  if (!fs.existsSync(MANIFEST)) return [];
  const text = fs.readFileSync(MANIFEST, 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([a-z0-9-]+)\s*\|/);
    if (!m) continue;
    const cnPath = m[1].trim();
    const id = m[2].trim();
    if (cnPath.includes('中文路径') || cnPath.startsWith('-')) continue;
    rows.push({ cnPath, id });
  }
  return rows;
}

function extractRangeIds(html) {
  return [...new Set([...html.matchAll(/id=["'](s-[a-z0-9-]+)["']/g)].map((x) => x[1]))].sort();
}

function extractCvIds(chapter) {
  const controls = chapter?.traceMap?.controls || {};
  return Object.entries(controls)
    .filter(([, v]) => v && (v.role === 'irrelevant' || v.role === 'confounding'))
    .map(([k]) => k)
    .filter((k) => k.startsWith('s-') || k.startsWith('in-') || k === 'audio-volume')
    .sort();
}

function main() {
  const pairs = parseManifest();
  const errors = [];
  const warnings = [];
  const items = [];

  for (const { cnPath, id } of pairs) {
    const gamePath = path.join(PKG_ROOT, id, 'game.html');
    const chapterPath = path.join(PKG_ROOT, id, 'chapter.json');
    const sampleGame = path.join(SAMPLE_ROOT, ...cnPath.split(/[\\/]/));
    const sampleDir = path.dirname(sampleGame);
    const sampleGraph = path.join(sampleDir, '图谱.html');
    const runtimeGraph = path.join(PKG_ROOT, id, '图谱.html');

    const item = { id, cnPath, ok: true, issues: [] };

    if (!fs.existsSync(gamePath)) {
      item.ok = false;
      item.issues.push('missing_runtime_game');
      errors.push(`${id}: missing runtime game.html`);
    }
    if (!fs.existsSync(chapterPath)) {
      item.ok = false;
      item.issues.push('missing_chapter');
      errors.push(`${id}: missing chapter.json`);
    }
    if (!fs.existsSync(sampleGame)) {
      item.ok = false;
      item.issues.push('missing_sample_game');
      errors.push(`${id}: missing 样本html ${cnPath}`);
    }
    if (!fs.existsSync(sampleGraph) && !fs.existsSync(runtimeGraph)) {
      warnings.push(`${id}: no 图谱.html in sample or runtime`);
      item.issues.push('missing_graph_html');
    }

    if (fs.existsSync(gamePath) && fs.existsSync(sampleGame)) {
      const rg = fs.readFileSync(gamePath, 'utf8');
      const sg = fs.readFileSync(sampleGame, 'utf8');
      const rIds = extractRangeIds(rg);
      const sIds = extractRangeIds(sg);
      const onlyR = rIds.filter((x) => !sIds.includes(x));
      const onlyS = sIds.filter((x) => !rIds.includes(x));
      if (onlyR.length || onlyS.length) {
        item.ok = false;
        item.issues.push('range_id_mismatch');
        errors.push(`${id}: range id mismatch runtime[${onlyR}] sample[${onlyS}]`);
      }
      item.rangeIds = rIds;

      if (fs.existsSync(chapterPath)) {
        const ch = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
        const cvs = extractCvIds(ch);
        const missingInGame = cvs.filter((c) => !rg.includes(`id="${c}"`) && !rg.includes(`id='${c}'`) && !rg.includes(c));
        // only flag slider-like CVs
        const sliderMissing = missingInGame.filter((c) => c.startsWith('s-') || c.startsWith('in-'));
        if (sliderMissing.length) {
          warnings.push(`${id}: chapter CV ids not obvious in game: ${sliderMissing.join(',')}`);
          item.issues.push('cv_id_uncertain');
        }
        item.chapterCvIds = cvs;
      }
    }

    items.push(item);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    pairCount: pairs.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    items,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const md = [
    '# runtime ↔ 样本html 一致性',
    '',
    `生成：${report.generatedAt}`,
    `配对：${report.pairCount} · 错误：${report.errorCount} · 警告：${report.warningCount}`,
    '',
    '## 错误',
    ...(errors.length ? errors.map((e) => `- ${e}`) : ['- （无）']),
    '',
    '## 警告',
    ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['- （无）']),
    '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md, 'utf8');

  console.log(JSON.stringify({ ok: errors.length === 0, errorCount: errors.length, warningCount: warnings.length, out: OUT_JSON }, null, 2));
  if (errors.length) process.exitCode = 1;
}

main();
