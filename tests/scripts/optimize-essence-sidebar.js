/**
 * Optimize essence agent packages toward stage + right sidebar shell.
 * Does not touch teammate packages (already optimized via ingest).
 *
 * Usage: node tests/scripts/optimize-essence-sidebar.js
 */
const fs = require('fs');
const path = require('path');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const PKG = getPackagesRoot();
const MANIFEST = path.join(PKG, 'manifest.json');

const SKIP = new Set([
  'pendulum-clock',
  'pendulum-target',
  'projectile-cannon',
  'projectile-basic',
  'capacitor-era-ch1',
  'capacitor-era-ch2',
  'capacitor-era-ch4',
]);

const SHELL_CSS = `
/* === essence-sidebar-shell (auto) === */
html, body { width:100%; height:100%; margin:0; padding:0 !important; overflow:hidden; }
body { display:block !important; align-items:stretch !important; justify-content:stretch !important; min-height:0 !important; }
#essence-app {
  display:flex; flex-direction:row; width:100%; height:100%; min-height:0;
  background:inherit;
}
#essence-stage {
  position:relative; flex:1; min-width:0; min-height:0;
  display:flex; flex-direction:column; background:#0f172a;
}
#essence-stage canvas {
  display:block; width:100% !important; height:100% !important; max-width:none !important;
  margin:0 !important; border-radius:0 !important; flex:1; min-height:0;
}
#essence-hud {
  position:absolute; top:10px; left:10px; right:10px; z-index:5; pointer-events:none;
  display:flex; flex-direction:column; gap:4px; max-width:min(420px, calc(100% - 20px));
}
#essence-hud .essence-title {
  pointer-events:none; padding:8px 12px; border-radius:12px;
  background:rgba(15,23,42,0.88); color:#e2e8f0; font-size:14px; font-weight:600;
  border:1px solid rgba(148,163,184,0.35);
}
#essence-hud .essence-sub {
  pointer-events:none; padding:6px 12px; border-radius:10px;
  background:rgba(15,23,42,0.75); color:#94a3b8; font-size:12px;
  border:1px solid rgba(148,163,184,0.25);
}
#essence-bench {
  width:clamp(280px, 28vw, 340px); flex-shrink:0; min-height:0;
  display:flex; flex-direction:column;
  background:#fff; border-left:1px solid #e2e8f0;
  color:#1a202c;
}
#essence-bench .essence-scroll {
  flex:1; overflow-y:auto; padding:14px 16px 8px; min-height:0;
  -webkit-overflow-scrolling:touch;
}
#essence-bench .essence-ft {
  padding:10px 16px 14px; border-top:1px solid #e2e8f0; flex-shrink:0;
  display:flex; flex-direction:column; gap:8px;
}
#essence-bench .slider-group input[type=range],
#essence-bench input[type=range] {
  width:100%; height:28px; margin:0;
}
@media (max-width:720px) {
  #essence-app { flex-direction:column; }
  #essence-stage { flex:1 1 0; min-height:48vh; }
  #essence-bench { width:100%; max-height:min(42vh,360px); border-left:none; border-top:1px solid #e2e8f0; }
}
/* hide original card chrome when wrapped */
#essence-stage .canvas-wrap,
#essence-stage .canvas-area,
#essence-stage > div:not(#essence-hud) {
  flex:1; min-height:0; width:100%; height:100%;
  margin:0 !important; padding:0 !important; border-radius:0 !important;
  background:transparent !important; display:flex; align-items:stretch;
}
#essence-bench .essence-scroll > .app,
#essence-bench .essence-scroll > .card,
#essence-bench .essence-scroll > .container,
#essence-bench .essence-scroll > .game {
  display:contents;
}
.essence-legacy-hide-outer > .app,
.essence-legacy-hide-outer > .card,
.essence-legacy-hide-outer > .container,
.essence-legacy-hide-outer > .game,
.essence-legacy-hide-outer > #app { display:contents; }
`;

const ALREADY_CSS = `
/* === essence-sidebar-shell already (auto) === */
html, body { width:100%; height:100%; margin:0; padding:0 !important; overflow:hidden; }
body { display:block !important; min-height:0 !important; align-items:stretch !important; justify-content:stretch !important; }
#app {
  max-width:none !important; width:100% !important; height:100% !important;
  border-radius:0 !important; box-shadow:none !important; margin:0 !important;
}
.main-layout { flex:1; min-height:0; display:flex !important; flex-direction:row !important; flex-wrap:nowrap !important; }
#simCanvasArea {
  flex:1 1 auto !important; min-width:0 !important; min-height:0 !important;
  max-height:none !important; aspect-ratio:auto !important;
}
#controlsPanel {
  flex:0 0 clamp(280px, 28vw, 340px) !important; width:clamp(280px, 28vw, 340px) !important;
  min-width:0 !important; overflow-y:auto; max-height:100%;
}
@media (max-width:720px) {
  .main-layout { flex-direction:column !important; }
  #simCanvasArea { min-height:48vh !important; }
  #controlsPanel {
    flex:0 0 auto !important; width:100% !important; max-height:min(42vh,360px) !important;
    border-left:none !important; border-top:1px solid #e2e8f0;
  }
}
`;

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitleSub(bodyInner) {
  const h1 = bodyInner.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const sub = bodyInner.match(/<div class="sub"[^>]*>([\s\S]*?)<\/div>/i)
    || bodyInner.match(/<p class="sub"[^>]*>([\s\S]*?)<\/p>/i)
    || bodyInner.match(/<div class="subtitle"[^>]*>([\s\S]*?)<\/div>/i);
  return {
    title: h1 ? stripTags(h1[1]) : '',
    sub: sub ? stripTags(sub[1]) : '',
    h1Html: h1 ? h1[0] : '',
    subHtml: sub ? sub[0] : '',
  };
}

function findCanvasBlock(bodyInner) {
  const wrap = bodyInner.match(/<div class="canvas-wrap"[\s\S]*?<\/div>\s*/i);
  if (wrap) return { block: wrap[0], index: wrap.index };
  const canvas = bodyInner.match(/<canvas\b[^>]*>[\s\S]*?<\/canvas>|<canvas\b[^>]*\/>/i);
  if (canvas) return { block: canvas[0], index: canvas.index };
  return null;
}

function isAlreadySidebar(html) {
  return /#simCanvasArea/.test(html) && /#controlsPanel/.test(html) && /\.main-layout/.test(html);
}

function injectCss(html, css) {
  if (html.includes('essence-sidebar-shell')) return html;
  if (/<\/style>/i.test(html)) {
    return html.replace(/<\/style>/i, `${css}\n</style>`);
  }
  return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
}

function transformCard(html) {
  if (html.includes('id="essence-app"')) return { html, skipped: 'already wrapped' };
  const bodyMatch = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  if (!bodyMatch) return { html, skipped: 'no body' };
  const bodyAttrs = bodyMatch[1] || '';
  let bodyInner = bodyMatch[2];

  // Peel single outer wrapper
  const outer = bodyInner.match(/^\s*<(div|main)\b([^>]*)>([\s\S]*)<\/\1>\s*(<script[\s\S]*)?$/i);
  let core = bodyInner;
  let trailingScripts = '';
  if (outer) {
    core = outer[3];
    trailingScripts = outer[4] || '';
  }

  // Separate trailing scripts inside core
  const scripts = [];
  core = core.replace(/<script\b[\s\S]*?<\/script>/gi, (m) => {
    scripts.push(m);
    return '';
  });

  const { title, sub, h1Html, subHtml } = extractTitleSub(core);
  const canvasInfo = findCanvasBlock(core);
  if (!canvasInfo) return { html, skipped: 'no canvas' };

  let rest = core;
  if (h1Html) rest = rest.replace(h1Html, '');
  if (subHtml) rest = rest.replace(subHtml, '');
  rest = rest.replace(canvasInfo.block, '');

  // Split action buttons to footer when present
  let footer = '';
  const action = rest.match(/<div class="action-row"[\s\S]*?<\/div>\s*/i)
    || rest.match(/<div class="btn-row"[\s\S]*?<\/div>\s*/i)
    || rest.match(/<(button)[^>]*id="btn-[^"]*"[\s\S]*?<\/button>(?:\s*<button[\s\S]*?<\/button>)*/i);
  if (action && /btn|button/i.test(action[0])) {
    // Prefer action-row block
    const row = rest.match(/<div class="action-row"[\s\S]*?<\/div>\s*/i)
      || rest.match(/<div class="btn-row"[\s\S]*?<\/div>\s*/i);
    if (row) {
      footer = row[0];
      rest = rest.replace(row[0], '');
    }
  }

  const hudTitle = title || '探究实验';
  const hudSub = sub || '';

  const newBody = `
<div id="essence-app" class="essence-legacy-hide-outer">
  <div id="essence-stage">
    ${canvasInfo.block}
    <div id="essence-hud">
      <div class="essence-title">${hudTitle}</div>
      ${hudSub ? `<div class="essence-sub">${hudSub}</div>` : ''}
    </div>
  </div>
  <aside id="essence-bench">
    <div class="essence-scroll">
      ${rest.trim()}
    </div>
    <div class="essence-ft">
      ${footer.trim() || '<!-- actions stay in scroll if none found -->'}
    </div>
  </aside>
</div>
${scripts.join('\n')}
${trailingScripts}
`;

  let out = html.replace(/<body([^>]*)>[\s\S]*<\/body>/i, `<body${bodyAttrs}>${newBody}</body>`);
  out = injectCss(out, SHELL_CSS);

  // Minimal resize: fill stage for canvases with fixed design size via CSS already;
  // add ResizeObserver only if canvas has width/height attributes and drawing uses them.
  if (!out.includes('essenceStageResize') && /<canvas\b/i.test(out)) {
    const resizeBoot = `
<script>
(function(){
  if (window.__essenceStageResize) return;
  window.__essenceStageResize = true;
  function fit(){
    var stage = document.getElementById('essence-stage');
    var cvs = stage && stage.querySelector('canvas');
    if (!stage || !cvs) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (w < 2 || h < 2) return;
    var dw = Number(cvs.getAttribute('width')) || cvs.width || 600;
    var dh = Number(cvs.getAttribute('height')) || cvs.height || 400;
    // keep design buffer; CSS scales visually
    if (!cvs._essenceDesign) cvs._essenceDesign = { dw: dw, dh: dh };
  }
  window.addEventListener('resize', fit);
  if (typeof ResizeObserver !== 'undefined') {
    var st = document.getElementById('essence-stage');
    if (st) new ResizeObserver(fit).observe(st);
  }
  fit();
})();
</script>`;
    out = out.replace(/<\/body>/i, `${resizeBoot}\n</body>`);
  }

  return { html: out, skipped: null };
}

function transformAlready(html) {
  if (html.includes('essence-sidebar-shell already')) return { html, skipped: 'css already' };
  return { html: injectCss(html, ALREADY_CSS), skipped: null };
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const results = [];
  for (const s of manifest.samples || []) {
    if (SKIP.has(s.id)) {
      results.push({ id: s.id, status: 'skip-teammate' });
      continue;
    }
    const gamePath = path.join(PKG, s.id, 'game.html');
    if (!fs.existsSync(gamePath)) {
      results.push({ id: s.id, status: 'missing' });
      continue;
    }
    let html = fs.readFileSync(gamePath, 'utf8');
    let result;
    if (isAlreadySidebar(html)) result = transformAlready(html);
    else result = transformCard(html);
    if (result.skipped) {
      results.push({ id: s.id, status: 'skip', reason: result.skipped });
      continue;
    }
    fs.writeFileSync(gamePath, result.html, 'utf8');
    results.push({ id: s.id, status: 'ok', bytes: result.html.length });
  }
  for (const r of results) {
    console.log(r.id, r.status, r.reason || r.bytes || '');
  }
  const ok = results.filter((r) => r.status === 'ok').length;
  console.log(`done: ${ok} optimized`);
}

if (require.main === module) main();
module.exports = { main };
