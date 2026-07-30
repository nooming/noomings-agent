# -*- coding: utf-8 -*-
"""Finish batch5 polish + batch6 Fixed/Reroll challenge goals. Sync 样本html -> packages."""
from pathlib import Path
import shutil
import re

ROOT = Path(r"c:\Users\20844\Desktop\agent")
YANG = ROOT / "样本html"
PKG = ROOT / "data" / "runtime" / "packages"
MARK6 = "BATCH6-FIXED-20260724"
MARK6R = "BATCH6-REROLL-20260724"


def write(path: Path, text: str) -> None:
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8")


def writeback(yang: str, pkg_id: str) -> None:
    src = YANG / yang
    dst = PKG / pkg_id / "game.html"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    print("writeback", pkg_id)


def hook_dual_mode(t: str, apply_fn: str) -> str:
    """Inject apply_fn call into dual-mode-shell applyMode."""
    if apply_fn in t and f"window.{apply_fn}" in t.split("/* === dual-mode-shell runtime")[-1]:
        # already hooked in shell
        if f"window.{apply_fn}(state.mode)" in t or f"window.{apply_fn}(state.mode)" in t:
            return t
    needles = [
        """    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e){""",
        """    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e) {
""",
    ]
    repl = f"""    setPhase(state.mode);
    gateActions();
    try {{
      if (typeof window.{apply_fn} === 'function') window.{apply_fn}(state.mode);
    }} catch (e) {{}}
    document.dispatchEvent(new CustomEvent('dual-mode-change', {{ detail: {{ mode: state.mode, attempts: state.attempts }} }}));
  }}

  function onPrimaryClick(e){{"""
    for needle in needles:
        if needle in t:
            return t.replace(needle, repl, 1)
    # capacitor-style dual-mode-manual already dispatches; ok if missing
    if "dual-mode-manual runtime" in t:
        return t
    print("WARN: dual-mode hook missing for", apply_fn)
    return t


# ── Batch5 polish ──────────────────────────────────────────────

def polish_cap_confound():
    path = YANG / "电容混淆.html"
    t = path.read_text(encoding="utf-8")
    t = t.replace("<!-- BATCH4-FIXED-CAP-20260724 FixedChallenge -->\n", "")
    if "BATCH4-REROLL-CAP-20260724" not in t:
        t = t.replace("</html>", "<!-- BATCH4-REROLL-CAP-20260724 RerollChallenge -->\n</html>")
    write(path, t)
    writeback("电容混淆.html", "capacitor-confound-ui")
    print("OK confound Reroll polish")


def polish_cap_ch2():
    path = YANG / "电容_串并联.html"
    t = path.read_text(encoding="utf-8")
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """<div id="controls2" class="ctrl-panel">
<div class="dual-bench-row" style="margin-bottom:12px"><span style="color:rgba(0,200,255,.7);letter-spacing:2px;font-size:11px">阶段</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div>
  <div class="ctrl-top">""",
            """<div id="controls2" class="ctrl-panel">
<div class="dual-bench-row" style="margin-bottom:12px"><span style="color:rgba(0,200,255,.7);letter-spacing:2px;font-size:11px">阶段</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div>
  <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:rgba(200,230,255,.78)">探究·试配：自由串并联，观察总电容如何变化；不必死盯单一目标。</p>
  <div class="ctrl-top">""",
        )
    # meta id for refreshCap2Goals
    if 'id="c2-meta"' not in t:
        t = t.replace(
            '<div class="c-meta">目标：<strong>500</strong> µF &emsp; 电压：<strong>5000 V</strong></div>',
            '<div class="c-meta" id="c2-meta">目标：<strong>500</strong> µF &emsp; 电压：<strong>5000 V</strong></div>',
        )
        t = t.replace(
            "const meta = document.querySelector('#controls .c-meta, .ctrl-panel .c-meta');",
            "const meta = document.getElementById('c2-meta') || document.querySelector('#controls2 .c-meta, .ctrl-panel .c-meta');",
        )
    write(path, t)
    writeback("电容_串并联.html", "capacitor-era-ch2")
    print("OK ch2 polish")


def polish_cap_ch4():
    path = YANG / "电容_储能与充电.html"
    t = path.read_text(encoding="utf-8")
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """<div id="controls4" class="ctrl-panel">
<div class="dual-bench-row" style="margin-bottom:12px"><span style="color:rgba(0,200,255,.7);letter-spacing:2px;font-size:11px">阶段</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div>
  <div id="c4-top">
    <div>
      <div class="c-label" style="color:rgba(255,200,60,0.88);text-shadow:0 0 8px rgba(255,180,40,0.30)">目标储能：950 ~ 1150 J</div>""",
            """<div id="controls4" class="ctrl-panel">
<div class="dual-bench-row" style="margin-bottom:12px"><span style="color:rgba(0,200,255,.7);letter-spacing:2px;font-size:11px">阶段</span><select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select></div>
  <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:rgba(200,230,255,.78)">探究·试能：自由试 C、V 组合，观察储能变化；宽区间仅作对照。</p>
  <div id="c4-top">
    <div>
      <div class="c-label" id="c4-energy-label" style="color:rgba(255,200,60,0.88);text-shadow:0 0 8px rgba(255,180,40,0.30)">目标储能：950 ~ 1150 J</div>""",
        )
    else:
        t = t.replace(
            '<div class="c-label" style="color:rgba(255,200,60,0.88);text-shadow:0 0 8px rgba(255,180,40,0.30)">目标储能：950 ~ 1150 J</div>',
            '<div class="c-label" id="c4-energy-label" style="color:rgba(255,200,60,0.88);text-shadow:0 0 8px rgba(255,180,40,0.30)">目标储能：950 ~ 1150 J</div>',
        )
    t = t.replace(
        "const label = document.querySelector('#controls .c-label');",
        "const label = document.getElementById('c4-energy-label') || document.querySelector('#controls4 .c-label');",
    )
    # regenerate puzzle when locking challenge band
    old = """function lockCap4Challenge() {
  const mid = 900 + Math.floor(Math.random() * 300); // 900–1199
  const half = 80 + Math.floor(Math.random() * 40);
  CH4_ELOW = mid - half;
  CH4_EHIGH = mid + half;
  _cap4Locked = { lo: CH4_ELOW, hi: CH4_EHIGH };
  refreshCap4Goals();
}"""
    new = """function lockCap4Challenge() {
  const mid = 900 + Math.floor(Math.random() * 300); // 900–1199
  const half = 80 + Math.floor(Math.random() * 40);
  CH4_ELOW = mid - half;
  CH4_EHIGH = mid + half;
  _cap4Locked = { lo: CH4_ELOW, hi: CH4_EHIGH };
  if (typeof generateCh4Puzzle === 'function') generateCh4Puzzle();
  refreshCap4Goals();
}"""
    if old in t:
        t = t.replace(old, new)
    write(path, t)
    writeback("电容_储能与充电.html", "capacitor-era-ch4")
    print("OK ch4 polish")


def sync_batch5_rest():
    for yang, pkg in [
        ("安培力.html", "magnetic-force"),
        ("变压器.html", "transformer-turns"),
        ("电容_介质与击穿.html", "capacitor-era-ch1"),
    ]:
        writeback(yang, pkg)
    print("OK batch5 sync")


# ── Batch6 ─────────────────────────────────────────────────────

def patch_heat():
    path = YANG / "热传导.html"
    t = path.read_text(encoding="utf-8")
    if MARK6 in t and "__heatApplyMode" in t:
        print("heat already")
        writeback("热传导.html", "heat-conduction")
        return

    t = t.replace(
        """    <h2>锅炉房保温墙</h2>
    <p>炉膛侧偏热、值班室偏凉。调节墙体导热与两侧温差，把穿过保温墙的热流抬到值班要求。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>夜班锅炉房 · 穿墙热流</h2>
    <p>凌晨值班室还冷：先自由拧导热与温差，看穿墙热流怎么变；再接限次急单——本局最低热流锁定，偏了不换单。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标热流本局固定，未命中只扣次数。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">锅炉房保温墙</div>
      <div class="essence-sub">把穿墙热流抬到值班要求（≥ 2000 W）</div>""",
        """      <div class="essence-title">夜班锅炉房 · 穿墙热流</div>
      <div class="essence-sub" id="goalMission">探究：自由调 k、ΔT，观察穿墙热流</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <div class="app">
    
    

    <!-- canvas 示意热流 -->
    <!-- 调节变量：导热系数 -->
    <div class="slider-group">""",
            """    <div class="essence-scroll">
      <div class="app">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试暖：自由改导热与温差，看热流升降；不必死盯固定功率。</p>
    <div class="slider-group">""",
        )

    old = """        const A_PHYS = 0.05;   // 真正进入热流计算的截面积（学生可调的 A 为对照量）
        const d = 0.02;
        const TARGET_Q = 2000;"""
    new = """        const A_PHYS = 0.05;   // 真正进入热流计算的截面积（学生可调的 A 为对照量）
        const d = 0.02;
        let TARGET_Q = 2000;
        let playMode = 'explore';
        let lockedQ = null;
        let challengeWon = false;
        const MODE_GOALS = {
          explore: {
            hud: '探究：自由试暖，观察热流如何随 k、ΔT 变化',
            side: '探究·试暖：自由改导热与温差，看穿墙热流；宽参考线仅作对照。'
          },
          challenge: {
            hud: '竞赛：限次把热流抬到本局锁定目标（打偏不换单）',
            side: '竞赛·夜班急单：进入时锁定最低热流；打偏只扣次数——用 Q∝κΔT 算打法。'
          }
        };
        function refreshHeatGoals() {
          const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
          const mission = document.getElementById('goalMission');
          const side = document.getElementById('sideGoal');
          if (playMode === 'challenge' && lockedQ != null) {
            if (mission) mission.textContent = '急单热流：≥ ' + lockedQ + ' W · 本局固定';
            if (side) side.textContent = '竞赛急单：把穿墙热流抬到 ≥ ' + lockedQ + ' W。目标已锁定，打偏不换单。';
          } else {
            if (mission) mission.textContent = g.hud;
            if (side) side.textContent = g.side;
          }
        }
        /** FixedChallenge：仅进入竞赛时锁定一次目标热流 */
        function lockChallengeQ() {
          const cands = [1600, 2000, 2400, 2800, 3200];
          lockedQ = cands[Math.floor(Math.random() * cands.length)];
          TARGET_Q = lockedQ;
          challengeWon = false;
          kSlider.value = '25';
          dtSlider.value = '20';
          refreshHeatGoals();
          updateReadings();
          feedback.innerHTML = '急单已锁定：热流 ≥ ' + TARGET_Q + ' W（本局不变）';
          winArea.innerHTML = '';
        }
        function applyExploreQ() {
          lockedQ = null;
          TARGET_Q = 2000;
          challengeWon = false;
          refreshHeatGoals();
          updateReadings();
          feedback.innerHTML = '自由试暖：调 k、ΔT 观察热流（探究不要求固定目标）';
          winArea.innerHTML = '';
        }
        window.__heatApplyMode = function(mode) {
          playMode = mode === 'challenge' ? 'challenge' : 'explore';
          if (playMode === 'challenge') lockChallengeQ();
          else applyExploreQ();
        };
        document.addEventListener('dual-mode-change', function(ev) {
          var m = ev && ev.detail && ev.detail.mode;
          if (typeof window.__heatApplyMode === 'function') window.__heatApplyMode(m);
        });
        /* """ + MARK6 + """ FixedChallenge */"""
    if old not in t:
        raise SystemExit("heat: TARGET_Q block missing")
    t = t.replace(old, new)

    t = t.replace(
        "ctx.fillText('穿墙热流 ' + Q.toFixed(0) + ' W / 目标 ' + TARGET_Q, boxX + 10, boxY + 42);",
        "ctx.fillText('穿墙热流 ' + Q.toFixed(0) + ' W / ' + (playMode==='challenge'?'急单':'对照') + ' ≥' + TARGET_Q, boxX + 10, boxY + 42);",
    )

    old_test = """            if (winOk) {
                feedback.innerHTML = '✅ 值班室热流达标，保温墙传热量足够。';
                winArea.innerHTML = '<span class="win-badge">🏆 过关！</span>';
            } else {
                feedback.innerHTML = '⚠️ 当前 ' + Q.toFixed(0) + ' W，值班要求 ≥ ' + TARGET_Q + ' W。试试提高导热或温差。';
                winArea.innerHTML = '';
            }"""
    new_test = """            if (playMode === 'explore') {
                feedback.innerHTML = '当前热流 ' + Q.toFixed(0) + ' W · 探究对比中（不要求固定目标）';
                winArea.innerHTML = '';
            } else if (winOk) {
                feedback.innerHTML = '✅ 急单完成：热流 ≥ ' + TARGET_Q + ' W（本局锁定）';
                winArea.innerHTML = '<span class="win-badge">🏆 过关！</span>';
                if (!challengeWon && typeof window.__craftShowWin === 'function') {
                  challengeWon = true;
                  window.__craftShowWin('急单热流本局锁定。热流速率随导热系数与温差增大而增大。');
                }
            } else {
                // FixedChallenge：失败不换目标
                feedback.innerHTML = '⚠️ 当前 ' + Q.toFixed(0) + ' W，急单仍锁定 ≥ ' + TARGET_Q + ' W';
                winArea.innerHTML = '';
            }"""
    if old_test not in t:
        raise SystemExit("heat: fireTest block missing")
    t = t.replace(old_test, new_test)

    # explore should not emit win
    t = t.replace(
        """            if (window.__emit) {
                window.__emit('snapshot', { controls: controls, winOk: winOk, hintKey: winOk ? 'win_ok' : 'retry_low_heat' });
                if (winOk) window.__emit('win', { winOk: true });
            }""",
        """            if (window.__emit) {
                var ok = playMode === 'challenge' && winOk;
                window.__emit('snapshot', { controls: controls, winOk: ok, hintKey: ok ? 'win_ok' : (playMode==='explore'?'explore_observe':'retry_low_heat') });
                if (ok) window.__emit('win', { winOk: true });
            }""",
    )

    t = hook_dual_mode(t, "__heatApplyMode")
    if MARK6 not in t:
        t = t.replace("</html>", "<!-- " + MARK6 + " FixedChallenge -->\n</html>")
    write(path, t)
    writeback("热传导.html", "heat-conduction")
    print("OK heat")


def patch_gas():
    path = YANG / "理想气体.html"
    t = path.read_text(encoding="utf-8")
    if MARK6 in t and "__gasApplyMode" in t:
        print("gas already")
        writeback("理想气体.html", "gas-ideal")
        return

    t = t.replace(
        """    <h2>恒温气筒台</h2>
    <p>密封气筒温度保持不变。调节压强与活塞体积，使乘积回到标定带，完成等温压缩检验。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>实验室气筒 · 等温标定</h2>
    <p>恒温气筒读数飘了：先自由拧压强与体积，看 p·V 乘积怎么变；再接限次急单——本局标定带锁定，偏了不换带。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后标定带本局固定，未命中只扣次数。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">恒温气筒台</div>
      <div class="essence-sub">把 p·V 乘积调进标定带 9.5–10.5</div>""",
        """      <div class="essence-title">实验室气筒 · 等温标定</div>
      <div class="essence-sub" id="goalMission">探究：自由调 p、V，观察乘积变化</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <div class="card">
    
    

    <!-- canvas 示意 (非必须, 但保留视觉) -->
    <!-- 调节变量 -->
    <div class="control-grid">""",
            """    <div class="essence-scroll">
      <div class="card">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试压：自由改压强与体积，看乘积；宽标定带仅作对照。</p>
    <div class="control-grid">""",
        )

    old = """        const pSlider = document.getElementById('s-pressure');
        const vSlider = document.getElementById('s-volume');
        const pDisplay = document.getElementById('pValDisplay');
        const vDisplay = document.getElementById('vValDisplay');
        const pvDisplay = document.getElementById('pvDisplay');
        const hintMsg = document.getElementById('hintMessage');
        const winIndicator = document.getElementById('winIndicator');
        const btnTest = document.getElementById('btn-test');
        const btnReset = document.getElementById('btn-reset');
        const canvas = document.getElementById('gasCanvas');
        const ctx = canvas.getContext('2d');
        let W = 600, H = 320, animT = 0, pulse = 0;"""
    new = """        const pSlider = document.getElementById('s-pressure');
        const vSlider = document.getElementById('s-volume');
        const pDisplay = document.getElementById('pValDisplay');
        const vDisplay = document.getElementById('vValDisplay');
        const pvDisplay = document.getElementById('pvDisplay');
        const hintMsg = document.getElementById('hintMessage');
        const winIndicator = document.getElementById('winIndicator');
        const btnTest = document.getElementById('btn-test');
        const btnReset = document.getElementById('btn-reset');
        const canvas = document.getElementById('gasCanvas');
        const ctx = canvas.getContext('2d');
        let W = 600, H = 320, animT = 0, pulse = 0;
        let BAND_LO = 9.5, BAND_HI = 10.5;
        let playMode = 'explore';
        let lockedBand = null;
        let challengeWon = false;
        const MODE_GOALS = {
          explore: {
            hud: '探究：自由试压，观察 p·V 乘积如何变化',
            side: '探究·试压：自由改压强与体积；宽标定带仅作对照，不必死盯命中。'
          },
          challenge: {
            hud: '竞赛：限次把乘积打进本局锁定标定带（打偏不换带）',
            side: '竞赛·等温急单：进入时锁定标定带；打偏只扣次数——用 pV=常数算打法。'
          }
        };
        function refreshGasGoals() {
          const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
          const mission = document.getElementById('goalMission');
          const side = document.getElementById('sideGoal');
          if (playMode === 'challenge' && lockedBand) {
            if (mission) mission.textContent = '急单标定带：' + BAND_LO.toFixed(1) + '–' + BAND_HI.toFixed(1) + ' · 本局固定';
            if (side) side.textContent = '竞赛急单：把 p·V 调进 ' + BAND_LO.toFixed(1) + '–' + BAND_HI.toFixed(1) + '。区间已锁定，打偏不换带。';
          } else {
            if (mission) mission.textContent = g.hud;
            if (side) side.textContent = g.side;
          }
        }
        /** FixedChallenge：仅进入竞赛时锁定一次标定带 */
        function lockChallengeBand() {
          const mid = 8 + Math.random() * 6; // 8–14
          const half = 0.4 + Math.random() * 0.5;
          BAND_LO = Math.round((mid - half) * 10) / 10;
          BAND_HI = Math.round((mid + half) * 10) / 10;
          lockedBand = { lo: BAND_LO, hi: BAND_HI };
          challengeWon = false;
          pSlider.value = '3.0';
          vSlider.value = '5.0';
          refreshGasGoals();
          updateAll();
          hintMsg.textContent = '急单已锁定标定带（本局不变）';
          winIndicator.innerHTML = '';
        }
        function applyExploreBand() {
          lockedBand = null;
          BAND_LO = 9.5; BAND_HI = 10.5;
          challengeWon = false;
          refreshGasGoals();
          updateAll();
          hintMsg.textContent = '自由试压：观察乘积变化（探究不要求命中急单）';
          winIndicator.innerHTML = '';
        }
        window.__gasApplyMode = function(mode) {
          playMode = mode === 'challenge' ? 'challenge' : 'explore';
          if (playMode === 'challenge') lockChallengeBand();
          else applyExploreBand();
        };
        document.addEventListener('dual-mode-change', function(ev) {
          var m = ev && ev.detail && ev.detail.mode;
          if (typeof window.__gasApplyMode === 'function') window.__gasApplyMode(m);
        });
        /* """ + MARK6 + """ FixedChallenge */"""
    if old not in t:
        raise SystemExit("gas: slider block missing")
    t = t.replace(old, new)

    t = t.replace("const onBand = pv >= 9.5 && pv <= 10.5;", "const onBand = pv >= BAND_LO && pv <= BAND_HI;")
    t = t.replace(
        "ctx.fillText('标定带 9.5 – 10.5 atm·L', boxX + 10, boxY + 20);",
        "ctx.fillText((playMode==='challenge'?'急单':'对照') + ' ' + BAND_LO.toFixed(1) + '–' + BAND_HI.toFixed(1) + ' atm·L', boxX + 10, boxY + 20);",
    )
    t = t.replace(
        """        function checkWin() {
            const { pv } = computePV();
            const ok = (pv >= 9.5 && pv <= 10.5);
            return { winOk: ok, hintKey: ok ? 'win' : 'retry' };
        }""",
        """        function checkWin() {
            const { pv } = computePV();
            const ok = (pv >= BAND_LO && pv <= BAND_HI);
            return { winOk: ok, hintKey: ok ? 'win' : 'retry' };
        }""",
    )
    t = t.replace(
        """            if (winOk) {
                try { emit('win', { winOk: true }); } catch(e) {}
                winIndicator.innerHTML = '<span class="win-badge">✅ 过关！乘积落在标定带内</span>';
                hintMsg.textContent = '等温条件下乘积回到标定带。';
            } else {
                winIndicator.innerHTML = '';
                hintMsg.textContent = '当前乘积 ' + pv.toFixed(2) + '，请调到 9.5–10.5。';
            }""",
        """            if (playMode === 'explore') {
                winIndicator.innerHTML = '';
                hintMsg.textContent = '当前乘积 ' + pv.toFixed(2) + ' · 探究对比中';
            } else if (winOk) {
                try { emit('win', { winOk: true }); } catch(e) {}
                winIndicator.innerHTML = '<span class="win-badge">✅ 过关！乘积落入锁定标定带</span>';
                hintMsg.textContent = '急单完成：乘积在 ' + BAND_LO.toFixed(1) + '–' + BAND_HI.toFixed(1) + '（本局锁定）';
                if (!challengeWon && typeof window.__craftShowWin === 'function') {
                  challengeWon = true;
                  window.__craftShowWin('急单标定带本局锁定。温度不变时，压强与体积成反比，乘积近似恒定。');
                }
            } else {
                // FixedChallenge：失败不换带
                winIndicator.innerHTML = '';
                hintMsg.textContent = '当前 ' + pv.toFixed(2) + '，急单仍锁定 ' + BAND_LO.toFixed(1) + '–' + BAND_HI.toFixed(1);
            }""",
    )
    # prevent explore win emit - already gated by playMode above for win; also gate snapshot winOk
    t = t.replace(
        "try { emit('snapshot', { controls, winOk, hintKey }); } catch(e) {}",
        "try { emit('snapshot', { controls, winOk: playMode==='challenge' && winOk, hintKey: playMode==='explore'?'explore_observe':hintKey }); } catch(e) {}",
    )

    t = hook_dual_mode(t, "__gasApplyMode")
    if MARK6 not in t:
        t = t.replace("</html>", "<!-- " + MARK6 + " FixedChallenge -->\n</html>")
    write(path, t)
    writeback("理想气体.html", "gas-ideal")
    print("OK gas")


def patch_lens():
    path = YANG / "透镜.html"
    t = path.read_text(encoding="utf-8")
    if MARK6 in t and "__lensApplyMode" in t:
        print("lens already")
        writeback("透镜.html", "thin-lens-implicit")
        return

    t = t.replace(
        """    <h2>光学实验台 · 成像</h2>
    <p>导轨上已摆好物、透镜与光屏。调节物距与焦距，让清晰的像落在光屏上。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>暗室光屏 · 透镜成像</h2>
    <p>暗室导轨上光屏位置要重标定：先自由改物距与焦距，看像落在哪；再接限次急单——本局光屏距锁定，打偏不换屏。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后光屏距本局固定，未命中只扣次数。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">光学实验台</div>
      <div class="essence-sub">把清晰实像调到光屏上</div>""",
        """      <div class="essence-title">暗室光屏 · 透镜成像</div>
      <div class="essence-sub" id="goalMission">探究：自由调 u、f，观察成像位置</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <!-- Canvas 区域 -->
  <!-- 调节变量 -->
  <div class="control-panel">""",
            """    <div class="essence-scroll">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试像：自由改物距与焦距，看像落点；不必死盯固定光屏距。</p>
  <div class="control-panel">""",
        )

    old = """    let W = 640, H = 360;
    const SCREEN_DIST_CM = 22; // 透镜到光屏固定距离 (cm)
    let layout = { axisY: 220, lensX: 320, screenX: 540, pxPerCm: 10 };"""
    new = """    let W = 640, H = 360;
    let SCREEN_DIST_CM = 22; // 透镜到光屏距离 (cm)；竞赛时锁定一次
    let layout = { axisY: 220, lensX: 320, screenX: 540, pxPerCm: 10 };
    let playMode = 'explore';
    let lockedScreen = null;
    let challengeWon = false;
    const MODE_GOALS = {
      explore: {
        hud: '探究：自由试像，观察像距如何随 u、f 变化',
        side: '探究·试像：自由改物距与焦距，看像落点；对照光屏距仅作参考。'
      },
      challenge: {
        hud: '竞赛：限次把实像调到本局锁定光屏（打偏不换屏）',
        side: '竞赛·暗室急单：进入时锁定光屏距；打偏只扣次数——用透镜公式算打法。'
      }
    };
    function refreshLensGoals() {
      const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
      const mission = document.getElementById('goalMission');
      const side = document.getElementById('sideGoal');
      if (playMode === 'challenge' && lockedScreen != null) {
        if (mission) mission.textContent = '急单光屏距：' + lockedScreen + ' cm · 本局固定';
        if (side) side.textContent = '竞赛急单：把实像调到距透镜 ' + lockedScreen + ' cm 的光屏。屏距已锁定，打偏不换屏。';
      } else {
        if (mission) mission.textContent = g.hud;
        if (side) side.textContent = g.side;
      }
    }
    /** FixedChallenge：仅进入竞赛时锁定一次光屏距 */
    function lockChallengeScreen() {
      const cands = [16, 18, 20, 22, 24, 26, 28];
      lockedScreen = cands[Math.floor(Math.random() * cands.length)];
      SCREEN_DIST_CM = lockedScreen;
      challengeWon = false;
      sliderU.value = '30';
      sliderF.value = '12';
      valU.textContent = '30 cm';
      valF.textContent = '12 cm';
      refreshLensGoals();
      drawScene(getU(), getF());
      observeResult.innerHTML = '急单已锁定光屏距 ' + SCREEN_DIST_CM + ' cm（本局不变）';
      winMessage.style.display = 'none';
    }
    function applyExploreScreen() {
      lockedScreen = null;
      SCREEN_DIST_CM = 22;
      challengeWon = false;
      refreshLensGoals();
      drawScene(getU(), getF());
      observeResult.innerHTML = '自由试像：观察像落点（探究不要求固定屏距）';
      winMessage.style.display = 'none';
    }
    window.__lensApplyMode = function(mode) {
      playMode = mode === 'challenge' ? 'challenge' : 'explore';
      if (playMode === 'challenge') lockChallengeScreen();
      else applyExploreScreen();
    };
    document.addEventListener('dual-mode-change', function(ev) {
      var m = ev && ev.detail && ev.detail.mode;
      if (typeof window.__lensApplyMode === 'function') window.__lensApplyMode(m);
    });
    /* """ + MARK6 + """ FixedChallenge */"""
    if old not in t:
        raise SystemExit("lens: SCREEN_DIST block missing")
    t = t.replace(old, new)

    t = t.replace(
        "ctx.fillText(onScreen ? '像已对准光屏' : '像未落在光屏', boxX + 10, boxY + 38);",
        "ctx.fillText((playMode==='challenge'?'急单屏 ':'对照屏 ') + SCREEN_DIST_CM + 'cm · ' + (onScreen ? '已对准' : '未对准'), boxX + 10, boxY + 38);",
    )

    old_test = """      try {
        const emit = (function() {
          function e(type, payload) {
            try { if (window.PlatformTraceAdapter) { window.PlatformTraceAdapter.record(type, payload); return; } } catch(e) {}
            try { if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter) { window.parent.PlatformTraceAdapter.record(type, payload); } } catch(e) {}
          }
          return e;
        })();
        emit('snapshot', { controls: controls, winOk: winOk, hintKey: hintKey });
        if (winOk) {
          emit('win', { winOk: true });
        }
      } catch (e) {}
    }"""
    new_test = """      try {
        const emit = (function() {
          function e(type, payload) {
            try { if (window.PlatformTraceAdapter) { window.PlatformTraceAdapter.record(type, payload); return; } } catch(e) {}
            try { if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter) { window.parent.PlatformTraceAdapter.record(type, payload); } } catch(e) {}
          }
          return e;
        })();
        if (playMode === 'explore') {
          observeResult.innerHTML = (onScreen ? '像碰巧落在对照屏上 · ' : '') + '探究对比中（不要求固定屏距）';
          winMessage.style.display = 'none';
          emit('snapshot', { controls: controls, winOk: false, hintKey: 'explore_observe' });
        } else if (winOk) {
          observeResult.innerHTML = '✅ 急单完成：像落在锁定光屏 ' + SCREEN_DIST_CM + ' cm';
          emit('snapshot', { controls: controls, winOk: true, hintKey: hintKey });
          emit('win', { winOk: true });
          if (!challengeWon && typeof window.__craftShowWin === 'function') {
            challengeWon = true;
            window.__craftShowWin('急单光屏距本局锁定。物距、像距与焦距满足透镜成像公式。');
          }
        } else {
          // FixedChallenge：失败不换屏
          observeResult.innerHTML = '❌ 未对准 · 急单屏距仍锁定 ' + SCREEN_DIST_CM + ' cm';
          emit('snapshot', { controls: controls, winOk: false, hintKey: hintKey });
        }
      } catch (e) {}
    }"""
    if old_test not in t:
        raise SystemExit("lens: handleTest emit block missing")
    t = t.replace(old_test, new_test)

    t = hook_dual_mode(t, "__lensApplyMode")
    if MARK6 not in t:
        t = t.replace("</html>", "<!-- " + MARK6 + " FixedChallenge -->\n</html>")
    write(path, t)
    writeback("透镜.html", "thin-lens-implicit")
    print("OK lens")


def patch_refract():
    path = YANG / "折射.html"
    t = path.read_text(encoding="utf-8")
    if MARK6 in t and "__refractApplyMode" in t:
        print("refract already")
        writeback("折射.html", "refraction-snell")
        return

    t = t.replace(
        """    <h2>水槽打靶 · 折射</h2>
    <p>水面上方的探照灯要照亮水下靶标。调节入射角与介质折射率，让折射光线命中目标。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>夜潜探照 · 水下打靶</h2>
    <p>码头夜潜要照亮水下浮标：先自由拧入射角与折射率，看折射光怎么拐；再接限次急单——本局靶位锁定，打偏不换靶。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后靶位本局固定，未命中只扣次数。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">水槽打靶</div>
      <div class="essence-sub">让折射光线命中水下靶标</div>""",
        """      <div class="essence-title">夜潜探照 · 水下打靶</div>
      <div class="essence-sub" id="goalMission">探究：自由调 θ₁、n₂，观察折射光路</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <div class="container">
    
    

    <div class="controls-grid">""",
            """    <div class="essence-scroll">
      <div class="container">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试照：自由改入射角与折射率，看折射光路；不必死盯固定靶。</p>
    <div class="controls-grid">""",
        )

    old = """  const n1 = 1.0;
  let W = 700, H = 400;
  let layout = { groundY: 240, launchX: 100, launchY: 70, target: { x: 520, y: 310, radius: 18 } };"""
    new = """  const n1 = 1.0;
  let W = 700, H = 400;
  let layout = { groundY: 240, launchX: 100, launchY: 70, target: { x: 520, y: 310, radius: 18 } };
  let playMode = 'explore';
  let lockedTargetFrac = null; // FixedChallenge：横向比例
  let challengeWon = false;
  const MODE_GOALS = {
    explore: {
      hud: '探究：自由试照，观察折射光如何随 θ₁、n₂ 变化',
      side: '探究·试照：自由改入射角与折射率，看光路；不必死盯固定靶位。'
    },
    challenge: {
      hud: '竞赛：限次命中本局锁定水下靶（打偏不换靶）',
      side: '竞赛·夜潜急单：进入时锁定靶位；打偏只扣次数——用折射定律算打法。'
    }
  };
  function refreshRefractGoals() {
    const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
    const mission = document.getElementById('goalMission');
    const side = document.getElementById('sideGoal');
    if (playMode === 'challenge' && lockedTargetFrac != null) {
      if (mission) mission.textContent = '急单靶位已锁定 · 本局固定';
      if (side) side.textContent = '竞赛急单：命中锁定水下靶。靶位已固定，打偏不换靶。';
    } else {
      if (mission) mission.textContent = g.hud;
      if (side) side.textContent = g.side;
    }
  }
  /** FixedChallenge：仅进入竞赛时锁定一次靶位 */
  function lockChallengeTarget() {
    lockedTargetFrac = 0.55 + Math.random() * 0.28; // 0.55–0.83
    challengeWon = false;
    angleSlider.value = '45';
    indexSlider.value = '1.3';
    refreshRefractGoals();
    updateExperiment(false);
    feedback.textContent = '急单已锁定水下靶位（本局不变）';
    winMessageDiv.innerHTML = '';
  }
  function applyExploreTarget() {
    lockedTargetFrac = null;
    challengeWon = false;
    refreshRefractGoals();
    updateExperiment(false);
    feedback.textContent = '自由试照：观察折射光路（探究不要求固定靶）';
    winMessageDiv.innerHTML = '';
  }
  window.__refractApplyMode = function(mode) {
    playMode = mode === 'challenge' ? 'challenge' : 'explore';
    if (playMode === 'challenge') lockChallengeTarget();
    else applyExploreTarget();
  };
  document.addEventListener('dual-mode-change', function(ev) {
    var m = ev && ev.detail && ev.detail.mode;
    if (typeof window.__refractApplyMode === 'function') window.__refractApplyMode(m);
  });
  /* """ + MARK6 + """ FixedChallenge */"""
    if old not in t:
        raise SystemExit("refract: layout block missing")
    t = t.replace(old, new)

    t = t.replace(
        """    layout.target = {
      x: Math.round(W * 0.72),
      y: Math.round(H * 0.72),
      radius: Math.max(14, Math.round(Math.min(W, H) * 0.035))
    };""",
        """    var txFrac = (playMode === 'challenge' && lockedTargetFrac != null) ? lockedTargetFrac : 0.72;
    layout.target = {
      x: Math.round(W * txFrac),
      y: Math.round(H * 0.72),
      radius: Math.max(14, Math.round(Math.min(W, H) * 0.035))
    };""",
    )
    t = t.replace(
        "ctx.fillText('水下靶', target.x - 22, target.y - target.radius - 8);",
        "ctx.fillText(playMode==='challenge'?'急单靶':'对照靶', target.x - 22, target.y - target.radius - 8);",
    )

    old_fire = """      const hit = result.hit;
      if (hit) {
        feedback.textContent = '✅ 命中目标！过关！';
        winMessageDiv.innerHTML = '<span class="win-badge">🎉 过关！折射光线命中目标</span>';
        return { winOk: true, hintKey: null };
      } else {
        feedback.textContent = '❌ 折射光线未命中目标，请调整参数再试';
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'C3' };
      }"""
    new_fire = """      const hit = result.hit;
      if (playMode === 'explore') {
        feedback.textContent = hit ? '光线碰巧掠过对照靶 · 探究对比中' : '当前未命中对照靶 · 继续探究折射规律';
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'explore_observe' };
      }
      if (hit) {
        feedback.textContent = '✅ 急单完成：命中锁定水下靶';
        winMessageDiv.innerHTML = '<span class="win-badge">🎉 过关！命中锁定靶</span>';
        if (!challengeWon && typeof window.__craftShowWin === 'function') {
          challengeWon = true;
          window.__craftShowWin('急单靶位本局锁定。入射角与折射率共同决定折射角，从而决定能否命中。');
        }
        return { winOk: true, hintKey: null };
      } else {
        // FixedChallenge：失败不换靶
        feedback.textContent = '❌ 未命中 · 急单靶位仍锁定，请再算折射角';
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'C3' };
      }"""
    if old_fire not in t:
        raise SystemExit("refract: fire hit block missing")
    t = t.replace(old_fire, new_fire)

    t = hook_dual_mode(t, "__refractApplyMode")
    if MARK6 not in t:
        t = t.replace("</html>", "<!-- " + MARK6 + " FixedChallenge -->\n</html>")
    write(path, t)
    writeback("折射.html", "refraction-snell")
    print("OK refract")


def patch_photo():
    path = YANG / "光电效应.html"
    t = path.read_text(encoding="utf-8")
    if MARK6R in t and "__photoApplyMode" in t and "rerollChallengeMaterial" in t:
        print("photo already")
        writeback("光电效应.html", "photoelectric")
        return

    t = t.replace(
        """    <h2>光电管实验台</h2>
    <p>真空光电管里还没有光电流。调节入射光频率与金属逸出功，试着点亮回路。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>夜班光电管 · 换材料急单</h2>
    <p>光电管阴极材料换了一批：先自由改频率与逸出功，看何时出现光电流；再接限次急单——每次打偏都会换新材料/W，防背阈值。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛失败会换材料逸出功（Reroll）。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">光电管实验台</div>
      <div class="essence-sub">点亮回路，观察到非零光电流</div>""",
        """      <div class="essence-title">夜班光电管 · 换材料急单</div>
      <div class="essence-sub" id="goalMission">探究：自由调 f、W，观察光电流阈值</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <div class="game">
  
  

  <!-- canvas 区域 -->
  <!-- 控制面板 -->
  <div class="control-panel">""",
            """    <div class="essence-scroll">
      <div class="game">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试光：自由改频率与逸出功，找电流阈值；不必死盯单一材料。</p>
    <div id="materialBadge" style="margin:0 0 10px;font-size:12px;color:#fde68a;display:none"></div>
  <div class="control-panel">""",
        )

    old = """    // 状态
    let lastFrequency = 5.0;   // 单位 1e14 Hz
    let lastWork = 2.5;        // eV
    let currentI = 0.0;        // μA
    let hasFired = false;
    let winAchieved = false;"""
    new = """    // 状态
    let lastFrequency = 5.0;   // 单位 1e14 Hz
    let lastWork = 2.5;        // eV
    let currentI = 0.0;        // μA
    let hasFired = false;
    let winAchieved = false;
    let playMode = 'explore';
    let lockedMat = null;
    let challengeWon = false;
    const MATERIALS = [
      { name: '钠', W: 2.3 },
      { name: '钾', W: 2.0 },
      { name: '铯', W: 1.9 },
      { name: '锌', W: 3.3 },
      { name: '铜', W: 4.5 },
      { name: '银', W: 4.3 }
    ];
    const MODE_GOALS = {
      explore: {
        hud: '探究：自由试光，观察何时出现光电流',
        side: '探究·试光：自由改频率与逸出功，找阈值；不必死盯单一材料。'
      },
      challenge: {
        hud: '竞赛：限次点亮当前急单材料（打偏会换材料/W）',
        side: '竞赛·换料急单：每次未命中都会换新阴极材料——不能背频率，要会算 hf>W。'
      }
    };
    function refreshPhotoGoals() {
      const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
      const mission = document.getElementById('goalMission');
      const side = document.getElementById('sideGoal');
      const badge = document.getElementById('materialBadge');
      if (playMode === 'challenge' && lockedMat) {
        if (mission) mission.textContent = '急单材料：' + lockedMat.name + ' · W=' + lockedMat.W.toFixed(1) + ' eV · 打偏换料';
        if (side) side.textContent = '竞赛急单：对 ' + lockedMat.name + '（W=' + lockedMat.W.toFixed(1) + ' eV）调出光电流。未命中会换新材料。';
        if (badge) { badge.style.display = 'block'; badge.textContent = '当前阴极：' + lockedMat.name + ' · 逸出功 ' + lockedMat.W.toFixed(1) + ' eV（锁定，打偏换料）'; }
        workSlider.disabled = true;
        workSlider.value = String(lockedMat.W);
      } else {
        if (mission) mission.textContent = g.hud;
        if (side) side.textContent = g.side;
        if (badge) badge.style.display = 'none';
        workSlider.disabled = false;
      }
    }
    function rollChallengeMaterial() {
      lockedMat = MATERIALS[Math.floor(Math.random() * MATERIALS.length)];
      workSlider.value = String(lockedMat.W);
      // 打乱频率，避免贴旧解
      freqSlider.value = String((2 + Math.random() * 4).toFixed(1));
    }
    /** RerollChallenge：进入抽材料；失败再换材料/W */
    function lockChallengeMaterial() {
      rollChallengeMaterial();
      challengeWon = false;
      winAchieved = false;
      refreshPhotoGoals();
      updateUI(false, false);
      hintDiv.textContent = '急单已下发：' + lockedMat.name + '（W=' + lockedMat.W.toFixed(1) + ' eV），打偏会换料';
      winBanner.style.display = 'none';
    }
    function rerollChallengeMaterial() {
      rollChallengeMaterial();
      challengeWon = false;
      winAchieved = false;
      refreshPhotoGoals();
      updateUI(false, false);
      hintDiv.textContent = '未命中 · 已换新材料 ' + lockedMat.name + '（W=' + lockedMat.W.toFixed(1) + ' eV）';
      winBanner.style.display = 'none';
    }
    function applyExploreMaterial() {
      lockedMat = null;
      challengeWon = false;
      winAchieved = false;
      workSlider.disabled = false;
      workSlider.value = '2.5';
      freqSlider.value = '5';
      refreshPhotoGoals();
      updateUI(false, false);
      hintDiv.textContent = '自由试光：调 f、W 观察光电流阈值';
      winBanner.style.display = 'none';
    }
    window.__photoApplyMode = function(mode) {
      playMode = mode === 'challenge' ? 'challenge' : 'explore';
      if (playMode === 'challenge') lockChallengeMaterial();
      else applyExploreMaterial();
    };
    document.addEventListener('dual-mode-change', function(ev) {
      var m = ev && ev.detail && ev.detail.mode;
      if (typeof window.__photoApplyMode === 'function') window.__photoApplyMode(m);
    });
    /* """ + MARK6R + """ RerollChallenge */"""
    if old not in t:
        raise SystemExit("photo: state block missing")
    t = t.replace(old, new)

    # Rewrite fire win logic branch
    old_fire = """      if (isFire || emitSnapshot) {
        if (winOk && !winAchieved) {
          winAchieved = true;
          winBanner.style.display = 'block';
          hintDiv.textContent = '🎉 过关！成功观察到光电流。';
          // snapshot + win
          const controls = snapControls();
          emit('snapshot', { controls: controls, winOk: true, hintKey: '过关' });
          emit('win', { winOk: true });
        } else if (winOk && winAchieved) {
          // 重复过关
          hintDiv.textContent = '✅ 已过关，继续探究吧。';
          const controls = snapControls();
          emit('snapshot', { controls: controls, winOk: true, hintKey: '已过关' });
        } else {
          // 未过关
          winBanner.style.display = 'none';
          hintDiv.textContent = hintKey;
          const controls = snapControls();
          emit('snapshot', { controls: controls, winOk: false, hintKey: hintKey });
        }
      } else {"""
    new_fire = """      if (isFire || emitSnapshot) {
        const controls = snapControls();
        if (playMode === 'explore') {
          winBanner.style.display = 'none';
          hintDiv.textContent = currentOk
            ? ('已观察到光电流 ' + I.toFixed(1) + ' μA · 探究对比中')
            : ('探究中：' + hintKey);
          emit('snapshot', { controls: controls, winOk: false, hintKey: 'explore_observe' });
        } else if (winOk && !winAchieved) {
          winAchieved = true;
          challengeWon = true;
          winBanner.style.display = 'block';
          hintDiv.textContent = '🎉 急单完成：' + (lockedMat ? lockedMat.name : '') + ' 已出光电流';
          emit('snapshot', { controls: controls, winOk: true, hintKey: '过关' });
          emit('win', { winOk: true });
          if (typeof window.__craftShowWin === 'function') {
            window.__craftShowWin('换材料后仍能命中：说明你掌握了 hf>W 的阈值条件，而不是背频率。');
          }
        } else if (winOk && winAchieved) {
          hintDiv.textContent = '✅ 已过关，可继续观察。';
          emit('snapshot', { controls: controls, winOk: true, hintKey: '已过关' });
        } else {
          // RerollChallenge：失败换材料/W
          winBanner.style.display = 'none';
          emit('snapshot', { controls: controls, winOk: false, hintKey: hintKey });
          if (isFire) rerollChallengeMaterial();
          else hintDiv.textContent = hintKey;
        }
      } else {"""
    if old_fire not in t:
        raise SystemExit("photo: fire branch missing")
    t = t.replace(old_fire, new_fire)

    # canvas material label if possible
    if "ctx.fillText('光电管'" in t or 'ctx.fillText("光电管"' in t:
        pass
    # add label near tube - soft insert after tube draw if marker exists
    marker = "ctx.fillText('阳极'"
    if marker in t and "急单材料" not in t:
        t = t.replace(
            marker,
            "if (playMode==='challenge' && lockedMat) { ctx.fillStyle='#fde68a'; ctx.font='12px \"Microsoft YaHei\",sans-serif'; ctx.fillText('急单·'+lockedMat.name+' W='+lockedMat.W.toFixed(1)+'eV', tubeX, tubeY - 10); }\n      " + marker,
            1,
        )

    t = hook_dual_mode(t, "__photoApplyMode")
    if MARK6R not in t:
        t = t.replace("</html>", "<!-- " + MARK6R + " RerollChallenge -->\n</html>")
    write(path, t)
    writeback("光电效应.html", "photoelectric")
    print("OK photo Reroll")


def main():
    polish_cap_confound()
    polish_cap_ch2()
    polish_cap_ch4()
    sync_batch5_rest()
    patch_heat()
    patch_gas()
    patch_lens()
    patch_refract()
    patch_photo()
    print("ALL DONE")


if __name__ == "__main__":
    main()
