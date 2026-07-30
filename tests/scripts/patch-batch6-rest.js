/**
 * Batch 6 remainder: gas / lens / refraction (Fixed) + photoelectric (Reroll)
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

// ── 理想气体 Fixed ─────────────────────────────────────────
(function () {
  let h = fs.readFileSync(path.join(YANG, '理想气体.html'), 'utf8');
  h = h.replace(
    `<h2>恒温气筒台</h2>
    <p>密封气筒温度保持不变。调节压强与活塞体积，使乘积回到标定带，完成等温压缩检验。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>`,
    `<h2>深潜器 · 压舱气室</h2>
    <p>潜水器等温气室偏离标定。先自由拧压强与体积，看乘积怎么变；再接限次急单——本局标定带锁定，打偏不换带。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后标定带本局固定，未命中只扣次数。</p>`
  );
  h = h.replace(
    `<div class="essence-title">恒温气筒台</div>
      <div class="essence-sub">把 p·V 乘积调进标定带 9.5–10.5</div>`,
    `<div class="essence-title">深潜器 · 压舱气室</div>
      <div class="essence-sub" id="goalMission">探究：自由调压强与体积，观察乘积</div>`
  );
  h = h.replace(
    `<div class="essence-scroll">
      <div class="card">
    
    

    <!-- canvas 示意 (非必须, 但保留视觉) -->
    <!-- 调节变量 -->`,
    `<div class="essence-scroll">
      <div class="card">
    <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·下潜前：自由改压强与体积，看乘积升降；不必死盯固定标定带。</p>

    <!-- canvas 示意 (非必须, 但保留视觉) -->
    <!-- 调节变量 -->`
  );

  // Insert mode state after DOM refs
  if (!h.includes('window.__gasApplyMode')) {
    h = h.replace(
      `        const canvas = document.getElementById('gasCanvas');
        const ctx = canvas.getContext('2d');
        let W = 600, H = 320, animT = 0, pulse = 0;`,
      `        const canvas = document.getElementById('gasCanvas');
        const ctx = canvas.getContext('2d');
        let W = 600, H = 320, animT = 0, pulse = 0;
        let playMode = 'explore';
        let PV_LO = 9.5, PV_HI = 10.5;
        let lockedBand = null;
        let challengeWon = false;

        const MODE_GOALS = {
          explore: { hud: '探究：自由调压强与体积，观察乘积', side: '探究·下潜前：自由改压强与体积，看乘积升降；不必死盯固定标定带。' },
          challenge: { hud: '竞赛：限次把 p·V 调进本局锁定标定带（打偏不换带）', side: '竞赛·下潜急单：进入时锁定标定带；打偏只扣次数——用等温关系算打法。' }
        };

        function refreshGasGoals() {
          const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
          const mission = document.getElementById('goalMission');
          const side = document.getElementById('sideGoal');
          if (playMode === 'challenge' && lockedBand) {
            if (mission) mission.textContent = '急单标定带 ' + PV_LO.toFixed(1) + '–' + PV_HI.toFixed(1) + ' · 本局固定';
            if (side) side.textContent = '竞赛急单：把乘积调进 ' + PV_LO.toFixed(1) + '–' + PV_HI.toFixed(1) + '。标定带已锁定，打偏不换。';
          } else {
            if (mission) mission.textContent = g.hud;
            if (side) side.textContent = g.side;
          }
        }

        /** FixedChallenge：仅进入竞赛时锁定一次标定带 */
        function lockChallengeBand() {
          const mid = 8 + Math.random() * 8; // 8–16
          const half = 0.4 + Math.random() * 0.5;
          PV_LO = Math.round((mid - half) * 10) / 10;
          PV_HI = Math.round((mid + half) * 10) / 10;
          lockedBand = { lo: PV_LO, hi: PV_HI };
          challengeWon = false;
          pSlider.value = '3.0';
          vSlider.value = '5.0';
          refreshGasGoals();
          updateAll();
          hintMsg.textContent = '急单已锁定标定带 ' + PV_LO.toFixed(1) + '–' + PV_HI.toFixed(1) + '（本局不变）';
          winIndicator.innerHTML = '';
        }

        function applyExploreBand() {
          lockedBand = null;
          challengeWon = false;
          PV_LO = 9.5; PV_HI = 10.5;
          pSlider.value = '3.0';
          vSlider.value = '5.0';
          refreshGasGoals();
          updateAll();
          hintMsg.textContent = '自由试调：改压强/体积后观察乘积。';
          winIndicator.innerHTML = '';
        }

        window.__gasApplyMode = function(mode) {
          playMode = mode === 'challenge' ? 'challenge' : 'explore';
          if (playMode === 'challenge') lockChallengeBand();
          else applyExploreBand();
        };
/* BATCH6-FIXED-20260724 FixedChallenge */`
    );
  }

  h = h.replace(
    `            const onBand = pv >= 9.5 && pv <= 10.5;
            const boxW = 230, boxH = 50, boxX = W - boxW - 16, boxY = H - boxH - 28;
            ctx.fillStyle = 'rgba(15,23,42,0.85)';
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.strokeStyle = onBand ? 'rgba(167,139,250,0.7)' : 'rgba(148,163,184,0.35)';
            ctx.strokeRect(boxX, boxY, boxW, boxH);
            ctx.fillStyle = '#e9d5ff';
            ctx.font = '12px "Microsoft YaHei",sans-serif';
            ctx.fillText('标定带 9.5 – 10.5 atm·L', boxX + 10, boxY + 20);
            ctx.fillStyle = onBand ? '#c4b5fd' : '#fda4af';
            ctx.fillText('当前乘积 ' + pv.toFixed(2), boxX + 10, boxY + 38);`,
    `            const onBand = playMode === 'challenge' && pv >= PV_LO && pv <= PV_HI;
            const boxW = 240, boxH = 50, boxX = W - boxW - 16, boxY = H - boxH - 28;
            ctx.fillStyle = 'rgba(15,23,42,0.85)';
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.strokeStyle = onBand ? 'rgba(167,139,250,0.7)' : 'rgba(148,163,184,0.35)';
            ctx.strokeRect(boxX, boxY, boxW, boxH);
            ctx.fillStyle = '#e9d5ff';
            ctx.font = '12px "Microsoft YaHei",sans-serif';
            if (playMode === 'challenge') {
              ctx.fillText('急单 ' + PV_LO.toFixed(1) + ' – ' + PV_HI.toFixed(1) + ' atm·L', boxX + 10, boxY + 20);
            } else {
              ctx.fillText('探究观察乘积（不必死盯带）', boxX + 10, boxY + 20);
            }
            ctx.fillStyle = onBand ? '#c4b5fd' : '#fda4af';
            ctx.fillText('当前乘积 ' + pv.toFixed(2), boxX + 10, boxY + 38);`
  );

  h = h.replace(
    `        function checkWin() {
            const { pv } = computePV();
            const ok = (pv >= 9.5 && pv <= 10.5);
            return { winOk: ok, hintKey: ok ? 'win' : 'retry' };
        }

        function emit(type, payload) {
            try { if (window.PlatformTraceAdapter) { window.PlatformTraceAdapter.record(type, payload || {}); return; } } catch (e) {}
            try { if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter) { window.parent.PlatformTraceAdapter.record(type, payload || {}); } } catch (e) {}
        }

        function fireSnapshotAndWin() {
            const { winOk, hintKey } = checkWin();
            const { pv } = computePV();
            pulse = 1;
            const controls = {};
            document.querySelectorAll('input[type="range"]').forEach(el => { if (el.id) controls[el.id] = el.value; });
            try { emit('snapshot', { controls, winOk, hintKey }); } catch(e) {}
            if (winOk) {
                try { emit('win', { winOk: true }); } catch(e) {}
                winIndicator.innerHTML = '<span class="win-badge">✅ 过关！乘积落在标定带内</span>';
                hintMsg.textContent = '等温条件下乘积回到标定带。';
            } else {
                winIndicator.innerHTML = '';
                hintMsg.textContent = '当前乘积 ' + pv.toFixed(2) + '，请调到 9.5–10.5。';
            }
            updateAll();
        }

        function resetToDefault() {
            pSlider.value = '3.0';
            vSlider.value = '5.0';
            updateAll();
            winIndicator.innerHTML = '';
            hintMsg.textContent = '已重置：乘积偏离标定带，继续调节。';
        }`,
    `        function emit(type, payload) {
            try { if (window.PlatformTraceAdapter) { window.PlatformTraceAdapter.record(type, payload || {}); return; } } catch (e) {}
            try { if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter) { window.parent.PlatformTraceAdapter.record(type, payload || {}); } } catch (e) {}
        }

        function fireSnapshotAndWin() {
            const { pv } = computePV();
            pulse = 1;
            const controls = {};
            document.querySelectorAll('input[type="range"]').forEach(el => { if (el.id) controls[el.id] = el.value; });
            if (playMode === 'explore') {
                winIndicator.innerHTML = '';
                hintMsg.textContent = '当前乘积 ' + pv.toFixed(2) + ' · 继续对比（探究不要求固定带）';
                updateAll();
                try { emit('snapshot', { controls, winOk: false, hintKey: 'explore_observe' }); } catch(e) {}
                return;
            }
            const winOk = pv >= PV_LO && pv <= PV_HI;
            try { emit('snapshot', { controls, winOk, hintKey: winOk ? 'win' : 'retry' }); } catch(e) {}
            if (winOk) {
                try { emit('win', { winOk: true }); } catch(e) {}
                if (!challengeWon) {
                  challengeWon = true;
                  if (typeof window.__craftShowWin === 'function') {
                    window.__craftShowWin('标定带本局锁定。温度不变时，压强与体积成反比，二者乘积保持恒定。');
                  }
                }
                winIndicator.innerHTML = '<span class="win-badge">✅ 过关！乘积落入锁定标定带</span>';
                hintMsg.textContent = '急单完成：乘积落入 ' + PV_LO.toFixed(1) + '–' + PV_HI.toFixed(1) + '。';
            } else {
                // FixedChallenge：失败不换带
                winIndicator.innerHTML = '';
                hintMsg.textContent = '未命中 · 当前 ' + pv.toFixed(2) + '，急单仍锁定 ' + PV_LO.toFixed(1) + '–' + PV_HI.toFixed(1);
            }
            updateAll();
        }

        function resetToDefault() {
            pSlider.value = '3.0';
            vSlider.value = '5.0';
            updateAll();
            winIndicator.innerHTML = '';
            if (playMode === 'challenge' && lockedBand) {
              hintMsg.textContent = '已重置滑条 · 标定带仍锁定 ' + PV_LO.toFixed(1) + '–' + PV_HI.toFixed(1);
            } else {
              hintMsg.textContent = '已重置：继续自由观察乘积。';
            }
        }`
  );

  h = h.replace(
    `        hintMsg.textContent = '气筒已偏离标定带，调节压强/体积后点击「测试」。';
        requestAnimationFrame(tick);`,
    `        refreshGasGoals();
        hintMsg.textContent = '气室已偏离，调节压强/体积后点击「测试」。';
        requestAnimationFrame(tick);`
  );

  // scene label tweak
  h = h.replace(`ctx.fillText('活塞', pistonX + 18, cylY + cylH * 0.35 - 6);`, `ctx.fillText('压舱活塞', pistonX + 18, cylY + cylH * 0.35 - 6);`);

  h = ensureHook(h, '__gasApplyMode');
  writeBoth('理想气体.html', 'gas-ideal', h);
})();

// ── 透镜 Fixed ─────────────────────────────────────────────
(function () {
  let h = fs.readFileSync(path.join(YANG, '透镜.html'), 'utf8');
  h = h.replace(
    `<h2>光学实验台 · 成像</h2>
    <p>导轨上已摆好物、透镜与光屏。调节物距与焦距，让清晰的像落在光屏上。</p>
    <p style="font-size:12px;color:var(--craft-muted)">右侧工作台调节参数；可用「自由探究 / 竞赛挑战」切换阶段。</p>`,
    `<h2>广场夜映 · 放映机</h2>
    <p>露天电影幕布已架好。先自由拧物距与焦距，看实像落点；再接限次急单——本局幕距锁定，打偏不换幕。</p>
    <p style="font-size:12px;color:var(--craft-muted)">探究与竞赛目标不同；竞赛进入后幕距本局固定，未对准只扣次数。</p>`
  );
  h = h.replace(
    `<div class="essence-title">光学实验台</div>
      <div class="essence-sub">把清晰实像调到光屏上</div>`,
    `<div class="essence-title">广场夜映 · 放映机</div>
      <div class="essence-sub" id="goalMission">探究：自由调物距与焦距，观察成像落点</div>`
  );
  h = h.replace(
    `  <!-- Canvas 区域 -->
  <!-- 调节变量 -->
  <div class="control-panel">`,
    `  <p id="sideGoal" style="margin:0 0 10px;font-size:12px;line-height:1.45;color:#94a3b8">探究·试映：自由改物距与焦距，看像落在哪；不必死盯固定幕距。</p>
  <!-- Canvas 区域 -->
  <!-- 调节变量 -->
  <div class="control-panel">`
  );

  if (!h.includes('window.__lensApplyMode')) {
    h = h.replace(
      `    let W = 640, H = 360;
    const SCREEN_DIST_CM = 22; // 透镜到光屏固定距离 (cm)
    let layout = { axisY: 220, lensX: 320, screenX: 540, pxPerCm: 10 };`,
      `    let W = 640, H = 360;
    let SCREEN_DIST_CM = 22; // 透镜到幕布距离 (cm)；竞赛进关锁定一次
    let playMode = 'explore';
    let lockedScreen = null;
    let challengeWon = false;
    let layout = { axisY: 220, lensX: 320, screenX: 540, pxPerCm: 10 };

    const MODE_GOALS = {
      explore: { hud: '探究：自由调物距与焦距，观察成像落点', side: '探究·试映：自由改物距与焦距，看像落在哪；不必死盯固定幕距。' },
      challenge: { hud: '竞赛：限次把清晰实像对准本局锁定幕距（打偏不换幕）', side: '竞赛·首映急单：进入时锁定幕距；打偏只扣次数——用成像关系算打法。' }
    };

    function refreshLensGoals() {
      const g = MODE_GOALS[playMode] || MODE_GOALS.explore;
      const mission = document.getElementById('goalMission');
      const side = document.getElementById('sideGoal');
      if (playMode === 'challenge' && lockedScreen != null) {
        if (mission) mission.textContent = '急单幕距 ' + SCREEN_DIST_CM + ' cm · 本局固定';
        if (side) side.textContent = '竞赛急单：把像调到距透镜约 ' + SCREEN_DIST_CM + ' cm 的幕布上。幕距已锁定，打偏不换。';
      } else {
        if (mission) mission.textContent = g.hud;
        if (side) side.textContent = g.side;
      }
    }

    /** FixedChallenge：仅进入竞赛时锁定一次幕距 */
    function lockChallengeScreen() {
      lockedScreen = 16 + Math.round(Math.random() * 12); // 16–28 cm
      SCREEN_DIST_CM = lockedScreen;
      challengeWon = false;
      sliderU.value = '30';
      sliderF.value = '12';
      valU.textContent = '30 cm';
      valF.textContent = '12 cm';
      refreshLensGoals();
      drawScene(getU(), getF());
      observeResult.innerHTML = '急单已锁定幕距 ' + SCREEN_DIST_CM + ' cm（本局不变）';
      observeResult.style.color = '#94a3b8';
      winMessage.style.display = 'none';
      hintMessage.style.display = 'none';
    }

    function applyExploreScreen() {
      lockedScreen = null;
      challengeWon = false;
      SCREEN_DIST_CM = 22;
      sliderU.value = '30';
      sliderF.value = '12';
      valU.textContent = '30 cm';
      valF.textContent = '12 cm';
      refreshLensGoals();
      drawScene(getU(), getF());
      observeResult.innerHTML = '自由试映：调节后观察成像落点。';
      observeResult.style.color = '#94a3b8';
      winMessage.style.display = 'none';
      hintMessage.style.display = 'none';
    }

    window.__lensApplyMode = function(mode) {
      playMode = mode === 'challenge' ? 'challenge' : 'explore';
      if (playMode === 'challenge') lockChallengeScreen();
      else applyExploreScreen();
    };
/* BATCH6-FIXED-20260724 FixedChallenge */`
    );
  }

  h = h.replace(
    `      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillText('光学导轨', W * 0.08, H * 0.9);`,
    `      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillText('广场放映导轨', W * 0.08, H * 0.9);`
  );
  h = h.replace(`ctx.fillText('光屏', L.screenX - 12, L.axisY + screenH/2 + 18);`, `ctx.fillText('幕布', L.screenX - 12, L.axisY + screenH/2 + 18);`);
  h = h.replace(
    `      ctx.fillStyle = onScreen ? '#86efac' : '#fda4af';
      ctx.fillText(onScreen ? '像已对准光屏' : '像未落在光屏', boxX + 10, boxY + 38);`,
    `      ctx.fillStyle = onScreen ? '#86efac' : '#fda4af';
      if (playMode === 'challenge') {
        ctx.fillText(onScreen ? '像已对准幕布' : ('像未落幕 · 幕距 ' + SCREEN_DIST_CM + ' cm'), boxX + 10, boxY + 38);
      } else {
        ctx.fillText(onScreen ? '像碰巧落在参考幕' : '探究观察成像落点', boxX + 10, boxY + 38);
      }`
  );

  h = h.replace(
    `    function handleTest() {
      const u = getU();
      const f = getF();
      const onScreen = isImageOnScreen(u, f);
      const hintKey = getHintKey(u, f);
      const winOk = onScreen;

      // 更新UI
      updateObserveAndWin();

      // 埋点 snapshot
      const controls = {
        's-object-distance': u,
        's-focal-length': f
      };
      try {
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
    }

    function handleReset() {
      sliderU.value = 30;
      sliderF.value = 12;
      valU.textContent = '30 cm';
      valF.textContent = '12 cm';
      winMessage.style.display = 'none';
      hintMessage.style.display = 'none';
      observeResult.innerHTML = '等待测试…';
      observeResult.style.color = '#2d3748';
      drawScene(getU(), getF());
    }`,
    `    function handleTest() {
      const u = getU();
      const f = getF();
      const onScreen = isImageOnScreen(u, f);
      const hintKey = getHintKey(u, f);
      const controls = {
        's-object-distance': u,
        's-focal-length': f
      };
      function emit(type, payload) {
        try { if (window.PlatformTraceAdapter) { window.PlatformTraceAdapter.record(type, payload); return; } } catch(e) {}
        try { if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter) { window.parent.PlatformTraceAdapter.record(type, payload); } } catch(e) {}
      }

      if (playMode === 'explore') {
        observeResult.innerHTML = onScreen
          ? '当前像落在参考幕附近 · 继续对比物距/焦距（探究不要求命中）'
          : ('观察中：' + hintKey + ' · 探究不要求固定幕距');
        observeResult.style.color = '#94a3b8';
        winMessage.style.display = 'none';
        hintMessage.style.display = 'none';
        drawScene(u, f);
        emit('snapshot', { controls: controls, winOk: false, hintKey: 'explore_observe' });
        return;
      }

      updateObserveAndWin();
      const winOk = onScreen;
      if (winOk) {
        if (!challengeWon) {
          challengeWon = true;
          if (typeof window.__craftShowWin === 'function') {
            window.__craftShowWin('幕距本局锁定。物距、像距与焦距满足透镜成像公式；像成在幕布上时幕距即像距。');
          }
        }
        observeResult.innerHTML = '急单完成：像对准锁定幕距 ' + SCREEN_DIST_CM + ' cm。';
      } else {
        // FixedChallenge：失败不换幕距
        observeResult.innerHTML = '未对准 · 幕距仍锁定 ' + SCREEN_DIST_CM + ' cm（' + hintKey + '）';
      }
      try {
        emit('snapshot', { controls: controls, winOk: winOk, hintKey: hintKey });
        if (winOk) emit('win', { winOk: true });
      } catch (e) {}
    }

    function handleReset() {
      sliderU.value = 30;
      sliderF.value = 12;
      valU.textContent = '30 cm';
      valF.textContent = '12 cm';
      winMessage.style.display = 'none';
      hintMessage.style.display = 'none';
      observeResult.innerHTML = playMode === 'challenge' && lockedScreen != null
        ? ('已重置滑条 · 幕距仍锁定 ' + SCREEN_DIST_CM + ' cm')
        : '等待测试…';
      observeResult.style.color = '#94a3b8';
      drawScene(getU(), getF());
    }`
  );

  // init goals
  h = h.replace(
    `    drawScene(getU(), getF());
  })();`,
    `    refreshLensGoals();
    drawScene(getU(), getF());
  })();`
  );

  h = ensureHook(h, '__lensApplyMode');
  writeBoth('透镜.html', 'thin-lens-implicit', h);
})();

console.log('gas+lens done');
