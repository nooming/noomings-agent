const fs = require('fs');
const { getCategoriesPath, getPlatformRoot } = require('./paths');
const { readCatalog, writeCatalog } = require('./catalog');
const { listMacroDefinitions } = require('./category-macros');

function defaultCategories() {
  return { version: 1, items: [] };
}

function readCategories() {
  const file = getCategoriesPath();
  if (!fs.existsSync(file)) return defaultCategories();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { version: data.version || 1, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return defaultCategories();
  }
}

function writeCategories(data) {
  fs.mkdirSync(getPlatformRoot(), { recursive: true });
  fs.writeFileSync(getCategoriesPath(), JSON.stringify(data, null, 2), 'utf8');
}

function slugTopic(topic) {
  return String(topic || 'other')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '') || 'other';
}

function listCategories({ kind } = {}) {
  let items = readCategories().items.slice();
  if (kind === 'macro') {
    items = items.filter(c => String(c.id).startsWith('macro-'));
  } else if (kind === 'topic') {
    items = items.filter(c => String(c.id).startsWith('topic-'));
  }
  return items.sort((a, b) => {
    if (!!a.builtin !== !!b.builtin) return a.builtin ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });
}

function ensureMacroCategories() {
  const data = readCategories();
  let changed = false;
  for (const { id, name } of listMacroDefinitions()) {
    if (data.items.some(c => c.id === id)) continue;
    data.items.push({ id, name, builtin: true, kind: 'macro' });
    changed = true;
  }
  if (changed) writeCategories(data);
  return listCategories({ kind: 'macro' });
}

function getCategory(id) {
  if (!id) return null;
  return readCategories().items.find(c => c.id === id) || null;
}

function ensureTopicCategory(topic) {
  const name = String(topic || '').trim();
  if (!name) return null;
  const data = readCategories();
  let hit = data.items.find(c => c.topicKey === name || c.name === name);
  if (hit) return hit;
  const id = `topic-${slugTopic(name)}`;
  if (data.items.some(c => c.id === id)) {
    hit = data.items.find(c => c.id === id);
    if (hit) return hit;
  }
  hit = { id, name, builtin: true, topicKey: name };
  data.items.push(hit);
  writeCategories(data);
  return hit;
}

function ensureBuiltinTopics(topics) {
  const seen = new Set();
  for (const topic of topics) {
    const t = String(topic || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    ensureTopicCategory(t);
  }
  return listCategories();
}

function createCategory(name) {
  const label = String(name || '').trim();
  if (!label) return { ok: false, error: 'name_required' };
  const data = readCategories();
  if (data.items.some(c => c.name === label)) {
    return { ok: false, error: 'duplicate_name' };
  }
  const item = { id: `cat-${Date.now()}`, name: label, builtin: false };
  data.items.push(item);
  writeCategories(data);
  return { ok: true, item };
}

function deleteCategory(id, { reassignTo } = {}) {
  const data = readCategories();
  const idx = data.items.findIndex(c => c.id === id);
  if (idx < 0) return { ok: false, error: 'not_found' };
  const cat = data.items[idx];
  const catalog = readCatalog();
  const refs = catalog.items.filter(i => i.categoryId === id);
  if (refs.length && !reassignTo) {
    return { ok: false, error: 'category_in_use', count: refs.length, catalogIds: refs.map(r => r.id) };
  }
  if (refs.length && reassignTo) {
    const target = getCategory(reassignTo);
    if (!target) return { ok: false, error: 'reassign_target_not_found' };
    for (const item of catalog.items) {
      if (item.categoryId === id) item.categoryId = reassignTo;
    }
    writeCatalog(catalog);
  }
  data.items.splice(idx, 1);
  writeCategories(data);
  return { ok: true, deleted: cat };
}

function setCatalogCategory(catalogId, categoryId) {
  const catalog = readCatalog();
  const item = catalog.items.find(i => i.id === catalogId);
  if (!item) return { ok: false, error: 'catalog_not_found' };
  if (categoryId && !getCategory(categoryId)) {
    return { ok: false, error: 'category_not_found' };
  }
  if (categoryId) item.categoryId = categoryId;
  else delete item.categoryId;
  writeCatalog(catalog);
  return { ok: true, item };
}

module.exports = {
  listCategories,
  getCategory,
  ensureTopicCategory,
  ensureBuiltinTopics,
  ensureMacroCategories,
  createCategory,
  deleteCategory,
  setCatalogCategory,
  readCategories,
  writeCategories,
};
