const fs = require('fs');
const path = require('path');
const { getCatalogPath, getPlatformRoot } = require('./paths');
const { getPackagesRoot } = require('../shared/data-paths');
const { resolvePackageId } = require('../shared/package-layout');
const { inferTopicFromCatalogItem, topicToMacroId } = require('./category-macros');
const {
  filterStudentCatalog,
  isResearchInclude,
  isObserveOnly,
  craftTier,
} = require('./catalog-visibility');

function defaultCatalog() {
  return { version: 1, items: [] };
}

function readCatalog() {
  const file = getCatalogPath();
  if (!fs.existsSync(file)) return defaultCatalog();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { version: data.version || 1, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return defaultCatalog();
  }
}

function writeCatalog(catalog) {
  fs.mkdirSync(getPlatformRoot(), { recursive: true });
  fs.writeFileSync(getCatalogPath(), JSON.stringify(catalog, null, 2), 'utf8');
}

function listCatalog({ publishedOnly = false, studentVisible = false } = {}) {
  let items = readCatalog().items;
  if (publishedOnly) items = items.filter(i => i.published);
  if (studentVisible) items = filterStudentCatalog(items);
  return items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}

function getCatalogItem(id) {
  return readCatalog().items.find(i => i.id === id) || null;
}

function loadChapterForGraph(graphId) {
  if (!graphId) return null;
  const packageId = resolvePackageId(graphId);
  const root = getPackagesRoot();
  const single = path.join(root, packageId, 'chapter.json');
  if (fs.existsSync(single)) {
    return JSON.parse(fs.readFileSync(single, 'utf8'));
  }
  const project = path.join(root, packageId, 'chapters.json');
  if (fs.existsSync(project)) {
    const chapters = JSON.parse(fs.readFileSync(project, 'utf8'));
    return Array.isArray(chapters) ? chapters[0] : chapters;
  }
  return null;
}

function isProtectedPackageGraph(graphId) {
  const packageId = resolvePackageId(graphId);
  const manifestPath = path.join(getPackagesRoot(), 'manifest.json');
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const { samples = [] } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return samples.some(s => s.id === packageId && s.id !== 'capacitor-plate');
  } catch {
    return false;
  }
}

function findCatalogRefsForGraph(graphId) {
  return readCatalog().items
    .filter(i => i.graphId === graphId || resolvePackageId(i.graphId) === resolvePackageId(graphId))
    .map(i => ({ id: i.id, title: i.title }));
}

function findCatalogRefsForPlayUrl(playUrl) {
  return readCatalog().items
    .filter(i => i.playUrl === playUrl)
    .map(i => ({ id: i.id, title: i.title }));
}

function deleteCatalogItem(id, { forceFeatured = false } = {}) {
  const catalog = readCatalog();
  const idx = catalog.items.findIndex(i => i.id === id);
  if (idx < 0) return { ok: false, error: 'not_found' };
  const item = catalog.items[idx];
  if (item.featured && !forceFeatured) {
    return { ok: false, error: 'featured_protected' };
  }
  catalog.items.splice(idx, 1);
  writeCatalog(catalog);
  return { ok: true, deleted: item };
}

function publishGame(body) {
  const catalog = readCatalog();
  const graphId = String(body.graphId || '').trim();
  const playUrl = String(body.playUrl || '').trim();
  const title = String(body.title || '').trim();
  if (!graphId || !playUrl) {
    return { ok: false, error: 'graphId_and_playUrl_required' };
  }
  const chapter = loadChapterForGraph(graphId);
  if (!chapter) {
    return { ok: false, error: 'chapter_not_found_for_graphId' };
  }
  const id = body.id || `game-${Date.now()}`;
  const item = {
    id,
    title: title || graphId,
    graphId,
    playUrl,
    published: body.published !== false,
    publishedAt: new Date().toISOString(),
    description: body.description || '',
  };
  if (body.categoryId) item.categoryId = String(body.categoryId);
  if (body.topicKey) item.topicKey = String(body.topicKey);
  if (body.source) item.source = body.source;
  if (body.sampleTags) item.sampleTags = body.sampleTags;
  if (body.featured != null) item.featured = !!body.featured;
  if (typeof body.researchInclude === 'boolean') item.researchInclude = body.researchInclude;
  if (!item.categoryId) {
    const topic = inferTopicFromCatalogItem({ title: item.title, topicKey: body.topicKey });
    if (topic) {
      item.topicKey = topic;
      item.categoryId = topicToMacroId(topic);
    }
  } else if (!item.topicKey) {
    const topic = inferTopicFromCatalogItem({ title: item.title, categoryId: item.categoryId });
    if (topic) item.topicKey = topic;
  }
  const idx = catalog.items.findIndex(i => i.id === id);
  if (idx >= 0) catalog.items[idx] = { ...catalog.items[idx], ...item };
  else catalog.items.unshift(item);
  writeCatalog(catalog);
  return { ok: true, item };
}

function setPublished(id, published) {
  const catalog = readCatalog();
  const item = catalog.items.find(i => i.id === id);
  if (!item) return { ok: false, error: 'not_found' };
  item.published = !!published;
  if (published) item.publishedAt = new Date().toISOString();
  writeCatalog(catalog);
  return { ok: true, item };
}

module.exports = {
  readCatalog,
  writeCatalog,
  listCatalog,
  getCatalogItem,
  loadChapterForGraph,
  isProtectedPackageGraph,
  publishGame,
  setPublished,
  deleteCatalogItem,
  findCatalogRefsForGraph,
  findCatalogRefsForPlayUrl,
  filterStudentCatalog,
  isResearchInclude,
  isObserveOnly,
  craftTier,
};
