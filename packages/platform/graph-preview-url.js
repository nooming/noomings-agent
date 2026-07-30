/** Resolve graphId → HTTP preview URL (server + browser). */
const { resolvePackageId, packagePreviewUrl } = require('../shared/package-layout');
const { getPackageDir } = require('../shared/data-paths');
const fs = require('fs');
const path = require('path');

const STRATEGY_GRAPH_HTML = '图谱.html';

function packageStrategyPreviewUrl(packageId) {
  return `/static/packages/${packageId}/${encodeURIComponent(STRATEGY_GRAPH_HTML)}`;
}

function resolveGraphPreviewUrl(graphId, indexItem) {
  const id = String(graphId || '').trim();
  if (!id) return null;
  if (indexItem?.url) return indexItem.url;

  const packageId = resolvePackageId(id);
  const pkgDir = getPackageDir(packageId);
  // Prefer Strategy-first export (探究策略图) over multi-tab graph.html API shell.
  if (fs.existsSync(path.join(pkgDir, STRATEGY_GRAPH_HTML))) {
    return packageStrategyPreviewUrl(packageId);
  }
  // Fallback: local graph.html shell (vendor mermaid) over stale CDN index.html.
  if (fs.existsSync(path.join(pkgDir, 'chapter.json')) || fs.existsSync(path.join(pkgDir, 'chapters.json'))) {
    return `/graph.html?graphId=${encodeURIComponent(packageId)}`;
  }
  if (fs.existsSync(path.join(pkgDir, 'index.html'))) {
    return packagePreviewUrl(packageId);
  }
  return packagePreviewUrl(packageId);
}

module.exports = {
  resolveGraphPreviewUrl,
  packageStrategyPreviewUrl,
  STRATEGY_GRAPH_HTML,
};
