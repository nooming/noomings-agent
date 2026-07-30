/** CLI: node tests/scripts/migrate-catalog-categories.js [--dry-run] */
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog } = require('../../packages/platform/catalog');
const { ensureMacroCategories } = require('../../packages/platform/categories');
const {
  topicToMacroId,
  inferTopicFromCatalogItem,
} = require('../../packages/platform/category-macros');
const { getAgentOutputRoot } = require('../../packages/shared/paths');
const { getGamesGeneratedRoot } = require('../../packages/shared/data-paths');
const { readIndex, writeIndex } = require('../../packages/generate/graph-persist');
const { loadManifest } = require('../../packages/platform/html-samples-index');

const TEACHER_GRAPH_KEEP = '电容纪元-静电城邦-20260702-154833';
const TEACHER_CATALOG_KEEP = 'capacitor-era';
const PROJECTILE_GRAPH_REMOVE = '平抛运动-调节发射参数使小球入筐-20260702-181112';

function isTeacherCatalogItem(item) {
  if (item.id === TEACHER_CATALOG_KEEP) return true;
  if (item.source === 'html-sample') return false;
  if (item.source === 'teacher') return true;
  if (String(item.id).startsWith('game-')) return true;
  if (!item.source && !String(item.graphId || '').startsWith('html-samples-')) return true;
  return false;
}

function shouldRemoveTeacherItem(item) {
  return isTeacherCatalogItem(item) && item.id !== TEACHER_CATALOG_KEEP;
}

function topicFromManifest(sampleId) {
  const { samples = [] } = loadManifest();
  const hit = samples.find(s => s.id === sampleId);
  return hit?.topic || '';
}

function stripSamplePrefix(title) {
  return String(title || '').replace(/^【样本集】/, '').trim();
}

function migrateCatalogItem(item) {
  const next = { ...item };
  next.title = stripSamplePrefix(next.title);

  if (next.graphId === PROJECTILE_GRAPH_REMOVE) {
    if (next.source === 'html-sample' || String(next.id).startsWith('demo-')) {
      next.graphId = 'html-samples-projectile-target';
      next.topicKey = topicFromManifest('projectile-target') || '平抛';
      if (!next.sampleTags) next.sampleTags = ['generate'];
    }
  }

  const topic = inferTopicFromCatalogItem(next)
    || topicFromManifest(String(next.id).replace(/^demo-/, ''));
  if (topic) next.topicKey = topic;
  next.categoryId = topicToMacroId(next.topicKey || topic);

  if (next.id === TEACHER_CATALOG_KEEP) {
    next.categoryId = topicToMacroId('电容');
    next.topicKey = '电容';
    next.source = 'teacher';
  }

  return next;
}

function purgeOutputIndex(dryRun) {
  const root = getAgentOutputRoot();
  const index = readIndex(root);
  const before = index.items.length;
  index.items = index.items.filter(i => {
    if (i.id === TEACHER_GRAPH_KEEP) return true;
    if (i.id === PROJECTILE_GRAPH_REMOVE) return false;
    if (!String(i.id).startsWith('html-samples-')) return false;
    return true;
  });
  if (index.latest === PROJECTILE_GRAPH_REMOVE) {
    index.latest = index.items[0]?.id || null;
  }
  if (!dryRun && index.items.length !== before) {
    writeIndex(root, index);
  }
  return { removed: before - index.items.length, remaining: index.items.length };
}

function purgeGeneratedHtml(dryRun) {
  const dir = getGamesGeneratedRoot();
  if (!fs.existsSync(dir)) return { removed: 0 };
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.includes('平抛运动') || !name.endsWith('.html')) continue;
    const abs = path.join(dir, name);
    if (!dryRun) fs.unlinkSync(abs);
    removed++;
  }
  return { removed };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  ensureMacroCategories();

  const catalog = readCatalog();
  const removedTeacher = [];
  const kept = [];

  for (const item of catalog.items) {
    if (shouldRemoveTeacherItem(item)) {
      removedTeacher.push(item.id);
    } else {
      kept.push(migrateCatalogItem(item));
    }
  }

  const outIndex = purgeOutputIndex(dryRun);
  const htmlPurge = purgeGeneratedHtml(dryRun);

  console.log(`teacher catalog removed: ${removedTeacher.length}${removedTeacher.length ? ` (${removedTeacher.join(', ')})` : ''}`);
  console.log(`catalog kept: ${kept.length} items (macro categories applied)`);
  console.log(`output index: removed ${outIndex.removed}, remaining ${outIndex.remaining}`);
  console.log(`generated html purge: ${htmlPurge.removed} file(s)`);

  if (!dryRun) {
    writeCatalog({ ...catalog, items: kept });
    console.log('catalog.json written');
  } else {
    console.log('dry-run: no files written');
  }
}

main();
