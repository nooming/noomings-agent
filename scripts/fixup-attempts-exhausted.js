/**
 * Fixup: applyMode/apply hide + bindExhaustWinGuard boot call + ramp branches.
 * Run: node scripts/fixup-attempts-exhausted.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_ROOT = path.join(ROOT, 'data', 'runtime', 'packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');

const SAMPLE_MAP = {
  'circular-motion': { dir: '圆周运动', file: '圆周运动.html' },
  'pendulum-target': { dir: '单摆投靶', file: '单摆投靶.html' },
  'pendulum-clock': { dir: '钟表铺校时', file: '钟表铺校时.html' },
  'momentum-collision': { dir: '动量碰撞', file: '动量碰撞.html' },
  'refraction-snell': { dir: '折射', file: '折射.html' },
  'heat-conduction': { dir: '热传导', file: '热传导.html' },
  'rc-circuit': { dir: 'RC电路', file: 'RC电路.html' },
  photoelectric: { dir: '光电效应', file: '光电效应.html' },
  'cyclotron-radius': { dir: '回旋加速器', file: '回旋加速器.html' },
  'magnetic-force': { dir: '安培力', file: '安培力.html' },
  'friction-incline': { dir: '斜面摩擦', file: '斜面摩擦.html' },
  'gas-ideal': { dir: '理想气体', file: '理想气体.html' },
  'capacitor-era-ch1': { dir: '电容_介质与击穿', file: '电容_介质与击穿.html' },
  'capacitor-era-ch2': { dir: '电容_串并联', file: '电容_串并联.html' },
  'capacitor-era-ch4': { dir: '电容_储能与充电', file: '电容_储能与充电.html' },
  'capacitor-confound-ui': { dir: '电容混淆', file: '电容混淆.html' },
  'series-parallel': { dir: '串并联电路', file: '串并联电路.html' },
  'transformer-turns': { dir: '变压器', file: '变压器.html' },
  'efield-charge': { dir: '电场', file: '电场.html' },
  'thin-lens-implicit': { dir: '透镜', file: '透镜.html' },
  'projectile-cannon': { dir: '抛体大炮', file: '抛体大炮.html' },
  'multi-kp': { dir: '机械能', file: '机械能.html' },
  'projectile-basic': { dir: '斜抛', file: '斜抛.html' },
  'ramp-rolling-collision': { dir: '斜坡滚球', file: 'game.html' },
};

function fixHtml(html, id) {
  let out = html;
  let notes = [];

  // applyMode: insert hide at top if missing
  if (
    out.includes('function applyMode(mode){') &&
    !/function applyMode\(mode\)\{\r?\n\s*hideAttemptsExhausted\(\);/.test(out)
  ) {
    const before = out;
    out = out.replace(
      /function applyMode\(mode\)\{\r?\n(\s*)state\.mode = mode === 'challenge' \? 'challenge' : 'explore';/,
      (m, ind) => `function applyMode(mode){\n${ind}hideAttemptsExhausted();\n${ind}state.mode = mode === 'challenge' ? 'challenge' : 'explore';`,
    );
    if (out !== before) notes.push('applyMode-hide');
  }

  // manual apply already usually has hide; ensure anyway
  if (
    out.includes('function apply(mode){') &&
    out.includes('attempts-exhausted-settle') &&
    !/function apply\(mode\)\{\r?\n\s*hideAttemptsExhausted\(\);/.test(out)
  ) {
    const before = out;
    out = out.replace(
      /function apply\(mode\)\{\r?\n(\s*)state\.mode=mode==='challenge'\?'challenge':'explore';/,
      (m, ind) => `function apply(mode){\n${ind}hideAttemptsExhausted();\n${ind}state.mode=mode==='challenge'?'challenge':'explore';`,
    );
    if (out !== before) notes.push('apply-hide');
  }

  // boot: bindExhaustWinGuard
  if (out.includes('function bindExhaustWinGuard') && !out.includes('setTimeout(bindExhaustWinGuard')) {
    const before = out;
    if (out.includes("applyMode(sel.value || 'explore');")) {
      out = out.replace(
        "applyMode(sel.value || 'explore');",
        "applyMode(sel.value || 'explore');\n    setTimeout(bindExhaustWinGuard, 0);",
      );
    }
    if (out.includes("apply(sel.value||'explore');") && !out.includes('setTimeout(bindExhaustWinGuard')) {
      out = out.replace(
        "apply(sel.value||'explore');",
        "apply(sel.value||'explore');\n    setTimeout(bindExhaustWinGuard,0);",
      );
    }
    if (out !== before) notes.push('bind-guard');
  }

  // ramp exhausted branches (skip if already on unified settle)
  if (
    id === 'ramp-rolling-collision' &&
    out.includes('次数用尽') &&
    !out.includes("window.__showAttemptsExhausted('本局急单未完成")
  ) {
    const old = `showMessage("挑战结束", desc + "<br><br><span class='hl-warn'>次数用尽！</span>", true, () => {
                            ui.modeSelect.value = 'explore';
                            ui.modeSelect.dispatchEvent(new Event('change'));
                        });`;
    const next = `if (typeof window.__showAttemptsExhausted === 'function') {
                          try { ui.msgBox.classList.add('hidden'); } catch (e0) {}
                          window.__showAttemptsExhausted('本局急单未完成：未在限次内到达目标高度带。目标高度仍按本局锁定；可返回探究或再开一局竞赛。');
                          resetScene();
                        } else {
                          showMessage("挑战结束", desc + "<br><br><span class='hl-warn'>次数用尽！</span>", true, () => {
                            ui.modeSelect.value = 'explore';
                            ui.modeSelect.dispatchEvent(new Event('change'));
                          });
                        }`;
    if (out.includes(old)) {
      out = out.split(old).join(next);
      notes.push('ramp-exhaust');
    } else {
      // whitespace-tolerant
      const re = /showMessage\("挑战结束",\s*desc\s*\+\s*"<br><br><span class='hl-warn'>次数用尽！<\/span>",\s*true,\s*\(\)\s*=>\s*\{\s*ui\.modeSelect\.value\s*=\s*'explore';\s*ui\.modeSelect\.dispatchEvent\(new Event\('change'\)\);\s*\}\);/g;
      const replaced = out.replace(re, next);
      if (replaced !== out) {
        out = replaced;
        notes.push('ramp-exhaust-re');
      } else {
        notes.push('ramp-miss');
      }
    }
  }

  // projectile / ramp: hide on mode change already handled for projectile; ensure ramp
  if (
    (id === 'ramp-rolling-collision' || id === 'projectile-basic') &&
    out.includes("ui.modeSelect.addEventListener('change'") &&
    !out.includes("__hideAttemptsExhausted === 'function') window.__hideAttemptsExhausted()")
  ) {
    const before = out;
    out = out.replace(
      /ui\.modeSelect\.addEventListener\('change',\s*\(e\)\s*=>\s*\{/,
      `ui.modeSelect.addEventListener('change', (e) => {
                if (typeof window.__hideAttemptsExhausted === 'function') window.__hideAttemptsExhausted();`,
    );
    if (out !== before) notes.push('mode-hide');
  }

  return { html: out, notes };
}

function main() {
  const results = [];
  for (const id of fs.readdirSync(PKG_ROOT)) {
    const gamePath = path.join(PKG_ROOT, id, 'game.html');
    if (!fs.existsSync(gamePath)) continue;
    const raw = fs.readFileSync(gamePath, 'utf8');
    if (!raw.includes('attempts-exhausted-settle')) continue;
    const { html, notes } = fixHtml(raw, id);
    if (notes.length) {
      fs.writeFileSync(gamePath, html, 'utf8');
      const sm = SAMPLE_MAP[id];
      let sample = '';
      if (sm) {
        const sp = path.join(SAMPLE_ROOT, sm.dir, sm.file);
        if (fs.existsSync(sp)) {
          const sraw = fs.readFileSync(sp, 'utf8');
          const sres = fixHtml(sraw, id);
          if (sres.notes.length) {
            fs.writeFileSync(sp, sres.html, 'utf8');
            sample = 'sample:' + sres.notes.join('+');
          }
        }
      }
      results.push({ id, notes: notes.join('+'), sample });
      console.log(id, notes.join('+'), sample);
    }
  }
  console.log('fixed', results.length);
}

main();
