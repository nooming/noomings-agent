/** Resolve graphId → HTTP preview URL (server + browser). */
const { resolvePackageId, packagePreviewUrl } = require('../shared/package-layout');
const { getPackageDir } = require('../shared/data-paths');
const fs = require('fs');
const path = require('path');

function resolveGraphPreviewUrl(graphId, indexItem) {
  const id = String(graphId || '').trim();
  if (!id) return null;
  if (indexItem?.url) return indexItem.url;

  const packageId = resolvePackageId(id);
  const pkgDir = getPackageDir(packageId);
  if (fs.existsSync(path.join(pkgDir, 'index.html'))) {
    return packagePreviewUrl(packageId);
  }
  if (fs.existsSync(path.join(pkgDir, 'chapter.json')) || fs.existsSync(path.join(pkgDir, 'chapters.json'))) {
    return `/graph.html?graphId=${encodeURIComponent(packageId)}`;
  }
  return packagePreviewUrl(packageId);
}

module.exports = {
  resolveGraphPreviewUrl,
};
