const { assert } = require('../../../lib/assert');
/**
 * Assert standalone export HTML includes strategy panorama shell.
 * npm run check:export  (suite: export-standalone-smoke)
 */
const fs = require('fs');
const path = require('path');
const { buildStandaloneGraphHtml } = require('../../../../packages/generate/export/export-standalone-html');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { ensureCoupledTraceMap } = require('../../../../packages/contract');
const { loadHints, loadChapter } = require('../../../lib/fixture-loader');
const COUPLED_MODE_HINTS = loadHints('coupledMode');

const JS_DIR = path.join(__dirname, '../../../../apps/web/viewer/js');
const SHARED_DIR = path.join(__dirname, '../../../../packages/shared');

function run() {
  let chapter = loadChapter('judge', 'coupledAligned');
  assert(chapter, 'sample chapter missing');
  chapter = enrichChapterContract(ensureCoupledTraceMap(chapter, COUPLED_MODE_HINTS));

  const viewerJs = [
    fs.readFileSync(path.join(JS_DIR, 'strategy-mermaid-theme.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED_DIR, 'strategy-mermaid-parse.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED_DIR, 'strategy-priority-mermaid.js'), 'utf8'),
    fs.readFileSync(path.join(JS_DIR, 'viewer.js'), 'utf8'),
  ].join('\n');
  const graphCss = fs.readFileSync(path.join(JS_DIR, 'graph-shell.css'), 'utf8');

  const html = buildStandaloneGraphHtml({ chapter, title: chapter.kg?.title, viewerJs, graphCss });

  assert(html.includes('id="vt-strategy"'), 'vt-strategy tab');
  assert(html.includes('id="strategy-panel"'), 'strategy-panel');
  assert(html.includes('id="strategy-viewport"'), 'strategy-viewport');
  assert(html.includes('id="btn-struct-toggle"'), 'struct data fold');
  assert(html.includes('mermaid.min.js'), 'mermaid script');
  assert(html.includes('../vendor/mermaid.min.js') || /vendor\/mermaid\.min\.js/.test(html), 'mermaid local vendor');
  assert(html.includes('../vendor/d3.v7.min.js') || /vendor\/d3\.v7\.min\.js/.test(html), 'd3 local vendor');
  assert(!/https:\/\/d3js\.org\//.test(html), 'no d3 CDN');
  assert(!/cdn\.jsdelivr\.net\/npm\/mermaid/.test(html), 'no mermaid CDN');
  assert(html.includes('strategy-mermaid-parse') || html.includes('parseStrategyMermaid'), 'parse bundled');
  assert(html.includes('annotateStrategyMermaidPriority') || html.includes('StrategyPriorityMermaid'), 'priority annotate bundled');
  assert(html.includes('"strategy"'), 'strategy in payload');
  assert(html.includes('graph TD'), 'mermaid body');
  assert(html.includes('defaultView: \'strategy\''), 'strategy-first default');
  assert(html.includes('metaChapters: [{ winSync: chapter.winSync, mapping: chapter.mapping, strategy: chapter.strategy'), 'metaChapters strategy');
  assert(html.includes('buildRouteTeachingHtml') || html.includes('route-teach-sec') || html.includes('本路径调什么'), 'teaching route panel');

  // Guard against Windows encoding corruption that replaces CJK / strips '<' in closers
  assert(html.includes('charset="UTF-8"') || html.includes("charset='UTF-8'"), 'utf-8 meta');
  assert(html.includes('决策树'), 'zh label 决策树');
  assert(html.includes('事理图谱'), 'zh label 事理图谱');
  assert(html.includes('探究策略图'), 'zh label 探究策略图');
  assert(html.includes('调节优先级'), 'zh legend 调节优先级');
  assert(html.includes('结构数据'), 'zh struct fold');
  assert(!html.includes('需联网加载 CDN'), 'no CDN banner text');
  assert(!html.includes('gen-banner'), 'no gen-banner UI');
  assert(!html.includes('单文件预览'), 'no export subtitle banner');
  assert(html.includes('d3.v7.min.js'), 'd3 vendor script kept');
  assert(html.includes('tex-mml-svg.js'), 'mathjax local vendor script (optional formulas)');
  assert(!/cdn\.jsdelivr\.net\/npm\/mathjax/.test(html), 'no mathjax CDN');
  assert(!/\?\?\/(?:div|h2|button)>/.test(html), 'no corrupted closers like ??/div>');
  assert(!/CDN\?D3/.test(html), 'no CDN?D3 mojibake');

  // Vendor files exist for offline copy
  const vendorDir = path.join(__dirname, '../../../../apps/web/viewer/vendor');
  assert(fs.existsSync(path.join(vendorDir, 'd3.v7.min.js')), 'vendor d3 present');
  assert(fs.existsSync(path.join(vendorDir, 'mermaid.min.js')), 'vendor mermaid present');
  assert(fs.existsSync(path.join(vendorDir, 'tex-mml-svg.js')), 'vendor mathjax present');

  console.log('export-standalone-smoke-check: OK', html.length, 'chars');
}

module.exports = { run };
