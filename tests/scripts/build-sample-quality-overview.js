/**
 * Build sample × graph × quality overview JSON for teacher UI.
 *
 *   node tests/scripts/build-sample-quality-overview.js
 *
 * Writes:
 *   apps/web/ui/data/sample-quality-overview.json
 *   data/runtime/packages/reports/sample-quality-overview.json
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const { inquiryValidityTier } = require('../lib/inquiry-validity');
const { assessNarrativeCleanliness } = require('../lib/narrative-cleanliness');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml'); // 样本html
const UI_DATA = path.join(ROOT, 'apps/web/ui/data');
const REPORTS = path.join(getPackagesRoot(), 'reports');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const rows = YANG_MAP.map(entry => {
    const pkgDir = path.join(getPackagesRoot(), entry.id);
    const sampleDir = path.join(YANG, entry.dir);
    const meta = readJson(path.join(pkgDir, 'meta.json')) || {};
    const chapter = readJson(path.join(pkgDir, 'chapter.json'));
    const hasRuntimeGraph = fs.existsSync(path.join(pkgDir, '\u56fe\u8c31.html'));
    const hasSampleGraph = fs.existsSync(path.join(sampleDir, '\u56fe\u8c31.html'));
    const hasGame = fs.existsSync(path.join(pkgDir, 'game.html'))
      || fs.existsSync(path.join(sampleDir, entry.game));
    const q = meta.quality || {};
    const validity = chapter ? inquiryValidityTier(chapter) : null;
    const narrative = chapter ? assessNarrativeCleanliness(chapter) : null;
    return {
      id: entry.id,
      dir: entry.dir,
      topic: entry.topic || entry.dir,
      title: meta.title || chapter?.kg?.title || entry.topic || entry.id,
      hasGraph: !!(hasRuntimeGraph || hasSampleGraph),
      hasGame: !!hasGame,
      qualityOk: !!q.ok,
      qualityScore: q.score != null ? q.score : null,
      qualityErrors: Array.isArray(q.errors) ? q.errors.slice(0, 3) : [],
      inquiryValidity: validity?.tier || null,
      inquiryValidityScore: validity?.score ?? null,
      inquiryValidityReasons: validity?.reasons || [],
      narrativeCleanScore: narrative?.score ?? null,
      narrativeDirty: !!narrative?.dirty,
      playUrl: `/static/packages/${entry.id}/game.html`,
      graphUrl: `/static/packages/${entry.id}/${encodeURIComponent('\u56fe\u8c31.html')}`,
      sampleGraphPath: `样本html/${entry.dir}/图谱.html`,
    };
  });

  const passed = rows.filter(r => r.qualityOk).length;
  const withGraph = rows.filter(r => r.hasGraph).length;
  const byValidity = { 强: 0, 中: 0, 弱: 0 };
  for (const r of rows) {
    if (r.inquiryValidity && byValidity[r.inquiryValidity] != null) byValidity[r.inquiryValidity] += 1;
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    qualityPassed: passed,
    withGraph,
    inquiryValidityDist: byValidity,
    narrativeDirtyCount: rows.filter(r => r.narrativeDirty).length,
    rows,
  };

  fs.mkdirSync(UI_DATA, { recursive: true });
  fs.mkdirSync(REPORTS, { recursive: true });
  const uiOut = path.join(UI_DATA, 'sample-quality-overview.json');
  const reportOut = path.join(REPORTS, 'sample-quality-overview.json');
  fs.writeFileSync(uiOut, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(reportOut, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`OK ${withGraph}/${rows.length} graphs; quality ${passed}/${rows.length}; validity 强/中/弱=${byValidity['强']}/${byValidity['中']}/${byValidity['弱']}`);
  console.log('wrote', uiOut);
  console.log('wrote', reportOut);
}

main();
