/**
 * Machine-readable scene themes for student-game visual upgrade.
 * Metaphor + tokens + stage intent per package (pendulum-clock quality bar).
 *
 * Usage:
 *   const { THEMES, cssBlockFor } = require('./craft-scene-themes');
 *   node tests/scripts/craft-scene-apply.js [--pkg rc-circuit|all]
 */
'use strict';

const THEMES = {
  'pendulum-clock': {
    metaphor: '钟表铺·校时',
    wave: 0,
    skip: true,
    title: '钟表铺·校时',
    stageIntent: 'Walnut workshop wall + hanging clock apparatus as hero',
    tokens: {
      accent: '#c9973f',
      bg: '#2c2218',
      panel: '#3a2c1c',
      text: '#f7efd8',
      muted: '#a8823f',
      ink: '#2c2218',
      mid: '#6a4a2e',
      hi: '#f0cf8a',
      glow: '#ff9d45',
      metal: '#c9973f',
      ok: '#6fae8f',
    },
  },

  // ── Wave 1 ──
  'rc-circuit': {
    metaphor: '暗房闪光同步台',
    wave: 1,
    title: '暗房 · 闪光同步',
    hudTitle: '闪光同步工作台',
    stageIntent: 'Darkroom bench; flash capacitor unit as hero, scope secondary',
    tokens: {
      accent: '#e8a06a',
      bg: '#0a0806',
      panel: '#1a1410',
      text: '#f0e6d8',
      muted: '#a89880',
      ink: '#0a0806',
      mid: '#2a1e16',
      hi: '#f5c48a',
      glow: '#ff6a28',
      metal: '#8a96a4',
      ok: '#7dba8c',
    },
  },
  'photoelectric': {
    metaphor: '光电暗箱',
    wave: 1,
    title: '暗箱 · 光电门禁',
    hudTitle: '光电暗箱工作台',
    stageIntent: 'Sealed dark box with photocell tube, mercury lamp, ammeter',
    tokens: {
      accent: '#d4a84b',
      bg: '#0c0a12',
      panel: '#1a1624',
      text: '#efe8d8',
      muted: '#9a8e78',
      ink: '#0c0a12',
      mid: '#2a2438',
      hi: '#f0d090',
      glow: '#6eb8e8',
      metal: '#7a8494',
      ok: '#7dba8c',
    },
  },
  'transformer-turns': {
    metaphor: '变压器台架',
    wave: 1,
    title: '工地 · 变压器台架',
    hudTitle: '变压器台架',
    stageIntent: 'Laminated iron core + copper coils on workshop trestle',
    tokens: {
      accent: '#c4783a',
      bg: '#14110e',
      panel: '#241c16',
      text: '#efe6d8',
      muted: '#9a8a78',
      ink: '#14110e',
      mid: '#3a2e22',
      hi: '#e8b070',
      glow: '#e09040',
      metal: '#6a7068',
      ok: '#7dba8c',
    },
  },
  'gas-ideal': {
    metaphor: '气缸活塞桌',
    wave: 1,
    title: '气室 · 活塞实验桌',
    hudTitle: '气缸活塞桌',
    stageIntent: 'Brushed steel cylinder + brass piston + pressure gauge on lab desk',
    tokens: {
      accent: '#6a9ab8',
      bg: '#101418',
      panel: '#1a2228',
      text: '#e8eef2',
      muted: '#8a9aa8',
      ink: '#101418',
      mid: '#2a343c',
      hi: '#b8d0e0',
      glow: '#5a9ec8',
      metal: '#8a969e',
      ok: '#6fae8f',
    },
  },
  'circular-motion': {
    metaphor: '转盘工位',
    wave: 1,
    title: '夜市 · 转盘工位',
    hudTitle: '转盘巡检工位',
    stageIntent: 'Carnival turntable with axle, cable, tip mass under amber floodlight',
    tokens: {
      accent: '#e0a040',
      bg: '#12100c',
      panel: '#221c14',
      text: '#f0e8d8',
      muted: '#a09070',
      ink: '#12100c',
      mid: '#2e2618',
      hi: '#f0c870',
      glow: '#ff8a30',
      metal: '#7a8490',
      ok: '#7dba8c',
    },
  },
  'refraction-snell': {
    metaphor: '光学水槽台',
    wave: 1,
    title: '光学台 · 水槽折射',
    hudTitle: '光学水槽台',
    stageIntent: 'Glass tank on wood optical bench; lamp + underwater target',
    tokens: {
      accent: '#3a9e9a',
      bg: '#0a1414',
      panel: '#142422',
      text: '#e4f0ee',
      muted: '#7a9a96',
      ink: '#0a1414',
      mid: '#1e3430',
      hi: '#8ad4c8',
      glow: '#f0d060',
      metal: '#6a7880',
      ok: '#6fae8f',
    },
  },

  // ── Wave 2 ──
  'efield-charge': {
    metaphor: '静电偏转舱',
    wave: 2,
    title: '偏转舱 · 电场实验',
    hudTitle: '静电偏转舱',
    stageIntent: 'Vacuum deflection chamber with parallel plates + particle beam',
    tokens: {
      accent: '#8a9ee0',
      bg: '#0c1018',
      panel: '#161e2c',
      text: '#e4eaf4',
      muted: '#8898b0',
      ink: '#0c1018',
      mid: '#243044',
      hi: '#b0c0f0',
      glow: '#6090e8',
      metal: '#6a7888',
      ok: '#6fae8f',
    },
  },
  'magnetic-force': {
    metaphor: '磁轨测力台',
    wave: 2,
    title: '磁轨 · 安培力台',
    hudTitle: '磁轨测力台',
    stageIntent: 'Rails + magnet yoke + current wire with force scale',
    tokens: {
      accent: '#4aaa78',
      bg: '#0a1410',
      panel: '#14241c',
      text: '#e4f0e8',
      muted: '#7a9a88',
      ink: '#0a1410',
      mid: '#1e3428',
      hi: '#80d0a0',
      glow: '#40c878',
      metal: '#6a7870',
      ok: '#6fae8f',
    },
  },
  'series-parallel': {
    metaphor: '配电接线板',
    wave: 2,
    title: '配电间 · 接线板',
    hudTitle: '串并联接线板',
    stageIntent: 'Bakelite terminal board with resistors, meters, patch cords',
    tokens: {
      accent: '#d08040',
      bg: '#12100c',
      panel: '#221a12',
      text: '#f0e8d8',
      muted: '#a09078',
      ink: '#12100c',
      mid: '#2e2418',
      hi: '#e8b070',
      glow: '#e88830',
      metal: '#6a7068',
      ok: '#6fae8f',
    },
  },
  'heat-conduction': {
    metaphor: '导热棒实验台',
    wave: 2,
    title: '热工台 · 导热棒',
    hudTitle: '导热棒实验台',
    stageIntent: 'Metal rod between heat source and sink with IR glow gradient',
    tokens: {
      accent: '#e07060',
      bg: '#140c0c',
      panel: '#241616',
      text: '#f0e4e0',
      muted: '#a88880',
      ink: '#140c0c',
      mid: '#342020',
      hi: '#f0a090',
      glow: '#ff6040',
      metal: '#8a7870',
      ok: '#6fae8f',
    },
  },
  'capacitor-confound-ui': {
    metaphor: '电容装配台',
    wave: 2,
    title: '装配台 · 平行板电容',
    hudTitle: '电容装配台',
    stageIntent: 'Parallel-plate press with dielectric sheets on assembly bench',
    tokens: {
      accent: '#d4a050',
      bg: '#141008',
      panel: '#241c10',
      text: '#f0e8d4',
      muted: '#a09070',
      ink: '#141008',
      mid: '#2e2414',
      hi: '#f0c878',
      glow: '#e09030',
      metal: '#7a8490',
      ok: '#6fae8f',
    },
  },
  'capacitor-era-ch1': {
    metaphor: '电容介质台',
    wave: 2,
    family: 'capacitor-era',
    title: '介质台 · 击穿探究',
    hudTitle: '电容介质台',
    stageIntent: 'Shared capacitor-era visual language: amber plates + dielectric press',
    tokens: {
      accent: '#d4a050',
      bg: '#141008',
      panel: '#241c10',
      text: '#f0e8d4',
      muted: '#a09070',
      ink: '#141008',
      mid: '#2e2414',
      hi: '#f0c878',
      glow: '#e09030',
      metal: '#7a8490',
      ok: '#6fae8f',
    },
  },
  'capacitor-era-ch2': {
    metaphor: '电容串并联台',
    wave: 2,
    family: 'capacitor-era',
    title: '串并联 · 电容台',
    hudTitle: '电容串并联台',
    stageIntent: 'Shared capacitor-era visual language',
    tokens: {
      accent: '#d4a050',
      bg: '#141008',
      panel: '#241c10',
      text: '#f0e8d4',
      muted: '#a09070',
      ink: '#141008',
      mid: '#2e2414',
      hi: '#f0c878',
      glow: '#e09030',
      metal: '#7a8490',
      ok: '#6fae8f',
    },
  },
  'capacitor-era-ch4': {
    metaphor: '电容储能台',
    wave: 2,
    family: 'capacitor-era',
    title: '储能台 · 充放电',
    hudTitle: '电容储能台',
    stageIntent: 'Shared capacitor-era visual language',
    tokens: {
      accent: '#d4a050',
      bg: '#141008',
      panel: '#241c10',
      text: '#f0e8d4',
      muted: '#a09070',
      ink: '#141008',
      mid: '#2e2414',
      hi: '#f0c878',
      glow: '#e09030',
      metal: '#7a8490',
      ok: '#6fae8f',
    },
  },
  'momentum-collision': {
    metaphor: '气垫导轨台',
    wave: 2,
    title: '气垫导轨 · 碰撞',
    hudTitle: '气垫导轨台',
    stageIntent: 'Air track with two gliders under cool lab lighting',
    tokens: {
      accent: '#c878a0',
      bg: '#120c12',
      panel: '#221820',
      text: '#f0e4ec',
      muted: '#a08898',
      ink: '#120c12',
      mid: '#2e2430',
      hi: '#e8a8c8',
      glow: '#e060a0',
      metal: '#7a8490',
      ok: '#6fae8f',
    },
  },
  'cyclotron-radius': {
    metaphor: '回旋轨道舱',
    wave: 2,
    title: '加速舱 · 回旋半径',
    hudTitle: '回旋轨道舱',
    stageIntent: 'Cylindrical chamber with magnetic poles + spiral orbit trail',
    tokens: {
      accent: '#40b8c8',
      bg: '#0a1216',
      panel: '#142228',
      text: '#e0eef0',
      muted: '#7898a0',
      ink: '#0a1216',
      mid: '#1e343c',
      hi: '#80d8e0',
      glow: '#30c8d8',
      metal: '#6a7880',
      ok: '#6fae8f',
    },
  },
  'thin-lens-implicit': {
    metaphor: '透镜光具座',
    wave: 2,
    title: '光具座 · 薄透镜',
    hudTitle: '透镜光具座',
    stageIntent: 'Optical rail with object, lens mount, screen under soft lamp',
    tokens: {
      accent: '#6a9ad0',
      bg: '#0c1218',
      panel: '#162028',
      text: '#e4ecf4',
      muted: '#8898a8',
      ink: '#0c1218',
      mid: '#243038',
      hi: '#a0c0e8',
      glow: '#f0d080',
      metal: '#6a7888',
      ok: '#6fae8f',
    },
  },
  'friction-incline': {
    metaphor: '斜面摩擦台',
    wave: 2,
    title: '斜面台 · 摩擦探究',
    hudTitle: '斜面摩擦台',
    stageIntent: 'Adjustable wooden incline with block and protractor',
    tokens: {
      accent: '#d08850',
      bg: '#14100c',
      panel: '#241c14',
      text: '#f0e6d8',
      muted: '#a09078',
      ink: '#14100c',
      mid: '#2e2418',
      hi: '#e8b888',
      glow: '#e07830',
      metal: '#7a7060',
      ok: '#6fae8f',
    },
  },
  'multi-kp': {
    metaphor: '过山车环轨台',
    wave: 2,
    title: '环轨台 · 机械能',
    hudTitle: '过山车环轨台',
    stageIntent: 'Model loop track with cart under cool steel lighting',
    tokens: {
      accent: '#5088c8',
      bg: '#0c1218',
      panel: '#162028',
      text: '#e4ecf4',
      muted: '#8898a8',
      ink: '#0c1218',
      mid: '#243040',
      hi: '#90b8e8',
      glow: '#4080d0',
      metal: '#6a7888',
      ok: '#6fae8f',
    },
  },

  // Light-touch if time
  'projectile-basic': {
    metaphor: '斜抛靶场',
    wave: 3,
    title: '靶场 · 斜抛',
    hudTitle: '斜抛靶场',
    stageIntent: 'Outdoor range silhouette + cannon; light material pass only',
    tokens: {
      accent: '#6aaa78',
      bg: '#0e1410',
      panel: '#1a241c',
      text: '#e4eee6',
      muted: '#889a88',
      ink: '#0e1410',
      mid: '#243028',
      hi: '#90c8a0',
      glow: '#50b868',
      metal: '#6a7868',
      ok: '#6fae8f',
    },
  },
  'projectile-cannon': {
    metaphor: '抛体大炮台',
    wave: 3,
    title: '炮台 · 抛体',
    hudTitle: '抛体大炮台',
    stageIntent: 'Coastal gun emplacement; light material pass only',
    tokens: {
      accent: '#c88850',
      bg: '#12100c',
      panel: '#221c14',
      text: '#f0e8d8',
      muted: '#a09078',
      ink: '#12100c',
      mid: '#2e2618',
      hi: '#e8b878',
      glow: '#e08030',
      metal: '#6a7060',
      ok: '#6fae8f',
    },
  },
  'pendulum-target': {
    metaphor: '单摆投靶台',
    wave: 3,
    title: '投靶台 · 单摆',
    hudTitle: '单摆投靶台',
    stageIntent: 'Pendulum release stand facing target; light pass if time',
    tokens: {
      accent: '#c9973f',
      bg: '#1a1410',
      panel: '#2a2118',
      text: '#f0e8d8',
      muted: '#a09070',
      ink: '#1a1410',
      mid: '#3a2c1c',
      hi: '#f0cf8a',
      glow: '#ff9d45',
      metal: '#c9973f',
      ok: '#6fae8f',
    },
  },
};

/** Build CSS block that rebinds craft tokens + scene material controls. */
function cssBlockFor(pkg) {
  const t = THEMES[pkg];
  if (!t || t.skip) return '';
  const k = t.tokens;
  return `
/* === craft-scene-tokens (${pkg}) === */
:root{
  --craft-accent:${k.accent};--craft-bg:${k.bg};--craft-panel:${k.panel};
  --craft-text:${k.text};--craft-muted:${k.muted};
  --scene-ink:${k.ink};--scene-mid:${k.mid};--scene-hi:${k.hi};
  --scene-glow:${k.glow};--scene-metal:${k.metal};--scene-ok:${k.ok};
}
#essence-app,#app{background:var(--scene-ink)!important;}
#essence-stage,#stage{
  background:
    radial-gradient(ellipse at 18% 12%,color-mix(in srgb,var(--scene-glow) 18%,transparent),transparent 42%),
    radial-gradient(ellipse at 78% 8%,rgba(255,255,255,.04),transparent 38%),
    linear-gradient(180deg,color-mix(in srgb,var(--scene-mid) 55%,var(--scene-ink)),var(--scene-ink))!important;
}
#essence-bench,.control-panel,#controls-area,#bench{
  background:linear-gradient(180deg,color-mix(in srgb,var(--scene-mid) 85%,#fff),var(--craft-panel) 45%,color-mix(in srgb,var(--scene-ink) 70%,var(--craft-panel)))!important;
  border-left:1px solid color-mix(in srgb,var(--craft-accent) 45%,transparent)!important;
  box-shadow:-8px 0 28px rgba(0,0,0,.35)!important;
  color:var(--craft-text)!important;
}
#essence-bench-hd,.dual-bench-hd,.bench-hd,.ctrl-hd{
  background:rgba(0,0,0,.28)!important;
  border-bottom:1px solid color-mix(in srgb,var(--craft-accent) 35%,transparent)!important;
}
#essence-bench-hd h1,.bench-hd-title,.ctrl-hd,.essence-title{color:var(--scene-hi)!important;}
#essence-hud .essence-title{
  background:rgba(0,0,0,.55)!important;border:1px solid color-mix(in srgb,var(--craft-accent) 40%,transparent)!important;
  color:var(--scene-hi)!important;letter-spacing:2px;
}
#essence-hud .essence-sub{
  background:rgba(0,0,0,.42)!important;border:1px solid color-mix(in srgb,var(--craft-accent) 22%,transparent)!important;
  color:var(--craft-muted)!important;
}
#essence-bench label,.slider-group label,.slabel{color:var(--craft-muted)!important;}
#essence-bench .value-tag,.slider-value,.sval{color:var(--scene-hi)!important;}
#essence-bench input[type=range],.slider-group input[type=range],input[type=range]{
  accent-color:var(--craft-accent);
}
#essence-bench input[type=range]::-webkit-slider-runnable-track,
.slider-group input[type=range]::-webkit-slider-runnable-track{
  height:6px;border-radius:3px;
  background:linear-gradient(90deg,var(--scene-ink),var(--scene-mid));
  box-shadow:inset 0 1px 2px rgba(0,0,0,.65);
}
#essence-bench input[type=range]::-webkit-slider-thumb,
.slider-group input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;appearance:none;width:20px;height:20px;margin-top:-7px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,var(--scene-hi),var(--craft-accent) 55%,color-mix(in srgb,var(--craft-accent) 50%,#000));
  border:1px solid color-mix(in srgb,var(--craft-accent) 40%,#000);
  box-shadow:0 2px 5px rgba(0,0,0,.55);
}
#essence-bench .btn,button.btn,.pixel-btn,#btnLaunch,#btn-test,#btn-fire,#btnFire{
  background:linear-gradient(180deg,var(--scene-hi),var(--craft-accent) 60%,color-mix(in srgb,var(--craft-accent) 70%,#000))!important;
  border:1px solid color-mix(in srgb,var(--craft-accent) 50%,#000)!important;
  color:#1a1208!important;font-weight:700!important;border-radius:6px!important;
  box-shadow:0 3px 10px color-mix(in srgb,var(--craft-accent) 35%,transparent),inset 0 1px 0 rgba(255,255,255,.35)!important;
}
.craft-card{
  background:linear-gradient(170deg,var(--scene-mid),var(--craft-panel))!important;
  border:1px solid color-mix(in srgb,var(--craft-accent) 50%,transparent)!important;
  border-radius:8px!important;
  box-shadow:0 24px 70px rgba(0,0,0,.5),inset 0 1px 0 color-mix(in srgb,var(--scene-hi) 25%,transparent)!important;
}
.craft-card h2{color:var(--scene-hi)!important;letter-spacing:3px;}
.craft-card .formula{border-left-color:var(--craft-accent)!important;}
.craft-card button{
  background:linear-gradient(180deg,var(--scene-hi),var(--craft-accent) 60%,color-mix(in srgb,var(--craft-accent) 70%,#000))!important;
  color:#1a1208!important;border-radius:6px!important;
}
#essence-bench .observe-box,.observe-box{
  background:rgba(0,0,0,.38)!important;
  border:1px solid color-mix(in srgb,var(--craft-accent) 40%,transparent)!important;
  border-left:3px solid var(--craft-accent)!important;
  border-radius:6px!important;
}
#essence-bench .observe-box .val,.observe-box .val{color:var(--scene-hi)!important;}
#dual-mode-hud .dual-chip,#challengeStats{
  background:rgba(0,0,0,.55)!important;
  border:1px solid color-mix(in srgb,var(--craft-accent) 40%,transparent)!important;
  color:var(--craft-text)!important;border-radius:8px!important;
}
#dual-mode-hud #modeLabel{color:var(--scene-hi)!important;}
#modeSelect{
  background:rgba(0,0,0,.45)!important;border:1px solid color-mix(in srgb,var(--craft-accent) 45%,transparent)!important;
  color:var(--scene-hi)!important;border-radius:6px!important;
}
/* === craft-hud-safezone: TL dual / TR essence / playfield y≥120 === */
#essence-stage > #dual-mode-hud,
#stage > #dual-mode-hud,
#dual-mode-hud{
  position:absolute!important;
  top:10px!important;
  left:10px!important;
  right:auto!important;
  width:auto!important;
  max-width:min(360px,calc(100% - 24px))!important;
  justify-content:flex-start!important;
  align-items:flex-start!important;
  z-index:12!important;
}
#essence-hud{
  position:absolute!important;
  top:10px!important;
  right:12px!important;
  left:auto!important;
  max-width:min(240px,calc(100% - 24px))!important;
  z-index:11!important;
  align-items:flex-end!important;
}
${benchUnifyCss()}
`;
}

/** Shared bench controls + HUD enforce (idempotent upsert block). */
function benchUnifyCss() {
  return `
/* === craft-bench-unify === */
/* HUD: TL dual-mode only · TR essence / legacy gauge */
#essence-stage > #dual-mode-hud,
#stage > #dual-mode-hud,
#dual-mode-hud{
  position:absolute!important;
  top:10px!important;
  left:10px!important;
  right:auto!important;
  width:auto!important;
  max-width:min(360px,calc(100% - 24px))!important;
  justify-content:flex-start!important;
  align-items:flex-start!important;
  flex-wrap:wrap!important;
  z-index:12!important;
  pointer-events:none!important;
}
#dual-mode-hud .dual-chip,
#dual-mode-hud #challengeStats,
#challengeStats{pointer-events:auto!important;}
#essence-hud{
  position:absolute!important;
  top:10px!important;
  right:12px!important;
  left:auto!important;
  max-width:min(240px,calc(100% - 24px))!important;
  z-index:11!important;
  align-items:flex-end!important;
  pointer-events:none!important;
}
/* Legacy #hud: stage overlay; dual stays TL, readout chips → TR */
#hud{
  position:absolute!important;
  inset:0!important;
  top:0!important;left:0!important;right:0!important;bottom:0!important;
  max-width:none!important;
  display:block!important;
  background:transparent!important;
  pointer-events:none!important;
  z-index:10!important;
  gap:0!important;
}
#hud > #dual-mode-hud{
  position:absolute!important;
  top:10px!important;left:10px!important;right:auto!important;
  max-width:min(360px,calc(100% - 24px))!important;
}
#hud > .hud-chip,
#hud > .gauge,
#hud > .hud-chip.gauge{
  position:absolute!important;
  top:10px!important;right:12px!important;left:auto!important;
  align-items:flex-end!important;
  max-width:min(240px,calc(100% - 24px))!important;
  z-index:11!important;
}
#craft-gauge{display:none!important;}
#dual-mode-hud #goalMission{display:none!important;}

/* Slider track / thumb */
#essence-bench input[type=range],
.slider-group input[type=range],
.slider-row input[type=range],
#bench input[type=range],
#controls-area input[type=range],
input[type=range]{
  -webkit-appearance:none;appearance:none;
  width:100%;height:28px;margin:2px 0 8px;background:transparent;
  accent-color:var(--craft-accent);
}
#essence-bench input[type=range]::-webkit-slider-runnable-track,
.slider-group input[type=range]::-webkit-slider-runnable-track,
.slider-row input[type=range]::-webkit-slider-runnable-track,
#bench input[type=range]::-webkit-slider-runnable-track,
input[type=range]::-webkit-slider-runnable-track{
  height:6px;border-radius:999px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--craft-bg,#0c1218) 80%,#000),color-mix(in srgb,var(--craft-panel,#162028) 70%,#fff));
  box-shadow:inset 0 1px 2px rgba(0,0,0,.55);
}
#essence-bench input[type=range]::-webkit-slider-thumb,
.slider-group input[type=range]::-webkit-slider-thumb,
.slider-row input[type=range]::-webkit-slider-thumb,
#bench input[type=range]::-webkit-slider-thumb,
input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;appearance:none;
  width:18px;height:18px;margin-top:-6px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--craft-accent) 55%,#fff),var(--craft-accent) 60%,color-mix(in srgb,var(--craft-accent) 55%,#000));
  border:1px solid color-mix(in srgb,var(--craft-accent) 40%,#000);
  box-shadow:0 2px 5px rgba(0,0,0,.45);
  cursor:pointer;
}

/* Label + value badge */
#essence-bench label,
.slider-group label,
.slider-row label,
.slabel,
#bench label{
  color:var(--craft-muted)!important;
  font-size:12px!important;
  font-weight:600!important;
  letter-spacing:.02em;
}
#essence-bench .value-badge,
.slider-row .value-badge,
.slider-row .value,
.slider-group .value,
.value-badge,
.sval,
.value-tag,
#essence-bench .value{
  display:inline-flex!important;align-items:center;justify-content:center;
  min-width:52px;padding:2px 10px!important;border-radius:999px!important;
  background:rgba(0,0,0,.35)!important;
  border:1px solid color-mix(in srgb,var(--craft-accent) 35%,transparent)!important;
  color:var(--scene-hi,var(--craft-accent))!important;
  font-family:var(--font-mono)!important;font-size:12px!important;font-weight:600!important;
}

/* Observe-box states: pending / measured / hit(ok) / miss */
#essence-bench .observe-box,
.observe-box,#observePanel{
  background:rgba(0,0,0,.38)!important;
  border:1px solid color-mix(in srgb,var(--craft-accent) 32%,transparent)!important;
  border-left:3px solid color-mix(in srgb,var(--craft-muted) 70%,var(--craft-accent))!important;
  border-radius:8px!important;
  color:var(--craft-text)!important;
  padding:12px 14px!important;
}
.observe-box.is-pending,.observe-box.pending,
.observe-box[data-state="pending"]{
  border-left-color:color-mix(in srgb,var(--craft-muted) 80%,transparent)!important;
  opacity:.92;
}
.observe-box.is-measured,.observe-box.measured,
.observe-box[data-state="measured"]{
  border-left-color:var(--craft-accent)!important;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--craft-accent) 18%,transparent);
}
.observe-box.is-hit,.observe-box.hit,.observe-box.ok,.observe-box.win,
.observe-box[data-state="hit"],.observe-box[data-state="ok"]{
  border-left-color:var(--scene-ok,#6fae8f)!important;
  background:rgba(34,197,94,.14)!important;
  border-color:rgba(34,197,94,.35)!important;
}
.observe-box.is-miss,.observe-box.miss,.observe-box.fail,
.observe-box[data-state="miss"],.observe-box[data-state="fail"]{
  border-left-color:#f87171!important;
  background:rgba(248,113,113,.14)!important;
  border-color:rgba(248,113,113,.35)!important;
}
.observe-box .label,.observe-box .state,.observe-box .val,.observe-box .reading{
  color:inherit;
}
.observe-box .state,.observe-box .reading,.observe-box .val{
  font-family:var(--font-mono);
  font-weight:700;
}

/* Primary action button */
#essence-bench .btn,button.btn,.pixel-btn,
#btnLaunch,#btn-test,#btn-fire,#btnFire,#btnTest,#fireBtn{
  padding:11px 16px!important;
  border-radius:10px!important;
  font-weight:700!important;
  letter-spacing:.02em;
  transition:opacity .15s,filter .15s,transform .12s;
}
#essence-bench .btn:disabled,button.btn:disabled,.pixel-btn:disabled,
#btnLaunch:disabled,#btn-test:disabled,#btn-fire:disabled,#btnFire:disabled,#btnTest:disabled,#fireBtn:disabled,
button.dual-disabled,.dual-disabled,
button.is-playing,.btn.is-playing,.pixel-btn.is-playing{
  opacity:.45!important;
  cursor:not-allowed!important;
  pointer-events:none!important;
  filter:grayscale(.15);
  transform:none!important;
}

/* De-emphasize confound / irrelevant zones */
.confound-note,
.irrelevant-area,
.srow-irrelevant,
.irrelevant-touch,
#essence-bench .confound-note,
#bench .confound-note,
#controls-area .confound-note{
  opacity:.7!important;
  font-size:.8rem!important;
  transform:scale(.98);
  transform-origin:left top;
  filter:saturate(.75);
}
.irrelevant-area button,
.irrelevant-touch{
  padding:3px 10px!important;
  font-size:.75rem!important;
  opacity:.75!important;
}
`;
}

module.exports = { THEMES, cssBlockFor, benchUnifyCss };
