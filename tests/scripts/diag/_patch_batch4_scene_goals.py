# -*- coding: utf-8 -*-
"""Batch 4: scene fun + Fixed/Reroll competition goals.
cyclotron Fixed; capacitor-confound Reroll; series-parallel Fixed.
"""
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


# ─── 1) Cyclotron Fixed ───────────────────────────────────────────

def patch_cyclotron() -> None:
    path = YANG / "回旋加速器.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "FixedChallenge" in t and "__cycloApplyMode" in t:
        print("cyclotron already patched")
        writeback("回旋加速器.html", "cyclotron-radius")
        return

    # Intro + scene titles
    t = t.replace(
        """    <h2>回旋加速器 · 轨道半径</h2>
    <p>粒子轨道偏离了绿色目标环带。调节 B 与入射速度，试着把半径调进目标范围。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>地下粒子秀 · 回旋快车</h2>
    <p>夜场粒子马戏开演：先自由调磁场与入射速度，看轨道怎么胀缩；再接限次急单——本局目标环带锁定，偏了不换环。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后目标环带本局固定，未命中只扣次数。</p>""",
    )
    t = t.replace(
        """        <span>⚡ 回旋加速器</span>
        <i>调节参数后点击发射/测试</i>""",
        """        <span>⚡ 地下粒子秀</span>
        <i id="goalMission">目标：自由发射，观察轨道半径如何随 B、v 变化</i>""",
    )
    # Side goal + modeSelect in controls
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """        <div id="controlsPanel">
            <!-- 调节变量：磁感应强度 -->""",
            """        <div id="controlsPanel">
            <div class="dual-bench-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
              <strong style="font-size:13px;color:#1f2a44">马戏控制台</strong>
              <select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select>
            </div>
            <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#64748b">探究·试车：自由调 B 与 v，观察轨道胀缩；不必死盯窄环带。</p>
            <!-- 调节变量：磁感应强度 -->""",
        )
    t = t.replace(
        """                <button class="btn btn-primary" id="btn-fire">🚀 发射</button>""",
        """                <button class="btn btn-primary" id="btn-fire">🚀 发车</button>""",
    )
    t = t.replace(
        """                <p style="font-size:0.9rem; color:#1f4a3a;">r = <span id="winRadius"></span> m (目标 2.0~3.5 m)</p>""",
        """                <p style="font-size:0.9rem; color:#1f4a3a;">r = <span id="winRadius"></span> m · <span id="winTargetBand">目标环带</span></p>""",
    )

    # Replace physics constants / target block with FixedChallenge logic
    old_phys = """    // 目标半径范围 (winCondition)
    const TARGET_R_MIN = 2.0;
    const TARGET_R_MAX = 3.5;

    // 是否已经过关 (防止重复触发)
    let hasWon = false;"""
    new_phys = """    // 目标半径范围（探究宽环 / 竞赛锁定窄环）
    let TARGET_R_MIN = 1.5;
    let TARGET_R_MAX = 4.0;
    let playMode = 'explore';
    let lockedBand = null; // FixedChallenge：进竞赛锁定一次
    let challengeWon = false;
    let exploreFires = 0;
    let exploreWon = false;

    // 是否已经过关 (防止重复触发)
    let hasWon = false;

    const MODE_GOALS = {
      explore: {
        hud: '目标：自由发车≥3次，观察半径如何随 B、v 变化（宽环带仅作参考）',
        side: '探究·试车：自由调磁场与入射速度，看轨道胀缩；宽环带只是参考，不必死磕。',
        hint: '自由试车：对比不同 B、v 的轨道'
      },
      challenge: {
        hud: '目标：限次把轨道打进本局锁定环带（偏了不换环）',
        side: '竞赛·夜场急单：进入时锁定目标环带；偏了只扣次数——用 r∝v/B 算出该怎么调。',
        hint: '急单：环带已锁定，限次命中'
      }
    };
    function refreshCycloGoals() {
      const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
      const mission = document.getElementById('goalMission');
      const side = document.getElementById('sideGoal');
      if (playMode === 'challenge' && lockedBand) {
        if (mission) mission.textContent = '急单环带：' + lockedBand.min.toFixed(1) + '–' + lockedBand.max.toFixed(1) + ' m · 本局固定';
        if (side) side.textContent = '竞赛急单：把轨道半径打进 ' + lockedBand.min.toFixed(1) + '–' + lockedBand.max.toFixed(1) + ' m。环带已锁定，偏了不换环。';
      } else {
        if (mission) mission.textContent = g.hud;
        if (side) side.textContent = g.side;
      }
      const winBand = document.getElementById('winTargetBand');
      if (winBand) winBand.textContent = '目标 ' + TARGET_R_MIN.toFixed(1) + '–' + TARGET_R_MAX.toFixed(1) + ' m';
    }
    /** FixedChallenge：仅进入竞赛时锁定一次窄环带 */
    function lockChallengeBand() {
      const mid = 2.2 + Math.random() * 1.1; // 2.2–3.3
      const half = 0.28 + Math.random() * 0.12;
      lockedBand = { min: Math.max(1.2, mid - half), max: Math.min(4.2, mid + half) };
      TARGET_R_MIN = lockedBand.min;
      TARGET_R_MAX = lockedBand.max;
      // 开局张力：默认参数往往偏出窄环
      sMag.value = '1.6';
      sVel.value = '3.0';
      challengeWon = false;
      hasWon = false;
      stopSim();
      angle = 0;
      recalcPhysics();
      syncUI();
      drawStatic();
      refreshCycloGoals();
      feedbackMsg.innerHTML = '急单已锁定环带（本局不变）';
      winOverlay.classList.remove('show');
    }
    function applyExploreBand() {
      lockedBand = null;
      challengeWon = false;
      exploreFires = 0;
      exploreWon = false;
      TARGET_R_MIN = 1.5;
      TARGET_R_MAX = 4.0;
      sMag.value = '1.0';
      sVel.value = '5.0';
      stopSim();
      angle = 0;
      recalcPhysics();
      syncUI();
      drawStatic();
      refreshCycloGoals();
      feedbackMsg.innerHTML = '自由试车：调参后发车，观察轨道';
      winOverlay.classList.remove('show');
    }
    window.__cycloApplyMode = function(mode) {
      playMode = mode === 'challenge' ? 'challenge' : 'explore';
      if (playMode === 'challenge') lockChallengeBand();
      else applyExploreBand();
    };
    document.addEventListener('dual-mode-change', function(ev) {
      var m = ev && ev.detail && ev.detail.mode;
      if (typeof window.__cycloApplyMode === 'function') window.__cycloApplyMode(m);
    });
    /* """ + MARK + """ */"""
    if old_phys not in t:
        raise SystemExit("cyclotron: phys block not found")
    t = t.replace(old_phys, new_phys)

    # Draw labels use dynamic band + scene title
    t = t.replace(
        """        ctx.fillText('目标环带 ' + TARGET_R_MIN + '–' + TARGET_R_MAX + ' m', 16, 56);
        ctx.fillStyle = '#93c5fd';
        ctx.fillText('回旋加速器 · 真空室', 16, 36);""",
        """        ctx.fillText((playMode === 'challenge' ? '急单环带 ' : '参考环带 ') + TARGET_R_MIN.toFixed(1) + '–' + TARGET_R_MAX.toFixed(1) + ' m', 16, 56);
        ctx.fillStyle = '#93c5fd';
        ctx.fillText('地下粒子秀 · 回旋快车', 16, 36);""",
    )

    # fire() logic: explore vs challenge Fixed
    old_fire = """    function fire() {
        // 停止当前动画
        stopSim();
        // 重置角度
        angle = 0;
        recalcPhysics();
        syncUI();
        // 检查过关条件
        const r = radius;
        const winOk = (r >= TARGET_R_MIN && r <= TARGET_R_MAX);
        const hintKey = winOk ? 'win' : 'retry';

        // 显示反馈
        if (winOk) {
            feedbackMsg.innerHTML = `<span class="win">✅ 轨道半径 ${r.toFixed(2)} m，在目标范围 [${TARGET_R_MIN}, ${TARGET_R_MAX}] 内！过关！</span>`;
            // 过关UI
            winRadiusSpan.textContent = r.toFixed(2);
            winOverlay.classList.add('show');
            // 埋点 snapshot + win
            const controlsSnapshot = {
                's-magnetic': parseFloat(sMag.value),
                's-velocity': parseFloat(sVel.value)
            };
            emit('snapshot', { controls: controlsSnapshot, winOk: true, hintKey: 'win' });
            emit('win', { winOk: true });
            hasWon = true;
        } else {
            feedbackMsg.innerHTML = `<span class="fail">❌ 半径 ${r.toFixed(2)} m，目标范围 [${TARGET_R_MIN}, ${TARGET_R_MAX}]。请调节参数后重试。</span>`;
            winOverlay.classList.remove('show');
            emit('snapshot', { controls: { 's-magnetic': parseFloat(sMag.value), 's-velocity': parseFloat(sVel.value) }, winOk: false, hintKey: 'retry' });
        }

        // 启动连续动画 (显示运动)
        startSim();
    }"""
    new_fire = """    function fire() {
        stopSim();
        angle = 0;
        recalcPhysics();
        syncUI();
        const r = radius;
        const inBand = (r >= TARGET_R_MIN && r <= TARGET_R_MAX);
        const controlsSnapshot = {
            's-magnetic': parseFloat(sMag.value),
            's-velocity': parseFloat(sVel.value)
        };
        if (playMode === 'explore') {
            exploreFires += 1;
            // 探究：发车≥3次且至少一次落入宽环带即可过关（归纳规律）
            if (inBand) exploreWon = true;
            const winOk = exploreWon && exploreFires >= 3;
            if (winOk && !hasWon) {
                feedbackMsg.innerHTML = '<span class="win">✅ 已完成试车对比（' + exploreFires + ' 次）。轨道规律摸清！</span>';
                winRadiusSpan.textContent = r.toFixed(2);
                winOverlay.classList.add('show');
                emit('snapshot', { controls: controlsSnapshot, winOk: true, hintKey: 'win' });
                emit('win', { winOk: true });
                hasWon = true;
                if (typeof window.__craftShowWin === 'function') {
                  window.__craftShowWin('轨道半径随速度增大、随磁场增强而减小——r = mv/(qB)。');
                }
            } else {
                feedbackMsg.innerHTML = inBand
                  ? ('<span class="win">半径 ' + r.toFixed(2) + ' m 在参考环带内。再换参数对比（已发 ' + exploreFires + '/3）</span>')
                  : ('<span class="fail">半径 ' + r.toFixed(2) + ' m。继续调 B、v 观察胀缩（已发 ' + exploreFires + '/3）</span>');
                winOverlay.classList.remove('show');
                emit('snapshot', { controls: controlsSnapshot, winOk: false, hintKey: 'explore' });
            }
        } else {
            // FixedChallenge：失败不换环带
            if (inBand) {
                feedbackMsg.innerHTML = '<span class="win">✅ 半径 ' + r.toFixed(2) + ' m，命中急单环带 [' + TARGET_R_MIN.toFixed(1) + ', ' + TARGET_R_MAX.toFixed(1) + ']！</span>';
                winRadiusSpan.textContent = r.toFixed(2);
                winOverlay.classList.add('show');
                emit('snapshot', { controls: controlsSnapshot, winOk: true, hintKey: 'win' });
                emit('win', { winOk: true });
                hasWon = true;
                challengeWon = true;
                if (typeof window.__craftShowWin === 'function') {
                  window.__craftShowWin('急单环带锁定下，你用 r∝v/B 把轨道调进了目标带。');
                }
            } else {
                feedbackMsg.innerHTML = '<span class="fail">❌ 半径 ' + r.toFixed(2) + ' m，急单环带仍为 [' + TARGET_R_MIN.toFixed(1) + ', ' + TARGET_R_MAX.toFixed(1) + ']（本局不换）。</span>';
                winOverlay.classList.remove('show');
                emit('snapshot', { controls: controlsSnapshot, winOk: false, hintKey: 'retry' });
            }
        }
        startSim();
    }"""
    if old_fire not in t:
        raise SystemExit("cyclotron: fire() not found")
    t = t.replace(old_fire, new_fire)

    # Patch dual-mode shell applyMode + ensureUi for cyclotron layout
    old_apply = """    if (state.mode === 'challenge') {
      stopTimer();
      state.attempts = MAX_ATTEMPTS;
      renderAttempts();
    } else {
      startExploreTimer();
    }
    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;
    if (state.attempts <= 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    state.attempts -= 1;
    renderAttempts();
    gateActions();
  }

  function ensureUi(){
    var stage = $('essence-stage') || document.querySelector('#proj-stage, #stage, #canvasContainer, .canvas-wrap')?.parentElement;
    var bench = $('essence-bench');
    if (!stage) return false;"""
    new_apply = """    if (state.mode === 'challenge') {
      stopTimer();
      state.attempts = MAX_ATTEMPTS;
      renderAttempts();
    } else {
      startExploreTimer();
    }
    setPhase(state.mode);
    gateActions();
    try {
      if (typeof window.__cycloApplyMode === 'function') window.__cycloApplyMode(state.mode);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('dual-mode-change', { detail: { mode: state.mode, attempts: state.attempts } }));
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;
    if (state.attempts <= 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    state.attempts -= 1;
    renderAttempts();
    gateActions();
  }

  function ensureUi(){
    var stage = $('essence-stage') || $('simCanvasArea') || document.querySelector('#proj-stage, #stage, #canvasContainer, .canvas-wrap, #simCanvasArea');
    var bench = $('essence-bench') || $('controlsPanel');
    if (!stage) return false;"""
    if old_apply not in t:
        raise SystemExit("cyclotron: dual-mode apply not found")
    t = t.replace(old_apply, new_apply)

    # primaryButtons include btn-fire
    t = t.replace(
        """  function primaryButtons(){
    return Array.prototype.slice.call(document.querySelectorAll(
      '#essence-bench .essence-ft button, #essence-bench button.btn, #essence-bench button[id^="btn"]'
    ));
  }""",
        """  function primaryButtons(){
    return Array.prototype.slice.call(document.querySelectorAll(
      '#essence-bench .essence-ft button, #essence-bench button.btn, #essence-bench button[id^="btn"], #controlsPanel button.btn-primary, #btn-fire'
    ));
  }""",
    )
    # ft click listener should catch controlsPanel
    t = t.replace(
        """    var ft = document.querySelector('#essence-bench .essence-ft') || $('essence-bench') || document.body;
    ft.addEventListener('click', onPrimaryClick, true);
    applyMode(sel.value || 'explore');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>


<script>
/* === craft-gold-runtime === */""",
        """    var ft = document.querySelector('#essence-bench .essence-ft') || $('essence-bench') || $('controlsPanel') || document.body;
    ft.addEventListener('click', onPrimaryClick, true);
    applyMode(sel.value || 'explore');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>


<script>
/* === craft-gold-runtime === */""",
    )

    # init refresh goals
    t = t.replace(
        """        feedbackMsg.innerHTML = '等待发射……';
        // 窗口resize""",
        """        feedbackMsg.innerHTML = '等待发车……';
        refreshCycloGoals();
        // 窗口resize""",
    )

    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    write(path, t)
    writeback("回旋加速器.html", "cyclotron-radius")
    print("OK cyclotron")


# ─── 2) Capacitor confound Reroll ─────────────────────────────────

def patch_cap_confound() -> None:
    path = YANG / "电容混淆.html"
    t = path.read_text(encoding="utf-8")
    if MARK in t and "RerollChallenge" in t and "__capConfoundApplyMode" in t:
        print("cap-confound already patched")
        writeback("电容混淆.html", "capacitor-confound-ui")
        return

    t = t.replace(
        """    <h2>电容探究</h2>
    <p>平行板电容计读数偏离目标区间。调节极板面积与间距，把读数调进目标带。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>""",
        """    <h2>古董收音机 · 调谐铺</h2>
    <p>街角收音机铺夜修：先自由拧面积与间距，听电容读数怎么变；再接限次急单——每次打偏都会换新目标区间，防背滑条。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛失败会换目标 C 区间（Reroll）。</p>""",
    )
    t = t.replace(
        """      <div class="essence-title">精密电容标定台</div>
      <div class="essence-sub">把读数调进目标区间</div>""",
        """      <div class="essence-title">古董收音机 · 调谐铺</div>
      <div class="essence-sub" id="goalMission">自由拧参，观察读数如何随面积/间距变化</div>""",
    )
    if 'id="sideGoal"' not in t:
        t = t.replace(
            """    <div class="essence-scroll">
      <!-- canvas 示意平行板 -->
  <!-- 调节变量 -->
  <div class="control-panel">""",
            """    <div class="essence-scroll">
      <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试听：自由调面积与间距，看读数升降；极板色调可顺手拧，不必死盯固定带。</p>
  <div class="control-panel">""",
        )

    # Replace fixed TARGET with mutable + Reroll logic
    old = """    const EPS0 = 8.854187817e-12;
    const TARGET_LO = 140;
    const TARGET_HI = 180;
    const canvas = document.getElementById('capCanvas');"""
    new = """    const EPS0 = 8.854187817e-12;
    let TARGET_LO = 140;
    let TARGET_HI = 180;
    let playMode = 'explore';
    let exploreTests = 0;
    let exploreWon = false;
    let challengeWon = false;
    const canvas = document.getElementById('capCanvas');
    const targetBandDisplay = document.getElementById('targetBandDisplay');

    const MODE_GOALS = {
      explore: {
        hud: '目标：自由试测≥3次，对比读数如何随 A、d 变化',
        side: '探究·试听：自由拧面积与间距，听电容读数怎么变；宽目标带仅作参考。'
      },
      challenge: {
        hud: '目标：限次把读数打进当前急单区间（打偏会换新目标）',
        side: '竞赛·夜修急单：每次未命中都会换新目标 C——不能背滑条，要会算。'
      }
    };
    function syncTargetBandUI() {
      if (targetBandDisplay) targetBandDisplay.textContent = TARGET_LO + '–' + TARGET_HI;
      const mission = document.getElementById('goalMission');
      const side = document.getElementById('sideGoal');
      const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
      if (playMode === 'challenge') {
        if (mission) mission.textContent = '急单区间：' + TARGET_LO + '–' + TARGET_HI + ' pF · 打偏换题';
        if (side) side.textContent = '竞赛急单：把读数打进 ' + TARGET_LO + '–' + TARGET_HI + ' pF。未命中会换新目标区间。';
      } else {
        if (mission) mission.textContent = g.hud;
        if (side) side.textContent = g.side;
      }
    }
    function rollTargetBand(kind) {
      // kind: explore wide | challenge narrow random
      if (kind === 'explore') {
        TARGET_LO = 120;
        TARGET_HI = 220;
      } else {
        const mid = 90 + Math.floor(Math.random() * 140); // 90–229
        const half = 12 + Math.floor(Math.random() * 10); // 12–21
        TARGET_LO = Math.max(40, mid - half);
        TARGET_HI = Math.min(280, mid + half);
      }
      syncTargetBandUI();
    }
    /** RerollChallenge：失败换目标 C */
    function rerollChallengeTarget() {
      rollTargetBand('challenge');
      // 打乱默认参，避免贴旧解
      areaSlider.value = String((0.02 + Math.random() * 0.06).toFixed(2));
      distSlider.value = String((0.002 + Math.random() * 0.006).toFixed(3));
      challengeWon = false;
      hintMsg.textContent = '急单已换新目标：' + TARGET_LO + '–' + TARGET_HI + ' pF';
      winContainer.innerHTML = '';
      updateUI(false);
    }
    function enterChallenge() {
      rollTargetBand('challenge');
      areaSlider.value = '0.03';
      distSlider.value = '0.008';
      challengeWon = false;
      hintMsg.textContent = '急单已下发：' + TARGET_LO + '–' + TARGET_HI + ' pF（打偏会换题）';
      winContainer.innerHTML = '';
      updateUI(false);
    }
    function enterExplore() {
      rollTargetBand('explore');
      exploreTests = 0;
      exploreWon = false;
      areaSlider.value = '0.05';
      distSlider.value = '0.005';
      hintMsg.textContent = '自由试听：调参后测试，观察读数';
      winContainer.innerHTML = '';
      updateUI(false);
    }
    window.__capConfoundApplyMode = function(mode) {
      playMode = mode === 'challenge' ? 'challenge' : 'explore';
      if (playMode === 'challenge') enterChallenge();
      else enterExplore();
    };
    document.addEventListener('dual-mode-change', function(ev) {
      var m = ev && ev.detail && ev.detail.mode;
      if (typeof window.__capConfoundApplyMode === 'function') window.__capConfoundApplyMode(m);
    });
    /* """ + MARK + """ RerollChallenge */"""
    if old not in t:
        raise SystemExit("cap: TARGET block not found")
    t = t.replace(old, new)

    # Scene label
    t = t.replace("ctx.fillText('电学标定室', wx - 4, wy - 10);", "ctx.fillText('收音机调谐铺', wx - 4, wy - 10);")
    t = t.replace("ctx.fillText('精密电容计', meterX + 28, meterY + meterH - 12);", "ctx.fillText('调谐电容计', meterX + 28, meterY + meterH - 12);")

    # Rewrite updateUI emitSnapshot branch for explore/challenge/reroll
    old_upd = """      if (emitSnapshot) {
        const controls = {
          's-area': A.toString(),
          's-distance': d.toString(),
          's-plateTone': String(tone)
        };
        const hintKey = winOk ? 'win' : (C_pF < TARGET_LO ? 'cap_low' : 'cap_high');
        try {
          if (window.PlatformTraceAdapter) {
            window.PlatformTraceAdapter.record('snapshot', { controls: controls, winOk: winOk, hintKey: hintKey });
          } else if (window.parent && window.parent.PlatformTraceAdapter) {
            window.parent.PlatformTraceAdapter.record('snapshot', { controls: controls, winOk: winOk, hintKey: hintKey });
          }
        } catch (e) {}
        if (winOk) {
          try {
            if (window.PlatformTraceAdapter) window.PlatformTraceAdapter.record('win', { winOk: true });
            else if (window.parent && window.parent.PlatformTraceAdapter) window.parent.PlatformTraceAdapter.record('win', { winOk: true });
          } catch (e) {}
          hintMsg.textContent = '读数已落入目标区间。';
          winContainer.innerHTML = '<div class="win-banner">过关 · 标定完成</div>';
          if (typeof window.__craftShowWin === 'function') {
            window.__craftShowWin('面积增大、间距减小都会抬高电容读数；极板色调不参与计算。');
          }
        } else {
          hintMsg.textContent = C_pF < TARGET_LO
            ? '读数偏低，尚未进入目标区间。'
            : '读数偏高，尚未进入目标区间。';
          winContainer.innerHTML = '';
        }
      } else {"""
    new_upd = """      if (emitSnapshot) {
        const controls = {
          's-area': A.toString(),
          's-distance': d.toString(),
          's-plateTone': String(tone)
        };
        if (playMode === 'explore') {
          exploreTests += 1;
          if (winOk) exploreWon = true;
          const done = exploreWon && exploreTests >= 3;
          const hintKey = done ? 'win' : 'explore';
          try {
            if (window.PlatformTraceAdapter) {
              window.PlatformTraceAdapter.record('snapshot', { controls: controls, winOk: done, hintKey: hintKey });
            } else if (window.parent && window.parent.PlatformTraceAdapter) {
              window.parent.PlatformTraceAdapter.record('snapshot', { controls: controls, winOk: done, hintKey: hintKey });
            }
          } catch (e) {}
          if (done) {
            try {
              if (window.PlatformTraceAdapter) window.PlatformTraceAdapter.record('win', { winOk: true });
              else if (window.parent && window.parent.PlatformTraceAdapter) window.parent.PlatformTraceAdapter.record('win', { winOk: true });
            } catch (e) {}
            hintMsg.textContent = '试听完成：已对比多次读数变化。';
            winContainer.innerHTML = '<div class="win-banner">过关 · 摸清调谐</div>';
            if (typeof window.__craftShowWin === 'function') {
              window.__craftShowWin('面积增大、间距减小都会抬高电容读数；极板色调不参与计算。');
            }
          } else {
            hintMsg.textContent = winOk
              ? ('读数在参考带内。再换参对比（已测 ' + exploreTests + '/3）')
              : ('继续调 A、d 观察读数（已测 ' + exploreTests + '/3）');
            winContainer.innerHTML = '';
          }
        } else {
          // RerollChallenge
          const hintKey = winOk ? 'win' : (C_pF < TARGET_LO ? 'cap_low' : 'cap_high');
          try {
            if (window.PlatformTraceAdapter) {
              window.PlatformTraceAdapter.record('snapshot', { controls: controls, winOk: winOk, hintKey: hintKey });
            } else if (window.parent && window.parent.PlatformTraceAdapter) {
              window.parent.PlatformTraceAdapter.record('snapshot', { controls: controls, winOk: winOk, hintKey: hintKey });
            }
          } catch (e) {}
          if (winOk) {
            try {
              if (window.PlatformTraceAdapter) window.PlatformTraceAdapter.record('win', { winOk: true });
              else if (window.parent && window.parent.PlatformTraceAdapter) window.parent.PlatformTraceAdapter.record('win', { winOk: true });
            } catch (e) {}
            challengeWon = true;
            hintMsg.textContent = '读数已落入急单区间 ' + TARGET_LO + '–' + TARGET_HI + ' pF。';
            winContainer.innerHTML = '<div class="win-banner">过关 · 夜修完成</div>';
            if (typeof window.__craftShowWin === 'function') {
              window.__craftShowWin('换目标后仍能命中：说明你掌握了 C 随 A、d 的关系，而不是背滑条。');
            }
          } else {
            // 失败换目标 C
            rerollChallengeTarget();
            hintMsg.textContent = (C_pF < TARGET_LO ? '偏低未中 · ' : '偏高未中 · ') + '已换新急单 ' + TARGET_LO + '–' + TARGET_HI + ' pF';
            winContainer.innerHTML = '';
          }
        }
      } else {"""
    if old_upd not in t:
        raise SystemExit("cap: updateUI branch not found")
    t = t.replace(old_upd, new_upd)

    # Hook dual-mode applyMode
    old_dm = """    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');"""
    # may appear once — replace first occurrence carefully with marker
    if "window.__capConfoundApplyMode" not in t.split("dual-mode-shell")[-1] if "dual-mode-shell" in t else True:
        needle = """    setPhase(state.mode);
    gateActions();
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;"""
        repl = """    setPhase(state.mode);
    gateActions();
    try {
      if (typeof window.__capConfoundApplyMode === 'function') window.__capConfoundApplyMode(state.mode);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('dual-mode-change', { detail: { mode: state.mode, attempts: state.attempts } }));
  }

  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target.closest('button');
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;"""
        if needle not in t:
            raise SystemExit("cap: dual-mode hook site not found")
        t = t.replace(needle, repl, 1)

    # init sync
    if "syncTargetBandUI();" not in t:
        t = t.replace(
            "    resizeCanvas();\n    updateUI(false);",
            "    resizeCanvas();\n    rollTargetBand('explore');\n    syncTargetBandUI();\n    updateUI(false);",
        )

    if MARK not in t:
        t = t.replace("</html>", "<!-- " + MARK + " -->\n</html>")
    write(path, t)
    writeback("电容混淆.html", "capacitor-confound-ui")
    print("OK cap-confound")


# ─── 3) Series-parallel Fixed ─────────────────────────────────────

def patch_series() -> None:
    from _patch_batch4_series import patch_series as _ps
    _ps()


def main():
    patch_cyclotron()
    patch_cap_confound()
    patch_series()
    print("batch4 done")


if __name__ == "__main__":
    main()
