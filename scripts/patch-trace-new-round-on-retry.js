/**
 * After terminal settle (机会用尽「再开一局竞赛」 / craft「再玩一次»),
 * request a new PlatformTraceAdapter session via student-play shell.
 *
 * Idempotent. Run: node scripts/patch-trace-new-round-on-retry.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_ROOT = path.join(ROOT, 'data', 'runtime', 'packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');

const MARKER = 'trace-new-round-on-retry';

const SAMPLE_MAP = {
  'circular-motion': { dir: '圆周运动', file: '圆周运动.html' },
  'projectile-basic': { dir: '斜抛', file: '斜抛.html' },
  'projectile-cannon': { dir: '抛体大炮', file: '抛体大炮.html' },
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
  'multi-kp': { dir: '机械能', file: '机械能.html' },
  'ramp-rolling-collision': { dir: '斜坡滚球', file: 'game.html' },
};

const HELPER_SNIPPET = `
<script>
/* === ${MARKER} === */
(function(){
  if (window.__platformTraceRequestNewRound) return;
  window.__platformTraceRequestNewRound = function(reason){
    var r = reason || 'retry';
    try {
      if (window.parent && window.parent !== window) {
        if (typeof window.parent.__platformTraceNewRound === 'function') {
          window.parent.__platformTraceNewRound({ reason: r });
          return true;
        }
        window.parent.postMessage({ type: 'platform-trace-new-round', reason: r }, '*');
        return true;
      }
    } catch (e) {}
    try {
      if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.beginNewRound === 'function') {
        window.PlatformTraceAdapter.beginNewRound({ reason: r });
        return true;
      }
    } catch (e2) {}
    return false;
  };
})();
</script>
`;

const EXHAUST_CALL =
  "try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}";

const CRAFT_CALL =
  "try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('craft_win_replay'); } catch (__nr) {}";

function injectHelper(html) {
  if (html.includes(`/* === ${MARKER} === */`)) {
    return { html, changed: false };
  }
  // Prefer before last </body>; else append.
  const idx = html.lastIndexOf('</body>');
  if (idx >= 0) {
    return {
      html: html.slice(0, idx) + HELPER_SNIPPET + html.slice(idx),
      changed: true,
    };
  }
  return { html: html + HELPER_SNIPPET, changed: true };
}

function patchExhaustRetry(html) {
  if (html.includes("__platformTraceRequestNewRound('exhausted_retry')")
    || html.includes('__platformTraceRequestNewRound("exhausted_retry")')) {
    return { html, changed: false, kind: 'exhaust-already' };
  }
  // Pretty shell / manual
  let next = html.replace(
    /(if\s*\(bRetry\)\s*bRetry\.addEventListener\('click',\s*function\s*\(\)\{\s*\n)(\s*)hideAttemptsExhausted\(\);/g,
    `$1$2${EXHAUST_CALL}\n$2hideAttemptsExhausted();`,
  );
  if (next !== html) return { html: next, changed: true, kind: 'exhaust-pretty' };

  // Compact manual: if(bRetry) bRetry.addEventListener('click',function(){\n      hideAttemptsExhausted();
  next = html.replace(
    /(if\s*\(bRetry\)\s*bRetry\.addEventListener\('click',\s*function\s*\(\)\{\s*\n)(\s*)hideAttemptsExhausted\(\);/g,
    `$1$2${EXHAUST_CALL}\n$2hideAttemptsExhausted();`,
  );
  if (next !== html) return { html: next, changed: true, kind: 'exhaust-compact' };

  // Ultra-compact: if(bRetry) bRetry.addEventListener('click',function(){\n      hideAttemptsExhausted(); apply(
  next = html.replace(
    /(if\(bRetry\)\s*bRetry\.addEventListener\('click',function\(\)\{\s*\n)(\s*)hideAttemptsExhausted\(\);/g,
    `$1$2${EXHAUST_CALL}\n$2hideAttemptsExhausted();`,
  );
  if (next !== html) return { html: next, changed: true, kind: 'exhaust-ultracompact' };

  return { html, changed: false, kind: 'exhaust-miss' };
}

function patchCraftWinReplay(html) {
  if (html.includes("__platformTraceRequestNewRound('craft_win_replay')")
    || html.includes('__platformTraceRequestNewRound("craft_win_replay")')) {
    return { html, changed: false, kind: 'craft-already' };
  }

  // craft-gold-runtime: if (wbtn) wbtn.addEventListener('click', function(){ if (wbtn.disabled) return;
  let next = html.replace(
    /(if\s*\(wbtn\)\s*wbtn\.addEventListener\('click',\s*function\s*\(\)\{\s*\n\s*if\s*\(wbtn\.disabled\)\s*return;\s*\n)(\s*)/g,
    `$1$2${CRAFT_CALL}\n$2`,
  );
  if (next !== html) return { html: next, changed: true, kind: 'craft-gold' };

  // ramp-rolling custom: ui.craftWinBtn.addEventListener('click', () => {\n                if (ui.craftWinBtn.disabled) return;
  next = html.replace(
    /(ui\.craftWinBtn\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*\n)(\s*)if\s*\(ui\.craftWinBtn\.disabled\)\s*return;\s*\n/g,
    `$1$2if (ui.craftWinBtn.disabled) return;\n$2${CRAFT_CALL}\n`,
  );
  if (next !== html) return { html: next, changed: true, kind: 'craft-ramp' };

  return { html, changed: false, kind: 'craft-miss' };
}

function patchHtml(raw) {
  let html = raw;
  let changed = false;
  const kinds = [];

  const needsHook = html.includes('attemptsExhaustedRetry')
    || html.includes('craftWinBtn')
    || html.includes('craft-gold-runtime');
  if (!needsHook) {
    return { html, changed: false, kinds: ['skip'] };
  }

  const h = injectHelper(html);
  html = h.html;
  if (h.changed) {
    changed = true;
    kinds.push('helper');
  }

  if (html.includes('attemptsExhaustedRetry') || html.includes("bRetry.addEventListener")) {
    const e = patchExhaustRetry(html);
    html = e.html;
    if (e.changed) changed = true;
    kinds.push(e.kind);
  }

  if (html.includes('craftWinBtn') || html.includes('craft-gold-runtime')) {
    const c = patchCraftWinReplay(html);
    html = c.html;
    if (c.changed) changed = true;
    kinds.push(c.kind);
  }

  return { html, changed, kinds };
}

function main() {
  const results = [];
  const pkgs = fs.readdirSync(PKG_ROOT).filter((d) => fs.existsSync(path.join(PKG_ROOT, d, 'game.html')));

  for (const id of pkgs) {
    const gamePath = path.join(PKG_ROOT, id, 'game.html');
    const raw = fs.readFileSync(gamePath, 'utf8');
    const { html, changed, kinds } = patchHtml(raw);
    if (!changed) {
      results.push({ id, status: kinds.includes('skip') ? 'skip' : 'unchanged', kinds });
      continue;
    }
    fs.writeFileSync(gamePath, html, 'utf8');
    let sampleStatus = 'no-sample';
    const sm = SAMPLE_MAP[id];
    if (sm) {
      const samplePath = path.join(SAMPLE_ROOT, sm.dir, sm.file);
      if (fs.existsSync(samplePath)) {
        const sraw = fs.readFileSync(samplePath, 'utf8');
        const sres = patchHtml(sraw);
        if (sres.changed) {
          fs.writeFileSync(samplePath, sres.html, 'utf8');
          sampleStatus = 'patched:' + sres.kinds.join('+');
        } else {
          sampleStatus = 'sample-unchanged';
        }
      } else {
        sampleStatus = 'sample-missing';
      }
    }
    results.push({ id, status: 'ok', kinds, sample: sampleStatus });
  }

  for (const r of results) {
    console.log([r.id, r.status, (r.kinds || []).join('+'), r.sample || ''].filter(Boolean).join(' | '));
  }
  const ok = results.filter((r) => r.status === 'ok');
  console.log('done:', ok.length, 'packages patched;', results.filter((r) => r.sample && String(r.sample).startsWith('patched')).length, 'samples');
}

if (require.main === module) main();
module.exports = { patchHtml, MARKER, HELPER_SNIPPET, EXHAUST_CALL, CRAFT_CALL };
