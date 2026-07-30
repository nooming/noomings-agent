/** Browser helper: graphId → preview URL (mirrors packages/platform/graph-preview-url.js). */
(function (global) {
  var GRAPH_ID_ALIASES = {
    '电容纪元-静电城邦-20260702-154833': 'capacitor-era',
    'html-samples-capacitor-plate': 'capacitor-era',
  };
  var STRATEGY_GRAPH_HTML = '图谱.html';

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
    // Browser cannot probe disk; prefer Strategy-first export path (server indexItem.url is authoritative when present).
    var pkg = resolvePackageId(id);
    return '/static/packages/' + pkg + '/' + encodeURIComponent(STRATEGY_GRAPH_HTML);
  }

  global.GraphPreviewUrl = { resolveGraphPreviewUrl };
})(typeof window !== 'undefined' ? window : globalThis);
