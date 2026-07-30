/** CLI: node tests/scripts/seed-html-samples.js [--catalog] [--catalog-all] [--merge] */
const fs = require('fs');
const path = require('path');
const { getCatalogPath } = require('../../packages/platform/paths');
const { readCatalog, writeCatalog } = require('../../packages/platform/catalog');
const { ensureBuiltinTopics, ensureMacroCategories } = require('../../packages/platform/categories');
const { topicToMacroId } = require('../../packages/platform/category-macros');
const {
  getPackagesRoot,
  getPackageDir,
  getPackageGamePath,
  getPackageChapterPath,
  getPackageManifestPath,
  getDatasetHtmlSamplesRoot,
  resolveRepoRelative,
} = require('../../packages/shared/data-paths');
const { packagePlayUrl } = require('../../packages/shared/package-layout');
const { injectLegacyTrace, auditHtmlContent } = require('../../packages/platform/legacy-trace-inject');

const PACKAGES = getPackagesRoot();
const LEGACY_MANIFEST = path.join(getDatasetHtmlSamplesRoot(), 'manifest.json');
const MANIFEST = getPackageManifestPath();
const CATALOG_DEMO = path.join(getDatasetHtmlSamplesRoot(), 'catalog-demo.json');
const CATALOG = getCatalogPath();
const OUT_CHAPTER_LEGACY = path.join(getDatasetHtmlSamplesRoot(), 'chapters');

const KNOWN_CHAPTERS = {};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadManifestData() {
  const file = fs.existsSync(MANIFEST) ? MANIFEST : LEGACY_MANIFEST;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function seedHtml(sample) {
  if (sample.id === 'capacitor-plate') return false;
  if (!sample.existingHtml) return false;
  const src = resolveRepoRelative(sample.existingHtml);
  const dest = getPackageGamePath(sample.id);
  if (!fs.existsSync(src)) {
    console.warn(`  skip ${sample.id}: missing ${sample.existingHtml}`);
    return false;
  }
  ensureDir(getPackageDir(sample.id));
  let html = fs.readFileSync(src, 'utf8');
  html = injectLegacyTrace(html, sample.id);
  fs.writeFileSync(dest, html, 'utf8');
  return true;
}

function seedChapter(sample) {
  if (sample.id === 'capacitor-plate') return false;
  const src = KNOWN_CHAPTERS[sample.id];
  if (!src || !fs.existsSync(src)) return false;
  ensureDir(getPackageDir(sample.id));
  fs.copyFileSync(src, getPackageChapterPath(sample.id));
  return true;
}

function sampleReady(sample) {
  if (sample.id === 'capacitor-plate') return false;
  return fs.existsSync(getPackageChapterPath(sample.id))
    && fs.existsSync(getPackageGamePath(sample.id));
}

function playabilityTags(sample, htmlPath) {
  const tags = [...(sample.tags || [])];
  if (sample.existingHtml && !tags.includes('existing-html')) tags.unshift('existing-html');
  if (fs.existsSync(htmlPath)) {
    const audit = auditHtmlContent(fs.readFileSync(htmlPath, 'utf8'), sample);
    if (audit.needsFireButton && !tags.includes('button-action')) tags.push('button-action');
    if (!audit.hasRaf && !audit.hasCssAnim && !tags.includes('static-verify')) tags.push('static-verify');
  }
  return tags;
}

function buildCatalogItem(sample) {
  ensureMacroCategories();
  const topic = sample.topic || '';
  const htmlPath = getPackageGamePath(sample.id);
  const descParts = [];
  if (sample.hint) descParts.push(sample.hint);
  if (sample.knowledgeText) descParts.push(sample.knowledgeText);
  return {
    id: `demo-${sample.id}`,
    title: `${topic || sample.id} · ${sample.id}`,
    description: descParts.join(' · ') || sample.id,
    graphId: sample.id,
    playUrl: packagePlayUrl(sample.id),
    published: true,
    featured: false,
    publishedAt: new Date().toISOString(),
    source: 'html-sample',
    categoryId: topicToMacroId(topic),
    topicKey: topic || undefined,
    sampleTags: playabilityTags(sample, htmlPath),
  };
}

function applyCatalogAll(merge) {
  const data = loadManifestData();
  const samples = (data.samples || []).filter(s => s.id !== 'capacitor-plate');
  ensureMacroCategories();

  const catalog = fs.existsSync(CATALOG)
    ? readCatalog()
    : { version: 1, items: [] };

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const sample of samples) {
    if (!sampleReady(sample)) {
      console.warn(`  skip catalog ${sample.id}: missing chapter or html`);
      skipped++;
      continue;
    }
    const item = buildCatalogItem(sample);
    const idx = catalog.items.findIndex(i => i.id === item.id);
    if (idx >= 0) {
      if (merge) {
        catalog.items[idx] = { ...catalog.items[idx], ...item };
        updated++;
      }
    } else {
      catalog.items.push(item);
      added++;
    }
  }

  writeCatalog(catalog);
  console.log(`catalog-all: added ${added}, updated ${updated}, skipped ${skipped} (total items ${catalog.items.length})`);
}

function applyCatalogDemo() {
  if (!fs.existsSync(CATALOG_DEMO)) {
    console.warn('catalog-demo.json missing');
    return;
  }
  const demo = JSON.parse(fs.readFileSync(CATALOG_DEMO, 'utf8'));
  const catalog = fs.existsSync(CATALOG)
    ? readCatalog()
    : { version: 1, items: [] };
  const ids = new Set(catalog.items.map(i => i.id));
  for (const item of (demo.items || []).filter(i => i.id !== 'demo-capacitor-plate')) {
    if (ids.has(item.id)) continue;
    catalog.items.push(item);
    ids.add(item.id);
  }
  writeCatalog(catalog);
  console.log(`catalog: added demo item(s) (skipped duplicates)`);
}

function postProcessLegacyGenerated(sample) {
  if (sample.id === 'capacitor-plate') return false;
  if (!sample.existingHtml) return false;
  const dest = getPackageGamePath(sample.id);
  if (!fs.existsSync(dest)) return false;
  const html = injectLegacyTrace(fs.readFileSync(dest, 'utf8'), sample.id);
  fs.writeFileSync(dest, html, 'utf8');
  return true;
}

function syncManifestCopy(data) {
  ensureDir(PACKAGES);
  const filtered = {
    ...data,
    samples: (data.samples || []).filter(s => s.id !== 'capacitor-plate'),
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(filtered, null, 2), 'utf8');
  if (fs.existsSync(LEGACY_MANIFEST)) {
    fs.writeFileSync(LEGACY_MANIFEST, JSON.stringify(filtered, null, 2), 'utf8');
  }
}

function main() {
  const data = loadManifestData();
  syncManifestCopy(data);
  let htmlCount = 0;
  let chapterCount = 0;
  let legacyPatched = 0;
  for (const sample of data.samples || []) {
    if (sample.id === 'capacitor-plate') continue;
    if (seedHtml(sample)) htmlCount++;
    else if (postProcessLegacyGenerated(sample)) legacyPatched++;
    if (seedChapter(sample)) chapterCount++;
  }
  console.log(`seed-html-samples: ${htmlCount} html copied, ${legacyPatched} legacy patched, ${chapterCount} chapter(s) copied`);
  if (process.argv.includes('--catalog-all')) {
    applyCatalogAll(process.argv.includes('--merge'));
  } else if (process.argv.includes('--catalog')) {
    applyCatalogDemo();
  }
}

main();
