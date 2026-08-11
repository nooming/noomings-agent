/**
 * Inject attempts_exhausted emit into dual-mode showAttemptsExhausted (idempotent).
 *
 * On first show of the exhausted settle (challenge, attempts<=0, not won):
 *   __emit('attempts_exhausted', { attempts: 0, mode: 'challenge' })
 *   __emit('snapshot', { winOk: false, attemptsExhausted: true, hintKey: 'attempts_exhausted' })
 *
 * Run: node scripts/patch-attempts-exhausted-emit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_ROOT = path.join(ROOT, 'data', 'runtime', 'packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');

const MARKER = 'attempts-exhausted-emit';

const EMIT_SNIPPET = `
    /* === ${MARKER} === */
    if (firstShow) {
      try {
        var __exPayload = { attempts: 0, mode: 'challenge' };
        var __exSnap = { winOk: false, attemptsExhausted: true, hintKey: 'attempts_exhausted' };
        if (typeof window.__emit === 'function') {
          window.__emit('attempts_exhausted', __exPayload);
          window.__emit('snapshot', __exSnap);
        } else if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.record === 'function') {
          window.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
          window.PlatformTraceAdapter.record('snapshot', __exSnap);
        }
      } catch (__exErr) {}
    }
`;

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

/** Shell / manual style: showAttemptsExhausted with el.hidden = false */
function patchShellOrManualShow(html) {
  if (html.includes(`/* === ${MARKER} === */`)) {
    return { html, changed: false, kind: 'already' };
  }
  if (!html.includes('function showAttemptsExhausted')) {
    return { html, changed: false, kind: 'no-show' };
  }

  let out = html;
  let changed = false;

  // Pattern A (pretty): ensureAttemptsExhaustedUi(); var el = $('attempts-exhausted'); if (el) el.hidden = false;
  const reA = /(function showAttemptsExhausted\(\)\{\s*\n(?:.*\n)*?\s*ensureAttemptsExhaustedUi\(\);\s*\n\s*var el = \$\('attempts-exhausted'\);\s*\n\s*)if \(el\) el\.hidden = false;(\s*\n\s*\})/;
  if (reA.test(out) && !out.includes(`/* === ${MARKER} === */`)) {
    out = out.replace(reA, (_, head, tail) =>
      `${head}if (!el) return;\n    var firstShow = !!el.hidden;\n    el.hidden = false;${EMIT_SNIPPET}${tail}`,
    );
    changed = out !== html;
  }

  // Pattern B (compact manual): ensureAttemptsExhaustedUi(); var el=$('attempts-exhausted'); if(el) el.hidden=false;
  if (!changed && !out.includes(`/* === ${MARKER} === */`)) {
    const reB = /(function showAttemptsExhausted\(\)\{\s*\n?\s*if\(state\.mode!=='challenge'\|\|state\.attempts>0\|\|__isChallengeWonNow\(\)\) return;\s*\n?\s*ensureAttemptsExhaustedUi\(\);\s*\n?\s*var el=\$\('attempts-exhausted'\); )if\(el\) el\.hidden=false;(\s*\n?\s*\})/;
    if (reB.test(out)) {
      out = out.replace(
        reB,
        (_, head, tail) =>
          `${head}if(!el) return; var firstShow=!!el.hidden; el.hidden=false;${EMIT_SNIPPET.replace(/\n    /g, '\n    ')}${tail}`,
      );
      changed = out !== html;
    }
  }

  // Pattern C (compact single-line-ish from inject template)
  if (!changed && !out.includes(`/* === ${MARKER} === */`)) {
    const reC = /(function showAttemptsExhausted\(\)\{\s*\n\s*if \(state\.mode !== 'challenge' \|\| state\.attempts > 0\) return;\s*\n\s*if \(__isChallengeWonNow\(\)\) return;\s*\n\s*ensureAttemptsExhaustedUi\(\);\s*\n\s*var el = \$\('attempts-exhausted'\);\s*\n\s*)if \(el\) el\.hidden = false;(\s*\n\s*\})/;
    if (reC.test(out)) {
      out = out.replace(reC, (_, head, tail) =>
        `${head}if (!el) return;\n    var firstShow = !!el.hidden;\n    el.hidden = false;${EMIT_SNIPPET}${tail}`,
      );
      changed = out !== html;
    }
  }

  return { html: out, changed, kind: changed ? 'shell-manual' : 'no-match-show' };
}

/** Standalone: function showAttemptsExhausted(desc){ ensureUi(); ... el.hidden = false; } */
function patchStandaloneShow(html) {
  if (html.includes(`/* === ${MARKER} === */`)) {
    return { html, changed: false, kind: 'already' };
  }
  if (!html.includes('function showAttemptsExhausted(desc)')) {
    return { html, changed: false, kind: 'no-standalone' };
  }

  const re = /(function showAttemptsExhausted\(desc\)\{\s*\n\s*ensureUi\(\);\s*\n\s*var p = \$\('attemptsExhaustedDesc'\);\s*\n\s*if \(p && typeof desc === 'string' && desc\) p\.textContent = desc;\s*\n\s*var el = \$\('attempts-exhausted'\);\s*\n\s*)if \(el\) el\.hidden = false;(\s*\n\s*\})/;
  if (!re.test(html)) {
    // looser
    const re2 = /(function showAttemptsExhausted\(desc\)\{[\s\S]*?var el = \$\('attempts-exhausted'\);\s*\n\s*)if \(el\) el\.hidden = false;(\s*\n\s*\})/;
    if (!re2.test(html)) return { html, changed: false, kind: 'standalone-no-match' };
    const out = html.replace(re2, (_, head, tail) =>
      `${head}if (!el) return;\n    var firstShow = !!el.hidden;\n    el.hidden = false;${EMIT_SNIPPET}${tail}`,
    );
    return { html: out, changed: out !== html, kind: 'standalone' };
  }
  const out = html.replace(re, (_, head, tail) =>
    `${head}if (!el) return;\n    var firstShow = !!el.hidden;\n    el.hidden = false;${EMIT_SNIPPET}${tail}`,
  );
  return { html: out, changed: out !== html, kind: 'standalone' };
}

function patchHtml(html) {
  if (html.includes(`/* === ${MARKER} === */`)) {
    return { html, changed: false, kind: 'already' };
  }
  // Prefer shell/manual first
  let res = patchShellOrManualShow(html);
  if (res.changed) return res;
  if (html.includes('function showAttemptsExhausted(desc)')) {
    return patchStandaloneShow(html);
  }
  return res;
}

function main() {
  const results = [];
  const pkgs = fs.readdirSync(PKG_ROOT).filter((d) => fs.existsSync(path.join(PKG_ROOT, d, 'game.html')));

  for (const id of pkgs) {
    const gamePath = path.join(PKG_ROOT, id, 'game.html');
    const raw = fs.readFileSync(gamePath, 'utf8');
    if (!raw.includes('showAttemptsExhausted') && !raw.includes('__showAttemptsExhausted')) {
      results.push({ id, status: 'skip-no-exhaust' });
      continue;
    }
    const { html, changed, kind } = patchHtml(raw);
    if (!changed) {
      results.push({ id, status: kind || 'unchanged' });
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
          sampleStatus = 'patched';
        } else {
          sampleStatus = sres.kind || 'sample-unchanged';
        }
      } else {
        sampleStatus = 'sample-missing';
      }
    }
    results.push({ id, status: 'ok', kind, sample: sampleStatus });
  }

  for (const r of results) {
    console.log([r.id, r.status, r.kind || '', r.sample || ''].filter(Boolean).join(' | '));
  }
  console.log('done:', results.filter((r) => r.status === 'ok').length, 'patched');
}

if (require.main === module) main();
module.exports = { patchHtml, EMIT_SNIPPET, MARKER };
