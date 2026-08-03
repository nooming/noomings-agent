/**
 * Upgrade 样本html to craft-gold 必达项; then writeback to packages.
 * Usage: node tests/scripts/craft-upgrade-yangben.js [--phase rename|a|b|c|all|writeback]
 */
const fs = require('fs');
const path = require('path');
const { benchUnifyCss } = require('./craft-scene-themes');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const TEAMMATE = path.join(ROOT, '组员做的样本');
const PKG = path.join(ROOT, 'data/runtime/packages');

const MAP = [
  ['斜抛.html', 'projectile-basic'],
  ['抛体大炮.html', 'projectile-cannon'],
  ['斜面摩擦.html', 'friction-incline'],
  ['机械能.html', 'multi-kp'],
  ['圆周运动.html', 'circular-motion'],
  ['动量碰撞.html', 'momentum-collision'],
  ['钟表铺校时.html', 'pendulum-clock'],
  ['单摆投靶.html', 'pendulum-target'],
  ['电场.html', 'efield-charge'],
  ['回旋加速器.html', 'cyclotron-radius'],
  ['电容混淆.html', 'capacitor-confound-ui'],
  ['串并联电路.html', 'series-parallel'],
  ['RC电路.html', 'rc-circuit'],
  ['安培力.html', 'magnetic-force'],
  ['变压器.html', 'transformer-turns'],
  ['电容_介质与击穿.html', 'capacitor-era-ch1'],
  ['电容_串并联.html', 'capacitor-era-ch2'],
  ['电容_储能与充电.html', 'capacitor-era-ch4'],
  ['热传导.html', 'heat-conduction'],
  ['理想气体.html', 'gas-ideal'],
  ['透镜.html', 'thin-lens-implicit'],
  ['折射.html', 'refraction-snell'],
  ['光电效应.html', 'photoelectric'],
];

const THEMES = {
  'friction-incline': { accent: '#e8a06a', bg: '#1a1410', panel: '#2a2118', title: '斜面摩擦探究', formula: '临界：μ < tanθ 时下滑', intro: '调节参数并测试下滑，观察物块何时静止、何时下滑。', cv: '' },
  'multi-kp': { accent: '#3b82f6', bg: '#0b1220', panel: '#152238', title: '机械能 · 过山车', formula: '½mv² + mgh = 常量（理想）', intro: '调节参数，观察过山车能否通过环顶。', cv: '' },
  'efield-charge': { accent: '#a78bfa', bg: '#12081c', panel: '#1e1230', title: '电场偏转', formula: 'F = qE', intro: '调节参数，使带电粒子进入目标区域。', cv: '' },
  'cyclotron-radius': { accent: '#22d3ee', bg: '#061018', panel: '#0d2230', title: '回旋半径', formula: 'r = mv / (qB)', intro: '调节参数，使轨道落入目标范围。', cv: '' },
  'capacitor-confound-ui': { accent: '#f59e0b', bg: '#1a1408', panel: '#2a2010', title: '电容探究', formula: 'C = ε₀εᵣA / d', intro: '调节控件，弄清哪些量真正改变结果。', cv: '' },
  'series-parallel': { accent: '#34d399', bg: '#07140f', panel: '#10241c', title: '串并联电路', formula: '串：R=ΣRi；并：1/R=Σ1/Ri', intro: '配置电路参数，使总效果落入目标区间。', cv: '' },
  'heat-conduction': { accent: '#fb7185', bg: '#1a0a10', panel: '#2a1520', title: '热传导', formula: 'Q/t ∝ κAΔT / L', intro: '调节参数，观察热传导效果并完成目标。', cv: '' },
  'thin-lens-implicit': { accent: '#60a5fa', bg: '#0a1220', panel: '#152238', title: '薄透镜成像', formula: '1/f = 1/u + 1/v', intro: '调节光学参数，使成像满足目标。', cv: '' },
  'momentum-collision': { accent: '#f472b6', bg: '#1a0a14', panel: '#2a1524', title: '动量碰撞', formula: 'm1v1 + m2v2 = 守恒（一维）', intro: '调节参数进行碰撞实验，观察碰撞前后的变化。', cv: '' },
  'magnetic-force': { accent: '#4ade80', bg: '#06140c', panel: '#102418', title: '安培力', formula: 'F = BIL', intro: '调节参数，使导线受力达到目标。', cv: '' },
  'rc-circuit': { accent: '#38bdf8', bg: '#061018', panel: '#0e2433', title: 'RC 充放电', formula: 'τ = RC', intro: '调节电路参数，观察充放电过程并完成目标。', cv: '' },
  'refraction-snell': { accent: '#2dd4bf', bg: '#061816', panel: '#0f2a28', title: '折射定律', formula: 'n1 sinθ1 = n2 sinθ2', intro: '调节参数，使光线按目标路径传播。', cv: '' },
  'circular-motion': { accent: '#fbbf24', bg: '#141008', panel: '#242014', title: '圆周运动', formula: 'a = v²/r', intro: '调节参数，观察圆周运动现象并完成目标读数。', cv: '' },
  'gas-ideal': { accent: '#c084fc', bg: '#120818', panel: '#22142e', title: '理想气体', formula: 'pV = nRT', intro: '调节气体状态参量，观察它们如何彼此关联。', cv: '' },
  'photoelectric': { accent: '#facc15', bg: '#141208', panel: '#242010', title: '光电效应', formula: 'Eₖ = hν − W', intro: '调节光与电路参数，探究阈值与光电流现象。', cv: '' },
  'transformer-turns': { accent: '#94a3b8', bg: '#0f141a', panel: '#1a2430', title: '变压器匝比', formula: 'U1/U2 ≈ N1/N2', intro: '调节匝数相关参数，观察电压如何变化。', cv: '' },
};

function dualModeBundle(theme) {
  const a = theme.accent;
  return {
    css: `
/* === craft-gold-shell === */
:root{--font-sans:"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;--font-mono:ui-monospace,"Cascadia Code",Consolas,monospace;--font-display:var(--font-sans);--font-formula:"Cambria Math","Times New Roman",serif;--craft-accent:${a};--craft-bg:${theme.bg};--craft-panel:${theme.panel};--craft-text:#e8eef5;--craft-muted:#9aa8b8;}
html,body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;
  font-family:var(--font-sans)!important;background:var(--craft-bg)!important;color:var(--craft-text)!important;}
#essence-app,#app{background:var(--craft-bg)!important;}
#essence-stage,#stage{background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.04),transparent 55%),var(--craft-bg)!important;}
#essence-bench,.control-panel,#controls-area,#bench{background:linear-gradient(180deg,color-mix(in srgb,var(--craft-panel) 92%,#fff),var(--craft-panel))!important;border-left:1px solid color-mix(in srgb,var(--craft-accent) 35%,transparent)!important;color:var(--craft-text)!important;}
#essence-bench-hd,.dual-bench-hd,.bench-hd,.ctrl-hd{background:rgba(0,0,0,.25)!important;border-bottom:1px solid color-mix(in srgb,var(--craft-accent) 30%,transparent)!important;}
#essence-bench-hd h1,.bench-hd-title,.ctrl-hd{color:var(--craft-accent)!important;}
#essence-bench .essence-scroll,#essence-bench .essence-ft,.bench-scroll,.ctrl-scroll,.ctrl-ft{background:transparent!important;color:var(--craft-text)!important;}
#essence-bench label,.slider-group label,.slabel{color:var(--craft-text)!important;}
#essence-bench .btn,button.btn,.pixel-btn,#btnLaunch{background:var(--craft-accent)!important;border:none!important;color:#0b1020!important;font-weight:700!important;border-radius:12px!important;}
#craft-intro,#craft-win{
  position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.72);backdrop-filter:blur(8px);
}
#craft-intro[hidden],#craft-win[hidden]{display:none!important;}
.craft-card{
  width:min(440px,92vw);background:var(--craft-panel);border:1px solid color-mix(in srgb,var(--craft-accent) 45%,transparent);
  border-radius:18px;padding:22px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.45);
}
.craft-card h2{margin:0 0 10px;font-size:1.25rem;color:var(--craft-accent);letter-spacing:1px;}
.craft-card p{margin:0 0 12px;line-height:1.65;color:var(--craft-text);font-size:.95rem;}
.craft-card .formula{font-family:var(--font-formula);font-size:1.05rem;color:#fff;background:rgba(0,0,0,.28);
  border-left:3px solid var(--craft-accent);padding:10px 12px;border-radius:8px;margin:10px 0 16px;}
.craft-card button{width:100%;padding:12px;border:none;border-radius:12px;background:var(--craft-accent);color:#0b1020;font-weight:700;cursor:pointer;font-size:1rem;}
#craft-gauge{
  margin-top:6px;padding:8px 12px;border-radius:12px;background:rgba(0,0,0,.35);
  border:1px solid color-mix(in srgb,var(--craft-accent) 30%,transparent);font-size:12px;color:var(--craft-text);
}
#craft-gauge strong{color:var(--craft-accent);font-family:var(--font-mono);font-size:16px;display:block;margin-top:2px;}
.app,.card,.container{background:transparent!important;box-shadow:none!important;color:inherit!important;}
.sub,.hint{color:var(--craft-text)!important;border-left-color:var(--craft-accent)!important;}
${benchUnifyCss()}
`,
    overlays: `
<div id="craft-intro">
  <div class="craft-card">
    <h2>${theme.title}</h2>
    <p>${theme.intro}</p>
    <p style="font-size:13px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>
    <button type="button" id="craftIntroBtn">开始探究</button>
  </div>
</div>
<div id="craft-win" hidden>
  <div class="craft-card">
    <h2>过关 · 你学到了什么</h2>
    <div class="formula" id="craftWinFormula">${theme.formula}</div>
    <p id="craftWinText">通过调参与观察，你归纳出了本实验的核心关系。</p>
    <button type="button" id="craftWinBtn">再玩一次</button>
  </div>
</div>
`,
    js: `
<script>
/* === craft-gold-runtime === */
(function(){
  if (window.__craftGold) return; window.__craftGold = true;
  var intro = document.getElementById('craft-intro');
  var win = document.getElementById('craft-win');
  var btn = document.getElementById('craftIntroBtn');
  var wbtn = document.getElementById('craftWinBtn');
  if (btn) btn.addEventListener('click', function(){ if(intro) intro.hidden = true; });
  function replayLevel(){
    if (typeof window.__craftReplay === 'function') {
      try { window.__craftReplay(); return; } catch (e) {}
    }
    var rbtn = document.getElementById('btn-reset')
      || document.querySelector('#btnReset, button.btn-reset, [data-action="reset"]');
    if (rbtn) { try { rbtn.click(); } catch (e) {} }
  }
  if (wbtn) wbtn.addEventListener('click', function(){
    window.__craftWinDismissed = true;
    if (win) win.hidden = true;
    replayLevel();
  });

  // gauge into hud
  var hud = document.getElementById('essence-hud') || document.getElementById('dual-mode-hud') || document.getElementById('hud');
  if (hud && !document.getElementById('craft-gauge')) {
    var g = document.createElement('div');
    g.id = 'craft-gauge';
    g.innerHTML = '<span>目标仪表</span><strong id="craftGaugeVal">待测</strong>';
    hud.appendChild(g);
  }

  function showWin(extra){
    if (win) {
      window.__craftWinDismissed = false;
      win.hidden = false;
      var t = document.getElementById('craftWinText');
      if (t && extra) t.textContent = extra;
    }
  }
  window.__craftShowWin = showWin;

  // Hook common win paths
  var _emit = window.__emit;
  window.__emit = function(type, payload){
    if (typeof _emit === 'function') _emit(type, payload);
    if (type === 'win') showWin();
  };
  // Observe win banners
  var obs = new MutationObserver(function(){
    if (window.__craftWinDismissed) return;
    var el = document.querySelector('.win-banner,.win-badge,#winBanner,[data-win="1"]');
    if (el && el.offsetParent !== null) showWin();
  });
  obs.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class','style','hidden']});

  // Live gauge from first range readout if possible
  function tick(){
    var val = document.querySelector('#essence-bench .value-badge, #essence-bench .value, .observe-box .state, .observe-value, #craftGaugeVal');
    var src = document.querySelector('.observe-box .state, .observe-value, #hud-dist, #g-T, .gauge .gval');
    var gval = document.getElementById('craftGaugeVal');
    if (gval && src && src !== gval) gval.textContent = (src.textContent || '').trim() || '观测中';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
</script>
`,
  };
}

function hasCraft(html) {
  return html.includes('craft-gold-shell') || html.includes('craft-gold-runtime');
}

function upgradeWithTheme(html, pkgId) {
  const theme = THEMES[pkgId];
  if (!theme) return { html, skipped: 'no theme map' };
  if (hasCraft(html) && !process.argv.includes('--force')) return { html, skipped: 'already craft' };

  const bundle = dualModeBundle(theme);
  let out = html;

  // Strip previous craft blocks if force
  if (process.argv.includes('--force')) {
    out = out.replace(/\/\* === craft-gold-shell === \*\/[\s\S]*?(?=<\/style>)/, '');
    out = out.replace(/<div id="craft-intro"[\s\S]*?<\/div>\s*<div id="craft-win"[\s\S]*?<\/div>\s*/i, '');
    out = out.replace(/<script>\s*\/\* === craft-gold-runtime === \*\/[\s\S]*?<\/script>\s*/g, '');
  }

  if (/<\/style>/i.test(out)) out = out.replace(/<\/style>/i, `${bundle.css}\n</style>`);
  else out = out.replace(/<\/head>/i, `<style>${bundle.css}</style></head>`);

  if (!/id=["']craft-intro["']/.test(out)) {
    out = out.replace(/<body([^>]*)>/i, `<body$1>\n${bundle.overlays}\n`);
  }
  if (!out.includes('craft-gold-runtime')) {
    out = out.replace(/<\/body>/i, `${bundle.js}\n</body>`);
  }

  // Kill obvious system font stacks in body style first occurrence
  out = out.replace(/font-family:\s*system-ui[^;"]*;/gi, 'font-family:var(--font-sans);');
  out = out.replace(/font-family:\s*'Inter'[^;"]*;/gi, 'font-family:var(--font-sans);');
  out = out.replace(/font-family:\s*['"]?Roboto[^;"]*;/gi, 'font-family:var(--font-sans);');

  return { html: out, skipped: null };
}

function phaseA() {
  // 钟表铺：组员原件 + dual mode patch pieces from package if needed
  const src = path.join(TEAMMATE, 'pendulum_钟表铺校时 (1).html');
  const dst = path.join(YANG, '钟表铺校时.html');
  let html = fs.readFileSync(src, 'utf8');
  // Ensure dual mode from package version if missing
  const pkgClock = path.join(PKG, 'pendulum-clock', 'game.html');
  if (!/id=["']modeSelect["']/.test(html) && fs.existsSync(pkgClock)) {
    // Prefer package (already has dual mode) but keep teammate visual if package is derived
    html = fs.readFileSync(pkgClock, 'utf8');
  }
  // Ensure intro-like overlay for clock if missing
  if (!/craft-intro|intro-overlay|开始校时|开始探究/.test(html)) {
    const theme = {
      accent: '#c9973f', bg: '#2c2218', panel: '#3a2c1c',
      title: '钟表铺·校时', formula: 'T ≈ 2π√(L/g)',
      intro: '调节摆的参数，使计时逼近目标周期。',
      cv: '',
    };
    const r = upgradeWithTheme(html, 'pendulum-clock');
    // pendulum-clock not in THEMES — inject manually
    const bundle = dualModeBundle(theme);
    let out = html;
    if (/<\/style>/i.test(out)) out = out.replace(/<\/style>/i, `${bundle.css}\n</style>`);
    out = out.replace(/<body([^>]*)>/i, `<body$1>\n${bundle.overlays}\n`);
    out = out.replace(/<\/body>/i, `${bundle.js}\n</body>`);
    html = out;
  }
  fs.writeFileSync(dst, html, 'utf8');
  console.log('A: 钟表铺校时', html.length);

  // Other A-tier: ensure craft overlays if lacking intro
  const aFiles = [
    ['斜抛.html', 'projectile-basic', { accent: '#3b82f6', bg: '#0f172a', panel: '#1e293b', title: '斜抛探究', formula: 'x = v₀cosθ · t；y = v₀sinθ · t − ½gt²', intro: '调节右侧参数并发射，观察轨迹如何变化，试着完成挑战目标。', cv: '' }],
    ['抛体大炮.html', 'projectile-cannon', { accent: '#ff7eb3', bg: '#2b213a', panel: '#1a1424', title: '模拟大炮', formula: '弹道受重力、阻力与风影响', intro: '调节发射参数命中目标；试着弄清哪些量真正影响弹道。', cv: '' }],
    ['单摆投靶.html', 'pendulum-target', { accent: '#5fa3c9', bg: '#0c1520', panel: '#152434', title: '单摆投靶', formula: '周期与摆长相关；落点由释放角决定', intro: '调节摆参数，使摆球落入目标区域。', cv: '' }],
  ];

  for (const [file, id, theme] of aFiles) {
    const p = path.join(YANG, file);
    let h = fs.readFileSync(p, 'utf8');
    if (!/id=["']craft-intro["']/.test(h)) {
      THEMES[id] = theme;
      const r = upgradeWithTheme(h, id);
      if (!r.skipped) h = r.html;
      else {
        const bundle = dualModeBundle(theme);
        h = h.replace(/<\/style>/i, `${bundle.css}\n</style>`);
        h = h.replace(/<body([^>]*)>/i, `<body$1>\n${bundle.overlays}\n`);
        h = h.replace(/<\/body>/i, `${bundle.js}\n</body>`);
      }
      fs.writeFileSync(p, h, 'utf8');
      console.log('A overlay', file);
    } else console.log('A skip', file);
  }

  // Capacitor chapters: add craft intro only (keep dark theme)
  for (const file of ['电容_介质与击穿.html', '电容_串并联.html', '电容_储能与充电.html']) {
    const p = path.join(YANG, file);
    let h = fs.readFileSync(p, 'utf8');
    if (/id=["']craft-intro["']/.test(h)) { console.log('A skip', file); continue; }
    const theme = {
      accent: '#00c8ff', bg: '#040410', panel: '#081220',
      title: file.replace('.html', '').replace('电容_', '电容·'),
      formula: 'C = ε₀εᵣA / d；串并联与储能关系见章节任务',
      intro: '完成本章任务：调节相关参数，观察现象并过关。',
      cv: '',
    };
    const bundle = dualModeBundle(theme);
    h = h.replace(/<\/style>/i, `${bundle.css}\n</style>`);
    h = h.replace(/<body([^>]*)>/i, `<body$1>\n${bundle.overlays}\n`);
    h = h.replace(/<\/body>/i, `${bundle.js}\n</body>`);
    fs.writeFileSync(p, h, 'utf8');
    console.log('A overlay', file);
  }
}

function phaseBC(ids) {
  for (const [file, id] of MAP) {
    if (!ids.includes(id)) continue;
    const p = path.join(YANG, file);
    if (!fs.existsSync(p)) { console.log('missing', file); continue; }
    let h = fs.readFileSync(p, 'utf8');
    if (!THEMES[id]) {
      // generic theme from title
      THEMES[id] = {
        accent: '#38bdf8', bg: '#0b1220', panel: '#152238',
        title: file.replace('.html', ''),
        formula: '调节自变量，观察因变量并完成目标',
        intro: `完成「${file.replace('.html', '')}」探究：右侧调参，舞台观察，竞赛模式限次验证。`,
        cv: '存在不影响结论的混淆控件或说明',
      };
    }
    const r = upgradeWithTheme(h, id);
    if (r.skipped) console.log('BC skip', file, r.skipped);
    else {
      fs.writeFileSync(p, r.html, 'utf8');
      console.log('BC ok', file);
    }
  }
}

function writeback() {
  for (const [file, id] of MAP) {
    const src = path.join(YANG, file);
    const dst = path.join(PKG, id, 'game.html');
    if (!fs.existsSync(src)) { console.log('missing yang', file); continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log('writeback', id);
  }
}

function main() {
  const phase = process.argv.includes('--phase')
    ? process.argv[process.argv.indexOf('--phase') + 1]
    : 'all';
  const pilot = ['rc-circuit', 'refraction-snell', 'circular-motion', 'gas-ideal', 'photoelectric', 'transformer-turns'];
  const draft = ['friction-incline', 'efield-charge', 'cyclotron-radius', 'multi-kp', 'capacitor-confound-ui', 'series-parallel', 'heat-conduction', 'thin-lens-implicit', 'momentum-collision', 'magnetic-force'];

  if (phase === 'a' || phase === 'all') phaseA();
  if (phase === 'b' || phase === 'all') phaseBC(pilot);
  if (phase === 'c' || phase === 'all') phaseBC(draft);
  if (phase === 'writeback' || phase === 'all') writeback();
  console.log('craft-upgrade done:', phase);
}

if (require.main === module) main();
module.exports = { main, MAP };
