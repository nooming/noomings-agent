const fs = require('fs');
const { assert } = require('../../../lib/assert');
const {
  readCatalog,
  writeCatalog,
  deleteCatalogItem,
  getCatalogItem,
} = require('../../../../packages/platform/catalog');
const { getCatalogPath } = require('../../../../packages/platform/paths');

function catalogDeleteCheck() {
  const catalogPath = getCatalogPath();
  const backup = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : null;
  const testId = `test-catalog-del-${Date.now()}`;
  const featuredId = `test-featured-del-${Date.now()}`;

  try {
    const catalog = readCatalog();
    catalog.items = catalog.items.filter(i => !i.id.startsWith('test-catalog-del-') && !i.id.startsWith('test-featured-del-'));
    catalog.items.push(
      { id: testId, title: 'Temp task', graphId: 'g-temp', playUrl: '/static/samples/x.html', published: false },
      { id: featuredId, title: 'Featured temp', graphId: 'g-f', playUrl: '/static/samples/y.html', published: true, featured: true },
    );
    writeCatalog(catalog);

    const blocked = deleteCatalogItem(featuredId);
    assert(!blocked.ok && blocked.error === 'featured_protected', 'featured protected without force');

    const forced = deleteCatalogItem(featuredId, { forceFeatured: true });
    assert(forced.ok && forced.deleted.id === featuredId, 'featured delete with force');
    assert(!getCatalogItem(featuredId), 'featured item removed');

    const ok = deleteCatalogItem(testId);
    assert(ok.ok && ok.deleted.id === testId, 'normal delete');
    assert(!getCatalogItem(testId), 'item removed');

    const missing = deleteCatalogItem('nonexistent-id-xyz');
    assert(!missing.ok && missing.error === 'not_found', 'not_found');
  } finally {
    if (backup != null) fs.writeFileSync(catalogPath, backup, 'utf8');
    else if (fs.existsSync(catalogPath)) fs.unlinkSync(catalogPath);
  }

  console.log('catalog-delete-check: OK');
}

module.exports = { run: catalogDeleteCheck };
