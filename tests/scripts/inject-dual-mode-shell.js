/**
 * Inject Nezha-style dual-mode chrome into essence packages:
 * - HUD: modeLabel + timer + challenge attempts
 * - Bench header: modeSelect
 * - JS: phase sync via __platformTraceSetPhase, attempt gating
 *
 * Usage: node tests/scripts/inject-dual-mode-shell.js [--id pkg-id] [--force]
 */
const fs = require('fs');
const path = require('path');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const PKG = getPackagesRoot();
const MANIFEST = path.join(PKG, 'manifest.json');

/** Packages with strong custom UI — handled separately / skip auto inject */
const SKIP = new Set([
  'pendulum-clock',
  'pendulum-target',
  'projectile-cannon',
  'projectile-basic',
  'capacitor-era-ch1',
  'capacitor-era-ch2',
  'capacitor-era-ch4',
]);

const MARKER = 'dual-mode-shell';

const DUAL_CSS = `
/* === dual-mode-shell (auto) === */
#dual-mode-hud {
  position:absolute; top:10px; left:10px; right:10px; z-index:8;
  display:flex; justify-content:space-between; align-items:flex-start;
  gap:8px; pointer-events:none;
}
#dual-mode-hud .dual-chip {
  pointer-events:auto; display:inline-flex; align-items:center; gap:10px;
  padding:8px 14px; border-radius:999px;
  background:rgba(255,255,255,0.92); border:1px solid rgba(148,163,184,0.45);
  box-shadow:0 4px 12px rgba(15,23,42,0.12); color:#1e293b; font-size:13px;
}
#dual-mode-hud #modeLabel { font-weight:700; color:#2563eb; }
#dual-mode-hud #timerDisplay { font-family:ui-monospace,monospace; font-weight:600; color:#334155; }
#challengeStats {
  pointer-events:auto; display:none; align-items:center; gap:8px;
  padding:8px 14px; border-radius:999px;
  background:rgba(255,255,255,0.92); border:1px solid rgba(248,113,113,0.45);
  box-shadow:0 4px 12px rgba(15,23,42,0.12); color:#1e293b; font-size:13px;
}
#challengeStats.is-visible { display:inline-flex; }
#attemptsDisplay { font-weight:700; color:#dc2626; font-size:16px; }
#essence-bench-hd, .dual-bench-hd {
  display:flex; justify-content:space-between; align-items:center; gap:10px;
  padding:12px 16px; border-bottom:1px solid #e2e8f0; background:#fff; flex-shrink:0;
}
#essence-bench-hd h1, .dual-bench-hd h1 {
  margin:0; font-size:15px; font-weight:700; color:#1e293b; line-height:1.3;
}
#modeSelect {
  border:1px solid #93c5fd; border-radius:999px; padding:4px 10px;
  font-size:12px; font-weight:600; color:#1d4ed8; background:#eff6ff; cursor:pointer;
}
#essence-bench.dual-mode-ready { display:flex; flex-direction:column; }
button.dual-disabled, .dual-disabled { opacity:0.45; pointer-events:none; cursor:not-allowed; }

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

const DUAL_JS = `
<script>
/* === dual-mode-shell runtime (auto) === */
(function(){
  if (window.__dualModeShell) return;
  window.__dualModeShell = true;

  var MAX_ATTEMPTS = 5;
  var EXPLORE_SECONDS = 10 * 60;
  var state = {
    mode: 'explore',
    attempts: MAX_ATTEMPTS,
    timeLeft: EXPLORE_SECONDS,
    timerId: null
  };

  function $(id){ return document.getElementById(id); }

  function setPhase(phase){
    try {
      if (typeof window.__platformTraceSetPhase === 'function') {
        window.__platformTraceSetPhase(phase);
      } else if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.setPhase === 'function') {
        window.PlatformTraceAdapter.setPhase(phase);
      }
    } catch (e) { /* offline */ }
  }

  function fmt(sec){
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderAttempts(){
    var el = $('attemptsDisplay');
    if (el) el.textContent = String(state.attempts);
  }

  function primaryButtons(){
    return Array.prototype.slice.call(document.querySelectorAll(
      '#essence-bench .essence-ft button, #essence-bench button.btn, #essence-bench button[id^="btn"]'
    ));
  }

  function gateActions(){
    var disable = state.mode === 'challenge' && state.attempts <= 0;
    primaryButtons().forEach(function(btn){
      if (/reset|清除|重置|再来/i.test(btn.textContent || '') || /reset|clear/i.test(btn.id || '')) return;
      btn.classList.toggle('dual-disabled', disable);
      if (disable) btn.setAttribute('disabled', 'disabled');
      else btn.removeAttribute('disabled');
    });
  }

  function stopTimer(){
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  function startExploreTimer(){
    stopTimer();
    state.timeLeft = EXPLORE_SECONDS;
    var td = $('timerDisplay');
    if (td) td.textContent = fmt(state.timeLeft);
    state.timerId = setInterval(function(){
      if (state.mode !== 'explore') return;
      state.timeLeft -= 1;
      if (td) td.textContent = fmt(Math.max(0, state.timeLeft));
      if (state.timeLeft <= 0) {
        stopTimer();
        var sel = $('modeSelect');
        if (sel) {
          sel.value = 'challenge';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, 1000);
  }

  function applyMode(mode){
    hideAttemptsExhausted();
    var __nextMode = mode === 'challenge' ? 'challenge' : 'explore';
    if (__nextMode === 'challenge' && __exhaustedNeedsNewRound) {
      __exhaustedNeedsNewRound = false;
      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_mode_reenter'); } catch (__nr) {}
    }
    state.mode = __nextMode;
    var label = $('modeLabel');
    var stats = $('challengeStats');
    var timerChip = $('dual-timer-chip');
    if (label) label.textContent = state.mode === 'explore' ? '探究模式' : '竞赛模式';
    if (stats) {
      if (state.mode === 'challenge') stats.classList.add('is-visible');
      else stats.classList.remove('is-visible');
    }
    if (timerChip) timerChip.style.display = state.mode === 'explore' ? 'inline-flex' : 'none';
    if (state.mode === 'challenge') {
      stopTimer();
      state.attempts = MAX_ATTEMPTS;
      renderAttempts();
    } else {
      startExploreTimer();
    }
    setPhase(state.mode);
    gateActions();
  }

  /* === attempts-exhausted-settle === */
  var __exhaustTimer = null;
  var __exhaustBound = false;
  /* === exhausted-mode-reenter-new-round === */
  var __exhaustedNeedsNewRound = false;
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
      if (sel) { sel.value = 'explore'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      else applyMode('explore');
    });
    if (bRetry) bRetry.addEventListener('click', function(){
      __exhaustedNeedsNewRound = false;
      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}
      hideAttemptsExhausted();
      applyMode('challenge');
      var sel = $('modeSelect');
      if (sel) sel.value = 'challenge';
    });
    if (bList) {
      if (typeof window.__eaNavigateToStudentList !== 'function' && !document.getElementById('craftBackBtn')) bList.hidden = true;
      else bList.addEventListener('click', function(){
        hideAttemptsExhausted();
        if (typeof window.__eaNavigateToStudentList === 'function') window.__eaNavigateToStudentList();
        else { var bb = document.getElementById('craftBackBtn'); if (bb) bb.click(); }
      });
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
    if (firstShow) __exhaustedNeedsNewRound = true;
    /* === attempts-exhausted-emit === */
    if (firstShow) {
      try {
        var __exPayload = { attempts: 0, mode: 'challenge' };
        var __exSnap = { winOk: false, attemptsExhausted: true, hintKey: 'attempts_exhausted' };
        if (typeof window.__emit === 'function') {
          window.__emit('attempts_exhausted', __exPayload);
          window.__emit('snapshot', __exSnap);
        }
        // Always mirror to PlatformTraceAdapter — __emit may be a stub/wrapper
        try {
          if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.record === 'function') {
            window.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
            window.PlatformTraceAdapter.record('snapshot', __exSnap);
          } else if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter && typeof window.parent.PlatformTraceAdapter.record === 'function') {
            window.parent.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
            window.parent.PlatformTraceAdapter.record('snapshot', __exSnap);
          }
        } catch (__pta) {}
      } catch (__exErr) {}
    }
  }
  function scheduleAttemptsExhausted(){
    if (state.mode !== 'challenge' || state.attempts > 0) return;
    if (__exhaustTimer) clearTimeout(__exhaustTimer);
    __exhaustTimer = setTimeout(function(){ __exhaustTimer = null; showAttemptsExhausted(); }, 650);
  }
  function bindExhaustWinGuard(){
    if (__exhaustBound) return;
    __exhaustBound = true;
    var prev = window.__craftShowWin;
    if (typeof prev === 'function') {
      window.__craftShowWin = function(){ hideAttemptsExhausted(); return prev.apply(this, arguments); };
    }
    try {
      var obs = new MutationObserver(function(){ if (__isChallengeWonNow()) hideAttemptsExhausted(); });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    } catch (e) {}
  }
  window.__showAttemptsExhausted = showAttemptsExhausted;
  window.__hideAttemptsExhausted = hideAttemptsExhausted;

  var FIRE_SEL = '#btnLaunch,#btn-test,#btn-test-ft,#btn-fire,#btnFire,#btnTest,#testBtn,#fireBtn,#launchBtn,#btn-run,#btnRun,#c4-discharge-btn,[data-action="fire"],[data-action="test"],[data-action="launch"]';
  function onPrimaryClick(e){
    if (state.mode !== 'challenge') return;
    var t = e.target && e.target.closest ? e.target.closest(FIRE_SEL) : null;
    if (!t) return;
    if (/reset|清除|重置|再来/i.test(t.textContent || '') || /reset|clear/i.test(t.id || '')) return;
    if (state.attempts <= 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    state.attempts -= 1;
    renderAttempts();
    gateActions();
    if (state.attempts <= 0) scheduleAttemptsExhausted();
  }

  function ensureUi(){
    var stage = $('essence-stage') || document.querySelector('#proj-stage, #stage, #canvasContainer, .canvas-wrap')?.parentElement;
    var bench = $('essence-bench');
    if (!stage) return false;

    if (!$('dual-mode-hud')) {
      var hud = document.createElement('div');
      hud.id = 'dual-mode-hud';
      hud.innerHTML =
        '<div id="dual-timer-chip" class="dual-chip">' +
          '<span id="modeLabel">探究模式</span><span style="width:1px;height:14px;background:#cbd5e1"></span>' +
          '<span id="timerDisplay">10:00</span>' +
        '</div>' +
        '<div id="challengeStats"><span>剩余机会</span><span id="attemptsDisplay">5</span></div>';
      stage.style.position = stage.style.position || 'relative';
      stage.appendChild(hud);
    }

    if (bench && !$('modeSelect')) {
      bench.classList.add('dual-mode-ready');
      var hd = document.createElement('div');
      hd.id = 'essence-bench-hd';
      hd.className = 'dual-bench-hd';
      var title = '环境控制台';
      var tEl = stage.querySelector('.essence-title, h1');
      if (tEl) title = (tEl.textContent || title).trim() || title;
      hd.innerHTML =
        '<h1>' + title.replace(/</g,'&lt;') + '</h1>' +
        '<select id="modeSelect" aria-label="探究阶段">' +
          '<option value="explore">自由探究</option>' +
          '<option value="challenge">竞赛挑战</option>' +
        '</select>';
      bench.insertBefore(hd, bench.firstChild);
    } else if (!$('modeSelect')) {
      // Fallback: floating select in hud
      var chip = $('dual-timer-chip');
      if (chip && !$('modeSelect')) {
        var sel = document.createElement('select');
        sel.id = 'modeSelect';
        sel.innerHTML = '<option value="explore">自由探究</option><option value="challenge">竞赛挑战</option>';
        chip.appendChild(sel);
      }
    }
    return !!$('modeSelect');
  }

  function boot(){
    if (!ensureUi()) return;
    var sel = $('modeSelect');
    sel.addEventListener('change', function(){ applyMode(sel.value); });
    // Prefer whole bench so fire buttons outside .essence-ft still count
    var root = $('essence-bench') || document;
    root.addEventListener('click', onPrimaryClick, true);
    applyMode(sel.value || 'explore');
    setTimeout(bindExhaustWinGuard, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>
`;

function hasDualMode(html) {
  return html.includes(MARKER) || (/\bid=["']modeSelect["']/.test(html) && /\bid=["']modeLabel["']/.test(html));
}

function injectCss(html, css) {
  if (html.includes(`/* === ${MARKER}`)) return html;
  if (/<\/style>/i.test(html)) {
    return html.replace(/<\/style>/i, `${css}\n</style>`);
  }
  return html.replace(/<\/head>/i, `<style>${css}</style>\n</head>`);
}

function injectJs(html) {
  if (html.includes('dual-mode-shell runtime')) return html;
  return html.replace(/<\/body>/i, `${DUAL_JS}\n</body>`);
}

function ensureEssenceHudSlot(html) {
  // Prefer essence-stage; if missing but essence-app exists, ok
  if (/id=["']essence-stage["']/.test(html) || /id=["']essence-app["']/.test(html)) return html;
  return html;
}

function transform(html) {
  if (hasDualMode(html) && !process.argv.includes('--force')) {
    return { html, skipped: 'already has dual mode' };
  }
  if (!/essence-sidebar-shell|id=["']essence-app["']|id=["']essence-bench["']/.test(html)) {
    return { html, skipped: 'no essence sidebar shell' };
  }
  let out = ensureEssenceHudSlot(html);
  // Remove previous auto dual-mode block if force
  if (process.argv.includes('--force')) {
    out = out.replace(/\/\* === dual-mode-shell \(auto\) === \*\/[\s\S]*?(?=<\/style>)/, '');
    out = out.replace(/<script>\s*\/\* === dual-mode-shell runtime[\s\S]*?<\/script>\s*/g, '');
  }
  out = injectCss(out, DUAL_CSS);
  out = injectJs(out);
  return { html: out, skipped: null };
}

function main() {
  const args = process.argv.slice(2);
  const idIdx = args.indexOf('--id');
  const onlyId = idIdx >= 0 ? args[idIdx + 1] : null;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const samples = (manifest.samples || []).filter((s) => !onlyId || s.id === onlyId);
  const results = [];

  for (const s of samples) {
    if (SKIP.has(s.id)) {
      results.push({ id: s.id, status: 'skip-manual' });
      continue;
    }
    const gamePath = path.join(PKG, s.id, 'game.html');
    if (!fs.existsSync(gamePath)) {
      results.push({ id: s.id, status: 'missing' });
      continue;
    }
    let html = fs.readFileSync(gamePath, 'utf8');
    const result = transform(html);
    if (result.skipped) {
      results.push({ id: s.id, status: 'skip', reason: result.skipped });
      continue;
    }
    fs.writeFileSync(gamePath, result.html, 'utf8');
    results.push({ id: s.id, status: 'ok' });
  }

  for (const r of results) console.log(r.id, r.status, r.reason || '');
  console.log('done:', results.filter((r) => r.status === 'ok').length, 'injected');
}

if (require.main === module) main();
module.exports = { main, transform, SKIP };
