/** CLI: node tests/scripts/seed-platform-demo.js [--merge]
 *  注册样本集演示任务到 platform catalog（供录屏 / Agent B 评判）
 */
const fs = require('fs');
const path = require('path');
const { loadChapterForGraph } = require('../../packages/platform/catalog');
const { getCatalogPath } = require('../../packages/platform/paths');
const { getDatasetHtmlSamplesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG = getCatalogPath();
const CHAPTER_ROOT = path.join(getDatasetHtmlSamplesRoot(), 'chapters');
const HTML_ROOT = path.join(getDatasetHtmlSamplesRoot(), 'generated');

const DEMO_ITEMS = [
  {
    id: 'demo-multi-kp',
    title: '【样本集】机械能双公式',
    description: 'multi-kp：mgh 与 ½mv² 多 KP + 混淆控件 I1',
    graphId: 'html-samples-multi-kp',
    playUrl: '/static/html-samples/generated/multi-kp.html',
    published: true,
    featured: true,
  },
  {
    id: 'demo-capacitor-confound-ui',
    title: '【样本集】电容与混淆 UI',
    description: 'capacitor-confound-ui：混淆变量与无关控件',
    graphId: 'html-samples-capacitor-confound-ui',
    playUrl: '/static/html-samples/generated/capacitor-confound-ui.html',
    published: true,
    featured: false,
  },
  {
    id: 'demo-projectile-basic',
    title: '【样本集】斜抛射程探究',
    description: '调节角度与初速度，探究平抛射程',
    graphId: 'html-samples-projectile-basic',
    playUrl: '/static/html-samples/generated/projectile-basic.html',
    published: true,
    featured: false,
  },
];

function chapterReady(sampleId) {
  return fs.existsSync(path.join(CHAPTER_ROOT, sampleId, 'chapter.json'))
    && fs.existsSync(path.join(HTML_ROOT, `${sampleId}.html`));
}

function main() {
  const merge = process.argv.includes('--merge');
  const catalog = fs.existsSync(CATALOG)
    ? JSON.parse(fs.readFileSync(CATALOG, 'utf8'))
    : { version: 1, items: [] };

  let added = 0;
  let updated = 0;
  for (const item of DEMO_ITEMS) {
    const sampleId = item.graphId.replace(/^html-samples-/, '');
    if (!chapterReady(sampleId)) {
      console.warn(`  skip ${item.id}: missing chapter/html for ${sampleId}`);
      continue;
    }
    const chapter = loadChapterForGraph(item.graphId);
    if (!chapter) {
      console.warn(`  skip ${item.id}: loadChapterForGraph failed`);
      continue;
    }
    const idx = catalog.items.findIndex(i => i.id === item.id);
    if (idx >= 0) {
      if (merge) {
        catalog.items[idx] = { ...catalog.items[idx], ...item };
        updated++;
      }
    } else {
      catalog.items.unshift({ ...item, publishedAt: new Date().toISOString() });
      added++;
    }
  }

  fs.mkdirSync(path.dirname(CATALOG), { recursive: true });
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`seed-platform-demo: added ${added}, updated ${updated}`);
  console.log(`  catalog: ${CATALOG}`);
}

main();
