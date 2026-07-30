# -*- coding: utf-8 -*-
"""Batch5 FixedChallenge for capacitor-era ch1/ch2/ch4."""
from pathlib import Path
import shutil

ROOT = Path(r"c:\Users\20844\Desktop\agent")
YANG = ROOT / "样本html"
PKG = ROOT / "data" / "runtime" / "packages"
MARK = "BATCH5-CAP-FIXED-20260724"


def wb(yang: str, pkg: str) -> None:
    shutil.copyfile(YANG / yang, PKG / pkg / "game.html")
    print("writeback", pkg)


def patch_ch1() -> None:
    path = YANG / "电容_介质与击穿.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "__capEraApplyMode" in t:
        print("ch1 already")
        wb("电容_介质与击穿.html", "capacitor-era-ch1")
        return

    t = t.replace(
        """    <h2>电容·介质与击穿</h2>
    <p>完成本章任务：调节相关参数，观察现象并过关。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>信号塔夜修 · 介质与击穿</h2>
    <p>雷暴夜里信号塔电容组又飘了：先自由换介质、拧面积与间距，摸清读数与击穿边界；再接限次急单——本局目标电容锁定，打偏不换题。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标电容本局固定，未命中只扣次数。</p>""",
    )

    # Make TARGETS mutable + Fixed lock hook
    old = "const TARGETS   = [50, 200];"
    if old not in t:
        raise SystemExit("ch1 TARGETS not found")
    new = """let TARGETS   = [50, 200];
const TARGETS_EXPLORE = [50, 200];
let _capEraPlayMode = 'explore';
let _capEraLockedTgt = null;
function refreshCapEraGoalUI() {
  const side = document.getElementById('sideGoal');
  const mission = document.getElementById('goalMission');
  const tgtEl = document.getElementById('c-tgt');
  const tgt = TARGETS[typeof ch === 'number' ? ch : 0];
  if (tgtEl) tgtEl.textContent = String(Math.round(tgt));
  if (_capEraPlayMode === 'challenge' && _capEraLockedTgt != null) {
    if (mission) mission.textContent = '急单目标：' + Math.round(_capEraLockedTgt) + ' pF · 本局固定';
    if (side) side.textContent = '竞赛急单：把读数打进约 ' + Math.round(_capEraLockedTgt) + ' pF（含容差带）。目标已锁定，打偏不换题。';
  } else {
    if (mission) mission.textContent = '探究：自由换介质/调 A、d，观察读数与击穿边界';
    if (side) side.textContent = '探究·试修：自由改参对比现象；竞赛才是另一套锁定急单。';
  }
}
/** FixedChallenge：进竞赛锁定一次目标 C */
function lockCapEraChallenge() {
  const base = TARGETS_EXPLORE[typeof ch === 'number' ? ch : 0] || 50;
  // 略偏开探究默认目标，形成迁移检验
  const factor = 0.75 + Math.random() * 0.7; // 0.75–1.45
  _capEraLockedTgt = Math.round(base * factor);
  TARGETS = TARGETS.slice();
  TARGETS[typeof ch === 'number' ? ch : 0] = _capEraLockedTgt;
  if (typeof syncUI === 'function') syncUI();
  refreshCapEraGoalUI();
}
function applyCapEraExplore() {
  _capEraLockedTgt = null;
  TARGETS = TARGETS_EXPLORE.slice();
  if (typeof syncUI === 'function') syncUI();
  refreshCapEraGoalUI();
}
window.__capEraApplyMode = function(mode) {
  _capEraPlayMode = mode === 'challenge' ? 'challenge' : 'explore';
  if (_capEraPlayMode === 'challenge') lockCapEraChallenge();
  else applyCapEraExplore();
};
document.addEventListener('dual-mode-change', function(ev) {
  var m = ev && ev.detail && ev.detail.mode;
  if (typeof window.__capEraApplyMode === 'function') window.__capEraApplyMode(m);
});
/* """ + MARK + """ FixedChallenge */"""
    t = t.replace(old, new, 1)

    # Add sideGoal near controls if missing
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """<div id="controls" class="ctrl-panel">
<div class="dual-bench-row" style="margin-bottom:12px"><span style="color:rgba(0,200,255,.7);letter-spacing:2px;font-size:11px">阶段</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div>
  <div class="ctrl-top">""",
            """<div id="controls" class="ctrl-panel">
<div class="dual-bench-row" style="margin-bottom:12px"><span style="color:rgba(0,200,255,.7);letter-spacing:2px;font-size:11px">阶段</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div>
  <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:rgba(200,230,255,.78)">探究·试修：自由改参对比现象；竞赛才是另一套锁定急单。</p>
  <div class="ctrl-top">""",
        )

    # Hook apply() in dual-mode-manual to call __capEraApplyMode (event already dispatched)
    # dual-mode already dispatches dual-mode-change — our listener is enough.

    if 'id="goalMission"' not in t:
        t = t.replace(
            '<div id="intro-main">电容纪元</div>',
            '<div id="intro-main">电容纪元</div><div id="goalMission" style="display:none">探究模式</div>',
        )

    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    path.write_text(t.replace("\r\n", "\n"), encoding="utf-8")
    wb("电容_介质与击穿.html", "capacitor-era-ch1")
    print("OK ch1")


def patch_ch2() -> None:
    path = YANG / "电容_串并联.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "__capEra2ApplyMode" in t:
        print("ch2 already")
        wb("电容_串并联.html", "capacitor-era-ch2")
        return

    # Intro
    if "完成本章任务" in t or "电容·串并联" in t[:8000]:
        t = t.replace(
            """    <h2>电容·串并联</h2>
    <p>完成本章任务：调节相关参数，观察现象并过关。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
            """    <h2>储能电站 · 电容阵列</h2>
    <p>城邦储能站电容组要重配：先自由串并联试总电容；再接限次急单——本局目标总电容锁定，打偏不换题。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标总电容本局固定，未命中只扣次数。</p>""",
        )
        # alternate intro if different
        if "储能电站 · 电容阵列" not in t:
            import re
            t2, n = re.subn(
                r"(<div id=\"craft-intro\">[\s\S]*?<h2>)[^<]+(</h2>\s*<p>)[^<]+(</p>\s*<p style=\"font-size:12px;color:var\(--craft-muted\)\">)[^<]+",
                r"""\1储能电站 · 电容阵列\2城邦储能站电容组要重配：先自由串并联试总电容；再接限次急单——本局目标总电容锁定，打偏不换题。\3探究与竞赛目标不同；竞赛进入后目标总电容本局固定，未命中只扣次数。""",
                t,
                count=1,
            )
            if n:
                t = t2

    old = "const CH2_TARGET  = 500;   // µF"
    if old not in t:
        # try without spaces
        alt = [line for line in t.splitlines() if "CH2_TARGET" in line and "=" in line][:3]
        print("CH2_TARGET lines:", alt)
        raise SystemExit("ch2 CH2_TARGET not found")
    new = """let CH2_TARGET  = 500;   // µF
const CH2_TARGET_EXPLORE = 500;
let _cap2PlayMode = 'explore';
let _cap2Locked = null;
function refreshCap2Goals() {
  const side = document.getElementById('sideGoal');
  const meta = document.querySelector('#controls .c-meta, .ctrl-panel .c-meta');
  if (_cap2PlayMode === 'challenge' && _cap2Locked != null) {
    if (side) side.textContent = '竞赛急单：总电容对准 ' + _cap2Locked + ' µF（±3%）。目标已锁定，打偏不换题。';
    if (meta) meta.innerHTML = '急单：<strong>' + _cap2Locked + '</strong> µF · 本局固定';
  } else {
    if (side) side.textContent = '探究·试配：自由串并联，观察总电容如何变化；不必死盯单一目标。';
    if (meta) meta.innerHTML = '探究对照：<strong>500</strong> µF &emsp; 电压：<strong>5000 V</strong>';
  }
}
/** FixedChallenge */
function lockCap2Challenge() {
  const cands = [420, 460, 500, 540, 580, 620];
  _cap2Locked = cands[Math.floor(Math.random() * cands.length)];
  CH2_TARGET = _cap2Locked;
  refreshCap2Goals();
  if (typeof syncCh2 === 'function') syncCh2();
  else if (typeof updateCh2 === 'function') updateCh2();
}
function applyCap2Explore() {
  _cap2Locked = null;
  CH2_TARGET = CH2_TARGET_EXPLORE;
  refreshCap2Goals();
}
window.__capEra2ApplyMode = function(mode) {
  _cap2PlayMode = mode === 'challenge' ? 'challenge' : 'explore';
  if (_cap2PlayMode === 'challenge') lockCap2Challenge();
  else applyCap2Explore();
};
document.addEventListener('dual-mode-change', function(ev) {
  var m = ev && ev.detail && ev.detail.mode;
  if (typeof window.__capEra2ApplyMode === 'function') window.__capEra2ApplyMode(m);
});
/* """ + MARK + """ FixedChallenge */"""
    t = t.replace(old, new, 1)

    if 'id="sideGoal"' not in t:
        t = t.replace(
            '<div id="controls" class="ctrl-panel">',
            '<div id="controls" class="ctrl-panel"><p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:rgba(200,230,255,.78)">探究·试配：自由串并联，观察总电容如何变化。</p>',
            1,
        )

    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    path.write_text(t.replace("\r\n", "\n"), encoding="utf-8")
    wb("电容_串并联.html", "capacitor-era-ch2")
    print("OK ch2")


def patch_ch4() -> None:
    path = YANG / "电容_储能与充电.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "__capEra4ApplyMode" in t:
        print("ch4 already")
        wb("电容_储能与充电.html", "capacitor-era-ch4")
        return

    if "电容·储能与充电" in t:
        t = t.replace(
            """    <h2>电容·储能与充电</h2>
    <p>完成本章任务：调节相关参数，观察现象并过关。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
            """    <h2>能量之门 · 储能校准</h2>
    <p>城门封印要精确储能：先自由试 C 与 V 组合，看能量怎么变；再接限次急单——本局目标储能带锁定，偏了不换带。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标储能带本局固定，未命中只扣次数。</p>""",
        )
        if "能量之门 · 储能校准" not in t:
            import re
            t2, n = re.subn(
                r"(<div id=\"craft-intro\">[\s\S]*?<h2>)[^<]+(</h2>\s*<p>)[^<]+(</p>\s*<p style=\"font-size:12px;color:var\(--craft-muted\)\">)[^<]+",
                r"""\1能量之门 · 储能校准\2城门封印要精确储能：先自由试 C 与 V 组合；再接限次急单——本局目标储能带锁定，偏了不换带。\3探究与竞赛目标不同；竞赛进入后目标储能带本局固定，未命中只扣次数。""",
                t,
                count=1,
            )
            if n:
                t = t2

    old = """const CH4_ELOW  = 950;
const CH4_EHIGH = 1150;"""
    if old not in t:
        raise SystemExit("ch4 energy band not found")
    new = """let CH4_ELOW  = 950;
let CH4_EHIGH = 1150;
const CH4_ELOW_EXP = 950, CH4_EHIGH_EXP = 1150;
let _cap4PlayMode = 'explore';
let _cap4Locked = null;
function refreshCap4Goals() {
  const side = document.getElementById('sideGoal');
  const label = document.querySelector('#controls .c-label');
  if (_cap4PlayMode === 'challenge' && _cap4Locked) {
    if (side) side.textContent = '竞赛急单：储能落入 ' + _cap4Locked.lo + '–' + _cap4Locked.hi + ' J。区间已锁定，打偏不换带。';
    if (label) label.textContent = '急单储能：' + _cap4Locked.lo + ' ~ ' + _cap4Locked.hi + ' J · 本局固定';
  } else {
    if (side) side.textContent = '探究·试能：自由试 C、V 组合，观察储能变化；宽区间仅作对照。';
    if (label) label.textContent = '对照储能：950 ~ 1150 J';
  }
}
/** FixedChallenge */
function lockCap4Challenge() {
  const mid = 900 + Math.floor(Math.random() * 300); // 900–1199
  const half = 80 + Math.floor(Math.random() * 40);
  CH4_ELOW = mid - half;
  CH4_EHIGH = mid + half;
  _cap4Locked = { lo: CH4_ELOW, hi: CH4_EHIGH };
  refreshCap4Goals();
}
function applyCap4Explore() {
  _cap4Locked = null;
  CH4_ELOW = CH4_ELOW_EXP;
  CH4_EHIGH = CH4_EHIGH_EXP;
  refreshCap4Goals();
}
window.__capEra4ApplyMode = function(mode) {
  _cap4PlayMode = mode === 'challenge' ? 'challenge' : 'explore';
  if (_cap4PlayMode === 'challenge') lockCap4Challenge();
  else applyCap4Explore();
};
document.addEventListener('dual-mode-change', function(ev) {
  var m = ev && ev.detail && ev.detail.mode;
  if (typeof window.__capEra4ApplyMode === 'function') window.__capEra4ApplyMode(m);
});
/* """ + MARK + """ FixedChallenge */"""
    t = t.replace(old, new, 1)

    if 'id="sideGoal"' not in t:
        t = t.replace(
            '<div id="controls" class="ctrl-panel">',
            '<div id="controls" class="ctrl-panel"><p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:rgba(255,220,160,.8)">探究·试能：自由试 C、V 组合，观察储能变化。</p>',
            1,
        )

    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    path.write_text(t.replace("\r\n", "\n"), encoding="utf-8")
    wb("电容_储能与充电.html", "capacitor-era-ch4")
    print("OK ch4")


if __name__ == "__main__":
    patch_ch1()
    patch_ch2()
    patch_ch4()
    print("cap era done")
