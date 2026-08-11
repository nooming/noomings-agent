/**
 * P1: after attempts exhausted, re-entering challenge via modeSelect
 * (返回探究 → 再选竞赛) must rotate PlatformTrace session — same as「再开一局」.
 * Idempotent. Patches runtime packages + 样本html mirrors + inject template.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MARK = '/* === exhausted-mode-reenter-new-round === */';

function patchShellHtml(html) {
  if (!html.includes('function applyMode(mode)') || !html.includes('attempts-exhausted-settle')) {
    return { html, changed: false, reason: 'no-shell' };
  }
  if (html.includes(MARK) || html.includes('__exhaustedNeedsNewRound')) {
    return { html, changed: false, reason: 'already' };
  }

  let out = html;
  let n = 0;

  // 1) flag next to exhaust timer vars
  const flagNeedle = 'var __exhaustTimer = null;\n  var __exhaustBound = false;';
  const flagRepl =
    'var __exhaustTimer = null;\n  var __exhaustBound = false;\n  ' +
    MARK +
    '\n  var __exhaustedNeedsNewRound = false;';
  if (out.includes(flagNeedle)) {
    out = out.replace(flagNeedle, flagRepl);
    n++;
  } else {
    return { html, changed: false, reason: 'no-flag-anchor' };
  }

  // 2) set flag on first show of exhausted layer
  const showNeedle = 'var firstShow = !!el.hidden;\n    el.hidden = false;';
  const showRepl =
    'var firstShow = !!el.hidden;\n    el.hidden = false;\n    if (firstShow) __exhaustedNeedsNewRound = true;';
  if (out.includes(showNeedle)) {
    out = out.replace(showNeedle, showRepl);
    n++;
  }

  // 3) retry clears flag (explicit new-round already)
  const retryNeedle =
    "if (bRetry) bRetry.addEventListener('click', function(){\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}";
  const retryRepl =
    "if (bRetry) bRetry.addEventListener('click', function(){\n      __exhaustedNeedsNewRound = false;\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}";
  if (out.includes(retryNeedle)) {
    out = out.replace(retryNeedle, retryRepl);
    n++;
  }

  // 4) applyMode: re-enter challenge after exhaust → new round
  const applyNeedle =
    'function applyMode(mode){\n    hideAttemptsExhausted();\n    state.mode = mode === \'challenge\' ? \'challenge\' : \'explore\';';
  const applyRepl =
    'function applyMode(mode){\n    hideAttemptsExhausted();\n    var __nextMode = mode === \'challenge\' ? \'challenge\' : \'explore\';\n    if (__nextMode === \'challenge\' && __exhaustedNeedsNewRound) {\n      __exhaustedNeedsNewRound = false;\n      try { if (typeof window.__platformTraceRequestNewRound === \'function\') window.__platformTraceRequestNewRound(\'exhausted_mode_reenter\'); } catch (__nr) {}\n    }\n    state.mode = __nextMode;';
  if (out.includes(applyNeedle)) {
    out = out.replace(applyNeedle, applyRepl);
    n++;
  } else {
    return { html, changed: false, reason: 'no-apply-anchor' };
  }

  return { html: out, changed: n >= 2, reason: `ops=${n}` };
}

/** Manual dual-mode: function apply(mode){ ... } (pendulum / cannon / era-*). */
function patchManualApply(html) {
  if (!html.includes('attempts-exhausted-settle') || !html.includes('function apply(mode)')) {
    return { html, changed: false, reason: 'no-manual-apply' };
  }
  if (html.includes(MARK) || html.includes('__exhaustedNeedsNewRound')) {
    return { html, changed: false, reason: 'already' };
  }

  let out = html;
  let n = 0;

  // flag: pretty or compact
  const flagVariants = [
    {
      from: 'var __exhaustTimer = null;\n  var __exhaustBound = false;',
      to:
        'var __exhaustTimer = null;\n  var __exhaustBound = false;\n  ' +
        MARK +
        '\n  var __exhaustedNeedsNewRound = false;',
    },
    {
      from: 'var __exhaustTimer=null, __exhaustBound=false;',
      to: 'var __exhaustTimer=null, __exhaustBound=false;\n  ' + MARK + '\n  var __exhaustedNeedsNewRound=false;',
    },
  ];
  let flagged = false;
  for (const v of flagVariants) {
    if (out.includes(v.from)) {
      out = out.replace(v.from, v.to);
      flagged = true;
      n++;
      break;
    }
  }
  if (!flagged) return { html, changed: false, reason: 'no-flag-anchor-manual' };

  // firstShow
  const showVariants = [
    {
      from: 'var firstShow = !!el.hidden;\n    el.hidden = false;',
      to: 'var firstShow = !!el.hidden;\n    el.hidden = false;\n    if (firstShow) __exhaustedNeedsNewRound = true;',
    },
    {
      from: 'var firstShow=!!el.hidden;\n    el.hidden=false;',
      to: 'var firstShow=!!el.hidden;\n    el.hidden=false;\n    if(firstShow) __exhaustedNeedsNewRound=true;',
    },
  ];
  for (const v of showVariants) {
    if (out.includes(v.from)) {
      out = out.replace(v.from, v.to);
      n++;
      break;
    }
  }

  // retry clear (pretty / compact)
  const retryVariants = [
    {
      from:
        "if (bRetry) bRetry.addEventListener('click', function(){\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}",
      to:
        "if (bRetry) bRetry.addEventListener('click', function(){\n      __exhaustedNeedsNewRound = false;\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}",
    },
    {
      from:
        "if(bRetry) bRetry.addEventListener('click',function(){\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}",
      to:
        "if(bRetry) bRetry.addEventListener('click',function(){\n      __exhaustedNeedsNewRound=false;\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}",
    },
  ];
  for (const v of retryVariants) {
    if (out.includes(v.from)) {
      out = out.replace(v.from, v.to);
      n++;
      break;
    }
  }

  // apply(mode) re-enter
  const applyVariants = [
    {
      from: 'function apply(mode){\n    hideAttemptsExhausted();\n    state.mode=mode===\'challenge\'?\'challenge\':\'explore\';',
      to:
        'function apply(mode){\n    hideAttemptsExhausted();\n    var __nextMode=mode===\'challenge\'?\'challenge\':\'explore\';\n    if(__nextMode===\'challenge\'&&__exhaustedNeedsNewRound){\n      __exhaustedNeedsNewRound=false;\n      try{ if(typeof window.__platformTraceRequestNewRound===\'function\') window.__platformTraceRequestNewRound(\'exhausted_mode_reenter\'); }catch(__nr){}\n    }\n    state.mode=__nextMode;',
    },
    {
      from: 'function apply(mode){\n    hideAttemptsExhausted();\n    state.mode = mode === \'challenge\' ? \'challenge\' : \'explore\';',
      to:
        'function apply(mode){\n    hideAttemptsExhausted();\n    var __nextMode = mode === \'challenge\' ? \'challenge\' : \'explore\';\n    if (__nextMode === \'challenge\' && __exhaustedNeedsNewRound) {\n      __exhaustedNeedsNewRound = false;\n      try { if (typeof window.__platformTraceRequestNewRound === \'function\') window.__platformTraceRequestNewRound(\'exhausted_mode_reenter\'); } catch (__nr) {}\n    }\n    state.mode = __nextMode;',
    },
  ];
  let applied = false;
  for (const v of applyVariants) {
    if (out.includes(v.from)) {
      out = out.replace(v.from, v.to);
      applied = true;
      n++;
      break;
    }
  }
  if (!applied) return { html, changed: false, reason: 'no-apply-anchor-manual' };

  return { html: out, changed: n >= 2, reason: `manual-apply ops=${n}` };
}

/** Custom modeSelect handlers (ramp-rolling / projectile-basic style). */
function patchModeSelectChallenge(html) {
  if (html.includes(MARK) || html.includes('__exhaustedNeedsNewRound')) {
    return { html, changed: false, reason: 'already' };
  }
  if (!html.includes('attempts-exhausted') || !/modeSelect\.addEventListener\(\s*['"]change['"]/.test(html)) {
    return { html, changed: false, reason: 'no-modeSelect-challenge' };
  }

  let out = html;
  let n = 0;

  // Prefer state object flag near attempts
  if (/attempts:\s*\d+/.test(out) && out.includes('timeLeft:')) {
    out = out.replace(
      /(attempts:\s*\d+,)\n(\s*)(timeLeft:)/,
      `$1\n$2${MARK}\n$2__exhaustedNeedsNewRound: false,\n$2$3`
    );
    if (out.includes('__exhaustedNeedsNewRound')) n++;
  }
  if (!out.includes('__exhaustedNeedsNewRound')) {
    // settle IIFE flag near exhaust helper
    if (out.includes('var __exhaustTimer = null;')) {
      out = out.replace(
        'var __exhaustTimer = null;',
        'var __exhaustTimer = null;\n  ' + MARK + '\n  var __exhaustedNeedsNewRound = false;'
      );
      n++;
    } else if (out.includes('function showAttemptsExhausted')) {
      out = out.replace(
        'function showAttemptsExhausted',
        MARK + '\n  var __exhaustedNeedsNewRound = false;\n  function showAttemptsExhausted'
      );
      n++;
    } else {
      return { html, changed: false, reason: 'no-flag-anchor-modeselect' };
    }
  }

  // firstShow → set flag (state. or bare)
  if (out.includes('var firstShow = !!el.hidden;\n    el.hidden = false;')) {
    const useState = out.includes('__exhaustedNeedsNewRound: false');
    const setFlag = useState
      ? 'if (firstShow) { try { state.__exhaustedNeedsNewRound = true; } catch (__e) {} }'
      : 'if (firstShow) __exhaustedNeedsNewRound = true;';
    out = out.replace(
      'var firstShow = !!el.hidden;\n    el.hidden = false;',
      'var firstShow = !!el.hidden;\n    el.hidden = false;\n    ' + setFlag
    );
    n++;
  }

  // retry clear
  if (out.includes("window.__platformTraceRequestNewRound('exhausted_retry')")) {
    const useState = /__exhaustedNeedsNewRound:\s*false/.test(out);
    const clear = useState
      ? "try { state.__exhaustedNeedsNewRound = false; } catch(__e) {}\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}"
      : "__exhaustedNeedsNewRound = false;\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}";
    out = out.replace(
      /try \{ if \(typeof window\.__platformTraceRequestNewRound === 'function'\) window\.__platformTraceRequestNewRound\('exhausted_retry'\); \} catch \(__nr\) \{\}/,
      clear
    );
    n++;
  }

  // On entering challenge via modeSelect, rotate if needed
  const challengeEnterPatterns = [
    {
      from:
        `if (state.mode === 'challenge') {
                    ui.challengeStats.classList.add('is-visible');
                    ui.sideGoal.textContent = '竞赛：在限次内让靶球停在 HUD 目标高度附近（±0.2 m）。';
                    state.attempts = 3;`,
      to:
        `if (state.mode === 'challenge') {
                    if (state.__exhaustedNeedsNewRound) {
                      state.__exhaustedNeedsNewRound = false;
                      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_mode_reenter'); } catch (__nr) {}
                    }
                    ui.challengeStats.classList.add('is-visible');
                    ui.sideGoal.textContent = '竞赛：在限次内让靶球停在 HUD 目标高度附近（±0.2 m）。';
                    state.attempts = 3;`,
    },
    {
      from:
        `if (state.mode === 'challenge') {
                    ui.challengeStats.classList.remove('hidden');
                    ui.challengeStats.classList.add('flex');
                    state.attempts = 6;`,
      to:
        `if (state.mode === 'challenge') {
                    if (state.__exhaustedNeedsNewRound) {
                      state.__exhaustedNeedsNewRound = false;
                      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_mode_reenter'); } catch (__nr) {}
                    }
                    ui.challengeStats.classList.remove('hidden');
                    ui.challengeStats.classList.add('flex');
                    state.attempts = 6;`,
    },
  ];
  let entered = false;
  for (const p of challengeEnterPatterns) {
    if (out.includes(p.from)) {
      out = out.replace(p.from, p.to);
      entered = true;
      n++;
      break;
    }
  }
  if (!entered) {
    // generic: first challenge attempts reset in modeSelect handler
    const m = out.match(
      /if\s*\(\s*state\.mode\s*===\s*['"]challenge['"]\s*\)\s*\{\s*\n(\s*)state\.attempts\s*=\s*(\d+)\s*;/
    );
    if (m) {
      const indent = m[1];
      out = out.replace(
        m[0],
        `if (state.mode === 'challenge') {\n${indent}if (state.__exhaustedNeedsNewRound) {\n${indent}  state.__exhaustedNeedsNewRound = false;\n${indent}  try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_mode_reenter'); } catch (__nr) {}\n${indent}}\n${indent}state.attempts = ${m[2]};`
      );
      entered = true;
      n++;
    }
  }
  if (!entered) return { html, changed: false, reason: 'no-challenge-enter-anchor' };

  return { html: out, changed: n >= 2, reason: `modeselect ops=${n}` };
}

function patchProjectileBasic(html) {
  return patchModeSelectChallenge(html);
}

function walkTargets() {
  const files = [];
  const pkgRoot = path.join(ROOT, 'data/runtime/packages');
  for (const id of fs.readdirSync(pkgRoot)) {
    const g = path.join(pkgRoot, id, 'game.html');
    if (fs.existsSync(g)) files.push(g);
  }
  const sampleRoot = path.join(ROOT, '样本html');
  if (fs.existsSync(sampleRoot)) {
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (/\.html$/i.test(name) && !/图谱/.test(name)) files.push(p);
      }
    };
    walk(sampleRoot);
  }
  files.push(path.join(ROOT, 'tests/scripts/inject-dual-mode-shell.js'));
  return files;
}

function patchInjectTemplate(src) {
  if (src.includes('__exhaustedNeedsNewRound')) return { html: src, changed: false, reason: 'already' };
  let out = src;
  out = out.replace(
    'var __exhaustTimer = null;\n  var __exhaustBound = false;',
    'var __exhaustTimer = null;\n  var __exhaustBound = false;\n  ' + MARK + '\n  var __exhaustedNeedsNewRound = false;'
  );
  out = out.replace(
    'function applyMode(mode){\n    hideAttemptsExhausted();\n    state.mode = mode === \'challenge\' ? \'challenge\' : \'explore\';',
    'function applyMode(mode){\n    hideAttemptsExhausted();\n    var __nextMode = mode === \'challenge\' ? \'challenge\' : \'explore\';\n    if (__nextMode === \'challenge\' && __exhaustedNeedsNewRound) {\n      __exhaustedNeedsNewRound = false;\n      try { if (typeof window.__platformTraceRequestNewRound === \'function\') window.__platformTraceRequestNewRound(\'exhausted_mode_reenter\'); } catch (__nr) {}\n    }\n    state.mode = __nextMode;'
  );
  out = out.replace(
    "if (bRetry) bRetry.addEventListener('click', function(){\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}",
    "if (bRetry) bRetry.addEventListener('click', function(){\n      __exhaustedNeedsNewRound = false;\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}"
  );
  out = out.replace(
    'var firstShow = !!el.hidden;\n    el.hidden = false;',
    'var firstShow = !!el.hidden;\n    el.hidden = false;\n    if (firstShow) __exhaustedNeedsNewRound = true;'
  );
  return { html: out, changed: out !== src, reason: 'inject-template' };
}

function patchOne(file, raw) {
  if (file.endsWith('inject-dual-mode-shell.js')) return patchInjectTemplate(raw);
  if (file.endsWith('patch-manual-dual-mode.js')) return patchManualTemplateSource(raw);

  // Try in order: shell applyMode → manual apply → modeSelect custom
  let result = patchShellHtml(raw);
  if (result.changed || result.reason === 'already') return result;
  result = patchManualApply(raw);
  if (result.changed || result.reason === 'already') return result;
  result = patchModeSelectChallenge(raw);
  if (result.changed || result.reason === 'already') return result;
  return result;
}

/** Keep future manual inject template in sync. */
function patchManualTemplateSource(src) {
  if (src.includes('__exhaustedNeedsNewRound')) return { html: src, changed: false, reason: 'already' };
  if (!src.includes('function apply(mode){')) return { html: src, changed: false, reason: 'no-manual-template' };
  let out = src;
  out = out.replace(
    'var __exhaustTimer=null, __exhaustBound=false;',
    'var __exhaustTimer=null, __exhaustBound=false;\n  ' + MARK + '\n  var __exhaustedNeedsNewRound=false;'
  );
  out = out.replace(
    'function apply(mode){\n    hideAttemptsExhausted();\n    state.mode=mode===\'challenge\'?\'challenge\':\'explore\';',
    'function apply(mode){\n    hideAttemptsExhausted();\n    var __nextMode=mode===\'challenge\'?\'challenge\':\'explore\';\n    if(__nextMode===\'challenge\'&&__exhaustedNeedsNewRound){\n      __exhaustedNeedsNewRound=false;\n      try{ if(typeof window.__platformTraceRequestNewRound===\'function\') window.__platformTraceRequestNewRound(\'exhausted_mode_reenter\'); }catch(__nr){}\n    }\n    state.mode=__nextMode;'
  );
  out = out.replace(
    "if(bRetry) bRetry.addEventListener('click',function(){\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}",
    "if(bRetry) bRetry.addEventListener('click',function(){\n      __exhaustedNeedsNewRound=false;\n      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}"
  );
  out = out.replace(
    'var firstShow=!!el.hidden;\n    el.hidden=false;',
    'var firstShow=!!el.hidden;\n    el.hidden=false;\n    if(firstShow) __exhaustedNeedsNewRound=true;'
  );
  return { html: out, changed: out !== src, reason: 'manual-template' };
}

function main() {
  const summary = [];
  const files = walkTargets();
  files.push(path.join(ROOT, 'tests/scripts/patch-manual-dual-mode.js'));
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const result = patchOne(file, raw);
    if (result.changed) {
      fs.writeFileSync(file, result.html, 'utf8');
      summary.push({ file: path.relative(ROOT, file), ok: true, reason: result.reason });
    } else {
      summary.push({ file: path.relative(ROOT, file), ok: false, reason: result.reason });
    }
  }
  const changed = summary.filter((s) => s.ok);
  const manualIds = [
    'capacitor-era-ch1',
    'capacitor-era-ch2',
    'capacitor-era-ch4',
    'pendulum-clock',
    'pendulum-target',
    'projectile-cannon',
    'ramp-rolling-collision',
  ];
  const manualStatus = manualIds.map((id) => {
    const g = path.join(ROOT, 'data/runtime/packages', id, 'game.html');
    const t = fs.existsSync(g) ? fs.readFileSync(g, 'utf8') : '';
    return { id, patched: t.includes('__exhaustedNeedsNewRound') && t.includes('exhausted_mode_reenter') };
  });
  console.log(
    JSON.stringify(
      {
        changed: changed.length,
        total: summary.length,
        changedFiles: changed.map((c) => c.file),
        manualStatus,
        skipped: summary.filter((s) => !s.ok && !['already', 'no-shell', 'no-manual-apply', 'no-modeSelect-challenge'].includes(s.reason)).slice(0, 40),
      },
      null,
      2
    )
  );
}

main();
