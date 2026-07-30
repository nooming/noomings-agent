/** Browser helper: graphId → preview URL (mirrors packages/platform/graph-preview-url.js). */
(function (global) {
  function resolveGraphPreviewUrl(graphId, indexItem) {
    const id = String(graphId || '').trim();
    if (!id) return null;
    if (indexItem && indexItem.url) return indexItem.url;
    var pkg = id.replace(/^html-samples-/, '');
    if (pkg === '电容纪元-静电城邦-20260702-154833' || pkg === 'html-samples-capacitor-plate') {
      pkg = 'capacitor-era';
    }
    return '/packages/' + encodeURIComponent(pkg) + '/index.html';
  }

  global.GraphPreviewUrl = { resolveGraphPreviewUrl };
})(typeof window !== 'undefined' ? window : globalThis);
