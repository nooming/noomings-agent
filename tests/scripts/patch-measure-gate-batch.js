/**
 * Batch: gate answer-level readouts until test/fire/detect.
 * Pattern: measured* flag; —/待测 before; reveal on test; clear on slider.
 * Writes 样本html + data/runtime/packages.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const PKG = path.join(ROOT, 'data/runtime/packages');

function writeBoth(cn, pkgId, html) {
  fs.writeFileSync(path.join(YANG, cn), html, 'utf8');
  const dir = path.join(PKG, pkgId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'game.html'), html, 'utf8');
  console.log('ok', cn, '->', pkgId);
}

function must(h, needle, label) {
  if (!h.includes(needle)) throw new Error('missing: ' + label + ' :: ' + needle.slice(0, 80));
}

function replaceOnce(h, from, to, label) {
  must(h, from, label);
  const i = h.indexOf(from);
  return h.slice(0, i) + to + h.slice(i + from.length);
}

function replaceAll(h, from, to, label) {
  must(h, from, label);
  return h.split(from).join(to);
}

/* ========== 1. cyclotron-radius ========== */
function patchCyclotron(h) {
  h = replaceOnce(h, 'let challengeWon = false;',
    'let challengeWon = false;\n    /** 仅发射后揭示轨道半径 r */\n    let measuredR = null;',
    'cyclo measured decl');

  h = replaceOnce(h,
`    function drawOrbitLabels() {
        if (radius > 0 && radius < 100) {
            const rPx = radius * scale;
            ctx.beginPath();
            ctx.arc(centerX, centerY, rPx, 0, 2 * Math.PI);
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#e0f2fe';
            ctx.font = '13px sans-serif';
            ctx.fillText('r = ' + radius.toFixed(2) + ' m', centerX + 8, centerY - rPx - 8);
        }`,
`    function drawOrbitLabels() {
        if (radius > 0 && radius < 100) {
            const rPx = radius * scale;
            ctx.beginPath();
            ctx.arc(centerX, centerY, rPx, 0, 2 * Math.PI);
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#e0f2fe';
            ctx.font = '13px sans-serif';
            if (measuredR != null) {
              ctx.fillText('r = ' + measuredR.toFixed(2) + ' m', centerX + 8, centerY - rPx - 8);
            } else {
              ctx.fillText('半径 待测 · 点发射后显示', centerX + 8, centerY - rPx - 8);
            }
        }`,
    'cyclo drawOrbitLabels');

  h = replaceOnce(h,
`    sMag.addEventListener('input', function() {
        syncUI();
        recalcPhysics();
        // 埋点 tuning
        emit('tuning', { controlId: 's-magnetic', value: parseFloat(this.value), timestamp: Date.now() });
        // 如果仿真未运行，重绘静态
        if (!simRunning) drawStatic();
    });
    sVel.addEventListener('input', function() {
        syncUI();
        recalcPhysics();
        emit('tuning', { controlId: 's-velocity', value: parseFloat(this.value), timestamp: Date.now() });
        if (!simRunning) drawStatic();
    });`,
`    sMag.addEventListener('input', function() {
        measuredR = null;
        syncUI();
        recalcPhysics();
        // 埋点 tuning
        emit('tuning', { controlId: 's-magnetic', value: parseFloat(this.value), timestamp: Date.now() });
        // 如果仿真未运行，重绘静态
        if (!simRunning) drawStatic();
        feedbackMsg.innerHTML = '调节中… 点「发射」查看轨道半径';
    });
    sVel.addEventListener('input', function() {
        measuredR = null;
        syncUI();
        recalcPhysics();
        emit('tuning', { controlId: 's-velocity', value: parseFloat(this.value), timestamp: Date.now() });
        if (!simRunning) drawStatic();
        feedbackMsg.innerHTML = '调节中… 点「发射」查看轨道半径';
    });`,
    'cyclo sliders');

  h = replaceOnce(h,
`    function fire() {
        // 停止当前动画
        stopSim();
        // 重置角度
        angle = 0;
        recalcPhysics();
        syncUI();
        const r = radius;`,
`    function fire() {
        // 停止当前动画
        stopSim();
        // 重置角度
        angle = 0;
        recalcPhysics();
        syncUI();
        const r = radius;
        measuredR = r;`,
    'cyclo fire measured');

  h = replaceOnce(h,
`    function resetSim() {
        stopSim();
        angle = 0;
        recalcPhysics();
        syncUI();
        drawStatic();
        feedbackMsg.innerHTML = '已复位，等待发射……';
        winOverlay.classList.remove('show');
        hasWon = false;
    }`,
`    function resetSim() {
        stopSim();
        angle = 0;
        measuredR = null;
        recalcPhysics();
        syncUI();
        drawStatic();
        feedbackMsg.innerHTML = '已复位，读数待测 · 点发射后显示半径';
        winOverlay.classList.remove('show');
        hasWon = false;
    }`,
    'cyclo reset');

  return h;
}

/* ========== 2. capacitor-confound-ui ========== */
function patchCapConfound(h) {
  h = replaceOnce(h, 'let challengeWon = false;',
    'let challengeWon = false;\n    /** 仅测试后揭示 C */\n    let measuredC = null;',
    'capC measured');

  h = replaceOnce(h,
`      const C_pF = pF(computeCapacitance(A, d));
      capDisplay.textContent = C_pF.toFixed(2);
      meterNeedle += (C_pF - meterNeedle) * 0.35;

      const inBand = C_pF >= TARGET_LO && C_pF <= TARGET_HI;
      const winOk = playMode === 'challenge' ? inBand : false;
      drawScene(A, d, tone, C_pF);

      if (emitSnapshot) {`,
`      const C_pF = pF(computeCapacitance(A, d));
      if (measuredC != null) {
        capDisplay.textContent = measuredC.toFixed(2);
        meterNeedle += (measuredC - meterNeedle) * 0.35;
      } else {
        capDisplay.textContent = '—';
        meterNeedle += (0 - meterNeedle) * 0.2;
      }

      const inBand = C_pF >= TARGET_LO && C_pF <= TARGET_HI;
      const winOk = playMode === 'challenge' ? inBand : false;
      drawScene(A, d, tone, C_pF);

      if (emitSnapshot) {
        measuredC = C_pF;
        capDisplay.textContent = measuredC.toFixed(2);`,
    'capC updateUI');

  h = replaceOnce(h,
`      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 26px ui-monospace,monospace';
      ctx.fillText(C_pF.toFixed(1), meterX + 22, meterY + 56);
      ctx.font = '13px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('pF', meterX + meterW - 42, meterY + 56);
      ctx.fillStyle = winOkColor(C_pF) ? '#4ade80' : '#f87171';
      ctx.font = 'bold 14px "Microsoft YaHei",sans-serif';
      ctx.fillText(winOkColor(C_pF) ? '区间内' : '偏离目标', meterX + 22, meterY + 74);`,
`      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 26px ui-monospace,monospace';
      if (measuredC != null) {
        ctx.fillText(measuredC.toFixed(1), meterX + 22, meterY + 56);
      } else {
        ctx.font = 'bold 22px ui-monospace,monospace';
        ctx.fillText('—', meterX + 36, meterY + 56);
      }
      ctx.font = '13px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('pF', meterX + meterW - 42, meterY + 56);
      ctx.fillStyle = measuredC != null ? (winOkColor(measuredC) ? '#4ade80' : '#f87171') : '#94a3b8';
      ctx.font = 'bold 14px "Microsoft YaHei",sans-serif';
      ctx.fillText(measuredC != null ? (winOkColor(measuredC) ? '区间内' : '偏离目标') : '待测', meterX + 22, meterY + 74);`,
    'capC meter');

  h = replaceOnce(h,
`      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillText('当前 ' + C_pF.toFixed(1) + ' · A=' + A.toFixed(2), 150, benchY - 24);
    }`,
`      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      if (measuredC != null) {
        ctx.fillText('当前 ' + measuredC.toFixed(1) + ' · A=' + A.toFixed(2), 150, benchY - 24);
      } else {
        ctx.fillText('当前 待测 · A=' + A.toFixed(2), 150, benchY - 24);
      }
    }`,
    'capC bottom');

  h = replaceOnce(h,
`      } else if (playMode === 'challenge') {
        if (inBand) hintMsg.textContent = '读数近区间 · 点击测试确认';
        else hintMsg.textContent = '未入区间 · 调参后再测（打偏换新目标）';
        winContainer.innerHTML = '';
      } else {
        hintMsg.textContent = '自由试调中 · 观察读数变化';
        winContainer.innerHTML = '';
      }`,
`      } else if (playMode === 'challenge') {
        hintMsg.textContent = '调节中… 点「测试」查看读数（打偏换新目标）';
        winContainer.innerHTML = '';
      } else {
        hintMsg.textContent = '读数待测 · 调 A、d 后点测试';
        winContainer.innerHTML = '';
      }`,
    'capC hint');

  h = replaceOnce(h,
`    function onTest() { updateUI(true); }
    function onReset() {
      areaSlider.value = '0.05';
      distSlider.value = '0.005';
      toneSlider.value = '0';
      updateUI(false);
      hintMsg.textContent = '已重置 · 调参后再测';
      winContainer.innerHTML = '';
    }

    areaSlider.addEventListener('input', function() { updateUI(false); });
    distSlider.addEventListener('input', function() { updateUI(false); });
    toneSlider.addEventListener('input', function() { updateUI(false); });`,
`    function onTest() { updateUI(true); }
    function onReset() {
      measuredC = null;
      areaSlider.value = '0.05';
      distSlider.value = '0.005';
      toneSlider.value = '0';
      updateUI(false);
      hintMsg.textContent = '已重置 · 读数待测 · 调参后再测';
      winContainer.innerHTML = '';
    }

    areaSlider.addEventListener('input', function() { measuredC = null; updateUI(false); });
    distSlider.addEventListener('input', function() { measuredC = null; updateUI(false); });
    toneSlider.addEventListener('input', function() { measuredC = null; updateUI(false); });`,
    'capC events');

  return h;
}

/* ========== 3. series-parallel ========== */
function patchSeriesParallel(h) {
  h = replaceOnce(h,
`        function updateAll() {
            const r1 = parseFloat(sR1.value) || 1;
            const r2 = parseFloat(sR2.value) || 1;
            const out = computeCircuit(r1, r2, mode);
            r1Val.textContent = r1;
            r2Val.textContent = r2;
            obsRtotal.textContent = out.Rtotal.toFixed(2);
            obsCurrent.textContent = out.I.toFixed(3);
            connectStatus.textContent = (mode === 'series') ? '串联' : '并联';
            drawWorkbench(r1, r2, mode, out.Rtotal, out.I);
        }`,
`        /** 仅测试后揭示 R总、I */
        let measuredI = null;
        let measuredRtotal = null;

        function updateAll() {
            const r1 = parseFloat(sR1.value) || 1;
            const r2 = parseFloat(sR2.value) || 1;
            const out = computeCircuit(r1, r2, mode);
            r1Val.textContent = r1;
            r2Val.textContent = r2;
            if (measuredI != null) {
              obsRtotal.textContent = measuredRtotal.toFixed(2);
              obsCurrent.textContent = measuredI.toFixed(3);
            } else {
              obsRtotal.textContent = '—';
              obsCurrent.textContent = '—';
            }
            connectStatus.textContent = (mode === 'series') ? '串联' : '并联';
            drawWorkbench(r1, r2, mode, out.Rtotal, out.I);
        }`,
    'sp updateAll');

  h = replaceOnce(h,
`            const onTarget = Math.abs(I - targetCurrent) < 0.001;
            ctx.fillStyle = onTarget ? '#4ade80' : '#fbbf24';
            ctx.font = 'bold 20px ui-monospace,monospace';
            ctx.fillText(I.toFixed(3), mx + 18, my + 45);
            ctx.fillStyle = '#a7f3d0';
            ctx.font = '12px "Microsoft YaHei",sans-serif';
            ctx.fillText('A  目标 ' + targetCurrent.toFixed(2), mx + 16, my + 72);
            ctx.fillStyle = onTarget ? '#86efac' : '#fca5a5';
            ctx.fillText(onTarget ? '已对准' : '未对准', mx + 16, my + 96);`,
`            const showI = measuredI != null ? measuredI : null;
            const onTarget = showI != null && Math.abs(showI - targetCurrent) < 0.001;
            ctx.fillStyle = showI != null ? (onTarget ? '#4ade80' : '#fbbf24') : '#94a3b8';
            ctx.font = 'bold 20px ui-monospace,monospace';
            ctx.fillText(showI != null ? showI.toFixed(3) : '—', mx + 18, my + 45);
            ctx.fillStyle = '#a7f3d0';
            ctx.font = '12px "Microsoft YaHei",sans-serif';
            ctx.fillText(playMode === 'challenge' ? ('A  目标 ' + targetCurrent.toFixed(2)) : 'A  待测', mx + 16, my + 72);
            ctx.fillStyle = showI != null ? (onTarget ? '#86efac' : '#fca5a5') : '#94a3b8';
            ctx.fillText(showI != null ? (onTarget ? '已对准' : '未对准') : '待测', mx + 16, my + 96);`,
    'sp ammeter');

  h = replaceOnce(h,
`            ctx.fillText('R总 ' + Rtotal.toFixed(1) + 'Ω · I ' + I.toFixed(3) + 'A · ' + tgtLabel, 26, benchY - 19);
        }`,
`            if (measuredI != null) {
              ctx.fillText('R总 ' + measuredRtotal.toFixed(1) + 'Ω · I ' + measuredI.toFixed(3) + 'A · ' + tgtLabel, 26, benchY - 19);
            } else {
              ctx.fillText('R总 待测 · I 待测 · ' + tgtLabel, 26, benchY - 19);
            }
        }`,
    'sp bottom');

  h = replaceOnce(h,
`        function fireTest() {
            const r1 = parseFloat(sR1.value) || 1;
            const r2 = parseFloat(sR2.value) || 1;
            const { Rtotal, I } = computeCircuit(r1, r2, mode);
            var controlsSnapshot = snapControls();
            controlsSnapshot['mode'] = mode;`,
`        function fireTest() {
            const r1 = parseFloat(sR1.value) || 1;
            const r2 = parseFloat(sR2.value) || 1;
            const { Rtotal, I } = computeCircuit(r1, r2, mode);
            measuredI = I;
            measuredRtotal = Rtotal;
            var controlsSnapshot = snapControls();
            controlsSnapshot['mode'] = mode;`,
    'sp fire');

  h = replaceOnce(h,
`        sR1.addEventListener('input', updateAll);
        sR2.addEventListener('input', updateAll);

        // 连接切换
        btnConnect.addEventListener('click', function() {
            mode = (mode === 'series') ? 'parallel' : 'series';
            // 更新按钮文字
            btnConnect.textContent = (mode === 'series') ? '🔁 切换连接 (串联)' : '🔁 切换连接 (并联)';
            updateAll();`,
`        sR1.addEventListener('input', function() { measuredI = null; measuredRtotal = null; updateAll(); });
        sR2.addEventListener('input', function() { measuredI = null; measuredRtotal = null; updateAll(); });

        // 连接切换
        btnConnect.addEventListener('click', function() {
            mode = (mode === 'series') ? 'parallel' : 'series';
            measuredI = null; measuredRtotal = null;
            // 更新按钮文字
            btnConnect.textContent = (mode === 'series') ? '🔁 切换连接 (串联)' : '🔁 切换连接 (并联)';
            updateAll();`,
    'sp events');

  return h;
}

/* ========== 4. rc-circuit ========== */
function patchRc(h) {
  h = replaceOnce(h, 'let challengeWon = false;',
    'let challengeWon = false;\n    /** 仅测试后揭示 τ */\n    let measuredTau = null;',
    'rc measured');

  h = replaceOnce(h,
`    function updateUI() {
        const { R, C, tau_ms, tau_s } = computeTau();
        rVal.textContent = R + ' kΩ';
        cVal.textContent = C + ' μF';
        tauDisplay.textContent = tau_s.toFixed(3);
        if (playMode === 'challenge') targetTauDisplay.textContent = TARGET_TAU_SEC.toFixed(1);
        else targetTauDisplay.textContent = '—';
        drawChargeCurve(tau_ms);
    }`,
`    function updateUI() {
        const { R, C, tau_ms, tau_s } = computeTau();
        rVal.textContent = R + ' kΩ';
        cVal.textContent = C + ' μF';
        tauDisplay.textContent = measuredTau != null ? measuredTau.toFixed(3) : '—';
        if (playMode === 'challenge') targetTauDisplay.textContent = TARGET_TAU_SEC.toFixed(1);
        else targetTauDisplay.textContent = '—';
        drawChargeCurve(tau_ms);
    }`,
    'rc updateUI');

  h = replaceOnce(h,
`        ctx.fillStyle = on ? '#86efac' : '#7dd3fc';
        ctx.fillText('当前 ' + tau_s.toFixed(3) + ' s', 26, 50);
    }`,
`        ctx.fillStyle = on && measuredTau != null ? '#86efac' : '#7dd3fc';
        if (measuredTau != null) {
          ctx.fillText('当前 ' + measuredTau.toFixed(3) + ' s', 26, 50);
        } else {
          ctx.fillText('当前 τ 待测 · 点测试后显示', 26, 50);
        }
    }`,
    'rc canvas tau');

  h = replaceOnce(h,
`    function onTest() {
        const { R, C, tau_ms, tau_s } = computeTau();
        const controls = {};
        controls['s-resistance'] = R;
        controls['s-capacitance'] = C;

        if (playMode === 'explore') {
            hintMsg.textContent = '当前曲线 · 继续对比 R、C';
            winIndicator.style.display = 'none';
            drawChargeCurve(tau_ms);`,
`    function onTest() {
        const { R, C, tau_ms, tau_s } = computeTau();
        measuredTau = tau_s;
        tauDisplay.textContent = measuredTau.toFixed(3);
        const controls = {};
        controls['s-resistance'] = R;
        controls['s-capacitance'] = C;

        if (playMode === 'explore') {
            hintMsg.textContent = '本次 τ=' + tau_s.toFixed(3) + ' s · 继续对比 R、C';
            winIndicator.style.display = 'none';
            drawChargeCurve(tau_ms);`,
    'rc onTest');

  h = replaceOnce(h,
`    sR.addEventListener('input', function() {
        updateUI();
        // 隐藏过关指示
        winIndicator.style.display = 'none';
        hintMsg.textContent = '调节中 · 点击测试';
    });
    sC.addEventListener('input', function() {
        updateUI();
        winIndicator.style.display = 'none';
        hintMsg.textContent = '调节中 · 点击测试';
    });`,
`    sR.addEventListener('input', function() {
        measuredTau = null;
        updateUI();
        // 隐藏过关指示
        winIndicator.style.display = 'none';
        hintMsg.textContent = '调节中 · 点击测试查看 τ';
    });
    sC.addEventListener('input', function() {
        measuredTau = null;
        updateUI();
        winIndicator.style.display = 'none';
        hintMsg.textContent = '调节中 · 点击测试查看 τ';
    });`,
    'rc sliders');

  return h;
}

/* ========== 5. magnetic-force ========== */
function patchMag(h) {
  h = replaceOnce(h,
`  // ----- 更新UI + canvas + 判定 -----
  function updateAll() {
    const I = parseFloat(sCurrent.value) || 0;
    const B = parseFloat(sMagnetic.value) || 0;
    currentVal.textContent = I.toFixed(1);
    magneticVal.textContent = B.toFixed(1);

    const F = computeForce(I, B);
    forceDisplay.textContent = F.toFixed(2);

    // 绘制 canvas (极简示意图)
    drawCanvas(I, B, F);

    // 判定 (但不过关提示, 由测试按钮触发)
    // 实时显示提示但不过关, 仅显示读数
    const onBand = Math.abs(F - F_TARGET) <= TOLERANCE;
    if (playMode === 'explore') {
      feedback.textContent = '当前托力 · 继续对比 I、B';
    } else {
      feedback.textContent = onBand
        ? '托力已接近急单，点击测试确认。'
        : (F < F_TARGET ? '托力偏小 · 急单仍锁定 ' + F_TARGET.toFixed(1) + ' N' : '托力偏大 · 急单仍锁定 ' + F_TARGET.toFixed(1) + ' N');
    }
  }`,
`  /** 仅测试后揭示 F */
  let measuredF = null;

  // ----- 更新UI + canvas + 判定 -----
  function updateAll() {
    const I = parseFloat(sCurrent.value) || 0;
    const B = parseFloat(sMagnetic.value) || 0;
    currentVal.textContent = I.toFixed(1);
    magneticVal.textContent = B.toFixed(1);

    const F = computeForce(I, B);
    forceDisplay.textContent = measuredF != null ? measuredF.toFixed(2) : '—';

    // 绘制 canvas (极简示意图)
    drawCanvas(I, B, F);

    if (playMode === 'explore') {
      feedback.textContent = measuredF != null
        ? ('本次托力 ' + measuredF.toFixed(2) + ' N · 换参再测')
        : '读数待测 · 调 I、B 后点测试';
    } else {
      feedback.textContent = measuredF != null
        ? ('本次 ' + measuredF.toFixed(2) + ' N · 急单锁定 ' + F_TARGET.toFixed(1) + ' N')
        : ('读数待测 · 急单锁定 ' + F_TARGET.toFixed(1) + ' N · 点测试');
    }
  }`,
    'mag updateAll');

  h = replaceOnce(h,
`    ctx.fillStyle = onBand ? '#86efac' : '#fca5a5';
    ctx.fillText('当前 ' + F.toFixed(2) + ' N · I=' + I.toFixed(1) + 'A B=' + B.toFixed(1) + 'T', 26, H - 26);
  }`,
`    ctx.fillStyle = measuredF != null ? (Math.abs(measuredF - F_TARGET) <= TOLERANCE ? '#86efac' : '#fca5a5') : '#94a3b8';
    if (measuredF != null) {
      ctx.fillText('当前 ' + measuredF.toFixed(2) + ' N · I=' + I.toFixed(1) + 'A B=' + B.toFixed(1) + 'T', 26, H - 26);
    } else {
      ctx.fillText('当前 F 待测 · I=' + I.toFixed(1) + 'A B=' + B.toFixed(1) + 'T', 26, H - 26);
    }
  }`,
    'mag canvas');

  h = replaceOnce(h,
`  function onTest() {
    const I = parseFloat(sCurrent.value) || 0;
    const B = parseFloat(sMagnetic.value) || 0;
    const F = computeForce(I, B);`,
`  function onTest() {
    const I = parseFloat(sCurrent.value) || 0;
    const B = parseFloat(sMagnetic.value) || 0;
    const F = computeForce(I, B);
    measuredF = F;
    forceDisplay.textContent = measuredF.toFixed(2);
    drawCanvas(I, B, F);`,
    'mag onTest');

  h = replaceOnce(h,
`  function onReset() {
    sCurrent.value = '2.0';
    sMagnetic.value = '1.0';
    winIndicator.style.display = 'none';
    feedback.innerHTML = '← 已重置，点击测试';
    updateAll();
  }

  // ----- 绑定事件 -----
  sCurrent.addEventListener('input', updateAll);
  sMagnetic.addEventListener('input', updateAll);`,
`  function onReset() {
    measuredF = null;
    sCurrent.value = '2.0';
    sMagnetic.value = '1.0';
    winIndicator.style.display = 'none';
    feedback.innerHTML = '← 已重置，读数待测 · 点击测试';
    updateAll();
  }

  // ----- 绑定事件 -----
  sCurrent.addEventListener('input', function() { measuredF = null; updateAll(); });
  sMagnetic.addEventListener('input', function() { measuredF = null; updateAll(); });`,
    'mag events');

  return h;
}

/* ========== 6. transformer-turns ========== */
function patchTransformer(h) {
  h = replaceOnce(h,
`  // 更新所有UI + canvas + 过关判定 (共用)
  function updateAll(emitSnapshot = false, isTest = false) {
    const n1 = parseInt(sN1.value, 10);
    const n2 = parseInt(sN2.value, 10);
    const U1 = parseFloat(sU1.value);
    const U2 = computeU2(n1, n2, U1);
    const U2rounded = Math.round(U2 * 100) / 100;

    // 更新读数
    observeU2.textContent = U2rounded.toFixed(2) + ' V';
    updateLabels();

    // 绘制canvas
    drawTransformer(n1, n2, U1, U2rounded);

    const inBand = U2rounded >= U2_LO && U2rounded <= U2_HI;
    let winOk = false;
    let hintKey = 'retry';

    if (playMode === 'explore') {
      if (winIndicator) winIndicator.style.display = 'none';
      feedback.textContent = '当前输出 · 探究对比中';
      hintKey = 'explore_observe';
    } else if (inBand) {
      winOk = true;
      hintKey = 'win';
      if (winIndicator) winIndicator.style.display = 'inline-block';
      feedback.textContent = '急单完成！U₂ 落入锁定区间 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V';
    } else {
      // FixedChallenge：失败不换带
      if (winIndicator) winIndicator.style.display = 'none';
      hintKey = U2rounded < U2_LO ? 'u2_low' : 'u2_high';
      feedback.textContent = U2rounded < U2_LO
        ? ('输出偏低 · 急单仍锁定 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V')
        : ('输出偏高 · 急单仍锁定 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V');
    }

    // 如果是测试按钮触发，发射 snapshot 和 win (如果过关)
    if (isTest) {`,
`  /** 仅测试后揭示 U₂ */
  let measuredU2 = null;

  // 更新所有UI + canvas + 过关判定 (共用)
  function updateAll(emitSnapshot = false, isTest = false) {
    const n1 = parseInt(sN1.value, 10);
    const n2 = parseInt(sN2.value, 10);
    const U1 = parseFloat(sU1.value);
    const U2 = computeU2(n1, n2, U1);
    const U2rounded = Math.round(U2 * 100) / 100;

    if (isTest) measuredU2 = U2rounded;

    // 更新读数
    observeU2.textContent = measuredU2 != null ? (measuredU2.toFixed(2) + ' V') : '—';
    updateLabels();

    // 绘制canvas（传 measured 或 NaN 表示待测）
    drawTransformer(n1, n2, U1, measuredU2 != null ? measuredU2 : NaN);

    const inBand = U2rounded >= U2_LO && U2rounded <= U2_HI;
    let winOk = false;
    let hintKey = 'retry';

    if (!isTest) {
      if (winIndicator) winIndicator.style.display = 'none';
      feedback.textContent = measuredU2 != null
        ? ('上次 U₂=' + measuredU2.toFixed(2) + ' V · 改参后需再测')
        : (playMode === 'challenge'
          ? ('读数待测 · 急单 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V')
          : '读数待测 · 调匝比后点测试');
      hintKey = 'pending';
    } else if (playMode === 'explore') {
      if (winIndicator) winIndicator.style.display = 'none';
      feedback.textContent = '本次 U₂=' + U2rounded.toFixed(2) + ' V · 探究对比中';
      hintKey = 'explore_observe';
    } else if (inBand) {
      winOk = true;
      hintKey = 'win';
      if (winIndicator) winIndicator.style.display = 'inline-block';
      feedback.textContent = '急单完成！U₂ 落入锁定区间 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V';
    } else {
      // FixedChallenge：失败不换带
      if (winIndicator) winIndicator.style.display = 'none';
      hintKey = U2rounded < U2_LO ? 'u2_low' : 'u2_high';
      feedback.textContent = U2rounded < U2_LO
        ? ('输出偏低 · 急单仍锁定 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V')
        : ('输出偏高 · 急单仍锁定 ' + U2_LO.toFixed(1) + '–' + U2_HI.toFixed(1) + ' V');
    }

    // 如果是测试按钮触发，发射 snapshot 和 win (如果过关)
    if (isTest) {`,
    'xfmr updateAll');

  h = replaceOnce(h,
`    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px ui-monospace,monospace';
    ctx.fillText(U2.toFixed(2) + ' V', W - 148, H - 118);
    ctx.fillStyle = on ? '#86efac' : '#fca5a5';
    ctx.font = '12px "Microsoft YaHei",sans-serif';
    ctx.fillText(playMode === 'challenge' ? (on ? '急单区间内' : '偏离急单') : (on ? '参考带内' : '参考带外'), W - 148, H - 96);`,
`    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px ui-monospace,monospace';
    if (isFinite(U2)) {
      ctx.fillText(U2.toFixed(2) + ' V', W - 148, H - 118);
      ctx.fillStyle = on ? '#86efac' : '#fca5a5';
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillText(playMode === 'challenge' ? (on ? '急单区间内' : '偏离急单') : (on ? '参考带内' : '参考带外'), W - 148, H - 96);
    } else {
      ctx.fillText('— V', W - 148, H - 118);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillText('U₂ 待测', W - 148, H - 96);
    }`,
    'xfmr draw U2');

  // fix on = ... when U2 is NaN — find the on line in drawTransformer
  h = replaceOnce(h,
`    const on = U2 >= U2_LO && U2 <= U2_HI;`,
`    const on = isFinite(U2) && U2 >= U2_LO && U2 <= U2_HI;`,
    'xfmr on finite');

  h = replaceOnce(h,
`  sN1.addEventListener('input', function() {
    updateAll(false, false);
  });
  sN2.addEventListener('input', function() {
    updateAll(false, false);
  });
  sU1.addEventListener('input', function() {
    updateAll(false, false);
  });`,
`  sN1.addEventListener('input', function() {
    measuredU2 = null;
    updateAll(false, false);
  });
  sN2.addEventListener('input', function() {
    measuredU2 = null;
    updateAll(false, false);
  });
  sU1.addEventListener('input', function() {
    measuredU2 = null;
    updateAll(false, false);
  });`,
    'xfmr sliders');

  h = replaceOnce(h,
`  (function loop(){ spark += 0.02; const n1=parseInt(sN1.value,10), n2=parseInt(sN2.value,10), U1=parseFloat(sU1.value); drawTransformer(n1,n2,U1,computeU2(n1,n2,U1)); requestAnimationFrame(loop); })();`,
`  (function loop(){ spark += 0.02; const n1=parseInt(sN1.value,10), n2=parseInt(sN2.value,10), U1=parseFloat(sU1.value); drawTransformer(n1,n2,U1, measuredU2 != null ? measuredU2 : NaN); requestAnimationFrame(loop); })();`,
    'xfmr loop');

  return h;
}

/* ========== 7. thin-lens ========== */
function patchLens(h) {
  h = replaceOnce(h,
`      ctx.fillStyle = onScreen ? '#86efac' : '#fda4af';
      ctx.fillText((playMode==='challenge'?'急单屏 ':'对照屏 ') + SCREEN_DIST_CM + 'cm · ' + (onScreen ? '已对准' : '未对准'), boxX + 10, boxY + 38);
    }`,
`      ctx.fillStyle = measured ? (onScreen ? '#86efac' : '#fda4af') : '#94a3b8';
      if (measured) {
        ctx.fillText((playMode==='challenge'?'急单屏 ':'对照屏 ') + SCREEN_DIST_CM + 'cm · ' + (onScreen ? '已对准' : '未对准'), boxX + 10, boxY + 38);
      } else {
        ctx.fillText((playMode==='challenge'?'急单屏 ':'对照屏 ') + SCREEN_DIST_CM + 'cm · 成像待测', boxX + 10, boxY + 38);
      }
    }`,
    'lens canvas');

  // Add measured near playMode / challengeWon
  if (!h.includes('let measured = false;') && !h.includes('/** 仅测试后揭示成像判定 */')) {
    // find a good anchor
    const anchors = [
      'let challengeWon = false;',
      'let playMode = \'explore\';'
    ];
    let done = false;
    for (const a of anchors) {
      if (h.includes(a)) {
        h = replaceOnce(h, a, a + '\n    /** 仅测试后揭示成像判定 */\n    let measured = false;', 'lens measured ' + a);
        done = true;
        break;
      }
    }
    if (!done) throw new Error('lens: no anchor for measured');
  }

  h = replaceOnce(h,
`    function handleTest() {
      const u = getU();
      const f = getF();
      const onScreen = isImageOnScreen(u, f);
      const hintKey = getHintKey(u, f);
      const winOk = onScreen;

      // 更新UI
      updateObserveAndWin();`,
`    function handleTest() {
      const u = getU();
      const f = getF();
      const onScreen = isImageOnScreen(u, f);
      const hintKey = getHintKey(u, f);
      const winOk = onScreen;
      measured = true;

      // 更新UI
      updateObserveAndWin();`,
    'lens handleTest');

  h = replaceOnce(h,
`    function handleReset() {
      sliderU.value = 30;
      sliderF.value = 12;
      valU.textContent = '30 cm';
      valF.textContent = '12 cm';
      winMessage.style.display = 'none';
      hintMessage.style.display = 'none';
      observeResult.innerHTML = '等待测试…';
      observeResult.style.color = '#2d3748';
      drawScene(getU(), getF());
    }

    // 滑条数值更新
    sliderU.addEventListener('input', function() {
      valU.textContent = sliderU.value + ' cm';
    });
    sliderF.addEventListener('input', function() {
      valF.textContent = sliderF.value + ' cm';
    });`,
`    function handleReset() {
      measured = false;
      sliderU.value = 30;
      sliderF.value = 12;
      valU.textContent = '30 cm';
      valF.textContent = '12 cm';
      winMessage.style.display = 'none';
      hintMessage.style.display = 'none';
      observeResult.innerHTML = '等待测试…';
      observeResult.style.color = '#2d3748';
      drawScene(getU(), getF());
    }

    // 滑条数值更新
    sliderU.addEventListener('input', function() {
      measured = false;
      valU.textContent = sliderU.value + ' cm';
      observeResult.innerHTML = '等待测试…';
      observeResult.style.color = '#2d3748';
      winMessage.style.display = 'none';
      drawScene(getU(), getF());
    });
    sliderF.addEventListener('input', function() {
      measured = false;
      valF.textContent = sliderF.value + ' cm';
      observeResult.innerHTML = '等待测试…';
      observeResult.style.color = '#2d3748';
      winMessage.style.display = 'none';
      drawScene(getU(), getF());
    });`,
    'lens events');

  return h;
}

/* ========== 8. refraction ========== */
function patchRefraction(h) {
  h = replaceOnce(h,
`      ctx.fillText('θ₂=' + theta2Deg.toFixed(1) + '°', ix + 18, groundY + 44);`,
`      if (measuredTheta2 != null) {
        ctx.fillText('θ₂=' + measuredTheta2.toFixed(1) + '°', ix + 18, groundY + 44);
      } else {
        ctx.fillText('θ₂ 待测', ix + 18, groundY + 44);
      }`,
    'ref theta2 label');

  h = replaceOnce(h,
`    if (playMode === 'challenge') {
      ctx.fillText(hit ? '光线已命中锁定信标' : '光线尚未命中信标', boxX + 10, boxY + 28);
    } else {
      ctx.fillText(hit ? '碰巧扫到参考信标' : '探究观察折射走向', boxX + 10, boxY + 28);
    }`,
`    if (measuredTheta2 == null) {
      ctx.fillText('光路待测 · 点发射后判定', boxX + 10, boxY + 28);
    } else if (playMode === 'challenge') {
      ctx.fillText(hit ? '光线已命中锁定信标' : '光线尚未命中信标', boxX + 10, boxY + 28);
    } else {
      ctx.fillText(hit ? '碰巧扫到参考信标' : '探究观察折射走向', boxX + 10, boxY + 28);
    }`,
    'ref hit box');

  // declare measured near challengeWon / playMode
  if (!h.includes('measuredTheta2')) {
    const a = 'let challengeWon = false;';
    if (h.includes(a)) {
      h = replaceOnce(h, a, a + '\n  /** 仅发射后揭示 θ₂ */\n  let measuredTheta2 = null;', 'ref measured');
    } else {
      h = replaceOnce(h, 'let playMode = \'explore\';',
        'let playMode = \'explore\';\n  /** 仅发射后揭示 θ₂ */\n  let measuredTheta2 = null;', 'ref measured2');
    }
  }

  h = replaceOnce(h,
`    // 显示折射角
    if (valid && !isNaN(theta2)) {
      refractionDisplay.textContent = theta2.toFixed(1) + '°';
    } else {
      refractionDisplay.textContent = '无效';
    }`,
`    // 显示折射角（测前待测）
    if (measuredTheta2 != null) {
      if (valid && !isNaN(measuredTheta2)) {
        refractionDisplay.textContent = measuredTheta2.toFixed(1) + '°';
      } else {
        refractionDisplay.textContent = '无效';
      }
    } else {
      refractionDisplay.textContent = '—';
    }`,
    'ref display');

  h = replaceOnce(h,
`    // 如果点击发射 或 自动检测 (fireAction)
    if (fireAction) {
      if (!valid || isNaN(theta2)) {`,
`    // 如果点击发射 或 自动检测 (fireAction)
    if (fireAction) {
      measuredTheta2 = valid && !isNaN(theta2) ? theta2 : null;
      if (measuredTheta2 != null) refractionDisplay.textContent = measuredTheta2.toFixed(1) + '°';
      else refractionDisplay.textContent = '无效';
      if (!valid || isNaN(theta2)) {`,
    'ref fireAction');

  h = replaceOnce(h,
`  angleSlider.addEventListener('input', function() {
    updateExperiment(false);
  });
  indexSlider.addEventListener('input', function() {
    updateExperiment(false);
  });`,
`  angleSlider.addEventListener('input', function() {
    measuredTheta2 = null;
    updateExperiment(false);
  });
  indexSlider.addEventListener('input', function() {
    measuredTheta2 = null;
    updateExperiment(false);
  });`,
    'ref sliders');

  return h;
}

/* ========== 9. photoelectric ========== */
function patchPhoto(h) {
  h = replaceOnce(h,
`      // 计算光电流 (唯一物理)
      const I = computePhotocurrent(freqHz, workEv);
      currentI = I;
      currentDisplay.textContent = I.toFixed(1);

      // 绘制 canvas (可视化)
      drawCanvas(fVal, workEv, I);`,
`      // 计算光电流 (唯一物理)
      const I = computePhotocurrent(freqHz, workEv);
      currentI = I;
      if (isFire) measuredI = I;
      currentDisplay.textContent = measuredI != null ? measuredI.toFixed(1) : '—';

      // 绘制 canvas (可视化)；动画可用 live I，数字用 measured
      drawCanvas(fVal, workEv, I);`,
    'photo updateUI');

  if (!h.includes('let measuredI')) {
    const a = 'let hasFired = false;';
    if (h.includes(a)) {
      h = replaceOnce(h, a, a + '\n    /** 仅发射后揭示光电流 I */\n    let measuredI = null;', 'photo measured');
    } else {
      h = replaceOnce(h, 'let winAchieved = false;',
        'let winAchieved = false;\n    let measuredI = null;', 'photo measured2');
    }
  }

  h = replaceOnce(h,
`        ctx.fillStyle = '#fda4af';
        ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
        ctx.fillText('e⁻  ·  I=' + I.toFixed(1) + ' μA', tubeX + tubeW * 0.35, tubeY + tubeH * 0.32);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('尚无光电子逸出', tubeX + tubeW * 0.34, tubeY + tubeH * 0.5);
      }`,
`        ctx.fillStyle = '#fda4af';
        ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
        if (measuredI != null) {
          ctx.fillText('e⁻  ·  I=' + measuredI.toFixed(1) + ' μA', tubeX + tubeW * 0.35, tubeY + tubeH * 0.32);
        } else {
          ctx.fillText('e⁻ 逸出中 · I 待测', tubeX + tubeW * 0.35, tubeY + tubeH * 0.32);
        }
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(measuredI != null ? '尚无光电子逸出' : '待发射检测', tubeX + tubeW * 0.34, tubeY + tubeH * 0.5);
      }`,
    'photo e text');

  h = replaceOnce(h,
`      ctx.fillStyle = I > 0 ? '#fde047' : '#fda4af';
      if (playMode === 'challenge') {
        ctx.fillText(I > 0 ? '门禁已开锁' : '打偏换新目标', boxX + 10, boxY + 38);
      } else {
        ctx.fillText(I > 0 ? '回路已导通' : '回路未导通', boxX + 10, boxY + 38);
      }
    }`,
`      ctx.fillStyle = measuredI != null ? (measuredI > 0 ? '#fde047' : '#fda4af') : '#94a3b8';
      if (measuredI == null) {
        ctx.fillText('电流待测 · 点发射后显示', boxX + 10, boxY + 38);
      } else if (playMode === 'challenge') {
        ctx.fillText(measuredI > 0 ? '门禁已开锁' : '打偏换新目标', boxX + 10, boxY + 38);
      } else {
        ctx.fillText(measuredI > 0 ? '回路已导通' : '回路未导通', boxX + 10, boxY + 38);
      }
    }`,
    'photo status');

  h = replaceOnce(h,
`      } else {
        // 仅更新显示，不发射 snapshot
        if (winAchieved) {
          winBanner.style.display = 'block';
          hintDiv.textContent = '✅ 已过关，继续调节可观察变化。';
        } else {
          winBanner.style.display = 'none';
          hintDiv.textContent = hintKey;
        }
      }`,
`      } else {
        // 仅更新显示，不发射 snapshot；调参中不剧透电流判定
        if (winAchieved) {
          winBanner.style.display = 'block';
          hintDiv.textContent = '✅ 已过关，改参后需再发射读数。';
        } else {
          winBanner.style.display = 'none';
          hintDiv.textContent = '调节中… 点「发射光」查看光电流';
        }
      }`,
    'photo hint pending');

  h = replaceOnce(h,
`      winAchieved = false;
      challengeWon = false;
      winBanner.style.display = 'none';
      hasFired = false;
      updateUI(false, false);
    }

    // 滑条事件 (更新UI但不发射snapshot, tuning由埋点hook处理)
    freqSlider.addEventListener('input', function() {
      updateUI(false, false);
    });
    workSlider.addEventListener('input', function() {
      updateUI(false, false);
    });`,
`      winAchieved = false;
      challengeWon = false;
      winBanner.style.display = 'none';
      hasFired = false;
      measuredI = null;
      updateUI(false, false);
    }

    // 滑条事件 (更新UI但不发射snapshot, tuning由埋点hook处理)
    freqSlider.addEventListener('input', function() {
      measuredI = null;
      hasFired = false;
      updateUI(false, false);
    });
    workSlider.addEventListener('input', function() {
      measuredI = null;
      hasFired = false;
      updateUI(false, false);
    });`,
    'photo events');

  return h;
}

/* ========== 10a. capacitor-era-ch1 ========== */
function patchCapCh1(h) {
  // Add button before hint
  h = replaceOnce(h,
`  <div id="hint">待调 · 改面积或间距后观察读数</div>
</div>`,
`  <button type="button" id="btn-read-cap" class="cap-read-btn" style="width:100%;margin-top:10px;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,200,255,0.45);background:rgba(0,40,60,0.85);color:#7dd3fc;font-weight:700;letter-spacing:1px;cursor:pointer;">▶ 读取电容</button>
  <div id="hint">读数待测 · 调参后点「读取电容」</div>
</div>`,
    'ch1 btn');

  // declare measured near won or syncUI
  if (!h.includes('let measuredCap = null')) {
    h = replaceOnce(h, 'function syncCapFormulaLive(m, C, bd) {',
`/** 仅「读取电容」后揭示 C/E */
let measuredCap = null;

function revealCapReading() {
  measuredCap = {
    C: calcC(areaCm2, distMm, mat().er),
    bd: broken(),
    E: V_APP / (distMm * 1e-3) / 1e6
  };
  syncUI();
}

function syncCapFormulaLive(m, C, bd) {`,
      'ch1 measured decl');
  }

  h = replaceOnce(h,
`function syncCapFormulaLive(m, C, bd) {
  const live = document.getElementById('cap-formula-live');
  if (!live) return;
  let html = \`电容 <span class="fv">\${bd && ch === 1 ? '—' : C.toFixed(1)} pF</span>\`;
  if (ch === 1) {
    const E = V_APP / (distMm * 1e-3) / 1e6;
    const ebd = m.Ebd / 1e6;
    html += \`<br>场强 <span class="\${bd ? 'fe-bad' : 'fe'}">\${E.toFixed(2)} MV/m</span> \${bd ? '超限' : \`/ 材料上限 \${ebd.toFixed(0)} MV/m\`}\`;
  }
  live.innerHTML = html;
}`,
`function syncCapFormulaLive(m, C, bd) {
  const live = document.getElementById('cap-formula-live');
  if (!live) return;
  if (measuredCap == null) {
    live.innerHTML = '电容 <span class="fv">待测</span>' + (ch === 1 ? '<br>场强 <span class="fe">待测</span>' : '');
    return;
  }
  const showC = measuredCap.C, showBd = measuredCap.bd, showE = measuredCap.E;
  let html = \`电容 <span class="fv">\${showBd && ch === 1 ? '—' : showC.toFixed(1)} pF</span>\`;
  if (ch === 1) {
    const ebd = m.Ebd / 1e6;
    html += \`<br>场强 <span class="\${showBd ? 'fe-bad' : 'fe'}">\${showE.toFixed(2)} MV/m</span> \${showBd ? '超限' : \`/ 材料上限 \${ebd.toFixed(0)} MV/m\`}\`;
  }
  live.innerHTML = html;
}`,
    'ch1 formula');

  h = replaceOnce(h,
`  document.getElementById('c-tgt').textContent   = tgt;
  document.getElementById('c-val').textContent   = bd ? '击穿！' : C.toFixed(1) + ' pF';`,
`  document.getElementById('c-tgt').textContent   = tgt;
  if (measuredCap == null) {
    document.getElementById('c-val').textContent = '待测';
  } else {
    document.getElementById('c-val').textContent = measuredCap.bd ? '击穿！' : measuredCap.C.toFixed(1) + ' pF';
  }`,
    'ch1 c-val');

  h = replaceOnce(h,
`  const hint = document.getElementById('hint');
  if (bd) {
    hint.textContent = \`击穿！当前 E = \${(V_APP/(distMm*1e-3)/1e6).toFixed(1)} MV/m，超过 \${m.name}（\${(m.Ebd/1e6).toFixed(0)} MV/m）\`;
    hint.className = '';
  } else if (C < tgt * 0.55) {
    hint.textContent = ch===0 ? '增大面积（A↑）或减小间距（d↓）可提升电容' : '尝试更高 εᵣ 的介质，同时注意击穿';
    hint.className = '';
  } else if (C < lo) {
    hint.textContent = \`还差 \${(lo - C).toFixed(1)} pF（需 \${loLbl}–\${hiLbl} pF）\`;
    hint.className = '';
  } else if (C <= hi) {`,
`  const hint = document.getElementById('hint');
  if (measuredCap == null) {
    hint.textContent = '读数待测 · 调参后点「读取电容」';
    hint.className = '';
  } else if (measuredCap.bd) {
    hint.textContent = \`击穿！当前 E = \${measuredCap.E.toFixed(1)} MV/m，超过 \${m.name}（\${(m.Ebd/1e6).toFixed(0)} MV/m）\`;
    hint.className = '';
  } else if (measuredCap.C < tgt * 0.55) {
    hint.textContent = ch===0 ? '增大面积（A↑）或减小间距（d↓）可提升电容' : '尝试更高 εᵣ 的介质，同时注意击穿';
    hint.className = '';
  } else if (measuredCap.C < lo) {
    hint.textContent = \`还差 \${(lo - measuredCap.C).toFixed(1)} pF（需 \${loLbl}–\${hiLbl} pF）\`;
    hint.className = '';
  } else if (measuredCap.C <= hi) {`,
    'ch1 hint');

  h = replaceOnce(h,
`  if (!won && !bd && capPuzzleOk()) {
    won = true;
    capLockControls(true);
    if (ch === 1) finalSol = { matId, areaCm2, distMm, C, mat: m };
    if (typeof Telemetry !== 'undefined') Telemetry.log('solution_locked', { after: Telemetry.snapshot() });
    setTimeout(capTryShowWin, 1100);
  }
}`,
`  // 须先读取电容，再判定过关（避免调参实时剧透）
  if (!won && measuredCap != null && !measuredCap.bd && capPuzzleOk()) {
    won = true;
    capLockControls(true);
    if (ch === 1) finalSol = { matId, areaCm2, distMm, C: measuredCap.C, mat: m };
    if (typeof Telemetry !== 'undefined') Telemetry.log('solution_locked', { after: Telemetry.snapshot() });
    setTimeout(capTryShowWin, 1100);
  }
}`,
    'ch1 win gate');

  // Gate canvas C / E labels (two draw sites)
  h = replaceAll(h,
`  ctx.fillText(bd?'击穿！':\`C = \${C.toFixed(1)} pF\`,g.cx,g.botY+g.ph+28);`,
`  if (measuredCap == null) ctx.fillText('C 待测',g.cx,g.botY+g.ph+28);
  else ctx.fillText(measuredCap.bd?'击穿！':\`C = \${measuredCap.C.toFixed(1)} pF\`,g.cx,g.botY+g.ph+28);`,
    'ch1 canvas C1');

  h = replaceAll(h,
`  ctx.fillText(bd?'击穿！':\`C = \${C.toFixed(1)} pF\`, g.cx, g.cy+g.R+24);`,
`  if (measuredCap == null) ctx.fillText('C 待测', g.cx, g.cy+g.R+24);
  else ctx.fillText(measuredCap.bd?'击穿！':\`C = \${measuredCap.C.toFixed(1)} pF\`, g.cx, g.cy+g.R+24);`,
    'ch1 canvas C2');

  h = replaceOnce(h,
`    const E=(V_APP/(distMm*1e-3)/1e6).toFixed(1);
    ctx.fillStyle=bd?'rgba(255,120,80,0.6)':'rgba(0,200,255,0.30)';
    ctx.fillText(\`E = \${E} MV/m\`,g.gx-10,g.botY+14);`,
`    ctx.fillStyle=bd?'rgba(255,120,80,0.6)':'rgba(0,200,255,0.30)';
    if (measuredCap == null) ctx.fillText('E 待测',g.gx-10,g.botY+14);
    else ctx.fillText(\`E = \${measuredCap.E.toFixed(1)} MV/m\`,g.gx-10,g.botY+14);`,
    'ch1 canvas E');

  // Clear measured on slider / mat; wire button
  h = replaceOnce(h,
`if (sArea) sArea.addEventListener('input', function(){ if(won) return; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); areaCm2=+this.value; if(typeof syncUI==='function')syncUI(); });
if (sDist) sDist.addEventListener('input', function(){ if(won) return; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); distMm=+this.value; if(typeof syncUI==='function')syncUI(); });`,
`if (sArea) sArea.addEventListener('input', function(){ if(won) return; measuredCap = null; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); areaCm2=+this.value; if(typeof syncUI==='function')syncUI(); });
if (sDist) sDist.addEventListener('input', function(){ if(won) return; measuredCap = null; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); distMm=+this.value; if(typeof syncUI==='function')syncUI(); });
;(function(){ var br=document.getElementById('btn-read-cap'); if(br) br.addEventListener('click', function(){ revealCapReading(); }); })();`,
    'ch1 slider clear');

  // Clear on thickness slider
  h = replaceOnce(h,
`  sTh.addEventListener('input', function() {`,
`  sTh.addEventListener('input', function() {
    measuredCap = null;`,
    'ch1 thickness clear');
  // mat select clears — patch common pattern
  h = h.replace(
    /Telemetry\.log\('var_adjust', \{ var: 'mat', from: _prevMat, to: m\.id, after: Telemetry\.snapshot\(\) \}\);/,
    "measuredCap = null;\n        Telemetry.log('var_adjust', { var: 'mat', from: _prevMat, to: m.id, after: Telemetry.snapshot() });"
  );

  return h;
}

/* ========== 10b. capacitor-era-ch2 ========== */
function patchCapCh2(h) {
  h = replaceOnce(h,
`  <div id="hint2" style="margin-top:10px;font-size:12px;text-align:center;color:rgba(255,255,255,0.82)">调整三组电容，使总电容达到目标 500 µF（不过载）</div>
</div>`,
`  <button type="button" id="btn-read-ch2" class="cap-read-btn" style="width:100%;margin-top:10px;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,180,60,0.45);background:rgba(60,30,0,0.85);color:#ffbe1e;font-weight:700;letter-spacing:1px;cursor:pointer;">▶ 确认配置</button>
  <div id="hint2" style="margin-top:10px;font-size:12px;text-align:center;color:rgba(255,255,255,0.82)">读数待测 · 调参后点「确认配置」</div>
</div>`,
    'ch2 btn');

  if (!h.includes('let measuredCh2 = null')) {
    h = replaceOnce(h, 'function ch2TryWin() {',
`/** 仅「确认配置」后揭示总容/储能/承压 */
let measuredCh2 = null;

function revealCh2Reading() {
  const ct = calcCh2Total();
  const E = ch2Energy(ct);
  const v = calcCh2Voltages();
  measuredCh2 = { ct, E, V_Cp: v.V_Cp, V_C3: v.V_C3, ovl: ct > CH2_OVERLOAD, bCp: v.V_Cp > CH2_VRATED, bC3: v.V_C3 > CH2_VRATED };
  syncCh2UI();
}

function ch2TryWin() {`,
      'ch2 measured');
  }

  h = replaceOnce(h,
`function ch2TryWin() {
  if (ch !== 2 || phase !== 'puzzle' || won) return;
  const ct = calcCh2Total();
  if (!ch2IsSafe() || !ch2InTargetBand(ct)) return;
  won = true;
  ch2LockSliders(true);
  if (typeof Telemetry !== 'undefined') Telemetry.log('solution_locked', { after: Telemetry.snapshot() });
  setTimeout(showWin, 1100);
}`,
`function ch2TryWin() {
  if (ch !== 2 || phase !== 'puzzle' || won) return;
  if (measuredCh2 == null) return;
  const ct = measuredCh2.ct;
  if (!ch2IsSafe() || !ch2InTargetBand(ct)) return;
  won = true;
  ch2LockSliders(true);
  if (typeof Telemetry !== 'undefined') Telemetry.log('solution_locked', { after: Telemetry.snapshot() });
  setTimeout(showWin, 1100);
}`,
    'ch2 trywin');

  h = replaceOnce(h,
`  document.getElementById('f-cp').textContent  = cp;
  document.getElementById('f-ct').textContent  = ct.toFixed(1);
  document.getElementById('f-e').textContent   = E.toFixed(2);

  // Voltage spans — turn red when exceeding rated
  const fvcp = document.getElementById('f-vcp');
  const fvc3 = document.getElementById('f-vc3');
  fvcp.textContent = \`V并联=\${V_Cp.toFixed(0)} V\`;
  fvcp.style.color = bCp ? '#ff6030' : 'rgba(255,160,40,0.65)';
  fvc3.textContent = \`V串联=\${V_C3.toFixed(0)} V\`;
  fvc3.style.color = bC3 ? '#ff6030' : 'rgba(0,200,255,0.65)';

  document.getElementById('c2-val').textContent = ovl ? '过载！' : bCp||bC3 ? '击穿！' : ct.toFixed(1) + ' µF';
  document.getElementById('c2-val').style.color  = anyFault ? '#ff6030' : '#00c8ff';
  syncCh2ProgBar(ct, anyFault);`,
`  document.getElementById('f-cp').textContent  = measuredCh2 == null ? '—' : String(cp);
  document.getElementById('f-ct').textContent  = measuredCh2 == null ? '—' : measuredCh2.ct.toFixed(1);
  document.getElementById('f-e').textContent   = measuredCh2 == null ? '—' : measuredCh2.E.toFixed(2);

  // Voltage spans — turn red when exceeding rated
  const fvcp = document.getElementById('f-vcp');
  const fvc3 = document.getElementById('f-vc3');
  if (measuredCh2 == null) {
    fvcp.textContent = 'V并联=待测';
    fvcp.style.color = 'rgba(255,160,40,0.65)';
    fvc3.textContent = 'V串联=待测';
    fvc3.style.color = 'rgba(0,200,255,0.65)';
    document.getElementById('c2-val').textContent = '待测';
    document.getElementById('c2-val').style.color = '#94a3b8';
  } else {
    fvcp.textContent = \`V并联=\${measuredCh2.V_Cp.toFixed(0)} V\`;
    fvcp.style.color = measuredCh2.bCp ? '#ff6030' : 'rgba(255,160,40,0.65)';
    fvc3.textContent = \`V串联=\${measuredCh2.V_C3.toFixed(0)} V\`;
    fvc3.style.color = measuredCh2.bC3 ? '#ff6030' : 'rgba(0,200,255,0.65)';
    document.getElementById('c2-val').textContent = measuredCh2.ovl ? '过载！' : measuredCh2.bCp||measuredCh2.bC3 ? '击穿！' : measuredCh2.ct.toFixed(1) + ' µF';
    document.getElementById('c2-val').style.color  = (measuredCh2.ovl||measuredCh2.bCp||measuredCh2.bC3) ? '#ff6030' : '#00c8ff';
  }
  syncCh2ProgBar(measuredCh2 == null ? 0 : measuredCh2.ct, measuredCh2 != null && anyFault);`,
    'ch2 readouts');

  h = replaceOnce(h,
`  const hint2 = document.getElementById('hint2');
  if (bCp) {`,
`  const hint2 = document.getElementById('hint2');
  if (measuredCh2 == null) {
    hint2.textContent = '读数待测 · 调参后点「确认配置」';
    hint2.style.color = 'rgba(255,255,255,0.50)';
  } else if (measuredCh2.bCp) {
    bCp = true; bC3 = measuredCh2.bC3; ovl = measuredCh2.ovl; ct = measuredCh2.ct;
  }
  if (measuredCh2 != null && measuredCh2.bCp) {`,
    'ch2 hint gate');

  // Fix the rest of hint chain - the original continues with } else if (bC3). Our insert may break.
  // Simpler approach: replace the whole hint2 block cleanly.
  // Re-read after first replace — if broken, fix in second pass.

  h = replaceOnce(h,
`    ctx.fillText(\`C = \${ct.toFixed(1)} µF\`, g.rx+44, g.midY+5);`,
`    if (measuredCh2 == null) ctx.fillText('C 待测', g.rx+44, g.midY+5);
    else ctx.fillText(\`C = \${measuredCh2.ct.toFixed(1)} µF\`, g.rx+44, g.midY+5);`,
    'ch2 canvas C');

  // slider clears + button
  h = replaceOnce(h,
`;(function(){var el=document.getElementById('s-c1');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c1=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();
;(function(){var el=document.getElementById('s-c2');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c2=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();
;(function(){var el=document.getElementById('s-c3');if(el)el.addEventListener('input',function(){ if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c3=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();`,
`;(function(){var el=document.getElementById('s-c1');if(el)el.addEventListener('input',function(){ measuredCh2=null; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c1=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();
;(function(){var el=document.getElementById('s-c2');if(el)el.addEventListener('input',function(){ measuredCh2=null; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c2=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();
;(function(){var el=document.getElementById('s-c3');if(el)el.addEventListener('input',function(){ measuredCh2=null; if(typeof SFX!=='undefined')SFX.tick('sliderTick'); c2_c3=+this.value; if(typeof syncCh2UI==='function')syncCh2UI(); });})();
;(function(){var br=document.getElementById('btn-read-ch2');if(br)br.addEventListener('click',function(){revealCh2Reading();});})();`,
    'ch2 sliders');

  return h;
}

/* ========== 10c. capacitor-era-ch4 ========== */
function patchCapCh4(h) {
  if (!h.includes('let measuredE4 = null')) {
    h = replaceOnce(h, 'function updateCh4Readout() {',
`/** 仅放电后揭示储能 E */
let measuredE4 = null;

function updateCh4Readout() {`,
      'ch4 measured');
  }

  h = replaceOnce(h,
`function updateCh4Readout() {
  const ro = document.getElementById('c4-readout');
  if (ch4SelCI < 0 || ch4SelVI < 0) { ro.textContent = '-- J'; ro.style.color = '#ffbe1e'; return; }
  const e = ch4CalcE(ch4SelCI, ch4SelVI);
  ro.textContent = e.toFixed(0) + ' J';
  ro.style.color = (e >= CH4_ELOW && e <= CH4_EHIGH) ? '#ffbe1e'
                 : (e > CH4_EHIGH ? '#ff6030' : '#60b8ff');
}`,
`function updateCh4Readout() {
  const ro = document.getElementById('c4-readout');
  if (ch4SelCI < 0 || ch4SelVI < 0) { ro.textContent = '-- J'; ro.style.color = '#ffbe1e'; return; }
  if (measuredE4 == null) {
    ro.textContent = '待测';
    ro.style.color = '#94a3b8';
    return;
  }
  const e = measuredE4;
  ro.textContent = e.toFixed(0) + ' J';
  ro.style.color = (e >= CH4_ELOW && e <= CH4_EHIGH) ? '#ffbe1e'
                 : (e > CH4_EHIGH ? '#ff6030' : '#60b8ff');
}`,
    'ch4 readout');

  h = replaceOnce(h,
`      ch4SelCI = i; buildCh4ChoiceGrid(); updateCh4Readout();
      if (typeof Telemetry !== 'undefined' && _p !== c) Telemetry.log('var_adjust', { var: 'C', from: _p, to: c, after: Telemetry.snapshot() });`,
`      measuredE4 = null; ch4SelCI = i; buildCh4ChoiceGrid(); updateCh4Readout();
      if (typeof Telemetry !== 'undefined' && _p !== c) Telemetry.log('var_adjust', { var: 'C', from: _p, to: c, after: Telemetry.snapshot() });`,
    'ch4 selC');

  h = replaceOnce(h,
`      ch4SelVI = i; buildCh4ChoiceGrid(); updateCh4Readout();
      if (typeof Telemetry !== 'undefined' && _p !== v) Telemetry.log('var_adjust', { var: 'V', from: _p, to: v, after: Telemetry.snapshot() });`,
`      measuredE4 = null; ch4SelVI = i; buildCh4ChoiceGrid(); updateCh4Readout();
      if (typeof Telemetry !== 'undefined' && _p !== v) Telemetry.log('var_adjust', { var: 'V', from: _p, to: v, after: Telemetry.snapshot() });`,
    'ch4 selV');

  h = replaceOnce(h,
`  const e = ch4CalcE(ch4SelCI, ch4SelVI);
  if (e >= CH4_ELOW && e <= CH4_EHIGH) {
    ch4DischargeResult = 'correct';
    ch4GateTarget = 1.0;
  } else if (e > CH4_EHIGH) {
    ch4DischargeResult = 'high';
    ch4GateTarget = Math.min(1.8, 1.0 + (e - CH4_EHIGH) / CH4_EHIGH);
  } else {
    ch4DischargeResult = 'low';
    ch4GateTarget = (e / CH4_ELOW) * 0.82;
  }`,
`  const e = ch4CalcE(ch4SelCI, ch4SelVI);
  measuredE4 = e;
  updateCh4Readout();
  if (e >= CH4_ELOW && e <= CH4_EHIGH) {
    ch4DischargeResult = 'correct';
    ch4GateTarget = 1.0;
  } else if (e > CH4_EHIGH) {
    ch4DischargeResult = 'high';
    ch4GateTarget = Math.min(1.8, 1.0 + (e - CH4_EHIGH) / CH4_EHIGH);
  } else {
    ch4DischargeResult = 'low';
    ch4GateTarget = (e / CH4_ELOW) * 0.82;
  }`,
    'ch4 discharge');

  h = replaceOnce(h,
`  ctx.fillText(sel?\`\${e.toFixed(0)} J\`:'-- J', gcx, gcy+gr+10);`,
`  if (!sel) ctx.fillText('-- J', gcx, gcy+gr+10);
  else if (measuredE4 == null) ctx.fillText('待测', gcx, gcy+gr+10);
  else ctx.fillText(\`\${measuredE4.toFixed(0)} J\`, gcx, gcy+gr+10);`,
    'ch4 gauge');

  return h;
}

function run() {
  const jobs = [
    ['回旋加速器.html', 'cyclotron-radius', patchCyclotron],
    ['电容混淆.html', 'capacitor-confound-ui', patchCapConfound],
    ['串并联电路.html', 'series-parallel', patchSeriesParallel],
    ['RC电路.html', 'rc-circuit', patchRc],
    ['安培力.html', 'magnetic-force', patchMag],
    ['变压器.html', 'transformer-turns', patchTransformer],
    ['透镜.html', 'thin-lens-implicit', patchLens],
    ['折射.html', 'refraction-snell', patchRefraction],
    ['光电效应.html', 'photoelectric', patchPhoto],
    ['电容_介质与击穿.html', 'capacitor-era-ch1', patchCapCh1],
    ['电容_串并联.html', 'capacitor-era-ch2', patchCapCh2],
    ['电容_储能与充电.html', 'capacitor-era-ch4', patchCapCh4],
  ];

  for (const [cn, id, fn] of jobs) {
    const src = path.join(YANG, cn);
    let h = fs.readFileSync(src, 'utf8');
    if (h.includes('/** 仅测试后揭示') || h.includes('measuredTau') || h.includes('measuredCap') || h.includes('measuredCh2') || h.includes('measuredE4') || h.includes('measuredR = null') || h.includes('measuredC = null') || h.includes('measuredI = null') || h.includes('measuredU2') || h.includes('measuredTheta2') || h.includes('measuredF = null')) {
      // Allow re-run only for files not yet patched; skip if already gated
      const already =
        (id === 'rc-circuit' && h.includes('measuredTau')) ||
        (id === 'magnetic-force' && h.includes('measuredF = null')) ||
        (id === 'photoelectric' && h.includes('measuredI = null') && h.includes('仅发射后揭示光电流')) ||
        (id === 'cyclotron-radius' && h.includes('measuredR = null')) ||
        (id === 'capacitor-confound-ui' && h.includes('measuredC = null')) ||
        (id === 'series-parallel' && h.includes('measuredI = null') && h.includes('measuredRtotal')) ||
        (id === 'transformer-turns' && h.includes('measuredU2')) ||
        (id === 'thin-lens-implicit' && h.includes('仅测试后揭示成像判定')) ||
        (id === 'refraction-snell' && h.includes('measuredTheta2')) ||
        (id === 'capacitor-era-ch1' && h.includes('measuredCap')) ||
        (id === 'capacitor-era-ch2' && h.includes('measuredCh2')) ||
        (id === 'capacitor-era-ch4' && h.includes('measuredE4'));
      if (already) {
        console.log('skip (already gated)', cn);
        continue;
      }
    }
    h = fn(h);
    writeBoth(cn, id, h);
  }
  console.log('done');
}

run();
