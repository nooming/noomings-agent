const { readCatalog } = require('../../../../packages/platform/catalog');
const { listPublishPairs } = require('../../../../packages/platform/publish-pairs');

function catalogPairIntegrityCheck() {
  const catalog = readCatalog();
  const pairs = listPublishPairs();
  const pairByGraph = new Map(pairs.map(p => [p.graphId, p]));
  const playUrlOwners = new Map();

  let teacherCount = 0;
  for (const item of catalog.items) {
    if (item.source === 'teacher') {
      teacherCount += 1;
      if (item.id !== 'capacitor-era') {
        throw new Error(`unexpected teacher catalog item: ${item.id}`);
      }
    }
    if (item.source === 'html-sample' && String(item.graphId).startsWith('html-samples-')) {
      throw new Error(`${item.id}: html-sample must use package graphId, got ${item.graphId}`);
    }
    const pair = pairByGraph.get(item.graphId);
    if (!pair || pair.playUrl !== item.playUrl) {
      throw new Error(`${item.id}: catalog pair not in publish-pairs (${item.graphId})`);
    }
    const prev = playUrlOwners.get(item.playUrl);
    if (prev && prev !== item.graphId) {
      throw new Error(`playUrl ${item.playUrl} shared by ${prev} and ${item.graphId}`);
    }
    playUrlOwners.set(item.playUrl, item.graphId);
    if (!item.categoryId || !String(item.categoryId).startsWith('macro-')) {
      throw new Error(`${item.id}: expected macro categoryId, got ${item.categoryId}`);
    }
  }

  if (teacherCount !== 1) {
    throw new Error(`expected exactly 1 teacher catalog item, got ${teacherCount}`);
  }

  console.log(`catalog-pair-integrity: OK (${catalog.items.length} items, 1 teacher)`);
}

module.exports = { run: catalogPairIntegrityCheck };
