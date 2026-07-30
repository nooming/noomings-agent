/** Unified inquiry package layout under data/runtime/packages/ */

const GRAPH_ID_ALIASES = {
  '电容纪元-静电城邦-20260702-154833': 'capacitor-era',
  'html-samples-capacitor-plate': 'capacitor-era',
};

function resolvePackageId(graphId) {
  const id = String(graphId || '').trim();
  if (!id) return '';
  if (GRAPH_ID_ALIASES[id]) return GRAPH_ID_ALIASES[id];
  const m = /^html-samples-(.+)$/.exec(id);
  if (m) return m[1];
  return id;
}

function packagePlayUrl(packageId) {
  return `/static/packages/${packageId}/game.html`;
}

function packagePreviewUrl(packageId) {
  return `/packages/${packageId}/index.html`;
}

module.exports = {
  GRAPH_ID_ALIASES,
  resolvePackageId,
  packagePlayUrl,
  packagePreviewUrl,
};
