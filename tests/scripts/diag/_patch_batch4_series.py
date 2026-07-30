# -*- coding: utf-8 -*-
"""Patch series-parallel only (FixedChallenge)."""
from pathlib import Path
import shutil

ROOT = Path(r"c:\Users\20844\Desktop\agent")
YANG = ROOT / "样本html"
PKG = ROOT / "data" / "runtime" / "packages"
MARK = "BATCH4-SCENE-GOALS-20260724"


def write(path: Path, text: str) -> None:
    path.write_text(text.replace("\r\n", "\n").replace("\r", "\n"), encoding="utf-8")


def writeback(yang_name: str, pkg_id: str) -> None:
    src = YANG / yang_name
    dst = PKG / pkg_id / "game.html"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    print("writeback", pkg_id)


def patch_series() -> None:
    path = YANG / "串并联电路.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "FixedChallenge" in t and "__seriesApplyMode" in t:
        print("series already patched")
        writeback("串并联电路.html", "series-parallel")
        return

    t = t.replace(
        """    <h2>串并联电路</h2>
    <p>工作台电源已接通。调节两只电阻并切换串/并联，使电流表落到目标电流。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>夜市灯箱 · 急修台</h2>
    <p>街边灯箱保险丝又跳了：先自由换串/并联、拧两只电阻，看电流怎么变；再接限次急单——本局目标电流锁定，对准才算修好。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标电流本局固定，未对准只扣次数。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">电路装配工位</div>
      <div class="essence-sub">把电流调到目标值</div>""",
        """      <div class="essence-title">夜市灯箱 · 急修台</div>
      <div class="essence-sub" id="goalMission">自由试接，对比串/并联电流差异</div>""",
    )
    if 'id="sideGoal"' not in t:
        old_side = """    <div class="essence-scroll">
      <div class="app">
    
    

    <!-- canvas 示意电路 (极简) -->
    <!-- 调节控件 -->
    <div class="control-grid">"""
        new_side = """    <div class="essence-scroll">
      <div class="app">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试接：自由切换串/并联并调电阻，观察电流变化；不必死盯单一目标。</p>
    <div class="control-grid">"""
        if old_side not in t:
            raise SystemExit("series: sideGoal insert site not found")
        t = t.replace(old_side, new_side)

    old = """        const U_SOURCE = 12;        // 固定电源电压 12V
        let mode = 'series';        // 'series' 或 'parallel'
        let targetCurrent = 0.15;   // 目标电流 0.15A (固定)"""
    new = """        const U_SOURCE = 12;        // 固定电源电压 12V
        let mode = 'series';        // 'series' 或 'parallel'
        let targetCurrent = 0.12;   // 探究参考目标
        let playMode = 'explore';
        let lockedTargetI = null; // FixedChallenge
        let exploreTests = 0;
        let exploreWon = false;
        let challengeWon = false;
        const EXPLORE_TOL = 0.02;
        const CHALLENGE_TOL = 0.001;

        const MODE_GOALS = {
          explore: {
            hud: '目标：自由试接≥3次，对比串/并联下电流如何变化',
            side: '探究·试接：切换串/并联、拧电阻，看电流升降；参考目标只作对照。'
          },
          challenge: {
            hud: '目标：限次把电流对准本局锁定值（打偏不换题）',
            side: '竞赛·灯箱急修：进入时锁定目标电流；未对准只扣次数——用串并联规律算出该怎么接。'
          }
        };
        function refreshSeriesGoals() {
          const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
          const mission = document.getElementById('goalMission');
          const side = document.getElementById('sideGoal');
          if (playMode === 'challenge' && lockedTargetI != null) {
            if (mission) mission.textContent = '急单电流：' + lockedTargetI.toFixed(2) + ' A · 本局固定';
            if (side) side.textContent = '竞赛急单：把电流对准 ' + lockedTargetI.toFixed(2) + ' A。目标已锁定，打偏不换题。';
          } else {
            if (mission) mission.textContent = g.hud;
            if (side) side.textContent = g.side;
          }
          if (obsTarget) obsTarget.textContent = targetCurrent.toFixed(2);
        }
        /** FixedChallenge：仅进入竞赛时锁定一次目标电流 */
        function lockChallengeCurrent() {
          const candidates = [0.18, 0.20, 0.24, 0.30, 0.36, 0.40, 0.48];
          lockedTargetI = candidates[Math.floor(Math.random() * candidates.length)];
          targetCurrent = lockedTargetI;
          sR1.value = '70';
          sR2.value = '70';
          mode = 'series';
          btnConnect.dataset.mode = 'series';
          btnConnect.textContent = '🔁 切换连接 (串联)';
          connectStatus.textContent = '串联';
          challengeWon = false;
          refreshSeriesGoals();
          setTimeout(function(){ if (typeof updateAll === 'function') updateAll(); }, 0);
          feedback.className = 'feedback info';
          feedback.textContent = '急单已锁定目标 ' + targetCurrent.toFixed(2) + ' A（本局不变）';
        }
        function applyExploreCurrent() {
          lockedTargetI = null;
          targetCurrent = 0.12;
          exploreTests = 0;
          exploreWon = false;
          sR1.value = '50';
          sR2.value = '50';
          mode = 'series';
          btnConnect.dataset.mode = 'series';
          btnConnect.textContent = '🔁 切换连接 (串联)';
          connectStatus.textContent = '串联';
          refreshSeriesGoals();
          setTimeout(function(){ if (typeof updateAll === 'function') updateAll(); }, 0);
          feedback.className = 'feedback info';
          feedback.textContent = '自由试接：切换串/并联，观察电流';
        }
        window.__seriesApplyMode = function(m) {
          playMode = m === 'challenge' ? 'challenge' : 'explore';
          if (playMode === 'challenge') lockChallengeCurrent();
          else applyExploreCurrent();
        };
        document.addEventListener('dual-mode-change', function(ev) {
          var m = ev && ev.detail && ev.detail.mode;
          if (typeof window.__seriesApplyMode === 'function') window.__seriesApplyMode(m);
        });
        /* """ + MARK + """ FixedChallenge */"""
    if old not in t:
        raise SystemExit("series: state block not found")
    t = t.replace(old, new)

    old_test = """            const winOk = (Math.abs(I - targetCurrent) < 0.001); // 容差0.001A
            const hintKey = winOk ? 'win' : (I > targetCurrent ? '电流偏大，增大电阻' : '电流偏小，减小电阻');

            // 更新反馈
            if (winOk) {
                feedback.className = 'feedback win';
                feedback.textContent = '过关！电流已对准目标 ' + targetCurrent.toFixed(2) + 'A';
                if (typeof window.__craftShowWin === 'function') {
                    window.__craftShowWin('串联电阻相加、并联电阻“更小”，同一电源下总电流随之变化。');
                }
            } else {
                feedback.className = 'feedback fail';
                feedback.textContent = '未对准：当前 ' + I.toFixed(3) + 'A，继续调节电阻或切换连接。';
            }"""
    new_test = """            const tol = playMode === 'challenge' ? CHALLENGE_TOL : EXPLORE_TOL;
            const onTarget = Math.abs(I - targetCurrent) < tol;
            let winOk = false;
            if (playMode === 'explore') {
                exploreTests += 1;
                if (onTarget) exploreWon = true;
                winOk = exploreWon && exploreTests >= 3;
            } else {
                // FixedChallenge：失败不换目标
                winOk = onTarget;
            }
            const hintKey = winOk ? 'win' : (I > targetCurrent ? '电流偏大，增大电阻' : '电流偏小，减小电阻');

            // 更新反馈
            if (winOk) {
                feedback.className = 'feedback win';
                feedback.textContent = playMode === 'challenge'
                  ? ('过关！电流已对准急单 ' + targetCurrent.toFixed(2) + 'A（本局锁定）')
                  : ('试接完成：已对比串/并联电流（' + exploreTests + ' 次）');
                if (typeof window.__craftShowWin === 'function') {
                    window.__craftShowWin('串联电阻相加、并联电阻“更小”，同一电源下总电流随之变化。');
                }
                if (playMode === 'challenge') challengeWon = true;
            } else {
                feedback.className = 'feedback fail';
                feedback.textContent = playMode === 'challenge'
                  ? ('未对准：当前 ' + I.toFixed(3) + 'A，急单仍为 ' + targetCurrent.toFixed(2) + 'A（本局不换）')
                  : ('对照中：当前 ' + I.toFixed(3) + 'A（已测 ' + exploreTests + '/3），继续切换串/并联对比');
            }"""
    if old_test not in t:
        raise SystemExit("series: winOk block not found")
    t = t.replace(old_test, new_test)

    needle = """    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;"""
    if "/* === dual-mode-shell" in t and "window.__seriesApplyMode" not in t.split("/* === dual-mode-shell")[-1]:
        repl = """    setPhase(state.mode);
    gateActions();
    try {
      if (typeof window.__seriesApplyMode === 'function') window.__seriesApplyMode(state.mode);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('dual-mode-change', { detail: { mode: state.mode, attempts: state.attempts } }));
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;"""
        if needle not in t:
            raise SystemExit("series: dual-mode hook not found")
        t = t.replace(needle, repl, 1)

    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    write(path, t)
    writeback("串并联电路.html", "series-parallel")
    print("OK series")


if __name__ == "__main__":
    patch_series()
