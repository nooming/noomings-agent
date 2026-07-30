/**
 * Build a single-file graph preview HTML (inlined chapter + viewer + CSS).
 * Load order in browser: export-standalone-template.js, then this file.
 * Node: require('./export-standalone-html')
 */
(function (root) {
  function browserSlugify(title) {
    const base = String(title || 'generated-graph')
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'generated-graph';
    return base + '.html';
  }

  function resolveTemplate() {
    if (typeof module !== 'undefined' && module.exports) {
      return require('./export-standalone-template');
    }
    return root.ExportStandaloneTemplate;
  }

  function buildStandaloneGraphHtml(opts) {
    const tpl = resolveTemplate();
    if (!tpl?.buildStandaloneExportHtml) {
      throw new Error('export standalone template not loaded');
    }
    let escapeHtml = opts.escapeHtml;
    if (!escapeHtml && typeof module !== 'undefined') {
      try {
        escapeHtml = require('./render-preview-html').escapeHtml;
      } catch {
        escapeHtml = null;
      }
    }
    if (!escapeHtml) {
      escapeHtml = s => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    return tpl.buildStandaloneExportHtml({
      ...opts,
      escapeHtml,
      vendorBase: opts.vendorBase == null ? '../vendor' : opts.vendorBase,
    });
  }

  function downloadStandaloneGraphHtml({ chapter, title, viewerJs, graphCss, filename }) {
    const html = buildStandaloneGraphHtml({ chapter, title, viewerJs, graphCss });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || browserSlugify(title || chapter?.kg?.title);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const api = {
    slugifyFilename(title) {
      if (typeof module !== 'undefined' && module.exports) {
        return require('../../shared/slugify').slugifyFilename(title, 'generated-graph');
      }
      return browserSlugify(title);
    },
    chapterPayload(chapter) {
      return resolveTemplate().chapterPayload(chapter);
    },
    buildStandaloneGraphHtml,
    downloadStandaloneGraphHtml,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GraphExport = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
