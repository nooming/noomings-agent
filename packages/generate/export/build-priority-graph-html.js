/**
 * Build Strategy-first standalone 图谱.html with priority mermaid annotate bundled.
 * Does not mutate chapter.json mermaid on disk.
 *
 * Offline: D3 + Mermaid + MathJax loaded from relative ../vendor/ (copied beside packages / 样本html).
 */
const fs = require('fs');
const path = require('path');
const { buildStandaloneGraphHtml } = require('./export-standalone-html');
const { annotateStrategyMermaidPriority } = require('../../shared/strategy-priority-mermaid');

const ROOT = path.resolve(__dirname, '../../..');
const JS_DIR = path.join(ROOT, 'apps/web/viewer/js');
const SHARED_DIR = path.join(ROOT, 'packages/shared');
const VENDOR_SRC = path.join(ROOT, 'apps/web/viewer/vendor');
const VENDOR_FILES = ['d3.v7.min.js', 'mermaid.min.js', 'tex-mml-svg.js'];
const VENDOR_COPY_README = [
  '# Offline graph preview vendor（导出副本）',
  '',
  '**勿手改本目录。** 权威源：`apps/web/viewer/vendor/`。',
  '由导出 `syncOfflineVendor` 生成/覆盖，供同级各夹 `图谱.html` 引用 `../vendor/`。',
  '',
  '需更新库时：只改权威源，再重新导出图谱（或手动拷贝上述 JS 到本目录）。',
  '',
].join('\n');

let _assetsCache = null;

function loadViewerAssets() {
  if (_assetsCache) return _assetsCache;
  const viewerJs = [
    fs.readFileSync(path.join(JS_DIR, 'strategy-mermaid-theme.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED_DIR, 'strategy-mermaid-parse.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED_DIR, 'strategy-priority-mermaid.js'), 'utf8'),
    fs.readFileSync(path.join(JS_DIR, 'viewer.js'), 'utf8'),
  ].join('\n');
  const graphCss = fs.readFileSync(path.join(JS_DIR, 'graph-shell.css'), 'utf8');
  _assetsCache = { viewerJs, graphCss };
  return _assetsCache;
}

function assertVendorPresent(srcDir) {
  for (const name of VENDOR_FILES) {
    const p = path.join(srcDir, name);
    if (!fs.existsSync(p) || fs.statSync(p).size < 1000) {
      throw new Error(`offline vendor missing or empty: ${p}`);
    }
  }
}

/**
 * Copy shared vendor libs next to package folders / 样本html root.
 * Keeps per-sample folders as 游戏 + 图谱.html only.
 */
function syncOfflineVendor(destDir) {
  assertVendorPresent(VENDOR_SRC);
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of VENDOR_FILES) {
    const src = path.join(VENDOR_SRC, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(destDir, name));
  }
  // Do not mirror authority README; stamp copies as generated.
  fs.writeFileSync(path.join(destDir, 'README.md'), VENDOR_COPY_README, 'utf8');
  return destDir;
}

function assertGraphHtmlSane(graphHtml) {
  if (!graphHtml.includes('\u63a2\u7a76\u7b56\u7565\u56fe')) {
    // 探究策略图
    throw new Error('missing Strategy-first shell (探究策略图)');
  }
  if (!graphHtml.includes('\u8c03\u8282\u4f18\u5148\u7ea7')) {
    // 调节优先级
    throw new Error('missing priority legend (调节优先级)');
  }
  if (!graphHtml.includes('defaultView: \'strategy\'')) {
    throw new Error('missing defaultView strategy');
  }
  if (!graphHtml.includes('annotateStrategyMermaidPriority')
    && !graphHtml.includes('StrategyPriorityMermaid')) {
    throw new Error('priority annotate not bundled');
  }
  if (/\?\?\/(?:div|h2|button)>/.test(graphHtml)) {
    throw new Error('CJK corruption detected (??/tag>)');
  }
  if (/CDN\?D3/.test(graphHtml)) {
    throw new Error('CJK corruption detected (CDN?D3)');
  }
  // Strategy must not require d3js.org / jsdelivr mermaid CDN
  if (/https:\/\/d3js\.org\//.test(graphHtml)) {
    throw new Error('d3 still points at CDN');
  }
  if (/cdn\.jsdelivr\.net\/npm\/mermaid/.test(graphHtml)) {
    throw new Error('mermaid still points at CDN');
  }
  if (/cdn\.jsdelivr\.net\/npm\/mathjax/.test(graphHtml)) {
    throw new Error('mathjax still points at CDN');
  }
  if (!graphHtml.includes('d3.v7.min.js') || !graphHtml.includes('mermaid.min.js')) {
    throw new Error('missing local vendor script refs');
  }
  if (!graphHtml.includes('tex-mml-svg.js')) {
    throw new Error('missing local mathjax vendor script ref');
  }
  if (!/src="[^"]*vendor\/d3\.v7\.min\.js"/.test(graphHtml)
    && !/src='[^']*vendor\/d3\.v7\.min\.js'/.test(graphHtml)) {
    throw new Error('d3 vendor path not relative vendor/');
  }
}

/**
 * @param {{ chapter: object, title?: string, vendorBase?: string }} opts
 * @returns {string} html
 */
function buildPriorityGraphHtml({ chapter, title, vendorBase }) {
  if (!chapter?.strategy?.mermaid?.trim()) {
    throw new Error('chapter.strategy.mermaid missing');
  }
  // Sanity: annotate works (viewer also annotates at runtime)
  const routes = chapter.strategy?.routes || [];
  annotateStrategyMermaidPriority(chapter.strategy.mermaid, routes);

  const { viewerJs, graphCss } = loadViewerAssets();
  const displayTitle = title
    || chapter.kg?.title
    || chapter.strategy?.title
    || 'Agent A';
  const graphHtml = buildStandaloneGraphHtml({
    chapter,
    title: displayTitle,
    viewerJs,
    graphCss,
    vendorBase: vendorBase == null ? '../vendor' : vendorBase,
  });
  assertGraphHtmlSane(graphHtml);
  return graphHtml;
}

/**
 * Write 图谱.html to runtime package dir and optional sample dir.
 * Also syncs shared vendor/ siblings for offline Strategy render.
 */
function writePriorityGraphFiles({ chapter, title, runtimeDir, sampleDir, vendorBase }) {
  const graphHtml = buildPriorityGraphHtml({ chapter, title, vendorBase });
  const outs = [];
  if (runtimeDir) {
    fs.mkdirSync(runtimeDir, { recursive: true });
    const p = path.join(runtimeDir, '\u56fe\u8c31.html'); // 图谱.html
    fs.writeFileSync(p, graphHtml, 'utf8');
    outs.push(p);
    // data/runtime/packages/{id}/图谱.html → ../vendor
    syncOfflineVendor(path.join(runtimeDir, '..', 'vendor'));
  }
  if (sampleDir) {
    fs.mkdirSync(sampleDir, { recursive: true });
    const p = path.join(sampleDir, '\u56fe\u8c31.html');
    fs.writeFileSync(p, graphHtml, 'utf8');
    outs.push(p);
    // 样本html/{dir}/图谱.html → ../vendor
    syncOfflineVendor(path.join(sampleDir, '..', 'vendor'));
  }
  return { graphHtml, outs, bytes: graphHtml.length };
}

module.exports = {
  loadViewerAssets,
  buildPriorityGraphHtml,
  writePriorityGraphFiles,
  assertGraphHtmlSane,
  syncOfflineVendor,
  VENDOR_SRC,
};
