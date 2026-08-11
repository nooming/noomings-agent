/**
 * Inject unified「机会用尽」settle layer into dual-mode packages.
 * Idempotent: skips files that already contain attempts-exhausted settle.
 *
 * Run: node scripts/patch-attempts-exhausted-settle.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_ROOT = path.join(ROOT, 'data', 'runtime', 'packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');

const MARKER = 'attempts-exhausted-settle';

const EXHAUST_CSS = `
/* === attempts-exhausted-settle === */
#attempts-exhausted{
  position:fixed;inset:0;z-index:12050;display:flex;align-items:center;justify-content:center;
  padding:18px;background:rgba(6,10,18,.62);backdrop-filter:blur(3px);
}
#attempts-exhausted[hidden]{display:none!important;}
#attempts-exhausted .craft-card{
  width:min(420px,92vw);background:var(--craft-panel,#121a2b);border:1px solid color-mix(in srgb,var(--craft-accent,#c9a227) 45%,transparent);
  border-radius:18px;padding:22px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.45);
}
#attempts-exhausted h2{margin:0 0 10px;font-size:1.25rem;color:var(--craft-accent,#e2b657);letter-spacing:1px;}
#attempts-exhausted p{margin:0 0 14px;line-height:1.65;color:var(--craft-text,#e8eefc);font-size:.95rem;}
#attempts-exhausted .craft-actions{display:flex;flex-direction:column;gap:10px;margin-top:4px;}
#attempts-exhausted .craft-actions button{
  width:100%;padding:12px;border:none;border-radius:12px;cursor:pointer;font-size:.95rem;font-weight:700;
  background:var(--craft-accent,#c9a227);color:#0b1020;
}
#attempts-exhausted .craft-btn-secondary{
  background:transparent!important;border:1px solid color-mix(in srgb,var(--craft-accent,#c9a227) 45%,transparent)!important;
  color:var(--craft-text,#e8eefc)!important;font-weight:600!important;
}
#attempts-exhausted .craft-btn-ghost{
  background:transparent!important;border:none!important;color:var(--craft-muted,#94a3b8)!important;
  font-weight:600!important;padding:8px!important;font-size:.88rem!important;
}
`;

/** Shared helpers for dual-mode-shell (MAX_ATTEMPTS / applyMode / renderAttempts / gateActions). */
function shellHelpers() {
  return `
  /* === ${MARKER} === */
  var __exhaustTimer = null;
  var __exhaustBound = false;
  function __isChallengeWonNow(){
    if (window.__craftWinOpen) return true;
    if (window.__challengeWon) return true;
    var win = $('craft-win');
    if (win && !win.hidden && win.getAttribute('hidden') == null) {
      try { if (win.offsetParent !== null || getComputedStyle(win).display !== 'none') return true; } catch (e) { return true; }
    }
    if (win && win.hidden === false) return true;
    return false;
  }
  function hideAttemptsExhausted(){
    if (__exhaustTimer) { clearTimeout(__exhaustTimer); __exhaustTimer = null; }
    var el = $('attempts-exhausted');
    if (el) el.hidden = true;
  }
  function ensureAttemptsExhaustedUi(){
    if ($('attempts-exhausted')) return;
    var wrap = document.createElement('div');
    wrap.id = 'attempts-exhausted';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="craft-card" role="dialog" aria-labelledby="attemptsExhaustedTitle">' +
        '<h2 id="attemptsExhaustedTitle">机会用尽</h2>' +
        '<p id="attemptsExhaustedDesc">本局急单未完成。目标仍按本局规则（口位/标定带等）锁定；可返回探究继续调参，或再开一局竞赛。</p>' +
        '<div class="craft-actions">' +
          '<button type="button" id="attemptsExhaustedExplore">返回探究</button>' +
          '<button type="button" id="attemptsExhaustedRetry" class="craft-btn-secondary">再开一局竞赛</button>' +
          '<button type="button" id="attemptsExhaustedList" class="craft-btn-ghost">返回列表</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    var bExplore = $('attemptsExhaustedExplore');
    var bRetry = $('attemptsExhaustedRetry');
    var bList = $('attemptsExhaustedList');
    if (bExplore) bExplore.addEventListener('click', function(){
      hideAttemptsExhausted();
      var sel = $('modeSelect');
      if (sel) {
        sel.value = 'explore';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        applyMode('explore');
      }
    });
    if (bRetry) bRetry.addEventListener('click', function(){
      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}
      hideAttemptsExhausted();
      state.attempts = MAX_ATTEMPTS;
      renderAttempts();
      gateActions();
      applyMode('challenge');
      var sel = $('modeSelect');
      if (sel) sel.value = 'challenge';
    });
    if (bList) {
      if (typeof window.__eaNavigateToStudentList !== 'function' && !document.getElementById('craftBackBtn')) {
        bList.hidden = true;
      } else {
        bList.addEventListener('click', function(){
          hideAttemptsExhausted();
          if (typeof window.__eaNavigateToStudentList === 'function') window.__eaNavigateToStudentList();
          else {
            var bb = document.getElementById('craftBackBtn');
            if (bb) bb.click();
          }
        });
      }
    }
  }
  function showAttemptsExhausted(){
    if (state.mode !== 'challenge' || state.attempts > 0) return;
    if (__isChallengeWonNow()) return;
    ensureAttemptsExhaustedUi();
    var el = $('attempts-exhausted');
    if (!el) return;
    var firstShow = !!el.hidden;
    el.hidden = false;
    /* === attempts-exhausted-emit === */
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
  }
  function scheduleAttemptsExhausted(){
    if (state.mode !== 'challenge' || state.attempts > 0) return;
    if (__exhaustTimer) clearTimeout(__exhaustTimer);
    __exhaustTimer = setTimeout(function(){
      __exhaustTimer = null;
      showAttemptsExhausted();
    }, 650);
  }
  function bindExhaustWinGuard(){
    if (__exhaustBound) return;
    __exhaustBound = true;
    var prev = window.__craftShowWin;
    if (typeof prev === 'function') {
      window.__craftShowWin = function(){
        hideAttemptsExhausted();
        return prev.apply(this, arguments);
      };
    }
    try {
      var obs = new MutationObserver(function(){
        if (__isChallengeWonNow()) hideAttemptsExhausted();
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    } catch (e) {}
  }
  window.__showAttemptsExhausted = showAttemptsExhausted;
  window.__hideAttemptsExhausted = hideAttemptsExhausted;
`;
}

/** Shared helpers for dual-mode-manual (MAX / apply / render). */
function manualHelpers() {
  return `
  /* === ${MARKER} === */
  var __exhaustTimer = null;
  var __exhaustBound = false;
  function __isChallengeWonNow(){
    if (window.__craftWinOpen) return true;
    if (window.__challengeWon) return true;
    var win = $('craft-win');
    if (win && win.hidden === false) return true;
    return false;
  }
  function hideAttemptsExhausted(){
    if (__exhaustTimer) { clearTimeout(__exhaustTimer); __exhaustTimer = null; }
    var el = $('attempts-exhausted');
    if (el) el.hidden = true;
  }
  function ensureAttemptsExhaustedUi(){
    if ($('attempts-exhausted')) return;
    var wrap = document.createElement('div');
    wrap.id = 'attempts-exhausted';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="craft-card" role="dialog" aria-labelledby="attemptsExhaustedTitle">' +
        '<h2 id="attemptsExhaustedTitle">机会用尽</h2>' +
        '<p id="attemptsExhaustedDesc">本局急单未完成。目标仍按本局规则（口位/标定带等）锁定；可返回探究继续调参，或再开一局竞赛。</p>' +
        '<div class="craft-actions">' +
          '<button type="button" id="attemptsExhaustedExplore">返回探究</button>' +
          '<button type="button" id="attemptsExhaustedRetry" class="craft-btn-secondary">再开一局竞赛</button>' +
          '<button type="button" id="attemptsExhaustedList" class="craft-btn-ghost">返回列表</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    var bExplore = $('attemptsExhaustedExplore');
    var bRetry = $('attemptsExhaustedRetry');
    var bList = $('attemptsExhaustedList');
    if (bExplore) bExplore.addEventListener('click', function(){
      hideAttemptsExhausted();
      var sel = $('modeSelect');
      if (sel) {
        sel.value = 'explore';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        apply('explore');
      }
    });
    if (bRetry) bRetry.addEventListener('click', function(){
      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}
      hideAttemptsExhausted();
      state.attempts = MAX;
      render();
      apply('challenge');
      var sel = $('modeSelect');
      if (sel) sel.value = 'challenge';
    });
    if (bList) {
      if (typeof window.__eaNavigateToStudentList !== 'function' && !document.getElementById('craftBackBtn')) {
        bList.hidden = true;
      } else {
        bList.addEventListener('click', function(){
          hideAttemptsExhausted();
          if (typeof window.__eaNavigateToStudentList === 'function') window.__eaNavigateToStudentList();
          else {
            var bb = document.getElementById('craftBackBtn');
            if (bb) bb.click();
          }
        });
      }
    }
  }
  function showAttemptsExhausted(){
    if (state.mode !== 'challenge' || state.attempts > 0) return;
    if (__isChallengeWonNow()) return;
    ensureAttemptsExhaustedUi();
    var el = $('attempts-exhausted');
    if (!el) return;
    var firstShow = !!el.hidden;
    el.hidden = false;
    /* === attempts-exhausted-emit === */
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
  }
  function scheduleAttemptsExhausted(){
    if (state.mode !== 'challenge' || state.attempts > 0) return;
    if (__exhaustTimer) clearTimeout(__exhaustTimer);
    __exhaustTimer = setTimeout(function(){
      __exhaustTimer = null;
      showAttemptsExhausted();
    }, 650);
  }
  function bindExhaustWinGuard(){
    if (__exhaustBound) return;
    __exhaustBound = true;
    var prev = window.__craftShowWin;
    if (typeof prev === 'function') {
      window.__craftShowWin = function(){
        hideAttemptsExhausted();
        return prev.apply(this, arguments);
      };
    }
    try {
      var obs = new MutationObserver(function(){
        if (__isChallengeWonNow()) hideAttemptsExhausted();
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    } catch (e) {}
  }
  window.__showAttemptsExhausted = showAttemptsExhausted;
  window.__hideAttemptsExhausted = hideAttemptsExhausted;
`;
}

/** Standalone helper for custom-attempts packages (projectile-basic / ramp). */
function standaloneHelperScript() {
  return `
<script>
/* === ${MARKER} standalone === */
(function(){
  if (window.__attemptsExhaustedSettle) return;
  window.__attemptsExhaustedSettle = true;
  function $(id){ return document.getElementById(id); }
  function hideAttemptsExhausted(){
    var el = $('attempts-exhausted');
    if (el) el.hidden = true;
  }
  function ensureUi(){
    if ($('attempts-exhausted')) return;
    var wrap = document.createElement('div');
    wrap.id = 'attempts-exhausted';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="craft-card" role="dialog" aria-labelledby="attemptsExhaustedTitle">' +
        '<h2 id="attemptsExhaustedTitle">机会用尽</h2>' +
        '<p id="attemptsExhaustedDesc">本局急单未完成。目标仍按本局规则（口位/标定带等）锁定；可返回探究继续调参，或再开一局竞赛。</p>' +
        '<div class="craft-actions">' +
          '<button type="button" id="attemptsExhaustedExplore">返回探究</button>' +
          '<button type="button" id="attemptsExhaustedRetry" class="craft-btn-secondary">再开一局竞赛</button>' +
          '<button type="button" id="attemptsExhaustedList" class="craft-btn-ghost">返回列表</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    var bExplore = $('attemptsExhaustedExplore');
    var bRetry = $('attemptsExhaustedRetry');
    var bList = $('attemptsExhaustedList');
    if (bExplore) bExplore.addEventListener('click', function(){
      hideAttemptsExhausted();
      var sel = $('modeSelect');
      if (sel) {
        sel.value = 'explore';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    if (bRetry) bRetry.addEventListener('click', function(){
      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}
      hideAttemptsExhausted();
      var sel = $('modeSelect');
      if (sel) {
        if (sel.value !== 'challenge') {
          sel.value = 'challenge';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    if (bList) {
      bList.addEventListener('click', function(){
        hideAttemptsExhausted();
        if (typeof window.__eaNavigateToStudentList === 'function') window.__eaNavigateToStudentList();
        else {
          var bb = document.getElementById('craftBackBtn');
          if (bb) bb.click();
        }
      });
    }
  }
  function showAttemptsExhausted(desc){
    ensureUi();
    var p = $('attemptsExhaustedDesc');
    if (p && typeof desc === 'string' && desc) p.textContent = desc;
    var el = $('attempts-exhausted');
    if (!el) return;
    var firstShow = !!el.hidden;
    el.hidden = false;
    /* === attempts-exhausted-emit === */
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
  }
  window.__showAttemptsExhausted = showAttemptsExhausted;
  window.__hideAttemptsExhausted = hideAttemptsExhausted;
  document.addEventListener('change', function(ev){
    if (ev.target && ev.target.id === 'modeSelect') hideAttemptsExhausted();
  }, true);
})();
</script>
`;
}

function injectCss(html) {
  if (html.includes(`/* === ${MARKER} === */`) || html.includes('attempts-exhausted-settle ===')) {
    // may already have css from partial — still allow JS patch
  }
  if (html.includes('#attempts-exhausted{') || html.includes('#attempts-exhausted {')) return html;
  if (/<\/style>/i.test(html)) {
    return html.replace(/<\/style>/i, `${EXHAUST_CSS}\n</style>`);
  }
  return html.replace(/<\/head>/i, `<style>${EXHAUST_CSS}</style>\n</head>`);
}

function patchShell(html) {
  if (!html.includes('dual-mode-shell runtime')) return { html, changed: false, kind: null };
  if (html.includes(`/* === ${MARKER} === */`)) return { html, changed: false, kind: 'shell-already' };

  let out = injectCss(html);
  const helpers = shellHelpers();

  // Insert helpers before onPrimaryClick (with or without FIRE_SEL)
  if (/\n  (var FIRE_SEL[\s\S]*?\n  )?function onPrimaryClick\(e\)\{/.test(out)) {
    out = out.replace(
      /\n  (var FIRE_SEL[\s\S]*?\n  )?function onPrimaryClick\(e\)\{/,
      `\n${helpers}\n  $1function onPrimaryClick(e){`,
    );
  } else {
    return { html, changed: false, kind: 'shell-no-hook' };
  }

  // After decrement, schedule settle
  const decPatterns = [
    [
      /state\.attempts -= 1;\s*\n\s*renderAttempts\(\);\s*\n\s*gateActions\(\);/g,
      'state.attempts -= 1;\n    renderAttempts();\n    gateActions();\n    if (state.attempts <= 0) scheduleAttemptsExhausted();',
    ],
    [
      /state\.attempts--;\s*\n\s*renderAttempts\(\);\s*\n\s*gateActions\(\);/g,
      'state.attempts--;\n    renderAttempts();\n    gateActions();\n    if (state.attempts <= 0) scheduleAttemptsExhausted();',
    ],
  ];
  let decOk = false;
  for (const [re, rep] of decPatterns) {
    if (re.test(out)) {
      out = out.replace(re, rep);
      decOk = true;
      break;
    }
  }
  if (!decOk) return { html, changed: false, kind: 'shell-no-dec' };

  // Hide on mode apply
  if (
    out.includes('function applyMode(mode){') &&
    !/function applyMode\(mode\)\{\r?\n\s*hideAttemptsExhausted\(\);/.test(out)
  ) {
    out = out.replace(
      /function applyMode\(mode\)\{\r?\n(\s*)state\.mode = mode === 'challenge' \? 'challenge' : 'explore';/,
      (m, ind) =>
        `function applyMode(mode){\n${ind}hideAttemptsExhausted();\n${ind}state.mode = mode === 'challenge' ? 'challenge' : 'explore';`,
    );
  }

  // Bind win guard in boot
  if (
    out.includes("applyMode(sel.value || 'explore');") &&
    !out.includes('setTimeout(bindExhaustWinGuard')
  ) {
    out = out.replace(
      "applyMode(sel.value || 'explore');",
      "applyMode(sel.value || 'explore');\n    setTimeout(bindExhaustWinGuard, 0);",
    );
  }

  return { html: out, changed: out !== html, kind: 'shell' };
}

function patchManual(html) {
  if (!html.includes('dual-mode-manual runtime')) return { html, changed: false, kind: null };
  if (html.includes(`/* === ${MARKER} === */`)) return { html, changed: false, kind: 'manual-already' };

  let out = injectCss(html);
  const helpers = manualHelpers();

  if (!out.includes('function consume(){')) return { html, changed: false, kind: 'manual-no-consume' };

  out = out.replace(
    '  function consume(){\n',
    `${helpers}\n  function consume(){\n`,
  );

  // After decrement in consume
  out = out.replace(
    /function consume\(\)\{\s*\n\s*if\(state\.mode!=='challenge'\) return true;\s*\n\s*if\(state\.attempts<=0\) return false;\s*\n\s*state\.attempts--; render\(\);\s*\n\s*return state\.attempts>=0;\s*\n\s*\}/,
    `function consume(){
    if(state.mode!=='challenge') return true;
    if(state.attempts<=0) return false;
    state.attempts--; render();
    if(state.attempts<=0) scheduleAttemptsExhausted();
    return state.attempts>=0;
  }`,
  );

  if (!out.includes('scheduleAttemptsExhausted()')) {
    // looser fallback
    out = out.replace(
      'state.attempts--; render();\n    return state.attempts>=0;',
      'state.attempts--; render();\n    if(state.attempts<=0) scheduleAttemptsExhausted();\n    return state.attempts>=0;',
    );
  }

  out = out.replace(
    'function apply(mode){\n    state.mode=mode===\'challenge\'?\'challenge\':\'explore\';',
    'function apply(mode){\n    hideAttemptsExhausted();\n    state.mode=mode===\'challenge\'?\'challenge\':\'explore\';',
  );

  if (
    out.includes("apply(sel.value||'explore');") &&
    !out.includes('setTimeout(bindExhaustWinGuard')
  ) {
    out = out.replace(
      "apply(sel.value||'explore');",
      "apply(sel.value||'explore');\n    setTimeout(bindExhaustWinGuard,0);",
    );
  }

  return { html: out, changed: out !== html, kind: 'manual' };
}

function patchProjectileBasic(html) {
  if (html.includes(`${MARKER} standalone`)) return { html, changed: false, kind: 'proj-already' };
  let out = injectCss(html);
  if (!out.includes(`${MARKER} standalone`)) {
    out = out.replace(/<\/body>/i, `${standaloneHelperScript()}\n</body>`);
  }

  // Align exhausted message to unified settle (avoid double popup)
  const oldBlock = `showMessage("机会用尽", \`未能在限次内命中约 \${lockDist} m 靶心。可切回探究后再选「靶心挑战」重开一局。\`, true, () => {
                        state.projectiles = [];
                    });`;
  const newBlock = `state.projectiles = [];
                    hideMessage();
                    if (typeof window.__showAttemptsExhausted === 'function') {
                        window.__showAttemptsExhausted('未能在限次内命中约 ' + lockDist + ' m 靶心。目标靶距仍按本局锁定；可返回探究继续试射，或再开一局竞赛。');
                    } else {
                        showMessage("机会用尽", \`未能在限次内命中约 \${lockDist} m 靶心。可切回探究后再选「靶心挑战」重开一局。\`, true, () => {
                            state.projectiles = [];
                        });
                    }`;
  if (out.includes(oldBlock)) {
    out = out.replace(oldBlock, newBlock);
  } else if (out.includes('showMessage("机会用尽"')) {
    out = out.replace(
      /showMessage\("机会用尽",[\s\S]*?\}\);/,
      `state.projectiles = [];
                    hideMessage();
                    if (typeof window.__showAttemptsExhausted === 'function') {
                        window.__showAttemptsExhausted('未能在限次内命中约 ' + lockDist + ' m 靶心。目标靶距仍按本局锁定；可返回探究继续试射，或再开一局竞赛。');
                    }`,
    );
  }

  // Hide exhausted when switching mode
  if (out.includes("ui.modeSelect.addEventListener('change'") && !out.includes('__hideAttemptsExhausted')) {
    out = out.replace(
      /ui\.modeSelect\.addEventListener\('change',\s*\(e\)\s*=>\s*\{/,
      `ui.modeSelect.addEventListener('change', (e) => {
                if (typeof window.__hideAttemptsExhausted === 'function') window.__hideAttemptsExhausted();`,
    );
  }

  return { html: out, changed: out !== html, kind: 'projectile-basic' };
}

function patchRamp(html) {
  if (html.includes(`${MARKER} standalone`) && html.includes("window.__showAttemptsExhausted('本局急单未完成")) {
    return { html, changed: false, kind: 'ramp-already' };
  }
  let out = injectCss(html);
  if (!out.includes(`${MARKER} standalone`)) {
    out = out.replace(/<\/body>/i, `${standaloneHelperScript()}\n</body>`);
  }

  const next = `try { ui.msgBox.classList.add('hidden'); } catch (e0) {}
                        if (typeof window.__showAttemptsExhausted === 'function') {
                          window.__showAttemptsExhausted('本局急单未完成：未在限次内到达目标高度带。目标高度仍按本局锁定；可返回探究或再开一局竞赛。');
                        }
                        resetScene();`;

  if (!out.includes("window.__showAttemptsExhausted('本局急单未完成")) {
    const old1 = `showMessage("挑战结束", desc + "<br><br><span class='hl-warn'>次数用尽！</span>", true, () => {
                            ui.modeSelect.value = 'explore';
                            ui.modeSelect.dispatchEvent(new Event('change'));
                        });`;
    if (out.includes(old1)) {
      out = out.split(old1).join(next);
    } else {
      const re = /showMessage\("挑战结束",\s*desc\s*\+\s*"<br><br><span class='hl-warn'>次数用尽！<\/span>",\s*true,\s*\(\)\s*=>\s*\{\s*ui\.modeSelect\.value\s*=\s*'explore';\s*ui\.modeSelect\.dispatchEvent\(new Event\('change'\)\);\s*\}\);/g;
      out = out.replace(re, next);
    }
  }

  if (
    out.includes("ui.modeSelect.addEventListener('change'") &&
    !out.includes("__hideAttemptsExhausted === 'function') window.__hideAttemptsExhausted()")
  ) {
    out = out.replace(
      /ui\.modeSelect\.addEventListener\('change',\s*\(e\)\s*=>\s*\{/,
      `ui.modeSelect.addEventListener('change', (e) => {
                if (typeof window.__hideAttemptsExhausted === 'function') window.__hideAttemptsExhausted();`,
    );
  }

  return { html: out, changed: out !== html, kind: 'ramp' };
}

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

function patchFile(html, id) {
  if (id === 'projectile-basic') return patchProjectileBasic(html);
  if (id === 'ramp-rolling-collision') return patchRamp(html);
  if (html.includes('dual-mode-shell runtime')) return patchShell(html);
  if (html.includes('dual-mode-manual runtime')) return patchManual(html);
  return { html, changed: false, kind: 'skip' };
}

function main() {
  const results = [];
  const pkgs = fs.readdirSync(PKG_ROOT).filter((d) => fs.existsSync(path.join(PKG_ROOT, d, 'game.html')));

  for (const id of pkgs) {
    const gamePath = path.join(PKG_ROOT, id, 'game.html');
    const raw = fs.readFileSync(gamePath, 'utf8');
    const hasAttempts =
      raw.includes('attemptsDisplay') ||
      raw.includes('MAX_ATTEMPTS') ||
      raw.includes('__dualModeConsumeAttempt') ||
      raw.includes('state.attempts');
    if (!hasAttempts) {
      results.push({ id, status: 'skip-no-attempts' });
      continue;
    }
    const { html, changed, kind } = patchFile(raw, id);
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
        const sres = patchFile(sraw, id);
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
    console.log(
      [r.id, r.status, r.kind || '', r.sample || ''].filter(Boolean).join(' | '),
    );
  }
  const ok = results.filter((r) => r.status === 'ok').length;
  console.log('done:', ok, 'patched');
}

if (require.main === module) main();
module.exports = { patchFile, injectCss, EXHAUST_CSS };
