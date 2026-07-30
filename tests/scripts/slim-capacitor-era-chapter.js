/**
 * Deep-slim a single-chapter capacitor-era HTML (ch1|ch2|ch4).
 * Preserves keep-chapter visuals; strips other-chapter DOM/CSS/dead modules.
 *
 * Usage:
 *   node tests/scripts/slim-capacitor-era-chapter.js --ch 1 --in "组员做的样本/ch1_介质与击穿.html"
 *   node tests/scripts/slim-capacitor-era-chapter.js --ch 1 --in path --out path
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const DEFAULT_SRC = {
  1: path.join(ROOT, '组员做的样本', 'ch1_介质与击穿.html'),
  2: path.join(ROOT, '组员做的样本', 'ch2_串并联配置.html'),
  4: path.join(ROOT, '组员做的样本', 'ch4_储能与充电.html'),
};

/** Script/CSS comment blocks always dropped */
const DROP_BLOCKS = new Set([
  'css/ch8.css',
  'js/core/map.js',
  'js/core/game-prologue.js',
  'js/core/chapter-transition.js',
  'js/core/finale-montage.js',
]);

function parseArgs(argv) {
  const out = { ch: null, in: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--ch') out.ch = Number(argv[++i]);
    else if (argv[i] === '--in') out.in = argv[++i];
    else if (argv[i] === '--out') out.out = argv[++i];
  }
  if (![1, 2, 4].includes(out.ch)) throw new Error('--ch must be 1, 2, or 4');
  out.in = out.in || DEFAULT_SRC[out.ch];
  out.out = out.out || out.in;
  return out;
}

function splitMarkedBlocks(html) {
  const re = /\/\* ===== ([^=]+) ===== \*\//g;
  const marks = [];
  let m;
  while ((m = re.exec(html))) {
    marks.push({ name: m[1].trim(), index: m.index, end: m.index + m[0].length });
  }
  if (!marks.length) return [{ name: '__prefix__', start: 0, end: html.length, body: html }];

  const parts = [];
  if (marks[0].index > 0) {
    parts.push({ name: '__prefix__', start: 0, end: marks[0].index, body: html.slice(0, marks[0].index) });
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : html.length;
    parts.push({
      name: marks[i].name,
      start,
      end,
      body: html.slice(start, end),
    });
  }
  return parts;
}

function shouldKeepBlock(name, ch) {
  if (name === '__prefix__') return true;
  if (DROP_BLOCKS.has(name)) return false;
  if (name === 'js/core/capacitor-viz.js' || name === 'js/core/capacitor-ui.js') {
    return ch === 1;
  }
  if (/^js\/chapters\/ch0\.js$/.test(name)) return false;
  if (/^js\/chapters\/ch\d/.test(name)) {
    return name.includes(`ch${ch}.js`) || name.includes(`ch${ch}/`);
  }
  return true;
}

function stripOtherIntros(blockBody, ch) {
  if (!blockBody.includes('chapter-intro-cinematics')) return blockBody;
  // Remove drawChNIntro for N !== keep (function … next function drawCh or end helpers)
  let out = blockBody;
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    if (n === ch) continue;
    const startRe = new RegExp(`function drawCh${n}Intro\\s*\\(`);
    const start = out.search(startRe);
    if (start < 0) continue;
    const rest = out.slice(start + 1);
    const next = rest.search(/function drawCh\dIntro\s*\(|function getTopChromeInset|\/\* =====/);
    const end = next < 0 ? out.length : start + 1 + next;
    out = out.slice(0, start) + `\n/* slim: removed drawCh${n}Intro */\n` + out.slice(end);
  }
  return out;
}

function stubDroppedGlobals(html, ch) {
  const panels = {
    1: "['controls','cap-formula','mat-wrap']",
    2: "['controls2','ch2-formula']",
    4: "['controls4']",
  }[ch];
  const stubs = `
<script>
/* slim-stubs: safe no-ops for removed modules */
window.openMap = window.openMap || function(){};
window.closeMap = window.closeMap || function(){};
window.devUnlock = window.devUnlock || function(){};
window.devTriggerWin = window.devTriggerWin || function(){};
window.resetGameProgress = window.resetGameProgress || function(){};
window.gpSkip = window.gpSkip || function(){};
window.gamePrologueActive = false;
if (typeof CH_PANEL_IDS === 'undefined') {
  var CH_PANEL_IDS = ${panels};
}
window.startTransition = window.startTransition || function(){
  var t = document.getElementById('trans');
  if (t) { t.style.display = 'flex'; t.style.opacity = '1'; }
};
</script>
`;
  if (/slim-stubs:/.test(html)) return html;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${stubs}\n</body>`);
  return html + stubs;
}

function patchGameLoopBinds(html, ch) {
  let out = html;

  // Replace hard slider binds with null-safe one-liners (full statement rewrite)
  const sliderBinds = [
    [
      /document\.getElementById\('s-c1'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); c2_c1=\+this\.value; syncCh2UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-c1');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c1=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();",
    ],
    [
      /document\.getElementById\('s-c2'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); c2_c2=\+this\.value; syncCh2UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-c2');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c2=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();",
    ],
    [
      /document\.getElementById\('s-c3'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); c2_c3=\+this\.value; syncCh2UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-c3');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c3=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();",
    ],
    [
      /document\.getElementById\('s-r3'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); c3_r=\+this\.value; syncCh3UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-r3');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c3_r=+this.value; if(typeof syncCh3UI==='function')syncCh3UI(); });})();",
    ],
    [
      /document\.getElementById\('s-cv3'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); c3_c=\+this\.value; syncCh3UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-cv3');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c3_c=+this.value; if(typeof syncCh3UI==='function')syncCh3UI(); });})();",
    ],
    [
      /document\.getElementById\('s-c5'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); ch5CVal=\+this\.value; syncCh5UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-c5');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); ch5CVal=+this.value; if(typeof syncCh5UI==='function')syncCh5UI(); });})();",
    ],
    [
      /document\.getElementById\('s-a6'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); ch6SliderA=\+this\.value; syncCh6UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-a6');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); ch6SliderA=+this.value; if(typeof syncCh6UI==='function')syncCh6UI(); });})();",
    ],
    [
      /document\.getElementById\('s-b6'\)\.addEventListener\('input',function\(\)\{ if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); ch6SliderB=\+this\.value; syncCh6UI\(\); \}\);/,
      ";(function(){var el=document.getElementById('s-b6');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); ch6SliderB=+this.value; if(typeof syncCh6UI==='function')syncCh6UI(); });})();",
    ],
  ];
  for (const [re, rep] of sliderBinds) out = out.replace(re, rep);

  out = out.replace(
    /const sArea = document\.getElementById\('s-area'\);\s*const sDist = document\.getElementById\('s-dist'\);\s*\['pointerdown', 'touchstart'\]\.forEach\(ev => \{\s*sArea\.addEventListener\(ev, \(\) => capProgDrag\(true\)\);\s*sDist\.addEventListener\(ev, \(\) => capProgDrag\(true\)\);\s*\}\);/,
    `const sArea = document.getElementById('s-area');
const sDist = document.getElementById('s-dist');
['pointerdown', 'touchstart'].forEach(ev => {
  if (sArea) sArea.addEventListener(ev, () => capProgDrag(true));
  if (sDist) sDist.addEventListener(ev, () => capProgDrag(true));
});`,
  );
  out = out.replace(
    /sArea\.addEventListener\('input', function\(\)\{ if\(won\) return; if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); areaCm2=\+this\.value; syncUI\(\); \}\);/,
    `if (sArea) sArea.addEventListener('input', function(){ if(won) return; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); areaCm2=+this.value; if(typeof syncUI==='function')syncUI(); });`,
  );
  out = out.replace(
    /sDist\.addEventListener\('input', function\(\)\{ if\(won\) return; if\(typeof SFX!=='undefined'\)SFX\.tick\('sliderTick'\); distMm=\+this\.value; syncUI\(\); \}\);/,
    `if (sDist) sDist.addEventListener('input', function(){ if(won) return; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); distMm=+this.value; if(typeof syncUI==='function')syncUI(); });`,
  );

  const keepPanels = {
    1: "['controls','cap-formula','mat-wrap']",
    2: "['controls2','ch2-formula']",
    4: "['controls4']",
  };
  out = out.replace(
    /const CH_PANEL_IDS = \[[^\]]*\];/,
    `const CH_PANEL_IDS = ${keepPanels[ch]};`,
  );

  out = out.replace(
    /document\.getElementById\('dialogue'\)\.addEventListener\('click', advanceDlg\);/,
    `(function(){var d=document.getElementById('dialogue'); if(d) d.addEventListener('click', advanceDlg);})();`,
  );

  if (!out.includes('slim-hide-map')) {
    out = out.replace(
      '</style>',
      `#map-btn,#map-overlay{display:none!important} /* slim-hide-map */\n</style>`,
    );
  }

  return out;
}

function removeDomById(html, ids) {
  let out = html;
  for (const id of ids) {
    // Remove element with id="id" ... matching closing tag at nesting depth 0 (simple heuristic for div)
    const openRe = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\bid="${id}"[^>]*)>`, 'i');
    let guard = 0;
    while (guard++ < 20) {
      const m = openRe.exec(out);
      if (!m) break;
      const tag = m[1].toLowerCase();
      const start = m.index;
      if (/\/>$/.test(m[0]) || ['input', 'img', 'br', 'hr', 'meta', 'link'].includes(tag)) {
        out = out.slice(0, start) + `<!-- slim: removed #${id} -->` + out.slice(start + m[0].length);
        continue;
      }
      let i = start + m[0].length;
      let depth = 1;
      const openTag = new RegExp(`<${tag}(\\s|>)`, 'gi');
      const closeTag = new RegExp(`</${tag}>`, 'gi');
      while (i < out.length && depth > 0) {
        openTag.lastIndex = i;
        closeTag.lastIndex = i;
        const o = openTag.exec(out);
        const c = closeTag.exec(out);
        if (!c) {
          depth = 0;
          break;
        }
        if (o && o.index < c.index) {
          depth += 1;
          i = o.index + o[0].length;
        } else {
          depth -= 1;
          i = c.index + c[0].length;
          if (depth === 0) {
            out = out.slice(0, start) + `<!-- slim: removed #${id} -->` + out.slice(i);
            break;
          }
        }
      }
      if (depth !== 0) break;
    }
  }
  return out;
}

function otherChapterDomIds(ch) {
  const allControls = ['controls', 'controls2', 'controls3', 'controls4', 'controls5', 'controls6', 'controls7'];
  const allSummary = ['summary0', 'summary1', 'summary2', 'summary3', 'summary4', 'summary5', 'summary6', 'summary7'];
  const keepControl = { 1: 'controls', 2: 'controls2', 4: 'controls4' }[ch];
  const keepSummary = `summary${ch}`;
  const drop = [
    'map-overlay',
    'ch8-root',
    'ch8-hud',
    'ch8-panel',
  ];
  for (const id of allControls) if (id !== keepControl) drop.push(id);
  for (const id of allSummary) if (id !== keepSummary) drop.push(id);
  if (ch !== 1) {
    drop.push('cap-formula', 'mat-wrap');
  }
  if (ch !== 2) drop.push('ch2-formula');
  return drop;
}

function stripOtherChapterCss(cssOrHtml, ch) {
  let out = cssOrHtml;
  // Remove large body.chapter-8 rules already gone with ch8 block
  if (ch !== 2) {
    out = out.replace(/\.ch2-[a-zA-Z0-9_-]+[^{]*\{[^}]*\}/g, '');
    out = out.replace(/#ch2-formula[^{]*\{[^}]*\}/g, '');
    out = out.replace(/#controls2[^{]*\{[^}]*\}/g, '');
  }
  if (ch !== 4) {
    out = out.replace(/\.c4-[a-zA-Z0-9_-]+[^{]*\{[^}]*\}/g, '');
    out = out.replace(/#controls4[^{]*\{[^}]*\}/g, '');
  }
  if (ch !== 1) {
    out = out.replace(/#controls\s*\{[^}]*\}/g, '');
    out = out.replace(/#cap-formula[^{]*\{[^}]*\}/g, '');
    out = out.replace(/#mat-wrap[^{]*\{[^}]*\}/g, '');
  }
  // Narrow media panel lists
  out = out.replace(
    /#controls,\s*#controls2,\s*#controls3,\s*#controls4,\s*#controls5,\s*#controls6,\s*#controls7/g,
    { 1: '#controls', 2: '#controls2', 4: '#controls4' }[ch],
  );
  return out;
}

function slimHtml(html, ch) {
  const parts = splitMarkedBlocks(html);
  const kept = [];
  for (const p of parts) {
    if (!shouldKeepBlock(p.name, ch)) {
      // css/ch8.css block incorrectly spans through </style><body>… until next JS mark.
      // Keep document structure after </style>; only drop the ch8 rules.
      if (p.name === 'css/ch8.css') {
        const styleEnd = p.body.indexOf('</style>');
        if (styleEnd >= 0) {
          kept.push(`\n/* slim: dropped block css/ch8.css */\n`);
          kept.push(p.body.slice(styleEnd)); // </style></head><body>…
          continue;
        }
      }
      if (p.name === 'js/core/map.js') {
        const panels = {
          1: "['controls','cap-formula','mat-wrap']",
          2: "['controls2','ch2-formula']",
          4: "['controls4']",
        }[ch];
        kept.push(`
/* slim: dropped block js/core/map.js — keep panel id list + map stubs */
const CH_PANEL_IDS = ${panels};
const CHAPTERS_META = [{ id: ${ch}, name: 'CH${ch}', short: 'CH${ch}' }];
function openMap() {}
function closeMap() {}
function devUnlock() {}
function devTriggerWin() {}
function resetGameProgress() {}
function buildMap() {}
`);
        continue;
      }
      kept.push(`\n/* slim: dropped block ${p.name} */\n`);
      continue;
    }
    let body = p.body;
    if (p.name === 'js/core/chapter-intro-cinematics.js') {
      body = stripOtherIntros(body, ch);
    }
    if (p.name === 'css/base.css' || p.name === '__prefix__') {
      body = stripOtherChapterCss(body, ch);
    }
    kept.push(body);
  }
  let out = kept.join('');
  out = removeDomById(out, otherChapterDomIds(ch));
  out = patchGameLoopBinds(out, ch);
  out = stubDroppedGlobals(out, ch);

  // Shrink CHAPTERS_META to keep chapter only (best-effort)
  out = out.replace(
    /const CHAPTERS_META = \[[\s\S]*?\];/,
    `const CHAPTERS_META = [{ id: ${ch}, name: '第${ch}章', short: 'CH${ch}' }];`,
  );

  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const raw = fs.readFileSync(args.in, 'utf8');
  const before = raw.split(/\n/).length;
  const slimmed = slimHtml(raw, args.ch);
  const after = slimmed.split(/\n/).length;
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, slimmed, 'utf8');
  console.log(`slim ch${args.ch}: ${before} → ${after} lines (${args.out})`);
  if (after > 6500) {
    console.warn(`warn: still above conservative 6.5k target (${after})`);
  }
  if (after > 9000) {
    throw new Error(`slim ineffective: ${after} lines`);
  }
}

if (require.main === module) main();
module.exports = { slimHtml, parseArgs };
