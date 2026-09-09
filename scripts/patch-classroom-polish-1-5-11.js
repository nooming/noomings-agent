/**
 * Classroom polish batch: phase_change fallback, visual P0 (5 advanced),
 * heat/circular bypass, cannon mass copy, craft-tokens link (5 published).
 * Syncs 样本html mirrors where mapped.
 *
 * Usage: node scripts/patch-classroom-polish-1-5-11.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'data/runtime/packages');
const YANG = path.join(ROOT, '样本html');

const SAMPLE_MAP = {
  'projectile-basic': path.join(YANG, '斜抛', '斜抛.html'),
  'projectile-cannon': path.join(YANG, '抛体大炮', '抛体大炮.html'),
  'friction-incline': path.join(YANG, '斜面摩擦', '斜面摩擦.html'),
  'pendulum-clock': path.join(YANG, '钟表铺校时', '钟表铺校时.html'),
  'pendulum-target': path.join(YANG, '单摆投靶', '单摆投靶.html'),
  'momentum-collision': path.join(YANG, '动量碰撞', '动量碰撞.html'),
  'circular-motion': path.join(YANG, '圆周运动', '圆周运动.html'),
  'ramp-rolling-collision': path.join(YANG, '斜坡滚球', 'game.html'),
  'gas-ideal': path.join(YANG, '理想气体', '理想气体.html'),
  'heat-conduction': path.join(YANG, '热传导', '热传导.html'),
};

const SETPHASE_EXPANDED = `function setPhase(phase){
    var p = phase === 'challenge' ? 'challenge' : 'explore';
    try {
      if (typeof window.__platformTraceSetPhase === 'function') {
        window.__platformTraceSetPhase(p);
        window.__craftPhaseEmitted = p;
        return;
      }
      if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.setPhase === 'function') {
        window.PlatformTraceAdapter.setPhase(p);
        window.__craftPhaseEmitted = p;
        return;
      }
    } catch (e) { /* offline */ }
    if (window.__craftPhaseEmitted === p) return;
    window.__craftPhaseEmitted = p;
    try {
      if (typeof window.__emit === 'function') window.__emit('phase_change', { phase: p });
      else if (typeof window.__traceEmit === 'function') window.__traceEmit('phase_change', { phase: p });
    } catch (e2) {}
  }`;

const SETPHASE_COMPACT = `function setPhase(p){
    p = p === 'challenge' ? 'challenge' : 'explore';
    try{
      if(typeof window.__platformTraceSetPhase==='function'){ window.__platformTraceSetPhase(p); window.__craftPhaseEmitted=p; return; }
      if(window.PlatformTraceAdapter&&window.PlatformTraceAdapter.setPhase){ window.PlatformTraceAdapter.setPhase(p); window.__craftPhaseEmitted=p; return; }
    }catch(e){}
    if(window.__craftPhaseEmitted===p) return;
    window.__craftPhaseEmitted=p;
    try{ if(typeof window.__emit==='function') window.__emit('phase_change',{phase:p}); else if(typeof window.__traceEmit==='function') window.__traceEmit('phase_change',{phase:p}); }catch(e2){}
  }`;

const VISUAL_POLISH_CSS = `
/* === classroom-visual-p0 === */
#sideGoal,p#sideGoal,#essence-bench #sideGoal,#proj-side #sideGoal,#sidePanel #sideGoal{
  font-size:14px!important;line-height:1.55!important;
}
.side-goal-wrap,#sideGoalBox{
  margin:0 0 12px;padding:8px 10px;border-radius:10px;
  background:rgba(0,0,0,.28);border:1px solid color-mix(in srgb,var(--craft-accent,#0c8aad) 40%,transparent);
}
.side-goal-cap,.side-goal-wrap .side-goal-cap,#sideGoalBox .side-goal-cap{
  font-size:12px!important;font-weight:700!important;letter-spacing:.04em;color:var(--craft-accent,#0c8aad)!important;margin-bottom:4px;
}
#essence-hud #goalMission,.essence-sub#goalMission,#goalMission{display:none!important;}
.probe-group,.cv-card.probe-group{
  margin-top:4px!important;padding:8px 10px!important;
  border:1px dashed color-mix(in srgb,var(--craft-accent,#0c8aad) 30%,transparent)!important;
  border-radius:10px!important;opacity:.68!important;background:rgba(0,0,0,.2)!important;
}
.probe-group .probe-cap{font-size:10px;letter-spacing:.05em;color:var(--craft-muted);margin:0 0 6px;}
.probe-group label{font-size:11px!important;font-weight:500!important;color:var(--craft-muted)!important;}
.craft-card > button,#craftIntroBtn,#craftWinBtn,#attempts-exhausted .craft-actions > button:first-child,
#btn-test,#btn-fire,#btnFire,#btnLaunch,#btn-test-ft{
  background:color-mix(in srgb,var(--craft-accent) 50%,#0c8aad)!important;border-radius:10px!important;
}
#modeSelect{min-height:34px;}
`;

const TOKENS_LINK = '<link rel="stylesheet" href="../_shared/craft-tokens.css">';

function readPkg(id) {
  return fs.readFileSync(path.join(PKG, id, 'game.html'), 'utf8');
}
function writePkg(id, html) {
  fs.writeFileSync(path.join(PKG, id, 'game.html'), html, 'utf8');
  const sample = SAMPLE_MAP[id];
  if (sample && fs.existsSync(sample)) {
    fs.writeFileSync(sample, html, 'utf8');
  }
}
function readChapter(id) {
  return fs.readFileSync(path.join(PKG, id, 'chapter.json'), 'utf8');
}
function writeChapter(id, text) {
  fs.writeFileSync(path.join(PKG, id, 'chapter.json'), text, 'utf8');
}

function patchSetPhaseExpanded(html) {
  if (html.includes('__craftPhaseEmitted')) return html;
  const re = /function setPhase\(phase\)\{\s*try \{\s*if \(typeof window\.__platformTraceSetPhase === 'function'\) \{\s*window\.__platformTraceSetPhase\(phase\);\s*\} else if \(window\.PlatformTraceAdapter && typeof window\.PlatformTraceAdapter\.setPhase === 'function'\) \{\s*window\.PlatformTraceAdapter\.setPhase\(phase\);\s*\}\s*\} catch \(e\) \{ \/\* offline \*\/ \}\s*\}/;
  if (!re.test(html)) {
    // try looser
    const re2 = /function setPhase\(phase\)\{[\s\S]*?catch \(e\) \{ \/\* offline \*\/ \}\s*\}/;
    if (re2.test(html) && !html.includes('__craftPhaseEmitted')) {
      return html.replace(re2, SETPHASE_EXPANDED);
    }
    return html;
  }
  return html.replace(re, SETPHASE_EXPANDED);
}

function patchSetPhaseCompact(html) {
  if (html.includes('__craftPhaseEmitted')) return html;
  const re = /function setPhase\(p\)\{\s*try\{\s*if\(typeof window\.__platformTraceSetPhase==='function'\) window\.__platformTraceSetPhase\(p\);\s*else if\(window\.PlatformTraceAdapter&&window\.PlatformTraceAdapter\.setPhase\) window\.PlatformTraceAdapter\.setPhase\(p\);\s*\}catch\(e\)\{\}\s*\}/;
  if (!re.test(html)) return html;
  return html.replace(re, SETPHASE_COMPACT);
}

function patchBasicPhase(html) {
  if (html.includes('__craftPhaseEmitted')) return html;
  const old = `try {
                  if (typeof window.__platformTraceSetPhase === 'function') window.__platformTraceSetPhase(state.mode);
                  else if (window.PlatformTraceAdapter && window.PlatformTraceAdapter.setPhase) window.PlatformTraceAdapter.setPhase(state.mode);
                } catch (_) {}`;
  const neu = `try {
                  var __p = state.mode === 'challenge' ? 'challenge' : 'explore';
                  if (typeof window.__platformTraceSetPhase === 'function') { window.__platformTraceSetPhase(__p); window.__craftPhaseEmitted = __p; }
                  else if (window.PlatformTraceAdapter && window.PlatformTraceAdapter.setPhase) { window.PlatformTraceAdapter.setPhase(__p); window.__craftPhaseEmitted = __p; }
                  else if (window.__craftPhaseEmitted !== __p) {
                    window.__craftPhaseEmitted = __p;
                    if (typeof window.__emit === 'function') window.__emit('phase_change', { phase: __p });
                    else if (typeof window.__traceEmit === 'function') window.__traceEmit('phase_change', { phase: __p });
                  }
                } catch (_) {}`;
  if (!html.includes(old)) return html;
  return html.replace(old, neu);
}

function patchRampPhase(html) {
  if (html.includes('__craftPhaseEmitted')) return html;
  const old = `try {
                    if (typeof window.__platformTraceSetPhase === 'function') {
                        window.__platformTraceSetPhase(state.mode);
                    } else if (window.PlatformTraceAdapter && window.PlatformTraceAdapter.setPhase) {
                        window.PlatformTraceAdapter.setPhase(state.mode);
                    }
                } catch (_) {}`;
  const neu = `try {
                    var __p = state.mode === 'challenge' ? 'challenge' : 'explore';
                    if (typeof window.__platformTraceSetPhase === 'function') {
                        window.__platformTraceSetPhase(__p); window.__craftPhaseEmitted = __p;
                    } else if (window.PlatformTraceAdapter && window.PlatformTraceAdapter.setPhase) {
                        window.PlatformTraceAdapter.setPhase(__p); window.__craftPhaseEmitted = __p;
                    } else if (window.__craftPhaseEmitted !== __p) {
                        window.__craftPhaseEmitted = __p;
                        if (typeof window.__emit === 'function') window.__emit('phase_change', { phase: __p });
                        else if (typeof window.__traceEmit === 'function') window.__traceEmit('phase_change', { phase: __p });
                    }
                } catch (_) {}`;
  if (!html.includes(old)) return html;
  return html.replace(old, neu);
}

function ensureVisualCss(html) {
  if (html.includes('classroom-visual-p0')) return html;
  if (html.includes('</style>')) {
    return html.replace('</style>', VISUAL_POLISH_CSS + '\n</style>');
  }
  return html;
}

function ensureTokensLink(html) {
  if (html.includes('craft-tokens.css')) return html;
  if (html.includes('<head>')) {
    return html.replace('<head>', '<head>\n' + TOKENS_LINK);
  }
  if (html.includes('<head ')) {
    return html.replace(/<head([^>]*)>/, '<head$1>\n' + TOKENS_LINK);
  }
  return html;
}

function replaceModeOptions(html) {
  return html
    .replace(/>竞赛挑战</g, '>竞赛<')
    .replace(/>定高挑战</g, '>竞赛<')
    .replace(/>靶心挑战</g, '>竞赛<')
    .replace(/>要塞突击</g, '>竞赛<');
}

function patchFriction(html) {
  html = ensureVisualCss(html);
  html = replaceModeOptions(html);
  html = patchSetPhaseExpanded(html);
  // mass → probe group
  if (!html.includes('probe-group') || !html.includes('次要参数')) {
    html = html.replace(
      `<div class="slider-group">
      <label>物体质量 m <span class="value-badge" id="massDisplay">1.0</span></label>
      <input type="range" id="s-mass" min="0.1" max="5" step="0.1" value="1.0">
    </div>`,
      `<div class="slider-group probe-group">
      <div class="probe-cap">次要参数 · 仅改观感 / 不进判定</div>
      <label>物体质量 m <span class="value-badge" id="massDisplay">1.0</span></label>
      <input type="range" id="s-mass" min="0.1" max="5" step="0.1" value="1.0">
    </div>`
    );
  }
  // side goal box structure
  html = html.replace(
    `<div id="sideGoalBox" style="margin:0 0 12px;padding:10px 12px;border-radius:12px;border:1px solid rgba(56,189,248,.35);background:rgba(15,23,42,.35)">
    <div style="font-size:11px;font-weight:700;color:#7dd3fc;letter-spacing:.04em">当前目标</div>
    <p id="sideGoal" style="margin:4px 0 0;font-size:12px;line-height:1.45;color:rgba(254,243,199,.92)">调 μ 与倾角，对比卡住、停接货区与冲过。</p>
  </div>`,
    `<div id="sideGoalBox" class="side-goal-wrap">
    <div class="side-goal-cap">当前目标</div>
    <p id="sideGoal" style="margin:4px 0 0;color:var(--craft-text)">调 μ 与倾角，对比卡住、停接货区与冲过。</p>
  </div>`
  );
  // accent toward platform teal mix (keep warm domain tint)
  html = html.replace(/--craft-accent:#d08850/g, '--craft-accent:#c88858');
  return html;
}

function patchPendulumTarget(html) {
  html = ensureVisualCss(html);
  html = replaceModeOptions(html);
  html = patchSetPhaseCompact(html);
  html = html.replace(/💀 挑战失败/g, '挑战失败');
  html = html.replace(/💀/g, '');
  // hide duplicate 竞赛 button risk: soften label
  html = html.replace(
    '<button id="compMode">竞赛</button>',
    '<button id="compMode" title="与上方模式切换相同">切到竞赛</button>'
  );
  // mass probe
  if (!html.includes('probe-group')) {
    html = html.replace(
      /<div class="row"><label>质量 m<\/label><span class="slider-value" id="massValue">3\.0<\/span><\/div>\s*<input[^>]*id="mass"[^>]*>/,
      (m) =>
        `<div class="probe-group"><div class="probe-cap">次要参数 · 仅改观感 / 不进判定</div>` +
        m +
        `</div>`
    );
  }
  html = html.replace(
    /<p id="sideGoal"[^>]*>/,
    '<p id="sideGoal" style="margin:0 0 10px;font-size:14px;line-height:1.55;color:var(--craft-text)">'
  );
  return html;
}

function patchMomentum(html) {
  html = ensureVisualCss(html);
  html = replaceModeOptions(html);
  html = patchSetPhaseExpanded(html);
  html = html.replace(/--craft-accent:#c878a0/g, '--craft-accent:#0c8aad');
  html = html.replace(/--craft-accent:#c878a0/gi, '--craft-accent:#0c8aad');
  // try common purple accents
  html = html.replace(/#c878a0/g, '#0c8aad');
  html = html.replace(
    `<div style="font-size:11px;font-weight:700;color:#7dd3fc;letter-spacing:.04em;margin-bottom:4px">当前目标</div>
    <p id="sideGoal" style="margin:0 0 12px;font-size:12px;line-height:1.45;color:rgba(226,232,240,.92)">调质量与初速，看包件 2 何时进接货口。</p>`,
    `<div class="side-goal-wrap">
      <div class="side-goal-cap">当前目标</div>
      <p id="sideGoal" style="margin:0;color:var(--craft-text)">调质量与初速，看包件 2 何时进接货口。</p>
    </div>`
  );
  html = html.replace(
    `<div class="slider-group">
            <label>导轨温度 T <span class="value-badge" id="railTempVal">22 °C</span></label>
            <input type="range" id="s-rail-temp" min="5" max="60" step="1" value="22">
        </div>`,
    `<div class="slider-group probe-group">
            <div class="probe-cap">次要参数 · 仅改观感 / 不进判定</div>
            <label>导轨温度 T <span class="value-badge" id="railTempVal">22 °C</span></label>
            <input type="range" id="s-rail-temp" min="5" max="60" step="1" value="22">
        </div>`
  );
  return html;
}

function patchCircular(html) {
  html = ensureVisualCss(html);
  html = replaceModeOptions(html);
  html = patchSetPhaseExpanded(html);
  html = html.replace(/📊 观测读数/g, '观测读数');
  html = html.replace(/📊/g, '');
  html = html.replace(
    `<div style="font-size:11px;font-weight:700;color:#7dd3fc;letter-spacing:.04em;margin-bottom:4px">当前目标</div>
  <p id="sideGoal" style="margin:0 0 12px;font-size:12px;line-height:1.45;color:rgba(226,232,240,.92)">调 r、ω，看线速度与向心力怎么变。</p>`,
    `<div class="side-goal-wrap">
    <div class="side-goal-cap">当前目标</div>
    <p id="sideGoal" style="margin:0;color:var(--craft-text)">调 r、ω，看线速度与向心力怎么变。</p>
  </div>`
  );
  html = html.replace(
    `<div class="slider-row">
      <label for="s-base-tilt">底座倾角 φ</label>
      <input type="range" id="s-base-tilt" min="0" max="15" step="1" value="0">
      <span class="value-badge" id="tiltDisplay">0°</span>
    </div>`,
    `<div class="slider-row probe-group">
      <div class="probe-cap">次要参数 · 不进判定 / 仅改观感</div>
      <label for="s-base-tilt">底座倾角 φ</label>
      <input type="range" id="s-base-tilt" min="0" max="15" step="1" value="0">
      <span class="value-badge" id="tiltDisplay">0°</span>
    </div>`
  );
  // craft attr already lacks tilt; ensure craftCv is clear
  html = html.replace(
    '底座倾角只改观感倾斜，不改 v/F 物理（视觉旁路）。',
    '底座倾角 φ：本关旁路，不进 v/F 判定，只改台架观感。'
  );
  return html;
}

function patchRamp(html) {
  html = ensureVisualCss(html);
  html = replaceModeOptions(html);
  html = patchRampPhase(html);
  // light token align
  if (!html.includes('--craft-accent')) {
    html = html.replace(
      '<style>',
      '<style>\n:root{--craft-bg:#12100e;--craft-panel:#1c1814;--craft-accent:#0c8aad;--craft-text:#efe8e0;--craft-muted:#9a9086;--craft-radius:12px;}'
    );
  } else {
    html = html.replace(/--craft-accent:\s*#[bB]8956[cC]/g, '--craft-accent:#0c8aad');
  }
  html = html.replace(
    /<div class="section-label">当前目标<\/div>\s*<p id="sideGoal">/,
    '<div class="section-label side-goal-cap">当前目标</div>\n                <p id="sideGoal" style="font-size:14px;line-height:1.55">'
  );
  // rail temp already in cv-card — add probe-cap if missing
  if (html.includes('param-card cv-card') && !html.includes('不进判定')) {
    html = html.replace(
      '<div class="param-card cv-card">\n                <h3>轨温</h3>',
      '<div class="param-card cv-card probe-group">\n                <div class="probe-cap">次要参数 · 仅改观感 / 不进判定</div>\n                <h3>轨温</h3>'
    );
  }
  return html;
}

function patchHeat(html) {
  html = ensureVisualCss(html);
  html = replaceModeOptions(html);
  html = patchSetPhaseExpanded(html);
  // strengthen area bypass copy
  html = html.replace(
    `<div class="slider-group probe-group">
        <div class="probe-cap">次要参数 · 本关旁路试探</div>
        <label>截面积 A`,
    `<div class="slider-group probe-group">
        <div class="probe-cap">次要参数 · 不进判定 / 旁路试探</div>
        <label>截面积 A（旁路）`
  );
  // remove area from craft attribution
  html = html.replace(
    `\n        <label><input type="radio" name="craftAttr" value="s-area"> 主要是截面积 A</label>`,
    ''
  );
  // craftCv reveal
  if (html.includes('id="craftCv"') && html.includes('craft-cv" hidden')) {
    html = html.replace(
      '<p id="craftCv" class="craft-cv" hidden></p>',
      '<p id="craftCv" class="craft-cv">截面积 A 本关不进热流判定（固定物理截面）；滑条仅对照旁路。</p>'
    );
  }
  // AV_LABELS: remove area from primary
  html = html.replace(
    'var AV_LABELS = {"s-thermal-conductivity":"导热系数","s-area":"截面积","s-temperature-diff":"温差"};',
    'var AV_LABELS = {"s-thermal-conductivity":"导热系数","s-temperature-diff":"温差"};'
  );
  return html;
}

function patchGasPhaseAndTokens(html) {
  html = patchSetPhaseExpanded(html);
  html = ensureTokensLink(html);
  // remove piston mass from craft attr if present
  html = html.replace(
    `\n        <label><input type="radio" name="craftAttr" value="s-piston-mass"> 主要是活塞质量</label>`,
    ''
  );
  return html;
}

function patchBasicTokensPhase(html) {
  html = ensureTokensLink(html);
  html = patchBasicPhase(html);
  return html;
}

function patchClockTokens(html) {
  html = ensureTokensLink(html);
  // clock already has phase_change via log; ensure mode options
  html = replaceModeOptions(html);
  return html;
}

function patchCannon(html) {
  html = patchSetPhaseCompact(html);
  html = html.replace(
    `<div class="guide-section">
                    <h3>6. 弹药质量</h3>
                    <p>质量越大，惯性越强。重物受风力和阻力减速的影响较小。</p>
                </div>`,
    `<div class="guide-section">
                    <h3>6. 弹药质量</h3>
                    <p>本关质量为旁路/观感量：不作为通关主因。可试拧对照，重点仍看角度、力度、阻力与风。</p>
                </div>`
  );
  // any other contradictory copy
  html = html.replace(/质量越大，惯性越强[^。]*。/g, '本关质量为旁路对照，不按「惯性决定通关」解读。');
  return html;
}

function patchCannonChapter() {
  let j = readChapter('projectile-cannon');
  j = j.replace(/"label": "质量影响惯性"/g, '"label": "质量为本关旁路（观感对照）"');
  j = j.replace(
    /"desc": "质量越大惯性越强，受阻力和风的影响越小"/g,
    '"desc": "本关将质量标为旁路/对照：勿当作通关主因；主看角度、力度、阻力与风"'
  );
  j = j.replace(/质量影响惯性/g, '质量为本关旁路');
  // mapping table cell
  j = j.replace(/\| 质量影响惯性 \| S2 \| core \| teach \|/g, '| 质量为本关旁路 | S2 | core | teach |');
  writeChapter('projectile-cannon', j);
}

function patchHeatChapter() {
  let j = readChapter('heat-conduction');
  // demote area strategy route
  j = j.replace(/"label": "单变量·截面积"/g, '"label": "试探·截面积（旁路）"');
  j = j.replace(
    /"id": "main",\s*"label": "试探·截面积（旁路）",[\s\S]*?"priorityRank": 2/,
    (m) =>
      m
        .replace(/"score": 0\.85/, '"score": 0.15')
        .replace(/"weight": 0\.85/, '"weight": 0.15')
        .replace(/"priorityRank": 2/, '"priorityRank": 9')
        .replace(
          /"warn": "每次只改一个参数，避免多变量混调难归因"/,
          '"warn": "截面积本关不进判定；试探旁路无增益，应回到 κ / ΔT"'
        )
  );
  // also if id stays main with old label already replaced in first replace — fix mermaid tip
  j = j.replace(/单变量·截面积/g, '试探·截面积（旁路）');
  j = j.replace(
    /"label": "截面积A对热流的影响"/g,
    '"label": "截面积为本关旁路（不进判定）"'
  );
  j = j.replace(
    /"desc": "截面积A增大热流增大，但竞赛中A固定为0\.05m²，不影响过关判定"/g,
    '"desc": "本关物理判定用固定截面积；滑条为对照旁路，不进过关判定"'
  );
  writeChapter('heat-conduction', j);
}

function patchCircularChapter() {
  let j = readChapter('circular-motion');
  j = j.replace(/"label": "单变量·倾角"/g, '"label": "试探·倾角（旁路）"');
  j = j.replace(/单变量·倾角/g, '试探·倾角（旁路）');
  // demote tilt route scores
  j = j.replace(
    /"id": "main_s-base-tilt",\s*"label": "试探·倾角（旁路）",[\s\S]*?"priorityRank": 3/,
    (m) =>
      m
        .replace(/"score": 0\.7/, '"score": 0.15')
        .replace(/"weight": 0\.7/, '"weight": 0.15')
        .replace(/"priorityRank": 3/, '"priorityRank": 9')
        .replace(
          /"warn": "每次只改一个参数，避免多变量混调难归因"/,
          '"warn": "底座倾角本关不进 v/F 判定；试探旁路无增益，应回到 r / ω"'
        )
  );
  j = j.replace(/调节半径、角速度、倾角滑条/g, '调节半径、角速度滑条（倾角为旁路）');
  writeChapter('circular-motion', j);
}

function main() {
  const log = [];

  // published 5: tokens + phase
  {
    let h = readPkg('projectile-basic');
    h = patchBasicTokensPhase(h);
    writePkg('projectile-basic', h);
    log.push('projectile-basic: tokens+phase');
  }
  {
    let h = readPkg('pendulum-clock');
    h = patchClockTokens(h);
    writePkg('pendulum-clock', h);
    log.push('pendulum-clock: tokens');
  }
  {
    let h = readPkg('gas-ideal');
    h = patchGasPhaseAndTokens(h);
    writePkg('gas-ideal', h);
    log.push('gas-ideal: tokens+phase+attr');
  }
  {
    let h = readPkg('friction-incline');
    h = patchFriction(h);
    h = ensureTokensLink(h);
    writePkg('friction-incline', h);
    log.push('friction-incline: visual+phase+tokens');
  }
  {
    let h = readPkg('heat-conduction');
    h = patchHeat(h);
    h = ensureTokensLink(h);
    writePkg('heat-conduction', h);
    patchHeatChapter();
    log.push('heat-conduction: bypass+phase+tokens+chapter');
  }

  // advanced 5 visual
  {
    let h = readPkg('pendulum-target');
    h = patchPendulumTarget(h);
    writePkg('pendulum-target', h);
    log.push('pendulum-target: visual+phase');
  }
  {
    let h = readPkg('momentum-collision');
    h = patchMomentum(h);
    writePkg('momentum-collision', h);
    log.push('momentum-collision: visual+phase');
  }
  {
    let h = readPkg('circular-motion');
    h = patchCircular(h);
    writePkg('circular-motion', h);
    patchCircularChapter();
    log.push('circular-motion: visual+bypass+phase+chapter');
  }
  {
    let h = readPkg('ramp-rolling-collision');
    h = patchRamp(h);
    writePkg('ramp-rolling-collision', h);
    log.push('ramp-rolling-collision: light visual+phase');
  }

  // cannon mass copy
  {
    let h = readPkg('projectile-cannon');
    h = patchCannon(h);
    writePkg('projectile-cannon', h);
    patchCannonChapter();
    log.push('projectile-cannon: mass copy+phase+chapter');
  }

  console.log('Patched:');
  for (const line of log) console.log(' -', line);
}

main();
