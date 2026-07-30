/**
 * Export Strategy-first + priority 图谱.html for one or all catalog samples.
 *
 *   node tests/scripts/export-priority-graphs.js
 *   node tests/scripts/export-priority-graphs.js --id projectile-basic
 *
 * Writes:
 *   data/runtime/packages/{id}/图谱.html
 *   样本html/{dir}/图谱.html
 * Does not mutate chapter.json.
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml'); // 样本html

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function exportOne(entry) {
  const pkgDir = path.join(getPackagesRoot(), entry.id);
  const chapterPath = path.join(pkgDir, 'chapter.json');
  if (!fs.existsSync(chapterPath)) {
    return { id: entry.id, ok: false, error: 'chapter.json missing' };
  }
  const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const metaPath = path.join(pkgDir, 'meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const title = meta.title || chapter.kg?.title || chapter.strategy?.title || entry.topic || entry.id;
  const sampleDir = path.join(YANG, entry.dir);
  try {
    const result = writePriorityGraphFiles({
      chapter,
      title,
      runtimeDir: pkgDir,
      sampleDir,
    });
    return { id: entry.id, ok: true, bytes: result.bytes, outs: result.outs };
  } catch (e) {
    return { id: entry.id, ok: false, error: e.message };
  }
}

function main() {
  const filterId = argValue('--id');
  const entries = filterId
    ? YANG_MAP.filter(e => e.id === filterId)
    : YANG_MAP;
  if (!entries.length) {
    console.error('no matching sample for', filterId);
    process.exit(1);
  }
  const rows = [];
  for (const entry of entries) {
    const row = exportOne(entry);
    rows.push(row);
    console.log(row.ok ? 'OK' : 'FAIL', entry.id, row.error || `${row.bytes} bytes`);
  }
  const passed = rows.filter(r => r.ok).length;
  console.log(`Done: ${passed}/${rows.length} exported`);
  if (passed < rows.length) process.exit(1);
}

main();
