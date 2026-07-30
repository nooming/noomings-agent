/** Browser helper: graphId → preview URL (mirrors packages/platform/graph-preview-url.js). */
(function (global) {
  var GRAPH_ID_ALIASES = {
    '电容纪元-静电城邦-20260702-154833': 'capacitor-era',
    'html-samples-capacitor-plate': 'capacitor-era',
  };

  function resolvePackageId(graphId) {
    var id = String(graphId || '').trim();
    if (!id) return '';
    if (GRAPH_ID_ALIASES[id]) return GRAPH_ID_ALIASES[id];
    var m = /^html-samples-(.+)$/.exec(id);
    if (m) return m[1];
    return id;
  }

  function resolveGraphPreviewUrl(graphId, indexItem) {
    var id = String(graphId || '').trim();
    if (!id) return null;
    if (indexItem && indexItem.url) return indexItem.url;
    // Browser cannot probe chapter.json; always use graph.html API shell (not CDN index.html).
    var pkg = resolvePackageId(id);
    return '/graph.html?graphId=' + encodeURIComponent(pkg);
  }

  global.GraphPreviewUrl = { resolveGraphPreviewUrl };
})(typeof window !== 'undefined' ? window : globalThis);
