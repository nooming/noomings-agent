/**
 * Fix HUD/canvas overlap to craft safe-zone layout:
 *   TL: #dual-mode-hud only
 *   TR: #essence-hud only (not stacked under dual at top:56)
 *   Playfield y≥120: no duplicate scene-name fillText in TL
 *   BR: canvas readout boxes reserve ~72px for student-play .play-fab
 *
 * Usage:
 *   node tests/scripts/fix-hud-safezone.js
 *   node tests/scripts/fix-hud-safezone.js --pkg transformer-turns
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { THEMES } = require('./craft-scene-themes');

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

/** Per-package canvas / DOM surgical patches (applied before CSS normalize). */
const CANVAS_PATCHES = {
  'transformer-turns': [
    {
      // remove TL tool-board label
      from: `    ctx.fillStyle = 'rgba(154,138,120,0.55)';\n    ctx.font = '10px "Microsoft YaHei",sans-serif';\n    ctx.fillText('台架工位', 20, 64);\n\n`,
      to: `\n`,
    },
    {
      // remove TL nameplate (duplicate of #essence-hud)
      from: `    // 铭牌（台架标识，避开 HUD）\n    ctx.fillStyle = PANEL;\n    ctx.fillRect(W * 0.06, 78, 148, 32);\n    ctx.strokeStyle = ACCENT;\n    ctx.lineWidth = 1.5;\n    ctx.strokeRect(W * 0.06, 78, 148, 32);\n    ctx.fillStyle = HI;\n    ctx.font = 'bold 12px "Microsoft YaHei",sans-serif';\n    ctx.fillText('变压器台架 · 叠片铁芯', W * 0.08, 98);\n\n`,
      to: `\n`,
    },
  ],
  'series-parallel': [
    {
      from: `            ctx.fillStyle = 'rgba(160,144,120,0.55)';\n            ctx.font = '10px "Microsoft YaHei",sans-serif';\n            ctx.fillText('配电挂板', 20, 60);\n\n`,
      to: `\n`,
    },
  ],
  'magnetic-force': [
    {
      from: `    ctx.fillStyle = HI;\n    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';\n    ctx.textAlign = 'left';\n    ctx.fillText('磁轨测力台', W * 0.14, 70);\n\n`,
      to: `\n`,
    },
  ],
  'capacitor-confound-ui': [
    {
      from: `      ctx.fillStyle = HI;\n      ctx.font = '11px "Microsoft YaHei",sans-serif';\n      ctx.fillText('介质料架', W * 0.06, 64);\n\n`,
      to: `\n`,
    },
  ],
  'friction-incline': [
    {
      from: `          ctx.fillStyle = SC.hi;\n          ctx.font = 'bold 10px "Microsoft YaHei",sans-serif';\n          ctx.fillText('工具板', pegX + 8, 68);\n`,
      to: ``,
    },
  ],
  'circular-motion': [
    {
      from: `    // 标题牌（暖炭底 + 琥珀描边）\n    ctx.fillStyle = 'rgba(18,16,12,0.88)';\n    ctx.fillRect(148, 54, 268, 40);\n    ctx.strokeStyle = 'rgba(224,160,64,0.45)';\n    ctx.lineWidth = 1;\n    ctx.strokeRect(148, 54, 268, 40);\n    ctx.fillStyle = SC.hi;\n    ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';\n    ctx.fillText('庙会飞椅', 156, 72);\n    ctx.fillStyle = '#e8dcc8';\n    ctx.font = '11px "Microsoft YaHei",sans-serif';\n    if (playMode === 'challenge') {\n      ctx.fillText('巡检：v ' + V_TARGET.toFixed(1) + '–' + V_HI.toFixed(1) + ' 且 F ' + F_TARGET.toFixed(1) + '–' + F_HI.toFixed(1), 156, 88);\n    } else {\n      ctx.fillText('试转中 · 观察读数如何随 r、ω 变化', 156, 88);\n    }\n\n`,
      to: `\n`,
    },
  ],
  'pendulum-target': [
    {
      from: `        ctx.fillText('矿井投递 · 把矿石摆进移动矿车', 160, 52);`,
      to: `        /* scene title lives in #essence-hud / sidebar */`,
    },
  ],
  'efield-charge': [
    {
      from: `        ctx.fillStyle = HI;\n        ctx.font = '12px "Microsoft YaHei",sans-serif';\n        ctx.textAlign = 'left';\n        ctx.fillText('静电偏转舱 · 真空室', chX + 14, chY - 8);\n\n`,
      to: `\n`,
    },
    {
      from: `ctx.fillText('荧光屏', tz.x - 6, Math.max(tz.y - 28, 58));`,
      to: `ctx.fillText('荧光屏', tz.x - 6, Math.max(tz.y - 28, 120));`,
    },
  ],
};

function normalizeEssenceHudCss(html) {
  let out = html;
  // Collapse left-stacked essence under dual → TR safe zone
  out = out.replace(
    /#essence-hud\{top:56px!important;left:10px!important;right:auto!important;max-width:min\(420px,calc\(100% - 24px\)\)!important;\}/g,
    '#essence-hud{top:10px!important;right:12px!important;left:auto!important;max-width:min(240px,calc(100% - 24px))!important;align-items:flex-end!important;}'
  );
  out = out.replace(
    /#essence-hud\{top:56px!important;max-width:min\(360px,calc\(100% - 24px\)\)!important;\}/g,
    '#essence-hud{top:10px!important;right:12px!important;left:auto!important;max-width:min(240px,calc(100% - 24px))!important;align-items:flex-end!important;}'
  );
  out = out.replace(
    /#essence-hud\{top:56px!important;\}/g,
    '#essence-hud{top:10px!important;right:12px!important;left:auto!important;max-width:min(240px,calc(100% - 24px))!important;align-items:flex-end!important;}'
  );
  // Multi-line series-parallel style
  out = out.replace(
    /#essence-hud\{\s*top:56px!important;left:10px!important;right:auto!important;[\s\S]*?\}/g,
    '#essence-hud{top:10px!important;right:12px!important;left:auto!important;max-width:min(240px,calc(100% - 24px))!important;align-items:flex-end!important;}'
  );
  return out;
}

function bumpBrReadouts(html) {
  let out = html;
  out = out.replace(/boxY\s*=\s*H\s*-\s*boxH\s*-\s*28/g, 'boxY = H - boxH - 72');
  out = out.replace(/const badgeX = W - 216, badgeY = H - 52;/g, 'const badgeX = W - 216, badgeY = H - 112;');
  return out;
}

function patchProjectileBasic(html) {
  let out = html;
  // Keep dual TL to mode|timer|stats; goal lives in sidebar #sideGoal
  if (!out.includes('/* craft-hud-safezone-projectile-basic */')) {
    const inject = `
/* craft-hud-safezone-projectile-basic */
#dual-mode-hud #goalMission{display:none!important;}
#craft-gauge{display:none!important;}
#dual-mode-hud{
  max-width:min(360px,calc(100% - 24px))!important;
  right:auto!important;
}
`;
    out = out.replace('</style>', inject + '</style>');
  }
  // Stop injecting craft-gauge into dual HUD
  out = out.replace(
    /\/\/ gauge into hud\s*\n\s*var hud = document\.getElementById\('essence-hud'\) \|\| document\.getElementById\('dual-mode-hud'\) \|\| document\.getElementById\('hud'\);\s*\n\s*if \(hud && !document\.getElementById\('craft-gauge'\)\) \{\s*\n\s*var g = document\.createElement\('div'\);\s*\n\s*g\.id = 'craft-gauge';\s*\n\s*g\.innerHTML = '<span>目标仪表<\/span><strong id="craftGaugeVal">待测<\/strong>';\s*\n\s*hud\.appendChild\(g\);\s*\n\s*\}/,
    '// gauge: reserved for sidebar; TL dual stays mode|timer|stats only'
  );
  return out;
}

function patchProjectileCannon(html) {
  let out = html;
  if (!out.includes('/* craft-hud-safezone-projectile-cannon */')) {
    const inject = `
/* craft-hud-safezone-projectile-cannon */
#dual-mode-hud #goalMission{display:none!important;}
#craft-gauge{display:none!important;}
#dual-mode-hud{
  top:10px!important;left:10px!important;right:auto!important;
  max-width:min(360px,calc(100% - 24px))!important;
  flex-wrap:wrap!important;
}
#hud-panel,.hud#hud-panel{
  top:auto!important;bottom:84px!important;left:auto!important;right:12px!important;
  z-index:6!important;max-width:min(220px,calc(100% - 24px))!important;
}
`;
    out = out.replace('</style>', inject + '</style>');
  }
  // Also soften base .hud top:92 left:10 if present
  out = out.replace(
    /\.hud \{\s*position: absolute; top: 92px; left: 10px;/,
    '.hud { position: absolute; top: auto; bottom: 84px; left: auto; right: 12px;'
  );
  return out;
}

function applyCanvasPatches(html, pkg) {
  const patches = CANVAS_PATCHES[pkg];
  if (!patches) return html;
  let out = html;
  for (const p of patches) {
    if (out.includes(p.from)) out = out.split(p.from).join(p.to);
    else if (p.to && out.includes(p.to.trim()) === false) {
      // already patched or drifted — try softer single-line removes
    }
  }
  return out;
}

function patchOne(pkg) {
  const gamePath = path.join(PKG, pkg, 'game.html');
  if (!fs.existsSync(gamePath)) {
    console.warn('skip missing', pkg);
    return { pkg, ok: false, reason: 'missing' };
  }
  let html = fs.readFileSync(gamePath, 'utf8');
  const before = html;

  html = applyCanvasPatches(html, pkg);
  html = normalizeEssenceHudCss(html);
  html = bumpBrReadouts(html);

  if (pkg === 'projectile-basic') html = patchProjectileBasic(html);
  if (pkg === 'projectile-cannon') html = patchProjectileCannon(html);

  const changed = html !== before;
  if (changed) {
    fs.writeFileSync(gamePath, html, 'utf8');
    console.log('patched', pkg);
  } else {
    console.log('no-op', pkg);
  }

  if (MIRROR[pkg]) {
    const mPath = path.join(YANG, MIRROR[pkg]);
    if (fs.existsSync(mPath)) {
      fs.writeFileSync(mPath, html, 'utf8');
      console.log('  mirrored', MIRROR[pkg]);
    }
  }
  return { pkg, ok: true, changed };
}

function main() {
  const args = process.argv.slice(2);
  const pkgIdx = args.indexOf('--pkg');
  let list;
  if (pkgIdx >= 0) list = [args[pkgIdx + 1]];
  else list = Object.keys(THEMES).filter((k) => !THEMES[k].skip);

  // Always include high-risk even if somehow skipped
  const priority = [
    'transformer-turns',
    'series-parallel',
    'magnetic-force',
    'capacitor-confound-ui',
    'friction-incline',
    'projectile-basic',
    'projectile-cannon',
    'rc-circuit',
    'photoelectric',
    'gas-ideal',
    'heat-conduction',
    'refraction-snell',
    'thin-lens-implicit',
    'circular-motion',
    'efield-charge',
    'pendulum-target',
  ];
  for (const p of priority) {
    if (!list.includes(p) && THEMES[p] && !THEMES[p].skip) list.push(p);
    else if (!list.includes(p) && fs.existsSync(path.join(PKG, p, 'game.html'))) list.push(p);
  }

  const results = [];
  for (const p of list) results.push(patchOne(p));
  const changed = results.filter((r) => r.changed).map((r) => r.pkg);
  console.log('\nChanged packages:', changed.length ? changed.join(', ') : '(none)');
}

main();
