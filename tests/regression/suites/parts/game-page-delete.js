const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { deleteGamePage, urlToAbsPath } = require('../../../../packages/platform/game-pages');
const { readCatalog, writeCatalog } = require('../../../../packages/platform/catalog');
const { getCatalogPath } = require('../../../../packages/platform/paths');
const { getPackagesRoot } = require('../../../../packages/shared/data-paths');
const { packagePlayUrl } = require('../../../../packages/shared/package-layout');

function gamePageDeleteCheck() {
  const catalogPath = getCatalogPath();
  const catalogBackup = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : null;
  const pkgId = `test-page-del-${Date.now()}`;
  const playUrl = packagePlayUrl(pkgId);
  const abs = path.join(getPackagesRoot(), pkgId, 'game.html');

  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '<html><body>test</body></html>');

    assert(urlToAbsPath('/static/evil/../packages/x/game.html') === null, 'reject bad url');

    const prot = deleteGamePage('/static/packages/capacitor-era/game.html');
    assert(!prot.ok && prot.error === 'protected_preset', 'protected capacitor-era');

    const catalog = readCatalog();
    catalog.items.push({
      id: `ref-html-${Date.now()}`,
      title: 'HTML ref',
      graphId: 'g1',
      playUrl,
      published: false,
    });
    writeCatalog(catalog);

    const blocked = deleteGamePage(playUrl);
    assert(!blocked.ok && blocked.error === 'referenced_by_catalog', 'block when referenced');
    assert(fs.existsSync(abs), 'file kept when blocked');

    catalog.items = catalog.items.filter(i => i.playUrl !== playUrl);
    writeCatalog(catalog);

    const ok = deleteGamePage(playUrl);
    assert(ok.ok && ok.url === playUrl, 'delete succeeds');
    assert(!fs.existsSync(abs), 'file removed');

    const missing = deleteGamePage(playUrl);
    assert(!missing.ok && missing.error === 'not_found', 'not_found after delete');
  } finally {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    try { fs.rmdirSync(path.dirname(abs)); } catch { /* non-fatal */ }
    if (catalogBackup != null) fs.writeFileSync(catalogPath, catalogBackup, 'utf8');
    else if (fs.existsSync(catalogPath)) fs.unlinkSync(catalogPath);
  }

  console.log('game-page-delete-check: OK');
}

module.exports = { run: gamePageDeleteCheck };
