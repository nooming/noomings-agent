/**
 * Shared standalone HTML shell for Agent export (Node + browser).
 * Keep in sync: used by render-preview-html.js and export-standalone-html.js
 *
 * Non-ASCII UI copy uses \\u escapes so the file stays ASCII-safe on Windows
 * editors that might otherwise corrupt UTF-8 template literals.
 */

function chapterPayload(chapter) {
  return {
    mapping: chapter.mapping,
    kg: chapter.kg,
    dt: chapter.dt,
    winSync: chapter.winSync,
    strategy: chapter.strategy,
    traceMap: chapter.traceMap,
    inquiryScript: chapter.inquiryScript,
  };
}

function buildStandaloneExportHtml({ chapter, title, viewerJs, graphCss, escapeHtml, vendorBase }) {
  const esc = escapeHtml || (s => String(s || ''));
  // Agent A 生成图谱
  const displayTitle = (title || chapter?.kg?.title || 'Agent A \u751f\u6210\u56fe\u8c31').trim();
  const payload = chapterPayload(chapter);
  const chapterJson = JSON.stringify(payload);
  const safeTitle = esc(displayTitle)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // UI strings (unicode-escaped) — Strategy-first shell
  const tPreview = '\u9884\u89c8'; // 预览
  const tStrategy = '\u63a2\u7a76\u7b56\u7565\u56fe'; // 探究策略图
  const tStruct = '\u7ed3\u6784\u6570\u636e'; // 结构数据
  const tDt = '\u51b3\u7b56\u6811'; // 决策树
  const tKg = '\u4e8b\u7406\u56fe\u8c31'; // 事理图谱
  const tZoom = '\u91cd\u7f6e\u89c6\u56fe'; // 重置视图
  const tClearHl = '\u6e05\u9664\u9ad8\u4eae'; // 清除高亮
  const tDash = '\u2014'; // —
  const tClickNode = '\u70b9\u51fb\u8282\u70b9\u67e5\u770b\u7ec6\u8282'; // 点击节点查看细节
  const tLegend = '\u8c03\u8282\u4f18\u5148\u7ea7'; // 调节优先级
  const tAll = '\u5168\u90e8'; // 全部
  const tPlayOnly = '\u4ec5\u6e38\u73a9'; // 仅游玩
  const tTeachOnly = '\u4ec5\u6559\u6848'; // 仅教案
  // 实心 = 游玩子图 · 实心+虚线描边 = 教案子图 · 空心 = 无关变量
  const tLegendHint =
    '\u5b9e\u5fc3 = \u6e38\u73a9\u5b50\u56fe \u00b7 \u5b9e\u5fc3+\u865a\u7ebf\u63cf\u8fb9 = \u6559\u6848\u5b50\u56fe \u00b7 \u7a7a\u5fc3 = \u65e0\u5173\u53d8\u91cf';
  const tInfoEmpty = '\u2190 \u70b9\u51fb\u8282\u70b9\u67e5\u770b\u7ec6\u8282'; // ← 点击节点查看细节
  // AGENT A · 探究策略图（优先级可视）
  const tHeaderTag = 'AGENT A \u00b7 \u63a2\u7a76\u7b56\u7565\u56fe\uff08\u4f18\u5148\u7ea7\u53ef\u89c6\uff09';

  // Offline strategy render: relative vendor/ (D3 + Mermaid). MathJax stays optional CDN.
  const base = (vendorBase == null || vendorBase === '')
    ? '../vendor'
    : String(vendorBase).replace(/\/$/, '');
  const d3Src = `${base}/d3.v7.min.js`;
  const mermaidSrc = `${base}/mermaid.min.js`;
  // System font stack — avoid Google Fonts CDN dependency for offline file://
  const fontStack = "'Segoe UI','PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif";
  const serifStack = "'Noto Serif SC','Songti SC','SimSun',serif";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} \u00b7 Agent A ${tPreview}</title>
<script src="${d3Src}"><\/script>
<script src="${mermaidSrc}"><\/script>
<script>
  window.MathJax = { tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']]}, svg:{fontCache:'global'} };
<\/script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\/script>
<style>
:root{--font-ui:${fontStack};--font-formula:${serifStack};}
${graphCss}
body{height:100vh;overflow:hidden;font-family:var(--font-ui);}
<\/style>
</head>
<body>
<div id="header">
  <div id="header-left">
    <h1>${safeTitle}</h1>
    <p>${tHeaderTag}</p>
  </div>
  <div id="view-toggle" class="view-toggle-strategy-first">
    <div class="vtab active vtab-primary" id="vt-strategy">${tStrategy}</div>
    <div class="view-struct-wrap">
      <button type="button" class="vtab vtab-secondary" id="btn-struct-toggle" aria-expanded="false">${tStruct} \u25be</button>
      <div id="struct-menu" class="struct-menu hidden" role="menu">
        <div class="vtab struct-item" id="vt-dt" role="menuitem">${tDt}</div>
        <div class="vtab struct-item" id="vt-kg" role="menuitem">${tKg}</div>
      </div>
    </div>
  </div>
</div>
<div id="tabs"></div>
<div id="main">
  <div id="graph">
    <svg id="svg" preserveAspectRatio="xMidYMid meet"></svg>
    <div id="strategy-panel"><div id="strategy-viewport"><div id="strategy-mermaid"></div></div></div>
    <div class="gctrl" id="gctrl">
      <button class="gbtn" id="btn-zoom">${tZoom}</button>
      <button class="gbtn graph-only" id="btn-hl">${tClearHl}</button>
    </div>
  </div>
  <div id="panel">
    <div id="panel-hd">
      <h2 id="p-title">${tDash}</h2>
      <div class="psub" id="p-sub">${tClickNode}</div>
    </div>
    <div id="legend">
      <div class="ltitle" id="legend-title">${tLegend}</div>
      <div id="legend-items"></div>
      <div id="kg-filter" class="hidden">
        <button type="button" class="fbtn active" data-kg-filter="all">${tAll}</button>
        <button type="button" class="fbtn" data-kg-filter="play">${tPlayOnly}</button>
        <button type="button" class="fbtn" data-kg-filter="teach">${tTeachOnly}</button>
      </div>
      <div id="legend-hint" class="legend-hint hidden">${tLegendHint}</div>
    </div>
    <div id="info"><div class="i-desc" style="text-align:center;margin-top:20px">${tInfoEmpty}</div></div>
  </div>
</div>
<script>
${viewerJs}
<\/script>
<script>
(function () {
  const chapter = ${chapterJson};
  GraphViewer.init({
    kgChapters: [chapter.kg],
    dtChapters: [chapter.dt],
    metaChapters: [{ winSync: chapter.winSync, mapping: chapter.mapping, strategy: chapter.strategy, traceMap: chapter.traceMap, inquiryScript: chapter.inquiryScript }],
    features: { trace: false, agent: false },
    defaultView: 'strategy',
  });
})();
<\/script>
</body>
</html>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { chapterPayload, buildStandaloneExportHtml };
} else if (typeof globalThis !== 'undefined') {
  globalThis.ExportStandaloneTemplate = { chapterPayload, buildStandaloneExportHtml };
}
