# -*- coding: utf-8 -*-
"""Batch5 FixedChallenge for magnetic-force + transformer-turns. RC already done."""
from pathlib import Path
import shutil

ROOT = Path(r"c:\Users\20844\Desktop\agent")
YANG = ROOT / "样本html"
PKG = ROOT / "data" / "runtime" / "packages"
MARK = "BATCH5-FIXED-20260724"


def write(path: Path, text: str) -> None:
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8")


def writeback(yang: str, pkg_id: str) -> None:
    shutil.copyfile(YANG / yang, PKG / pkg_id / "game.html")
    print("writeback", pkg_id)


def hook_dual_mode(t: str, apply_fn: str) -> str:
    needle = """    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;"""
    if apply_fn in t.split("/* === dual-mode-shell runtime")[-1]:
        return t
    repl = f"""    setPhase(state.mode);
    gateActions();
    try {{
      if (typeof window.{apply_fn} === 'function') window.{apply_fn}(state.mode);
    }} catch (e) {{}}
    document.dispatchEvent(new CustomEvent('dual-mode-change', {{ detail: {{ mode: state.mode, attempts: state.attempts }} }}));
  }}

  function onPrimaryClick(e){{
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;"""
    if needle not in t:
        raise SystemExit(f"dual-mode hook missing for {apply_fn}")
    return t.replace(needle, repl, 1)


def patch_magnetic() -> None:
    path = YANG / "安培力.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "__magApplyMode" in t and "FixedChallenge" in t:
        print("magnetic already")
        writeback("安培力.html", "magnetic-force")
        return

    t = t.replace(
        """    <h2>安培力</h2>
    <p>磁轨上的载流导线偏离目标托力。调节电流与磁场，使安培力落进目标带。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>电磁吊运 · 磁轨货厢</h2>
    <p>夜班仓库磁轨吊运偏了：先自由拧电流与磁场，看导线托力怎么变；再接限次急单——本局目标托力锁定，偏了不换单。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标力本局固定，未命中只扣次数。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">磁轨受力台</div>
      <div class="essence-sub">导线长度固定 0.8 m · 把受力调进目标</div>""",
        """      <div class="essence-title">电磁吊运 · 磁轨货厢</div>
      <div class="essence-sub" id="goalMission">探究：自由调 I、B，观察托力变化</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <div class="card">
  
  

  <!-- canvas 区域 -->
  <!-- 调节变量 -->
  <div class="slider-group">""",
            """    <div class="essence-scroll">
      <div class="card">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试吊：自由调电流与磁场，看托力升降；不必死盯固定目标力。</p>
  <div class="slider-group">""",
        )

    old = """  // 目标安培力 (过关条件) : 取一个合理目标，例如 I=3.0A, B=1.5T → F=3.0*1.5*0.8=3.6N
  // 但为了可调范围内存在解，设定目标 F_target = 2.4 N (例如 I=2.0, B=1.5 或 I=3.0, B=1.0)
  const F_TARGET = 2.4; // N
  const TOLERANCE = 0.15; // N"""
    new = """  // 目标安培力：探究观察；竞赛 FixedChallenge 进入时锁定一次
  let F_TARGET = 2.4; // N
  const TOLERANCE = 0.15; // N
  let playMode = 'explore';
  let lockedF = null;
  let challengeWon = false;

  const MODE_GOALS = {
    explore: {
      hud: '探究：自由试吊≥3次，观察托力如何随 I、B 变化',
      side: '探究·试吊：自由改电流与磁场，看导线托力；不必死盯固定目标力。'
    },
    challenge: {
      hud: '竞赛：限次把托力打进本局锁定目标（打偏不换单）',
      side: '竞赛·吊运急单：进入时锁定目标托力；打偏只扣次数——用 F=BIL 算打法。'
    }
  };
  function refreshMagGoals() {
    const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
    const mission = document.getElementById('goalMission');
    const side = document.getElementById('sideGoal');
    if (playMode === 'challenge' && lockedF != null) {
      if (mission) mission.textContent = '急单托力：' + lockedF.toFixed(1) + ' N · 本局固定';
      if (side) side.textContent = '竞赛急单：把托力调到约 ' + lockedF.toFixed(1) + ' N。目标已锁定，打偏不换单。';
    } else {
      if (mission) mission.textContent = g.hud;
      if (side) side.textContent = g.side;
    }
  }
  /** FixedChallenge：仅进入竞赛时锁定一次目标力 */
  function lockChallengeF() {
    // 可达：I∈[0,5], B∈[0,2], L=0.8 → F∈[0,8]
    const candidates = [1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0];
    lockedF = candidates[Math.floor(Math.random() * candidates.length)];
    F_TARGET = lockedF;
    challengeWon = false;
    sCurrent.value = '1.0';
    sMagnetic.value = '0.5';
    refreshMagGoals();
    updateAll();
    feedback.textContent = '急单已锁定托力 ' + F_TARGET.toFixed(1) + ' N（本局不变）';
    winIndicator.style.display = 'none';
  }
  function applyExploreF() {
    lockedF = null;
    F_TARGET = 2.4;
    challengeWon = false;
    sCurrent.value = '2.0';
    sMagnetic.value = '1.0';
    refreshMagGoals();
    updateAll();
    feedback.textContent = '自由试吊：调 I、B 观察托力';
    winIndicator.style.display = 'none';
  }
  window.__magApplyMode = function(mode) {
    playMode = mode === 'challenge' ? 'challenge' : 'explore';
    if (playMode === 'challenge') lockChallengeF();
    else applyExploreF();
  };
  document.addEventListener('dual-mode-change', function(ev) {
    var m = ev && ev.detail && ev.detail.mode;
    if (typeof window.__magApplyMode === 'function') window.__magApplyMode(m);
  });
  /* """ + MARK + """ FixedChallenge */"""
    if old not in t:
        raise SystemExit("magnetic: F_TARGET block missing")
    t = t.replace(old, new)

    # Scene label
    t = t.replace("ctx.fillText('匀强磁场区', W * 0.14, 70);", "ctx.fillText('磁轨吊运区', W * 0.14, 70);")
    t = t.replace(
        "ctx.fillText('目标 F ≈ ' + F_TARGET.toFixed(1) + ' N (±' + TOLERANCE + ')', 26, H - 42);",
        "ctx.fillText((playMode==='challenge'?'急单':'参考') + ' F ≈ ' + F_TARGET.toFixed(1) + ' N (±' + TOLERANCE + ')', 26, H - 42);",
    )

    # updateAll explore vs challenge hint
    t = t.replace(
        """    const onBand = Math.abs(F - F_TARGET) <= TOLERANCE;
    feedback.textContent = onBand
      ? '受力已接近目标，点击测试确认。'
      : (F < F_TARGET ? '受力偏小，尚未进入目标带。' : '受力偏大，尚未进入目标带。');
  }""",
        """    const onBand = Math.abs(F - F_TARGET) <= TOLERANCE;
    if (playMode === 'explore') {
      feedback.textContent = '当前托力 ' + F.toFixed(2) + ' N · 继续对比 I、B（探究不要求固定目标）';
    } else {
      feedback.textContent = onBand
        ? '托力已接近急单，点击测试确认。'
        : (F < F_TARGET ? '托力偏小 · 急单仍锁定 ' + F_TARGET.toFixed(1) + ' N' : '托力偏大 · 急单仍锁定 ' + F_TARGET.toFixed(1) + ' N');
    }
  }""",
    )

    old_test = """    } else if (Math.abs(F - F_TARGET) <= TOLERANCE) {
      winOk = true;
      hintKey = '过关！安培力达标';
      feedback.textContent = '过关！受力已落入目标带。';
      winIndicator.style.display = 'inline-block';
      if (typeof window.__craftShowWin === 'function') {
        window.__craftShowWin('安培力随电流与磁感应强度同向增大；导线长度固定时，F 与 B、I 成正比。');
      }
    } else {
      hintKey = 'force_off_target';
      feedback.textContent = '未达标：当前 ' + F.toFixed(2) + ' N，目标约 ' + F_TARGET.toFixed(1) + ' N。';
      winIndicator.style.display = 'none';
    }"""
    new_test = """    } else if (playMode === 'explore') {
      hintKey = 'explore_observe';
      feedback.textContent = '当前托力 ' + F.toFixed(2) + ' N（' + (modeLabel := '') + '探究对比中）'.replace(modeLabel,'');
      feedback.textContent = '当前托力 ' + F.toFixed(2) + ' N · 探究对比中';
      winIndicator.style.display = 'none';
    } else if (Math.abs(F - F_TARGET) <= TOLERANCE) {
      winOk = true;
      hintKey = '过关！安培力达标';
      feedback.textContent = '急单完成！托力落入锁定目标 ' + F_TARGET.toFixed(1) + ' N';
      winIndicator.style.display = 'inline-block';
      if (!challengeWon && typeof window.__craftShowWin === 'function') {
        challengeWon = true;
        window.__craftShowWin('急单托力本局锁定。导线长度固定时，F 与 B、I 成正比。');
      }
    } else {
      // FixedChallenge：失败不换目标
      hintKey = 'force_off_target';
      feedback.textContent = '未达标：当前 ' + F.toFixed(2) + ' N，急单仍锁定 ' + F_TARGET.toFixed(1) + ' N';
      winIndicator.style.display = 'none';
    }"""
    # Fix the ugly explore branch - rewrite cleaner
    new_test = """    } else if (playMode === 'explore') {
      hintKey = 'explore_observe';
      feedback.textContent = '当前托力 ' + F.toFixed(2) + ' N · 探究对比中';
      winIndicator.style.display = 'none';
    } else if (Math.abs(F - F_TARGET) <= TOLERANCE) {
      winOk = true;
      hintKey = '过关！安培力达标';
      feedback.textContent = '急单完成！托力落入锁定目标 ' + F_TARGET.toFixed(1) + ' N';
      winIndicator.style.display = 'inline-block';
      if (!challengeWon && typeof window.__craftShowWin === 'function') {
        challengeWon = true;
        window.__craftShowWin('急单托力本局锁定。导线长度固定时，F 与 B、I 成正比。');
      }
    } else {
      // FixedChallenge：失败不换目标
      hintKey = 'force_off_target';
      feedback.textContent = '未达标：当前 ' + F.toFixed(2) + ' N，急单仍锁定 ' + F_TARGET.toFixed(1) + ' N';
      winIndicator.style.display = 'none';
    }"""
    if old_test not in t:
        raise SystemExit("magnetic: onTest block missing")
    t = t.replace(old_test, new_test)

    t = hook_dual_mode(t, "__magApplyMode")
    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    write(path, t)
    writeback("安培力.html", "magnetic-force")
    print("OK magnetic")


def patch_transformer() -> None:
    path = YANG / "变压器.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "__xfmrApplyMode" in t and "FixedChallenge" in t:
        print("transformer already")
        writeback("变压器.html", "transformer-turns")
        return

    t = t.replace(
        """    <h2>变压器匝比</h2>
    <p>配电柜副边电压偏离目标。调节匝数与输入电压，把 U₂ 调进目标区间。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>营地供电 · 变压器柜</h2>
    <p>露营营地副边电压飘了：先自由拧匝数与输入，看 U₂ 怎么变；再接限次急单——本局目标电压带锁定，偏了不换带。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标电压带本局固定，未命中只扣次数。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">配电变压器台</div>
      <div class="essence-sub">把副边电压调进目标区间</div>""",
        """      <div class="essence-title">营地供电 · 变压器柜</div>
      <div class="essence-sub" id="goalMission">探究：自由调匝比与 U₁，观察 U₂</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <div class="card">
  
  

  <!-- canvas 展示变压器示意 + 读数 -->
  <!-- 调节变量：三个滑条，id 严格匹配 -->
  <div class="control-grid">""",
            """    <div class="essence-scroll">
      <div class="card">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试供电：自由改匝数与输入电压，看副边输出；不必死盯固定区间。</p>
  <div class="control-grid">""",
        )

    old = """  const wrap = canvas.parentElement;
  let W = 600, H = 360, dpr = 1, spark = 0;
  const U2_LO = 8.0, U2_HI = 12.0;"""
    new = """  const wrap = canvas.parentElement;
  let W = 600, H = 360, dpr = 1, spark = 0;
  let U2_LO = 8.0, U2_HI = 12.0;
  let playMode = 'explore';
  let lockedBand = null;
  let challengeWon = false;
  const targetU2Display = document.getElementById('targetU2Display');

  const MODE_GOALS = {
    explore: {
      hud: '探究：自由试供电，观察 U₂ 如何随匝比、U₁ 变化',
      side: '探究·试供电：自由改匝数与输入，看副边电压；宽区间仅作参考。'
    },
    challenge: {
      hud: '竞赛：限次把 U₂ 打进本局锁定区间（打偏不换带）',
      side: '竞赛·营地急单：进入时锁定目标电压带；打偏只扣次数——用匝比关系算打法。'
    }
  };
  function syncTargetUI() {
    if (targetU2Display) targetU2Display.textContent = U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V';
    const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
    const mission = document.getElementById('goalMission');
    const side = document.getElementById('sideGoal');
    if (playMode === 'challenge' && lockedBand) {
      if (mission) mission.textContent = '急单电压带：' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V · 本局固定';
      if (side) side.textContent = '竞赛急单：把 U₂ 调进 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V。区间已锁定，打偏不换带。';
    } else {
      if (mission) mission.textContent = g.hud;
      if (side) side.textContent = g.side;
    }
  }
  /** FixedChallenge：仅进入竞赛时锁定一次电压带 */
  function lockChallengeBand() {
    const mid = 6 + Math.random() * 8; // 6–14
    const half = 1.2 + Math.random() * 1.0;
    U2_LO = Math.round((mid - half) * 10) / 10;
    U2_HI = Math.round((mid + half) * 10) / 10;
    lockedBand = { lo: U2_LO, hi: U2_HI };
    challengeWon = false;
    sN1.value = '800';
    sN2.value = '200';
    sU1.value = '5';
    syncTargetUI();
    updateAll();
    feedback.textContent = '急单已锁定电压带（本局不变）';
  }
  function applyExploreBand() {
    lockedBand = null;
    U2_LO = 8.0; U2_HI = 12.0;
    challengeWon = false;
    sN1.value = '500';
    sN2.value = '500';
    sU1.value = '5';
    syncTargetUI();
    updateAll();
    feedback.textContent = '自由试供电：调匝比与输入，观察 U₂';
  }
  window.__xfmrApplyMode = function(mode) {
    playMode = mode === 'challenge' ? 'challenge' : 'explore';
    if (playMode === 'challenge') lockChallengeBand();
    else applyExploreBand();
  };
  document.addEventListener('dual-mode-change', function(ev) {
    var m = ev && ev.detail && ev.detail.mode;
    if (typeof window.__xfmrApplyMode === 'function') window.__xfmrApplyMode(m);
  });
  /* """ + MARK + """ FixedChallenge */"""
    if old not in t:
        raise SystemExit("xfmr: U2 band block missing")
    t = t.replace(old, new)

    # Need updateAll function name - check
    if "function updateAll" not in t and "function updateUI" in t:
        t = t.replace("updateAll();", "updateUI();")
    elif "function update()" in t and "function updateAll" not in t:
        # find actual refresh function
        pass

    # Find the function that refreshes after slider - likely update() or similar
    # Grep showed computeU2 and draw - look for function that calls drawTransformer
    import re
    m = re.search(r"function (update\w*)\s*\(", t)
    # Also check for refresh
    funcs = re.findall(r"function (\w+)\s*\(", t[t.find("computeU2"):t.find("computeU2")+2500])
    print("xfmr funcs near compute:", funcs[:12])

    # Patch win logic
    old_win = """    const winOk = U2rounded >= U2_LO && U2rounded <= U2_HI;
    const hintKey = winOk ? 'win' : (U2rounded < U2_LO ? 'u2_low' : 'u2_high');

    if (winOk) {
      feedback.textContent = '输出电压已落入目标区间。';"""
    # read actual
    idx = t.find("const winOk = U2rounded")
    if idx < 0:
        raise SystemExit("xfmr winOk not found")
    print("WIN SNIP:", repr(t[idx:idx+450]))

    t = hook_dual_mode(t, "__xfmrApplyMode")
    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    write(path, t)
    # Don't writeback yet if incomplete - continue in second pass
    print("partial xfmr written for inspection")


if __name__ == "__main__":
    # sync RC
    writeback("RC电路.html", "rc-circuit")
    patch_magnetic()
    patch_transformer()
