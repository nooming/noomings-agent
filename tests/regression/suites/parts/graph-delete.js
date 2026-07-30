const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { getAgentOutputRoot } = require('../../../../packages/shared/paths');
const { deleteGeneratedGraph, isSafeGraphId } = require('../../../../packages/generate/graph-delete');
const { readCatalog, writeCatalog } = require('../../../../packages/platform/catalog');
const { getCatalogPath } = require('../../../../packages/platform/paths');

function graphDeleteCheck() {
  const outputRoot = getAgentOutputRoot();
  const catalogPath = getCatalogPath();
  const catalogBackup = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : null;
  const graphId = `test-graph-del-${Date.now()}`;
  const graphDir = path.join(outputRoot, graphId);
  const indexPath = path.join(outputRoot, 'index.json');
  const indexBackup = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;

  try {
    assert(!isSafeGraphId('../evil'), 'reject path traversal');
    assert(!isSafeGraphId('a/b'), 'reject slash in id');
    assert(isSafeGraphId(graphId), 'accept safe id');

    fs.mkdirSync(graphDir, { recursive: true });
    fs.writeFileSync(path.join(graphDir, 'chapter.json'), JSON.stringify({ title: 't' }));

    const catalog = readCatalog();
    catalog.items.push({
      id: `ref-${graphId}`,
      title: 'Ref task',
      graphId,
      playUrl: '/static/samples/generated/t.html',
      published: false,
    });
    writeCatalog(catalog);

    const blocked = deleteGeneratedGraph(graphId, outputRoot);
    assert(!blocked.ok && blocked.error === 'referenced_by_catalog', 'block when referenced');
    assert(blocked.referencedBy?.length === 1, 'returns refs');
    assert(fs.existsSync(graphDir), 'dir kept when blocked');

    catalog.items = catalog.items.filter(i => i.graphId !== graphId);
    writeCatalog(catalog);

    const ok = deleteGeneratedGraph(graphId, outputRoot);
    assert(ok.ok && ok.graphId === graphId, 'delete succeeds');
    assert(!fs.existsSync(graphDir), 'dir removed');

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    assert(!index.items.some(i => i.id === graphId), 'index entry removed');
  } finally {
    if (fs.existsSync(graphDir)) fs.rmSync(graphDir, { recursive: true, force: true });
    if (catalogBackup != null) fs.writeFileSync(catalogPath, catalogBackup, 'utf8');
    else if (fs.existsSync(catalogPath)) fs.unlinkSync(catalogPath);
    if (indexBackup != null) fs.writeFileSync(indexPath, indexBackup, 'utf8');
  }

  console.log('graph-delete-check: OK');
}

module.exports = { run: graphDeleteCheck };
