const fs = require('fs');
const path = require('path');
const { findCatalogRefsForGraph } = require('../platform/catalog');

function isSafeGraphId(graphId) {
  if (!graphId || typeof graphId !== 'string') return false;
  const id = graphId.trim();
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) return false;
  return true;
}

function readIndex(root) {
  const file = path.join(root, 'index.json');
  if (!fs.existsSync(file)) return { latest: null, items: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { latest: data.latest || null, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { latest: null, items: [] };
  }
}

function writeIndex(root, index) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

function deleteGeneratedGraph(graphId, outputRoot, { force = false } = {}) {
  if (!isSafeGraphId(graphId)) {
    return { ok: false, error: 'invalid_graphId' };
  }
  const id = graphId.trim();
  const referencedBy = findCatalogRefsForGraph(id);
  if (referencedBy.length && !force) {
    return { ok: false, error: 'referenced_by_catalog', referencedBy };
  }

  const dir = path.join(outputRoot, id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const index = readIndex(outputRoot);
  index.items = index.items.filter(i => i.id !== id);
  if (index.latest === id) {
    index.latest = index.items[0]?.id || null;
  }
  writeIndex(outputRoot, index);

  return { ok: true, graphId: id, referencedBy };
}

module.exports = {
  deleteGeneratedGraph,
  isSafeGraphId,
  readIndex,
  writeIndex,
};
