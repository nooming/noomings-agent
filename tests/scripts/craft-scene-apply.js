/**
 * Inject scene CSS tokens into package game.html (+ optional 样本html mirror).
 * Does NOT rewrite canvas physics — only CSS token block + optional title/hud text.
 *
 * Usage:
 *   node tests/scripts/craft-scene-apply.js --pkg rc-circuit
 *   node tests/scripts/craft-scene-apply.js --wave 1
 *   node tests/scripts/craft-scene-apply.js --wave 2 --mirror
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { THEMES, cssBlockFor } = require('./craft-scene-themes');

const ROOT = path.resolve(__dirname, '../..');
const PKG = path.join(ROOT, 'data/runtime/packages');
const YANG = path.join(ROOT, '样本html');

const MIRROR = {
  'projectile-basic': '斜抛/斜抛.html',
  'projectile-cannon': '抛体大炮/抛体大炮.html',
  'friction-incline': '斜面摩擦/斜面摩擦.html',
  'multi-kp': '机械能/机械能.html',
  'circular-motion': '圆周运动/圆周运动.html',
  'momentum-collision': '动量碰撞/动量碰撞.html',
  'pendulum-clock': '钟表铺校时/钟表铺校时.html',
  'pendulum-target': '单摆投靶/单摆投靶.html',
  'efield-charge': '电场/电场.html',
  'cyclotron-radius': '回旋加速器/回旋加速器.html',
  'capacitor-confound-ui': '电容混淆/电容混淆.html',
  'series-parallel': '串并联电路/串并联电路.html',
  'rc-circuit': 'RC电路/RC电路.html',
  'magnetic-force': '安培力/安培力.html',
  'transformer-turns': '变压器/变压器.html',
  'capacitor-era-ch1': '电容_介质与击穿/电容_介质与击穿.html',
  'capacitor-era-ch2': '电容_串并联/电容_串并联.html',
  'capacitor-era-ch4': '电容_储能与充电/电容_储能与充电.html',
  'heat-conduction': '热传导/热传导.html',
  'gas-ideal': '理想气体/理想气体.html',
  'thin-lens-implicit': '透镜/透镜.html',
  'refraction-snell': '折射/折射.html',
  'photoelectric': '光电效应/光电效应.html',
};

/* Consume tokens + trailing hud-safezone / bench-unify so re-apply does not duplicate */
const SCENE_RE = /\/\* === craft-scene-tokens[\s\S]*?(?=\n<\/style>)/;
const CRAFT_ROOT_RE = /:root\{--craft-accent:[^}]+\}/;

function injectCss(html, pkg) {
  const block = cssBlockFor(pkg);
  if (!block) return { html, changed: false };
  if (SCENE_RE.test(html)) {
    return { html: html.replace(SCENE_RE, block.trim() + '\n'), changed: true };
  }
  // Insert before </style> that closes craft shell (last </style> in head)
  const idx = html.indexOf('</style>');
  if (idx < 0) return { html, changed: false };
  // Also rebind first craft-gold :root accent if present
  let next = html;
  const theme = THEMES[pkg];
  if (theme && CRAFT_ROOT_RE.test(next)) {
    const k = theme.tokens;
    next = next.replace(
      CRAFT_ROOT_RE,
      `:root{--craft-accent:${k.accent};--craft-bg:${k.bg};--craft-panel:${k.panel};--craft-text:${k.text};--craft-muted:${k.muted};}`
    );
  }
  next = next.slice(0, idx) + block + next.slice(idx);
  return { html: next, changed: true };
}

function patchTitles(html, pkg) {
  const t = THEMES[pkg];
  if (!t) return html;
  let out = html;
  if (t.title) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${t.title}</title>`);
    // craft intro h2 (first craft-card h2)
    out = out.replace(
      /(<div id="craft-intro">[\s\S]*?<h2>)[^<]+(<\/h2>)/,
      `$1${t.title}$2`
    );
  }
  if (t.hudTitle) {
    out = out.replace(
      /(<div class="essence-title">)[^<]+(<\/div>)/,
      `$1${t.hudTitle}$2`
    );
  }
  return out;
}

function applyOne(pkg, { mirror }) {
  const gamePath = path.join(PKG, pkg, 'game.html');
  if (!fs.existsSync(gamePath)) {
    console.warn('skip missing', pkg);
    return false;
  }
  if (THEMES[pkg] && THEMES[pkg].skip) {
    console.log('skip (leave alone)', pkg);
    return false;
  }
  let html = fs.readFileSync(gamePath, 'utf8');
  const { html: withCss, changed } = injectCss(html, pkg);
  let next = patchTitles(withCss, pkg);
  if (next !== html) {
    fs.writeFileSync(gamePath, next, 'utf8');
    console.log('updated', pkg, '/game.html');
  } else if (!changed) {
    console.log('no-op', pkg);
  }
  if (mirror && MIRROR[pkg]) {
    const mPath = path.join(YANG, MIRROR[pkg]);
    if (fs.existsSync(mPath)) {
      fs.writeFileSync(mPath, next, 'utf8');
      console.log('mirrored', MIRROR[pkg]);
    } else {
      // try flat name from craft-upgrade MAP
      console.warn('mirror missing', mPath);
    }
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const mirror = args.includes('--mirror');
  const pkgIdx = args.indexOf('--pkg');
  const waveIdx = args.indexOf('--wave');
  let list = [];
  if (pkgIdx >= 0) {
    const name = args[pkgIdx + 1];
    if (name === 'all') list = Object.keys(THEMES);
    else list = [name];
  } else if (waveIdx >= 0) {
    const w = Number(args[waveIdx + 1]);
    list = Object.keys(THEMES).filter((k) => THEMES[k].wave === w && !THEMES[k].skip);
  } else {
    console.log('Usage: --pkg <name|all> | --wave <n>  [--mirror]');
    process.exit(1);
  }
  for (const p of list) applyOne(p, { mirror });
}

main();
