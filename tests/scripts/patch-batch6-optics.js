/**
 * Batch 6: refraction Fixed + photoelectric Reroll
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const PKG = path.join(ROOT, 'data/runtime/packages');

function writeBoth(cn, pkgId, html) {
  fs.writeFileSync(path.join(YANG, cn), html, 'utf8');
  fs.writeFileSync(path.join(PKG, pkgId, 'game.html'), html, 'utf8');
  console.log('OK', cn, '->', pkgId);
}

function ensureHook(html, fn) {
  if (html.includes('typeof window.' + fn)) return html;
  const re = /(setPhase\(state\.mode\);\s*\n\s*gateActions\(\);)/;
  if (!re.test(html)) throw new Error('hook site missing for ' + fn);
  return html.replace(
    re,
    `$1\n    if (typeof window.${fn} === 'function') {\n      try { window.${fn}(state.mode); } catch (e) {}\n    }`
  );
}

// ── 折射 Fixed ─────────────────────────────────────────────
(function () {
  let h = fs.readFileSync(path.join(YANG, '折射.html'), 'utf8');
  h = h.replace(
    `<h2>水槽打靶 · 折射</h2>
    <p>水面上方的探照灯要照亮水下靶标。调节入射角与介质折射率，让折射光线命中目标。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>`,
    `<h2>珊瑚礁搜救 · 探照</h2>
    <p>夜潜搜救：水面探照灯要照亮礁石下的信标。先自由拧入射角与介质折射率，看折射走向；再接限次急单——本局信标位置锁定，打偏不换靶。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后信标位置本局固定，未命中只扣次数。</p>`
  );
  h = h.replace(
    `<div class="essence-title">水槽打靶</div>
      <div class="essence-sub">让折射光线命中水下靶标</div>`,
    `<div class="essence-title">珊瑚礁搜救 · 探照</div>
      <div class="essence-sub" id="goalMission">探究：自由调入射角与折射率，观察折射走向</div>`
  );
  h = h.replace(
    `<div class="essence-scroll">
      <div class="container">
    
    

    <div class="controls-grid">`,
    `<div class="essence-scroll">
      <div class="container">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·夜潜：自由改入射角与折射率，看折射光线走向；不必死盯固定靶。</p>

    <div class="controls-grid">`
  );

  if (!h.includes('window.__snellApplyMode')) {
    h = h.replace(
      `  const n1 = 1.0;
  let W = 700, H = 400;
  let layout = { groundY: 240, launchX: 100, launchY: 70, target: { x: 520, y: 310, radius: 18 } };`,
      `  const n1 = 1.0;
  let W = 700, H = 400;
  let playMode = 'explore';
  let lockedTargetFrac = null; // { xf, yf } 竞赛锁定的靶位比例
  let challengeWon = false;
  let layout = { groundY: 240, launchX: 100, launchY: 70, target: { x: 520, y: 310, radius: 18 } };

  const MODE_GOALS = {
    explore: { hud: '探究：自由调入射角与折射率，观察折射走向', side: '探究·夜潜：自由改入射角与折射率，看折射光线走向；不必死盯固定靶。' },
    challenge: { hud: '竞赛：限次命中本局锁定信标（打偏不换靶）', side: '竞赛·搜救急单：进入时锁定信标位置；打偏只扣次数——用折射关系算打法。' }
  };

  function refreshSnellGoals() {
    const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
    const mission = document.getElementById('goalMission');
    const side = document.getElementById('sideGoal');
    if (playMode === 'challenge' && lockedTargetFrac) {
      if (mission) mission.textContent = '急单信标已锁定 · 本局固定';
      if (side) side.textContent = '竞赛急单：让折射光线命中锁定信标。位置已锁定，打偏不换靶。';
    } else {
      if (mission) mission.textContent = g.hud;
      if (side) side.textContent = g.side;
    }
  }

  /** FixedChallenge：仅进入竞赛时锁定一次信标位置 */
  function lockChallengeTarget() {
    lockedTargetFrac = {
      xf: 0.58 + Math.random() * 0.22, // 0.58–0.80
      yf: 0.62 + Math.random() * 0.18  // 0.62–0.80
    };
    challengeWon = false;
    angleSlider.value = '45';
    indexSlider.value = '1.3';
    refreshSnellGoals();
    updateExperiment(false);
    feedback.textContent = '急单已锁定信标位置（本局不变）';
    winMessageDiv.innerHTML = '';
  }

  function applyExploreTarget() {
    lockedTargetFrac = null;
    challengeWon = false;
    angleSlider.value = '45';
    indexSlider.value = '1.3';
    refreshSnellGoals();
    updateExperiment(false);
    feedback.textContent = '自由试探：调节后观察折射走向。';
    winMessageDiv.innerHTML = '';
  }

  window.__snellApplyMode = function(mode) {
    playMode = mode === 'challenge' ? 'challenge' : 'explore';
    if (playMode === 'challenge') lockChallengeTarget();
    else applyExploreTarget();
  };
/* BATCH6-FIXED-20260724 FixedChallenge */`
    );
  }

  h = h.replace(
    `    layout.groundY = Math.round(H * 0.52);
    layout.launchX = Math.round(W * 0.16);
    layout.launchY = Math.round(H * 0.18);
    layout.target = {
      x: Math.round(W * 0.72),
      y: Math.round(H * 0.72),
      radius: Math.max(14, Math.round(Math.min(W, H) * 0.035))
    };
    return layout;`,
    `    layout.groundY = Math.round(H * 0.52);
    layout.launchX = Math.round(W * 0.16);
    layout.launchY = Math.round(H * 0.18);
    const xf = lockedTargetFrac ? lockedTargetFrac.xf : 0.72;
    const yf = lockedTargetFrac ? lockedTargetFrac.yf : 0.72;
    layout.target = {
      x: Math.round(W * xf),
      y: Math.round(H * yf),
      radius: Math.max(14, Math.round(Math.min(W, H) * 0.035))
    };
    return layout;`
  );

  h = h.replace(`ctx.fillText('水下靶', target.x - 22, target.y - target.radius - 8);`, `ctx.fillText('信标', target.x - 14, target.y - target.radius - 8);`);
  h = h.replace(
    `    ctx.fillText(hit ? '光线已命中水下靶' : '光线尚未命中靶标', boxX + 10, boxY + 28);`,
    `    if (playMode === 'challenge') {
      ctx.fillText(hit ? '光线已命中锁定信标' : '光线尚未命中信标', boxX + 10, boxY + 28);
    } else {
      ctx.fillText(hit ? '碰巧扫到参考信标' : '探究观察折射走向', boxX + 10, boxY + 28);
    }`
  );

  h = h.replace(
    `    // 如果点击发射 或 自动检测 (fireAction)
    if (fireAction) {
      if (!valid || isNaN(theta2)) {
        feedback.textContent = '❌ 折射光线无效 (可能全反射)';
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'C3' };
      }
      const hit = result.hit;
      if (hit) {
        feedback.textContent = '✅ 命中目标！过关！';
        winMessageDiv.innerHTML = '<span class="win-badge">🎉 过关！折射光线命中目标</span>';
        return { winOk: true, hintKey: null };
      } else {
        feedback.textContent = '❌ 折射光线未命中目标，请调整参数再试';
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'C3' };
      }
    } else {
      // 非发射状态，仅显示提示
      if (!valid) {
        feedback.textContent = '当前参数导致全反射，调整入射角或折射率';
      } else {
        feedback.textContent = '调节参数，点击「发射光线」测试';
      }
      winMessageDiv.innerHTML = '';
      return { winOk: false, hintKey: null };
    }
  }`,
    `    if (fireAction) {
      if (playMode === 'explore') {
        if (!valid || isNaN(theta2)) {
          feedback.textContent = '当前折射无效（可能全反射）· 探究继续试参';
        } else if (result.hit) {
          feedback.textContent = '光线碰巧扫到参考信标 · 继续对比（探究不要求命中）';
        } else {
          feedback.textContent = '折射角约 ' + theta2.toFixed(1) + '° · 探究观察走向';
        }
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'explore_observe' };
      }
      if (!valid || isNaN(theta2)) {
        // FixedChallenge：失败不换靶
        feedback.textContent = '折射无效 · 信标仍锁定（可能全反射）';
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'C3' };
      }
      const hit = result.hit;
      if (hit) {
        feedback.textContent = '急单完成：命中锁定信标。';
        if (!challengeWon) {
          challengeWon = true;
          if (typeof window.__craftShowWin === 'function') {
            window.__craftShowWin('信标位置本局锁定。光进入不同介质时方向改变；入射角、折射率共同决定折射角。');
          }
        }
        winMessageDiv.innerHTML = '<span class="win-badge">🎉 过关！折射光线命中信标</span>';
        return { winOk: true, hintKey: null };
      } else {
        // FixedChallenge：失败不换靶
        feedback.textContent = '未命中 · 信标位置仍锁定，请改入射角或折射率再试';
        winMessageDiv.innerHTML = '';
        return { winOk: false, hintKey: 'C3' };
      }
    } else {
      if (!valid) {
        feedback.textContent = '当前参数导致全反射，调整入射角或折射率';
      } else if (playMode === 'challenge') {
        feedback.textContent = '信标已锁定，调节后点击「发射光线」';
      } else {
        feedback.textContent = '调节参数，点击「发射光线」观察折射';
      }
      winMessageDiv.innerHTML = '';
      return { winOk: false, hintKey: null };
    }
  }`
  );

  // fireAndEmit: explore shouldn't emit win
  // already handled via updateExperiment returning winOk false

  h = h.replace(
    /updateExperiment\(false\);\s*\n\s*\}\)?;?\s*\n?\s*(window\.addEventListener\('resize')/,
    `refreshSnellGoals();\n  updateExperiment(false);\n\n  $1`
  );

  // safer init append
  if (!h.includes('refreshSnellGoals();')) {
    // find end of main IIFE bindings
    h = h.replace(
      `  fireBtn.addEventListener('click', fireAndEmit);`,
      `  fireBtn.addEventListener('click', fireAndEmit);\n  refreshSnellGoals();`
    );
  }

  h = ensureHook(h, '__snellApplyMode');
  writeBoth('折射.html', 'refraction-snell', h);
})();

// ── 光电效应 Reroll ────────────────────────────────────────
(function () {
  let h = fs.readFileSync(path.join(YANG, '光电效应.html'), 'utf8');
  h = h.replace(
    `<h2>光电管实验台</h2>
    <p>真空光电管里还没有光电流。调节入射光频率与金属逸出功，试着点亮回路。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>`,
    `<h2>夜视门禁 · 光控开锁</h2>
    <p>夜巡门禁要靠光电管触发。先自由对比频率与逸出功如何决定电流；再接限次急单——每次未导通都会换金属片（新 W）。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛失败会换材料/逸出功，不能背滑条。</p>`
  );
  h = h.replace(
    `<div class="essence-title">光电管实验台</div>
      <div class="essence-sub">点亮回路，观察到非零光电流</div>`,
    `<div class="essence-title">夜视门禁 · 光控开锁</div>
      <div class="essence-sub" id="goalMission">探究：自由调频率与逸出功，观察光电流</div>`
  );
  h = h.replace(
    `<div class="essence-scroll">
      <div class="game">
  
  

  <!-- canvas 区域 -->
  <!-- 控制面板 -->
  <div class="control-panel">`,
    `<div class="essence-scroll">
      <div class="game">
  <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·夜巡：自由改频率与逸出功，看电流是否出现；不必死盯固定材料。</p>
  <div id="materialChip" style="display:none;margin:0 0 10px;padding:8px 10px;border-radius:10px;background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.35);font-size:12px;color:#fde68a">当前急单金属：—</div>

  <!-- canvas 区域 -->
  <!-- 控制面板 -->
  <div class="control-panel">`
  );

  if (!h.includes('window.__peApplyMode')) {
    h = h.replace(
      `    // 状态
    let lastFrequency = 5.0;   // 单位 1e14 Hz
    let lastWork = 2.5;        // eV
    let currentI = 0.0;        // μA
    let hasFired = false;
    let winAchieved = false;`,
      `    // 状态
    let lastFrequency = 5.0;   // 单位 1e14 Hz
    let lastWork = 2.5;        // eV
    let currentI = 0.0;        // μA
    let hasFired = false;
    let winAchieved = false;
    let playMode = 'explore';
    let lockedMaterial = null; // { name, W }
    let challengeWon = false;
    const I_TARGET = 0.8; // 竞赛导通阈值 μA

    const MATERIALS = [
      { name: '铯片', W: 1.9 },
      { name: '钾片', W: 2.3 },
      { name: '钠片', W: 2.7 },
      { name: '锌片', W: 3.3 },
      { name: '铜片', W: 4.1 },
      { name: '铂片', W: 4.7 }
    ];

    const MODE_GOALS = {
      explore: { hud: '探究：自由调频率与逸出功，观察光电流', side: '探究·夜巡：自由改频率与逸出功，看电流是否出现；不必死盯固定材料。' },
      challenge: { hud: '竞赛：限次点亮本局金属门禁（打偏换材料）', side: '竞赛·夜巡急单：进入时抽一块金属；未导通会换新材料/W——要会算阈值。' }
    };

    function refreshPeGoals() {
      const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
      const mission = document.getElementById('goalMission');
      const side = document.getElementById('sideGoal');
      const chip = document.getElementById('materialChip');
      if (playMode === 'challenge' && lockedMaterial) {
        if (mission) mission.textContent = '急单金属：' + lockedMaterial.name + ' · W=' + lockedMaterial.W.toFixed(1) + ' eV · 打偏换题';
        if (side) side.textContent = '竞赛急单：把光电流抬到 ≥ ' + I_TARGET.toFixed(1) + ' μA。未命中会换新金属片。';
        if (chip) {
          chip.style.display = 'block';
          chip.textContent = '当前急单金属：' + lockedMaterial.name + '（W = ' + lockedMaterial.W.toFixed(1) + ' eV）· 打偏换片';
        }
      } else {
        if (mission) mission.textContent = g.hud;
        if (side) side.textContent = g.side;
        if (chip) chip.style.display = 'none';
      }
    }

    function rollMaterial(excludeName) {
      let pool = MATERIALS.slice();
      if (excludeName) pool = pool.filter(function(m) { return m.name !== excludeName; });
      const m = pool[Math.floor(Math.random() * pool.length)];
      return { name: m.name, W: m.W };
    }

    /** RerollChallenge：进入竞赛抽一次；失败再换材料/W */
    function lockChallengeMaterial() {
      lockedMaterial = rollMaterial(null);
      challengeWon = false;
      winAchieved = false;
      freqSlider.value = '4.0';
      workSlider.value = String(lockedMaterial.W);
      workSlider.disabled = true;
      refreshPeGoals();
      updateUI(false, false);
      hintDiv.textContent = '急单已下发：' + lockedMaterial.name + ' · W=' + lockedMaterial.W.toFixed(1) + ' eV（打偏会换片）';
      winBanner.style.display = 'none';
    }

    function rerollChallengeMaterial() {
      const prev = lockedMaterial ? lockedMaterial.name : null;
      lockedMaterial = rollMaterial(prev);
      challengeWon = false;
      winAchieved = false;
      freqSlider.value = String((3.0 + Math.random() * 3.0).toFixed(1));
      workSlider.value = String(lockedMaterial.W);
      workSlider.disabled = true;
      refreshPeGoals();
      updateUI(false, false);
      hintDiv.textContent = '未导通 · 已换新金属 ' + lockedMaterial.name + '（W=' + lockedMaterial.W.toFixed(1) + ' eV）';
      winBanner.style.display = 'none';
    }

    function applyExploreMaterial() {
      lockedMaterial = null;
      challengeWon = false;
      winAchieved = false;
      workSlider.disabled = false;
      freqSlider.value = '5.0';
      workSlider.value = '2.5';
      refreshPeGoals();
      updateUI(false, false);
      hintDiv.textContent = '自由试探：改频率/逸出功后观察电流。';
      winBanner.style.display = 'none';
    }

    window.__peApplyMode = function(mode) {
      playMode = mode === 'challenge' ? 'challenge' : 'explore';
      if (playMode === 'challenge') lockChallengeMaterial();
      else applyExploreMaterial();
    };
/* BATCH6-REROLL-20260724 RerollChallenge */`
    );
  }

  // Replace updateUI win logic for dual mode
  h = h.replace(
    `      // 判定过关条件: 产生光电流 (I > 0) 且频率/逸出功在范围内
      const freqOk = (freqHz >= 1e14 && freqHz <= 1e15);
      const workOk = (workEv >= 1.0 && workEv <= 5.0);
      const currentOk = (I > 0.0);
      const winOk = freqOk && workOk && currentOk;

      // 更新提示
      let hintKey = '';
      if (!freqOk) hintKey = '频率超出范围 (1e14~1e15 Hz)';
      else if (!workOk) hintKey = '逸出功超出范围 (1~5 eV)';
      else if (!currentOk) hintKey = '未产生光电流，尝试增大频率或减小逸出功';
      else hintKey = '✅ 光电流产生！满足过关条件。';

      if (isFire || emitSnapshot) {
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
      } else {
        // 仅更新显示，不发射 snapshot
        if (winAchieved) {
          winBanner.style.display = 'block';
          hintDiv.textContent = '✅ 已过关，继续调节可观察变化。';
        } else {
          winBanner.style.display = 'none';
          hintDiv.textContent = hintKey;
        }
      }
    }`,
    `      // 竞赛：锁定金属 W；探究：自由观察
      if (playMode === 'challenge' && lockedMaterial) {
        workEv = lockedMaterial.W;
        workSlider.value = String(lockedMaterial.W);
      }
      const freqOk = (freqHz >= 1e14 && freqHz <= 1e15);
      const workOk = (workEv >= 1.0 && workEv <= 5.0);
      const currentOk = playMode === 'challenge' ? (I >= I_TARGET) : (I > 0.0);
      const winOk = playMode === 'challenge' && freqOk && workOk && currentOk;

      let hintKey = '';
      if (!freqOk) hintKey = '频率超出范围 (1e14~1e15 Hz)';
      else if (!workOk) hintKey = '逸出功超出范围 (1~5 eV)';
      else if (playMode === 'challenge' && I < I_TARGET) hintKey = '电流不足 · 需 ≥ ' + I_TARGET.toFixed(1) + ' μA（打偏会换片）';
      else if (playMode !== 'challenge' && I <= 0) hintKey = '尚未导通，试着增大频率或减小逸出功';
      else hintKey = playMode === 'challenge' ? '门禁可开锁' : '已观察到光电流';

      if (isFire || emitSnapshot) {
        const controls = snapControls();
        if (playMode === 'explore') {
          winBanner.style.display = 'none';
          hintDiv.textContent = '当前 I=' + I.toFixed(1) + ' μA · 继续对比（探究不要求固定材料）';
          emit('snapshot', { controls: controls, winOk: false, hintKey: 'explore_observe' });
        } else if (winOk && !challengeWon) {
          challengeWon = true;
          winAchieved = true;
          winBanner.style.display = 'block';
          hintDiv.textContent = '急单完成：' + lockedMaterial.name + ' 门禁已开锁。';
          if (typeof window.__craftShowWin === 'function') {
            window.__craftShowWin('换材料后仍能开锁：说明你掌握了光子能量与逸出功的关系，而不是背滑条。');
          }
          emit('snapshot', { controls: controls, winOk: true, hintKey: '过关' });
          emit('win', { winOk: true });
        } else if (winOk && challengeWon) {
          winBanner.style.display = 'block';
          hintDiv.textContent = '已过关，可继续观察。';
          emit('snapshot', { controls: controls, winOk: true, hintKey: '已过关' });
        } else {
          // RerollChallenge：失败换材料/W
          winBanner.style.display = 'none';
          emit('snapshot', { controls: controls, winOk: false, hintKey: hintKey });
          rerollChallengeMaterial();
        }
      } else {
        if (challengeWon) {
          winBanner.style.display = 'block';
          hintDiv.textContent = '已过关，继续调节可观察变化。';
        } else if (playMode === 'challenge' && lockedMaterial) {
          winBanner.style.display = 'none';
          hintDiv.textContent = lockedMaterial.name + ' · W=' + lockedMaterial.W.toFixed(1) + ' eV · 调频率后发射';
        } else {
          winBanner.style.display = 'none';
          hintDiv.textContent = hintKey;
        }
      }
    }`
  );

  h = h.replace(
    `      ctx.fillText('真空光电管', tubeX + 12, tubeY - 8);`,
    `      ctx.fillText(playMode === 'challenge' && lockedMaterial ? ('门禁光电管 · ' + lockedMaterial.name) : '门禁光电管', tubeX + 12, tubeY - 8);`
  );
  h = h.replace(
    `      ctx.fillStyle = I > 0 ? '#fde047' : '#fda4af';
      ctx.fillText(I > 0 ? '回路已导通' : '回路未导通', boxX + 10, boxY + 38);`,
    `      ctx.fillStyle = (playMode === 'challenge' ? I >= I_TARGET : I > 0) ? '#fde047' : '#fda4af';
      if (playMode === 'challenge') {
        ctx.fillText(I >= I_TARGET ? '门禁已开锁' : ('需 I≥' + I_TARGET.toFixed(1) + ' · 打偏换片'), boxX + 10, boxY + 38);
      } else {
        ctx.fillText(I > 0 ? '回路已导通' : '回路未导通', boxX + 10, boxY + 38);
      }`
  );

  h = h.replace(
    `    function resetAll() {
      freqSlider.value = '5.0';
      workSlider.value = '2.5';
      winAchieved = false;
      winBanner.style.display = 'none';
      hasFired = false;
      updateUI(false, false);
      hintDiv.textContent = '已重置，调节参数后点击发射光。';
    }`,
    `    function resetAll() {
      if (playMode === 'challenge' && lockedMaterial) {
        freqSlider.value = '4.0';
        workSlider.value = String(lockedMaterial.W);
        workSlider.disabled = true;
        hintDiv.textContent = '已重置频率 · 金属仍为 ' + lockedMaterial.name + '（失败才会换片）';
      } else {
        freqSlider.value = '5.0';
        workSlider.value = '2.5';
        workSlider.disabled = false;
        hintDiv.textContent = '已重置，调节参数后点击发射光。';
      }
      winAchieved = false;
      challengeWon = false;
      winBanner.style.display = 'none';
      hasFired = false;
      updateUI(false, false);
    }`
  );

  h = h.replace(
    `    updateUI(false, false);
    requestAnimationFrame(tick);
  })();`,
    `    refreshPeGoals();
    updateUI(false, false);
    requestAnimationFrame(tick);
  })();`
  );

  h = ensureHook(h, '__peApplyMode');
  writeBoth('光电效应.html', 'photoelectric', h);
})();

console.log('optics done');
