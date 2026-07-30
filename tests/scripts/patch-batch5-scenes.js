/**
 * One-shot scene upgrades for batch 5 samples (RC / ampere already partly done / transformer).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const PKG = path.join(ROOT, 'data/runtime/packages');

function writeBoth(cnName, pkgId, html) {
  fs.writeFileSync(path.join(YANG, cnName), html, 'utf8');
  fs.writeFileSync(path.join(PKG, pkgId, 'game.html'), html, 'utf8');
  console.log('wrote', cnName, '->', pkgId);
}

// ----- RC -----
(function patchRC() {
  const file = path.join(YANG, 'RC电路.html');
  let h = fs.readFileSync(file, 'utf8');
  const start = h.indexOf('    // 充电曲线 V(t)');
  const end = h.indexOf('    // 过关判定 (基于τ)');
  if (start < 0 || end < 0) throw new Error('RC markers missing');
  const neu = `    function drawChargeCurve(tau_ms) {
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#071018');
        bg.addColorStop(1, '#0b1c2c');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, H - 64, W, 64);
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, H - 64, W, 10);
        ctx.fillStyle = '#334155';
        ctx.fillRect(24, H - 150, 110, 78);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(24, H - 150, 110, 78);
        ctx.fillStyle = '#e0f2fe';
        ctx.font = 'bold 12px "Microsoft YaHei",sans-serif';
        ctx.fillText('RC 模块', 44, H - 120);
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '11px sans-serif';
        const rc = computeTau();
        ctx.fillText('R ' + rc.R + 'kΩ', 40, H - 98);
        ctx.fillText('C ' + rc.C + 'μF', 40, H - 82);
        const ox = W * 0.22, oy = 36, ow = W * 0.72, oh = H - 120;
        ctx.fillStyle = '#020617';
        ctx.fillRect(ox, oy, ow, oh);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.strokeRect(ox, oy, ow, oh);
        ctx.fillStyle = '#67e8f9';
        ctx.font = 'bold 13px "Microsoft YaHei",sans-serif';
        ctx.fillText('示波器 · 充电曲线', ox + 12, oy + 22);
        ctx.strokeStyle = 'rgba(34,211,238,0.15)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
            const x = ox + (i / 6) * ow;
            ctx.beginPath(); ctx.moveTo(x, oy + 30); ctx.lineTo(x, oy + oh - 16); ctx.stroke();
        }
        for (let i = 1; i < 4; i++) {
            const y = oy + 30 + (i / 4) * (oh - 46);
            ctx.beginPath(); ctx.moveTo(ox + 10, y); ctx.lineTo(ox + ow - 10, y); ctx.stroke();
        }
        if (tau_ms <= 0) return;
        const maxT = 5 * tau_ms;
        const plotL = ox + 16, plotR = ox + ow - 16, plotT = oy + 34, plotB = oy + oh - 20;
        const scaleX = (plotR - plotL) / maxT;
        const scaleY = (plotB - plotT);
        ctx.beginPath();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 8;
        for (let t = 0; t <= maxT; t += Math.max(0.5, maxT / 200)) {
            const v = 1 - Math.exp(-t / tau_ms);
            const x = plotL + t * scaleX;
            const y = plotB - v * scaleY;
            if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        const tScan = ((animT * 0.4) % 1) * maxT;
        const vScan = 1 - Math.exp(-tScan / tau_ms);
        ctx.beginPath();
        ctx.arc(plotL + tScan * scaleX, plotB - vScan * scaleY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fde047';
        ctx.fill();
        const tau_s = tau_ms / 1000;
        const on = Math.abs(tau_s - TARGET_TAU_SEC) < 0.05;
        ctx.fillStyle = 'rgba(15,23,42,0.85)';
        ctx.fillRect(16, 16, 200, 44);
        ctx.strokeStyle = on ? 'rgba(74,222,128,0.55)' : 'rgba(56,189,248,0.4)';
        ctx.strokeRect(16, 16, 200, 44);
        ctx.fillStyle = '#e0f2fe';
        ctx.font = '12px "Microsoft YaHei",sans-serif';
        ctx.fillText('目标 τ ≈ ' + TARGET_TAU_SEC.toFixed(1) + ' s', 26, 34);
        ctx.fillStyle = on ? '#86efac' : '#7dd3fc';
        ctx.fillText('当前 ' + tau_s.toFixed(3) + ' s', 26, 50);
    }

`;
  h = h.slice(0, start) + neu + h.slice(end);
  if (!h.includes('let W = 700, H = 360, dpr = 1, animT = 0')) {
    throw new Error('RC resize preamble missing — re-check earlier edit');
  }
  h = h.replace(
    `sR.addEventListener('input', updateUI);
    sC.addEventListener('input', updateUI);
    btnTest.addEventListener('click', onTest);
    updateUI();`,
    `sR.addEventListener('input', updateUI);
    sC.addEventListener('input', updateUI);
    btnTest.addEventListener('click', onTest);
    window.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined' && wrap) new ResizeObserver(resizeCanvas).observe(wrap);
    resizeCanvas();
    (function loop(){ animT += 0.016; drawChargeCurve(computeTau().tau_ms); requestAnimationFrame(loop); })();`
  );
  h = h.replace(
    "hintMsg.textContent = '✅ 时间常数达标！实验成功。';",
    "hintMsg.textContent = '时间常数达标。';\n            if (typeof window.__craftShowWin === 'function') window.__craftShowWin('时间常数由 R 与 C 共同决定，乘积越大曲线上升越慢。');"
  );
  writeBoth('RC电路.html', 'rc-circuit', h);
})();

// ----- Transformer -----
(function patchTransformer() {
  const file = path.join(YANG, '变压器.html');
  let h = fs.readFileSync(file, 'utf8');
  h = h.replace(
    '<p>调节匝数相关参数，观察电压如何变化。</p>',
    '<p>配电柜副边电压偏离目标。调节匝数与输入电压，把 U₂ 调进目标区间。</p>'
  );
  h = h.replace(
    `<div class="essence-title">⚡ 变压器</div>
      <div class="essence-sub">探究理想变压器输出电压与匝数比的关系</div>`,
    `<div class="essence-title">配电变压器台</div>
      <div class="essence-sub">把副边电压调进目标区间</div>`
  );
  h = h.replace(
    '<div class="feedback" id="feedbackMsg">调节参数后点击「测试」验证公式</div>',
    '<div class="feedback" id="feedbackMsg">当前输出未对准目标，试着改匝数或输入电压。</div>'
  );
  h = h.replace(
    `<div class="observe-box">
    <div style="display:flex; justify-content:space-between; align-items:baseline;">
      <span style="font-weight:500;">📊 输出电压 <span style="font-weight:400; font-size:0.8rem; color:#4a5568;">U₂</span></span>
      <span class="reading" id="observeU2">0.00 <small>V</small></span>
    </div>
    <div class="feedback" id="feedbackMsg">当前输出未对准目标，试着改匝数或输入电压。</div>
  </div>`,
    `<div class="observe-box">
    <div style="display:flex; justify-content:space-between; align-items:baseline;">
      <span style="font-weight:500;">输出电压 U₂</span>
      <span class="reading" id="observeU2">0.00 <small>V</small></span>
    </div>
    <div style="margin-top:8px;font-size:0.9rem;color:var(--craft-muted)">目标区间 <strong id="targetU2Display" style="color:#fde68a">8.0–12.0 V</strong></div>
    <div class="feedback" id="feedbackMsg">当前输出未对准目标，试着改匝数或输入电压。</div>
  </div>`
  );

  const drawStart = h.indexOf('  // 绘制变压器示意图 (简洁)');
  const drawEnd = h.indexOf('  // 更新所有UI + canvas + 过关判定 (共用)');
  if (drawStart < 0 || drawEnd < 0) throw new Error('transformer draw markers missing');

  const drawNeu = `  const wrap = canvas.parentElement;
  let W = 600, H = 360, dpr = 1, spark = 0;
  const U2_LO = 8.0, U2_HI = 12.0;
  function resizeCanvas() {
    const rect = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function drawTransformer(n1, n2, U1, U2) {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#111827');
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, H - 70, W, 70);
    ctx.fillStyle = '#374151';
    ctx.fillRect(0, H - 70, W, 12);
    // 墙面配电柜
    ctx.fillStyle = '#334155';
    ctx.fillRect(W * 0.08, 40, W * 0.84, H * 0.62);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.strokeRect(W * 0.08, 40, W * 0.84, H * 0.62);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px "Microsoft YaHei",sans-serif';
    ctx.fillText('配电柜 · 理想变压器', W * 0.1, 62);

    const cx = W * 0.48, cy = H * 0.42;
    // 铁芯
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(cx - 70, cy - 55, 140, 110);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(cx - 55, cy - 40, 40, 80);
    ctx.fillRect(cx + 15, cy - 40, 40, 80);
    // 线圈
    const turns1 = Math.max(3, Math.round(n1 / 200));
    const turns2 = Math.max(3, Math.round(n2 / 200));
    for (let i = 0; i < turns1; i++) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx - 35, cy - 28 + i * (56 / turns1), 22, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < turns2; i++) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx + 35, cy - 28 + i * (56 / turns2), 22, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '12px "Microsoft YaHei",sans-serif';
    ctx.fillText('原边 n₁=' + n1, cx - 110, cy + 70);
    ctx.fillStyle = '#fde68a';
    ctx.fillText('副边 n₂=' + n2, cx + 30, cy + 70);

    // 电压表
    const on = U2 >= U2_LO && U2 <= U2_HI;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(W - 160, H - 150, 130, 70);
    ctx.strokeStyle = on ? '#4ade80' : '#f59e0b';
    ctx.strokeRect(W - 160, H - 150, 130, 70);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px ui-monospace,monospace';
    ctx.fillText(U2.toFixed(2) + ' V', W - 148, H - 118);
    ctx.fillStyle = on ? '#86efac' : '#fca5a5';
    ctx.font = '12px "Microsoft YaHei",sans-serif';
    ctx.fillText(on ? '目标区间内' : '偏离目标', W - 148, H - 96);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('U₁ ' + U1.toFixed(1) + ' V', 24, H - 28);
    // 能量流光点
    spark = (spark + 0.02) % 1;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx - 90 + spark * 60, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(cx + 40 + spark * 50, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

`;
  h = h.slice(0, drawStart) + drawNeu + h.slice(drawEnd);

  // Replace win logic in updateAll
  h = h.replace(
    `    // 过关判定：公式自动满足 (理想变压器，只要计算正确即符合)
    // 但为了体现“验证”，我们检查计算是否与公式一致 (总是true)
    const formulaOk = true;  // 因为U2由公式算出，必然一致
    const winOk = formulaOk;
    const hintKey = winOk ? 'formula_matched' : 'formula_mismatch';

    // 更新过关指示
    if (winOk) {
      winIndicator.style.display = 'inline-block';
      feedback.innerHTML = '<span class="pass">✅ 输出电压符合公式 U₂/U₁ = n₂/n₁，探究成功！</span>';
    } else {
      winIndicator.style.display = 'none';
      feedback.innerHTML = '<span class="fail">⚠️ 请检查参数，输出电压应与公式一致。</span>';
    }`,
    `    const winOk = U2rounded >= U2_LO && U2rounded <= U2_HI;
    const hintKey = winOk ? 'win' : (U2rounded < U2_LO ? 'u2_low' : 'u2_high');

    if (winOk) {
      winIndicator.style.display = 'inline-block';
      feedback.textContent = '输出电压已落入目标区间。';
    } else {
      winIndicator.style.display = 'none';
      feedback.textContent = U2rounded < U2_LO
        ? '输出偏低，尚未进入目标区间。'
        : '输出偏高，尚未进入目标区间。';
    }`
  );

  // craft win on test path
  h = h.replace(
    /if \(winOk\) \{\s*try \{[\s\S]*?record\('win'[\s\S]*?\}\s*catch[\s\S]*?\}/,
    (m) => m
  );

  // Ensure craft show on test - find isTest win emit block
  if (!h.includes("window.__craftShowWin")) {
    h = h.replace(
      "feedback.textContent = '输出电压已落入目标区间。';",
      "feedback.textContent = '输出电压已落入目标区间。';\n      if (isTest && typeof window.__craftShowWin === 'function') window.__craftShowWin('副边电压随匝数比变化：U₂/U₁ ≈ n₂/n₁。');"
    );
  }

  // init resize + loop
  if (!h.includes('resizeCanvas();')) {
    h = h.replace(
      /btnTest\.addEventListener\('click'[\s\S]*?\n/,
      (m) => m + `  window.addEventListener('resize', function(){ resizeCanvas(); updateAll(false,false); });\n  if (typeof ResizeObserver !== 'undefined' && wrap) new ResizeObserver(function(){ resizeCanvas(); updateAll(false,false); }).observe(wrap);\n  resizeCanvas();\n  (function loop(){ spark += 0.02; updateAll(false,false); requestAnimationFrame(loop); })();\n`
    );
  }

  // default tension: n1=500 n2=500 U1=5 -> U2=5, target 8-12. Good.
  writeBoth('变压器.html', 'transformer-turns', h);
})();

// Ampère writeback (already edited in yangben)
(function syncAmpere() {
  const h = fs.readFileSync(path.join(YANG, '安培力.html'), 'utf8');
  fs.writeFileSync(path.join(PKG, 'magnetic-force', 'game.html'), h, 'utf8');
  console.log('synced 安培力 -> magnetic-force');
})();

console.log('batch5 patch done');
