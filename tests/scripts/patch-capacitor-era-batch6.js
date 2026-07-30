/**
 * Flagship audit fixes for capacitor-era ch1/ch2/ch4:
 * - no formula spoilers during explore (float panels + auto derivation)
 * - timer contrast on dark chips
 * - chapter-specific win formulas
 * - soften dialogue / warn spoilers
 * Then writeback to packages.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const PKG = path.join(ROOT, 'data/runtime/packages');

const FILES = [
  {
    yang: '电容_介质与击穿.html',
    id: 'capacitor-era-ch1',
    winFormula: 'C = ε₀εᵣA / d；击穿：E = V/d 超过材料极限',
    stripCapFormula: true,
    stripCh2Formula: false,
    stripCh4EnergyLabel: false,
    ch: 1,
  },
  {
    yang: '电容_串并联.html',
    id: 'capacitor-era-ch2',
    winFormula: '并联 C = ΣCᵢ；串联 1/C = Σ(1/Cᵢ)',
    stripCapFormula: false,
    stripCh2Formula: true,
    stripCh4EnergyLabel: false,
    ch: 2,
  },
  {
    yang: '电容_储能与充电.html',
    id: 'capacitor-era-ch4',
    winFormula: 'E = ½ C V²',
    stripCapFormula: false,
    stripCh2Formula: false,
    stripCh4EnergyLabel: true,
    ch: 4,
  },
];

function patchTimer(cssBlock) {
  let s = cssBlock;
  if (!/#timerDisplay\{[^}]*color:/.test(s)) {
    s = s.replace(
      /#timerDisplay\{font-family:ui-monospace,monospace\}/,
      '#timerDisplay{font-family:ui-monospace,monospace;font-weight:700;color:#0f172a}'
    );
  }
  if (!/body\.cap-dark #timerDisplay/.test(s)) {
    s = s.replace(
      /body\.cap-dark #modeLabel\{color:#00c8ff\}/,
      'body.cap-dark #modeLabel{color:#00c8ff}\nbody.cap-dark #timerDisplay{color:#ffe0c2!important}'
    );
  }
  return s;
}

function patchCapFormulaHtml(html) {
  return html.replace(
    /<div id="cap-formula" class="formula-float">\s*C = ε₀ · εᵣ · A \/ d<br>ε₀ = 8\.854 × 10⁻¹² F\/m\s*<div id="cap-formula-live" class="formula-float-live"><\/div>\s*<\/div>/,
    `<div id="cap-formula" class="formula-float">
  <div class="formula-float-dim">观测读数</div>
  <div id="cap-formula-live" class="formula-float-live"></div>
</div>`
  );
}

function patchCh2FormulaHtml(html) {
  return html.replace(
    /<div id="ch2-formula" class="formula-float formula-float--ch2">[\s\S]*?<\/div>\s*\n\s*<div id="controls2"/,
    `<div id="ch2-formula" class="formula-float formula-float--ch2">
  <div class="formula-float-dim">观测读数</div>
  并联组：<span class="fo" id="f-cp">--</span> µF<br>
  总电容：<span class="fs" id="f-ct">--</span> µF<br>
  储能：<span class="fo" id="f-e">--</span> kJ<br>
  承压：<span id="f-vcp">V并联=-- V</span><br>
  <span id="f-vc3">V串联=-- V</span><br>
  <span class="formula-float-dim">额定耐压 2500 V</span>
</div>

<div id="controls2"`
  );
}

function patchSyncCapFormulaLive(html) {
  const old = `function syncCapFormulaLive(m, C, bd) {
  const live = document.getElementById('cap-formula-live');
  if (!live) return;
  const _A = areaCm2, _d = distMm, _er = m.er;
  const _Aexp = \`\${_A}×10⁻⁴\`;
  const _dexp = \`\${_d.toFixed(1)}×10⁻³\`;
  let html = \`= 8.854×10⁻¹² × \${_er} × (\${_Aexp}) / (\${_dexp})<br>→ <span class="fv">C = \${bd && ch === 1 ? '—' : C.toFixed(1)} pF</span>\`;
  if (ch === 1) {
    const E = V_APP / (distMm * 1e-3) / 1e6;
    const ebd = m.Ebd / 1e6;
    html += \`<br><br>E = V / d<br>= \${V_APP} / (\${_dexp})<br>→ <span class="\${bd ? 'fe-bad' : 'fe'}">E = \${E.toFixed(2)} MV/m</span> \${bd ? '⚡' : \`&lt; \${ebd.toFixed(0)} MV/m\`}\`;
  }
  live.innerHTML = html;
}`;
  const neu = `function syncCapFormulaLive(m, C, bd) {
  const live = document.getElementById('cap-formula-live');
  if (!live) return;
  let html = \`电容 <span class="fv">\${bd && ch === 1 ? '—' : C.toFixed(1)} pF</span>\`;
  if (ch === 1) {
    const E = V_APP / (distMm * 1e-3) / 1e6;
    const ebd = m.Ebd / 1e6;
    html += \`<br>场强 <span class="\${bd ? 'fe-bad' : 'fe'}">\${E.toFixed(2)} MV/m</span> \${bd ? '⚡ 超限' : \`/ 材料上限 \${ebd.toFixed(0)} MV/m\`}\`;
  }
  live.innerHTML = html;
}`;
  if (!html.includes('function syncCapFormulaLive')) return html;
  if (html.includes(old)) return html.replace(old, neu);
  // looser fallback: replace function body via regex
  return html.replace(
    /function syncCapFormulaLive\(m, C, bd\) \{[\s\S]*?\n\}/,
    neu
  );
}

function patchDerivationHook(html) {
  const from = `    var wrapped=function(){
      var r=orig.apply(this,arguments);
      var c=curCh();
      // 开场只自动弹一次，之后用左下角按钮随时重看
      if(DERIV[c]&&!seen[c]){seen[c]=true;setTimeout(function(){show(c);},380);}
      else{showReopenForCurrent();}
      return r;
    };`;
  const to = `    var wrapped=function(){
      var r=orig.apply(this,arguments);
      // 探究中不剧透：开场不自动弹出公式推导；过关后再开放重看
      reopen.style.display='none';
      return r;
    };`;
  if (html.includes(from)) html = html.replace(from, to);
  else {
    html = html.replace(
      /if\(DERIV\[c\]&&!seen\[c\]\)\{seen\[c\]=true;setTimeout\(function\(\)\{show\(c\);\},380\);\}\s*else\{showReopenForCurrent\(\);\}/,
      "reopen.style.display='none';"
    );
  }

  // After win, allow reopen + optionally show derivation once
  if (!html.includes('__dvWinHooked')) {
    const inject = `
  // 过关后才开放公式推导（符合探究不剧透）
  (function hookWinForDerive(){
    if (window.__dvWinHooked) return;
    function wrap(name){
      if (typeof window[name] !== 'function' || window[name].__dvWinHooked) return false;
      var orig = window[name];
      var wrapped = function(){
        var r = orig.apply(this, arguments);
        try {
          var c = curCh();
          if (DERIV[c] && !seen[c]) {
            seen[c] = true;
            setTimeout(function(){ show(c); }, 600);
          } else {
            showReopenForCurrent();
          }
        } catch (e) {}
        return r;
      };
      wrapped.__dvWinHooked = true;
      window[name] = wrapped;
      return true;
    }
    var tries = 0;
    (function tryW(){
      var ok = wrap('showWin') || wrap('__craftShowWin');
      // also patch craft win reveal if present
      var cw = document.getElementById('craft-win');
      if (cw && !cw.__dvObs) {
        cw.__dvObs = true;
        var mo = new MutationObserver(function(){
          if (!cw.hidden && cw.style.display !== 'none') {
            try {
              var c = curCh();
              if (DERIV[c]) showReopenForCurrent();
            } catch (e) {}
          }
        });
        mo.observe(cw, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
      }
      if (ok || tries > 50) { window.__dvWinHooked = true; return; }
      tries++; setTimeout(tryW, 200);
    })();
  })();
`;
    html = html.replace(
      /window\.showDerivation=show;\n\}\)\(\);/,
      `window.showDerivation=show;${inject}\n})();`
    );
  }
  return html;
}

function patchDialogueFormulas(html, ch) {
  // Strip explicit formula lines in DLG arrays for the active chapter only when present.
  const replacements = [
    [
      "C = ε₀ · A / d",
      "两块极板的正对面积与间距，都会改变电容器能储存的电荷能力。",
    ],
    [
      "C = ε₀εᵣA/d 决定容量，E = V/d 决定场强。\nεᵣ 越大容越大；d 越小场强越高——两者相互牵制。",
      "换上不同介质后，同样几何尺寸下容量会变；但间距太近时，介质也可能被高压击穿——两者相互牵制。",
    ],
    [
      "并联时总电容相加：Cp = C₁ + C₂\n串联时总电容减小：1/C = 1/Cp + 1/C₃",
      "电容器可以串联或并联：并联时总容量变大，串联时总容量变小。",
    ],
    [
      "储能公式：E = ½CV²",
      "储能取决于你所选的电容量与充电电压——多试几组组合。",
    ],
    [
      "时间常数 τ = R × C 决定了充电的快慢。",
      "电阻与电容共同决定了充电的快慢。",
    ],
    [
      "充电公式：V(t) = Vs × (1 − e^{−t/τ})\n当 t = τ 时电压达到 63.2%；t = 3τ 时达到 95%。\n\nτ 太小 → 电流过大，造物损毁；τ 太大 → 超时沉眠。",
      "充电太快可能损坏造物，太慢则会超时沉眠——慢慢试出合适的节奏。",
    ],
  ];
  for (const [a, b] of replacements) {
    if (html.includes(a)) html = html.split(a).join(b);
  }
  // ch1 material hint that exposes E=
  html = html.replace(
    /⚠ 介质击穿！ E = V\/d 超过材料极限——增大间距，或更换介质/,
    "⚠ 介质击穿！场强超过材料极限——增大间距，或更换介质"
  );
  return html;
}

function patchCh4Label(html) {
  return html.replace(
    /E = ½CV²  &ensp;目标：950 ~ 1150 J/,
    "目标储能：950 ~ 1150 J"
  );
}

function patchCraftWin(html, winFormula) {
  return html.replace(
    /(<div class="formula" id="craftWinFormula">)[^<]*(<\/div>)/,
    `$1${winFormula}$2`
  );
}

function patchCanvasLabelsWithE(html) {
  // Soften in-canvas E = labels if they dump formula structure; keep numeric field strength.
  // Leave A/d geometric labels.
  return html;
}

function patchFile(spec) {
  const srcPath = path.join(YANG, spec.yang);
  let html = fs.readFileSync(srcPath, "utf8");
  const before = html;

  html = patchTimer(html);
  html = patchCraftWin(html, spec.winFormula);
  html = patchDialogueFormulas(html, spec.ch);
  html = patchDerivationHook(html);

  if (spec.stripCapFormula) {
    html = patchCapFormulaHtml(html);
    html = patchSyncCapFormulaLive(html);
  }
  if (spec.stripCh2Formula) {
    html = patchCh2FormulaHtml(html);
  }
  if (spec.stripCh4EnergyLabel) {
    html = patchCh4Label(html);
  }

  // Ensure body gets cap-dark for timer contrast on this game
  if (!/document\.body\.classList\.add\(['"]cap-dark['"]\)/.test(html)) {
    html = html.replace(
      /<\/script>\s*<!-- ═+[\s\S]*?公式推导卡片/,
      (m) =>
        `<script>(function(){try{document.body.classList.add('cap-dark');}catch(e){}})();</script>\n` +
        m
    );
    // safer: inject near top of body after craft shell
    if (!/classList\.add\(['"]cap-dark['"]\)/.test(html)) {
      html = html.replace(
        /<body>/,
        `<body class="cap-dark">`
      );
    }
  } else if (!/<body[^>]*cap-dark/.test(html) && /<body>/.test(html)) {
    html = html.replace(/<body>/, `<body class="cap-dark">`);
  }

  if (html === before) {
    console.log("NOCHANGE", spec.yang);
  } else {
    fs.writeFileSync(srcPath, html, "utf8");
    console.log("PATCHED", spec.yang, "delta", html.length - before.length);
  }

  const dst = path.join(PKG, spec.id, "game.html");
  fs.copyFileSync(srcPath, dst);
  console.log("WRITEBACK", spec.id);
}

for (const spec of FILES) patchFile(spec);
console.log("done");
