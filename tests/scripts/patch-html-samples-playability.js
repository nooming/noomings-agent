/** CLI: node tests/scripts/patch-html-samples-playability.js */
const fs = require('fs');
const path = require('path');
const { loadAllSamples } = require('../lib/html-samples-manifest');
const { injectLegacyTrace, stripLegacyOperationHint } = require('../../packages/platform/legacy-trace-inject');
const { getPackageGamePath } = require('../../packages/shared/data-paths');

function patchMultiKp(html) {
  if (/requestAnimationFrame\(animFrame\)/.test(html)) return html;
  const oldFire = `    // ----- 发射 & 判定 (共用物理) -----
    function fire() {
        const h = parseFloat(heightSlider.value);
        const v = parseFloat(speedSlider.value);
        // 约束检查
        if (h < 0 || h > 10 || v < 0 || v > 10) {
            observeText.textContent = '⚠️ 参数超出范围 (h:0~10, v:0~10)';
            winMessage.innerHTML = '<span class="fail-badge">❌ 参数无效</span>';
            return;
        }
        // 物理判定
        const canPass = computePassLoop(h, v);
        winOk = canPass;
        passedLoop = canPass;
        simulationDone = true;
        launched = true;

        // 更新观察
        if (canPass) {
            observeText.textContent = '✅ 过山车成功通过环路最高点！机械能足够。';
            winMessage.innerHTML = '<span class="win-badge">🎉 过关！探究完成</span>';
            hintKey = 'pass';
        } else {
            observeText.textContent = '❌ 过山车未能通过最高点。尝试增大起始高度或释放速度。';
            winMessage.innerHTML = '<span class="fail-badge">⛔ 未通过 · 重试</span>';
            hintKey = 'fail_energy';
        }

        drawTrack(canPass);

        // ----- 埋点 snapshot + win (如果过关) -----
        const controlsSnapshot = {};
        controlsSnapshot['s-height'] = h;
        controlsSnapshot['s-speed'] = v;
        // 发射 snapshot
        try {
            const snapPayload = { controls: controlsSnapshot, winOk: winOk, hintKey: hintKey };
            // 调用 emit (已在 trace-adapter-hook 中定义)
            if (window.emit) {
                window.emit('snapshot', snapPayload);
            } else {
                // fallback 直接调用 adapter
                try {
                    if (window.PlatformTraceAdapter) window.PlatformTraceAdapter.record('snapshot', snapPayload);
                    else if (window.parent && window.parent.PlatformTraceAdapter) window.parent.PlatformTraceAdapter.record('snapshot', snapPayload);
                } catch(e){}
            }
            if (winOk) {
                if (window.emit) {
                    window.emit('win', { winOk: true });
                } else {
                    try {
                        if (window.PlatformTraceAdapter) window.PlatformTraceAdapter.record('win', { winOk: true });
                        else if (window.parent && window.parent.PlatformTraceAdapter) window.parent.PlatformTraceAdapter.record('win', { winOk: true });
                    } catch(e){}
                }
            }
        } catch (e) {}
    }`;

  const newFire = `    // ----- 发射 & 判定 (共用物理) -----
    function finishFire(h, v, canPass) {
        winOk = canPass;
        passedLoop = canPass;
        simulationDone = true;
        launched = true;
        if (canPass) {
            observeText.textContent = '✅ 过山车成功通过环路最高点！机械能足够。';
            winMessage.innerHTML = '<span class="win-badge">🎉 过关！探究完成</span>';
            hintKey = 'pass';
        } else {
            observeText.textContent = '❌ 过山车未能通过最高点。尝试增大起始高度或释放速度。';
            winMessage.innerHTML = '<span class="fail-badge">⛔ 未通过 · 重试</span>';
            hintKey = 'fail_energy';
        }
        drawTrack(canPass);
        const controlsSnapshot = { 's-height': h, 's-speed': v };
        const snapPayload = { controls: controlsSnapshot, winOk: winOk, hintKey: hintKey };
        const emitFn = window.__emit || window.emit;
        if (emitFn) {
            emitFn('snapshot', snapPayload);
            if (winOk) emitFn('win', { winOk: true });
        }
    }

    function fire() {
        const h = parseFloat(heightSlider.value);
        const v = parseFloat(speedSlider.value);
        if (h < 0 || h > 10 || v < 0 || v > 10) {
            observeText.textContent = '⚠️ 参数超出范围 (h:0~10, v:0~10)';
            winMessage.innerHTML = '<span class="fail-badge">❌ 参数无效</span>';
            return;
        }
        const canPass = computePassLoop(h, v);
        simulationDone = false;
        launched = true;
        observeText.textContent = '过山车运行中…';
        winMessage.innerHTML = '';
        const entryX = loopCenterX - loopRadius;
        const exitX = loopCenterX + loopRadius;
        let animStart = null;
        function animFrame(ts) {
            if (!animStart) animStart = ts;
            const t = Math.min(1, (ts - animStart) / 1600);
            if (t < 0.35) {
                carX = startX + 10 + (entryX - startX - 10) * (t / 0.35);
                carY = groundY - 10;
            } else if (t < 0.72) {
                const lt = (t - 0.35) / 0.37;
                const angle = Math.PI - lt * Math.PI;
                carX = loopCenterX + loopRadius * Math.cos(angle);
                carY = loopCenterY + loopRadius * Math.sin(angle);
            } else {
                const lt = (t - 0.72) / 0.28;
                carX = exitX + 24 * lt;
                carY = groundY - 8;
            }
            drawTrack(false);
            if (t < 1) requestAnimationFrame(animFrame);
            else finishFire(h, v, canPass);
        }
        requestAnimationFrame(animFrame);
    }`;

  if (!html.includes(oldFire.slice(0, 80))) return html;
  return html.replace(oldFire, newFire);
}

function patchCircularMotion(html) {
  if (/requestAnimationFrame\(loop\)/.test(html)) return html;
  const tail = `
  function loop() {
    const r = parseFloat(sRadius.value);
    const omega = parseFloat(sOmega.value);
    updateObserve(r, omega);
    drawScene(r, omega);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);`;
  if (html.includes('btnFire.addEventListener')) {
    return html.replace(
      /btnFire\.addEventListener\('click', fireTest\);/,
      `btnFire.addEventListener('click', fireTest);\n${tail}`,
    );
  }
  return html;
}

function patchMomentumCollision(html) {
  if (/requestAnimationFrame\(step\)/.test(html)) return html;
  const marker = '        drawScene();\n\n        // ----- 埋点 snapshot + win (如果过关) -----';
  const animBlock = `        const start1 = ball1X, start2 = ball2X;
        const end1 = ball1X, end2 = ball2X;
        ball1X = BALL1_INIT_X;
        ball2X = BALL2_INIT_X;
        let t0 = null;
        function step(ts) {
            if (!t0) t0 = ts;
            const u = Math.min(1, (ts - t0) / 900);
            ball1X = BALL1_INIT_X + (end1 - BALL1_INIT_X) * u;
            ball2X = BALL2_INIT_X + (end2 - BALL2_INIT_X) * u;
            drawScene();
            if (u < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);

        // ----- 埋点`;
  if (html.includes(marker)) return html.replace(marker, animBlock);
  return html;
}

function main() {
  const { samples } = loadAllSamples();
  let patched = 0;
  for (const sample of samples) {
    const p = getPackageGamePath(sample.id);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    const before = raw;
    let html = injectLegacyTrace(stripLegacyOperationHint(raw), sample.id);
    if (sample.id === 'multi-kp') html = patchMultiKp(html);
    if (sample.id === 'circular-motion') html = patchCircularMotion(html);
    if (sample.id === 'momentum-collision') html = patchMomentumCollision(html);
    if (html !== before) {
      fs.writeFileSync(p, html, 'utf8');
      patched++;
      console.log(`patched ${sample.id}`);
    }
  }
  console.log(`patch-html-samples-playability: ${patched} file(s) updated`);
}

main();
