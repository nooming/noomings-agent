/**
 * Manual dual-mode patches for teammate / capacitor packages.
 * Usage: node tests/scripts/patch-manual-dual-mode.js
 */
const fs = require('fs');
const path = require('path');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const PKG = getPackagesRoot();

const SHARED_CSS = `
/* === dual-mode-manual === */
#dual-mode-hud{
  position:absolute;top:10px;left:10px;z-index:40;display:flex;gap:8px;align-items:center;
  pointer-events:none;flex-wrap:wrap;max-width:min(520px,calc(100% - 20px));
}
#dual-mode-hud .dual-chip,#challengeStats{
  pointer-events:auto;display:inline-flex;align-items:center;gap:8px;
  padding:7px 12px;border-radius:999px;font-size:12px;font-weight:600;
  background:rgba(255,255,255,.92);border:1px solid rgba(148,163,184,.45);
  box-shadow:0 4px 12px rgba(0,0,0,.15);color:#1e293b;
}
#modeLabel{color:#2563eb;font-weight:700}
#timerDisplay{font-family:ui-monospace,monospace}
#challengeStats{display:none}
#challengeStats.is-visible{display:inline-flex}
#attemptsDisplay{color:#dc2626;font-weight:800}
#modeSelect{
  border:1px solid #93c5fd;border-radius:999px;padding:4px 10px;font-size:12px;
  font-weight:600;color:#1d4ed8;background:#eff6ff;cursor:pointer;
}
.dual-bench-row{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%}
body.cap-dark #dual-mode-hud .dual-chip,body.cap-dark #challengeStats{
  background:rgba(8,18,32,.92);border-color:rgba(0,200,255,.35);color:#cfe9f5;
}
body.cap-dark #modeLabel{color:#00c8ff}
body.cap-dark #modeSelect{
  background:rgba(0,40,60,.85);border-color:rgba(0,200,255,.45);color:#7dd3fc;
}
body.cap-dark #attemptsDisplay{color:#ff8a6a}

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

const SHARED_RUNTIME = (opts) => `
<script>
/* === dual-mode-manual runtime === */
(function(){
  if (window.__dualModeManual) return;
  window.__dualModeManual = true;
  var MAX=${opts.maxAttempts || 5};
  var EXP=${opts.exploreSeconds || 600};
  var state={mode:'explore',attempts:MAX,timeLeft:EXP,timerId:null};
  function $(id){return document.getElementById(id);}
  function setPhase(p){
    try{
      if(typeof window.__platformTraceSetPhase==='function') window.__platformTraceSetPhase(p);
      else if(window.PlatformTraceAdapter&&window.PlatformTraceAdapter.setPhase) window.PlatformTraceAdapter.setPhase(p);
    }catch(e){}
  }
  function fmt(sec){var m=Math.floor(sec/60),s=sec%60;return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;}
  function stop(){if(state.timerId){clearInterval(state.timerId);state.timerId=null;}}
  function render(){
    var label=$('modeLabel'),stats=$('challengeStats'),att=$('attemptsDisplay'),td=$('timerDisplay'),chip=$('dual-timer-chip');
    if(label) label.textContent=state.mode==='explore'?'探究模式':'竞赛模式';
    if(stats){ if(state.mode==='challenge') stats.classList.add('is-visible'); else stats.classList.remove('is-visible'); }
    if(att) att.textContent=String(state.attempts);
    if(chip) chip.style.display=state.mode==='explore'?'inline-flex':'none';
    if(td) td.textContent=fmt(Math.max(0,state.timeLeft));
  }
  function startTimer(){
    stop(); state.timeLeft=EXP; render();
    state.timerId=setInterval(function(){
      if(state.mode!=='explore') return;
      state.timeLeft--; render();
      if(state.timeLeft<=0){
        stop();
        var sel=$('modeSelect');
        if(sel){ sel.value='challenge'; sel.dispatchEvent(new Event('change',{bubbles:true})); }
      }
    },1000);
  }
  function apply(mode){
    hideAttemptsExhausted();
    state.mode=mode==='challenge'?'challenge':'explore';
    if(state.mode==='challenge'){ stop(); state.attempts=MAX; }
    else startTimer();
    render(); setPhase(state.mode);
    document.dispatchEvent(new CustomEvent('dual-mode-change',{detail:{mode:state.mode,attempts:state.attempts}}));
  }
  /* === attempts-exhausted-settle === */
  var __exhaustTimer=null, __exhaustBound=false;
  /* === exhausted-mode-reenter-new-round === */
  var __exhaustedNeedsNewRound=false;
  function __isChallengeWonNow(){
    if(window.__craftWinOpen||window.__challengeWon) return true;
    var win=$('craft-win');
    return !!(win && win.hidden===false);
  }
  function hideAttemptsExhausted(){
    if(__exhaustTimer){clearTimeout(__exhaustTimer);__exhaustTimer=null;}
    var el=$('attempts-exhausted'); if(el) el.hidden=true;
  }
  function ensureAttemptsExhaustedUi(){
    if($('attempts-exhausted')) return;
    var wrap=document.createElement('div');
    wrap.id='attempts-exhausted'; wrap.hidden=true;
    wrap.innerHTML='<div class="craft-card" role="dialog" aria-labelledby="attemptsExhaustedTitle"><h2 id="attemptsExhaustedTitle">机会用尽</h2><p id="attemptsExhaustedDesc">本局急单未完成。目标仍按本局规则（口位/标定带等）锁定；可返回探究继续调参，或再开一局竞赛。</p><div class="craft-actions"><button type="button" id="attemptsExhaustedExplore">返回探究</button><button type="button" id="attemptsExhaustedRetry" class="craft-btn-secondary">再开一局竞赛</button><button type="button" id="attemptsExhaustedList" class="craft-btn-ghost">返回列表</button></div></div>';
    document.body.appendChild(wrap);
    var bExplore=$('attemptsExhaustedExplore'), bRetry=$('attemptsExhaustedRetry'), bList=$('attemptsExhaustedList');
    if(bExplore) bExplore.addEventListener('click',function(){
      hideAttemptsExhausted();
      var sel=$('modeSelect');
      if(sel){ sel.value='explore'; sel.dispatchEvent(new Event('change',{bubbles:true})); }
      else apply('explore');
    });
    if(bRetry) bRetry.addEventListener('click',function(){
      try { if (typeof window.__platformTraceRequestNewRound === 'function') window.__platformTraceRequestNewRound('exhausted_retry'); } catch (__nr) {}
      hideAttemptsExhausted(); apply('challenge');
      var sel=$('modeSelect'); if(sel) sel.value='challenge';
    });
    if(bList){
      if(typeof window.__eaNavigateToStudentList!=='function'&&!document.getElementById('craftBackBtn')) bList.hidden=true;
      else bList.addEventListener('click',function(){
        hideAttemptsExhausted();
        if(typeof window.__eaNavigateToStudentList==='function') window.__eaNavigateToStudentList();
        else { var bb=document.getElementById('craftBackBtn'); if(bb) bb.click(); }
      });
    }
  }
  function showAttemptsExhausted(){
    if(state.mode!=='challenge'||state.attempts>0||__isChallengeWonNow()) return;
    ensureAttemptsExhaustedUi();
    var el=$('attempts-exhausted');
    if(!el) return;
    var firstShow=!!el.hidden;
    el.hidden=false;
    /* === attempts-exhausted-emit === */
    if(firstShow){
      try{
        var __exPayload={attempts:0,mode:'challenge'};
        var __exSnap={winOk:false,attemptsExhausted:true,hintKey:'attempts_exhausted'};
        if(typeof window.__emit==='function'){ window.__emit('attempts_exhausted',__exPayload); window.__emit('snapshot',__exSnap); }
        // Always mirror to PlatformTraceAdapter — __emit may be a stub/wrapper
        try{
          if(window.PlatformTraceAdapter&&typeof window.PlatformTraceAdapter.record==='function'){
            window.PlatformTraceAdapter.record('attempts_exhausted',__exPayload);
            window.PlatformTraceAdapter.record('snapshot',__exSnap);
          }else if(window.parent&&window.parent!==window&&window.parent.PlatformTraceAdapter&&typeof window.parent.PlatformTraceAdapter.record==='function'){
            window.parent.PlatformTraceAdapter.record('attempts_exhausted',__exPayload);
            window.parent.PlatformTraceAdapter.record('snapshot',__exSnap);
          }
        }catch(__pta){}
      }catch(__exErr){}
    }
  }
  function scheduleAttemptsExhausted(){
    if(state.mode!=='challenge'||state.attempts>0) return;
    if(__exhaustTimer) clearTimeout(__exhaustTimer);
    __exhaustTimer=setTimeout(function(){ __exhaustTimer=null; showAttemptsExhausted(); },650);
  }
  function bindExhaustWinGuard(){
    if(__exhaustBound) return; __exhaustBound=true;
    var prev=window.__craftShowWin;
    if(typeof prev==='function') window.__craftShowWin=function(){ hideAttemptsExhausted(); return prev.apply(this,arguments); };
    try{
      var obs=new MutationObserver(function(){ if(__isChallengeWonNow()) hideAttemptsExhausted(); });
      obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style']});
    }catch(e){}
  }
  window.__showAttemptsExhausted=showAttemptsExhausted;
  window.__hideAttemptsExhausted=hideAttemptsExhausted;
  function consume(){
    if(state.mode!=='challenge') return true;
    if(state.attempts<=0) return false;
    state.attempts--; render();
    if(state.attempts<=0) scheduleAttemptsExhausted();
    return state.attempts>=0;
  }
  window.__dualModeConsumeAttempt=consume;
  window.__dualModeGet=function(){return {mode:state.mode,attempts:state.attempts};};
  function boot(){
    var sel=$('modeSelect');
    if(!sel) return;
    sel.addEventListener('change',function(){ apply(sel.value); });
    apply(sel.value||'explore');
    setTimeout(bindExhaustWinGuard,0);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
</script>
`;

function injectCss(html, css) {
  if (html.includes('dual-mode-manual')) return html;
  if (/<\/style>/i.test(html)) return html.replace(/<\/style>/i, `${css}\n</style>`);
  return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
}

function injectRuntime(html, opts = {}) {
  if (html.includes('dual-mode-manual runtime')) return html;
  return html.replace(/<\/body>/i, `${SHARED_RUNTIME(opts)}\n</body>`);
}

function hudHtml() {
  return `<div id="dual-mode-hud">
  <div id="dual-timer-chip" class="dual-chip"><span id="modeLabel">探究模式</span><span style="opacity:.35">|</span><span id="timerDisplay">10:00</span></div>
  <div id="challengeStats"><span>剩余机会</span><span id="attemptsDisplay">5</span></div>
</div>`;
}

function modeSelectHtml() {
  return `<select id="modeSelect" aria-label="探究阶段"><option value="explore">自由探究</option><option value="challenge">竞赛挑战</option></select>`;
}

function patchProjectileBasic(html) {
  if (!html.includes("__platformTraceSetPhase")) {
    html = html.replace(
      `ui.modeSelect.addEventListener('change', (e) => {
                state.mode = e.target.value;
                ui.modeLabel.textContent = state.mode === 'explore' ? '探究模式' : '挑战模式';`,
      `ui.modeSelect.addEventListener('change', (e) => {
                state.mode = e.target.value;
                ui.modeLabel.textContent = state.mode === 'explore' ? '探究模式' : '竞赛模式';
                try {
                  if (typeof window.__platformTraceSetPhase === 'function') window.__platformTraceSetPhase(state.mode);
                  else if (window.PlatformTraceAdapter && window.PlatformTraceAdapter.setPhase) window.PlatformTraceAdapter.setPhase(state.mode);
                } catch (_) {}`,
    );
  }
  // Ensure initial sync after listeners
  if (!html.includes('__dualModeInitPhase')) {
    html = html.replace(
      /<\/body>/i,
      `<script>/* __dualModeInitPhase */(function(){function sync(){var s=document.getElementById('modeSelect');if(!s)return;try{if(window.__platformTraceSetPhase)window.__platformTraceSetPhase(s.value||'explore');}catch(e){}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(sync,0);});else setTimeout(sync,0);})();</script>\n</body>`,
    );
  }
  return html;
}

function patchProjectileCannon(html) {
  html = injectCss(html, SHARED_CSS);
  if (!html.includes('id="modeSelect"')) {
    html = html.replace(
      '<div class="ctrl-hd">控制面板</div>',
      `<div class="ctrl-hd"><div class="dual-bench-row"><span>控制面板</span>${modeSelectHtml()}</div></div>`,
    );
  }
  if (!html.includes('id="dual-mode-hud"')) {
    html = html.replace(
      '<div id="stage">',
      `<div id="stage">\n${hudHtml()}`,
    );
  }
  html = injectRuntime(html, { maxAttempts: 6 });
  // Gate fire button via dual-mode consume
  if (!html.includes('__dualModeConsumeAttempt') || !html.includes('dualModeFireGate')) {
    html = html.replace(
      /<\/body>/i,
      `<script>/* dualModeFireGate */
(function(){
  function bind(){
    var btn=document.getElementById('btn-fire');
    if(!btn||btn.__dualGate) return;
    btn.__dualGate=true;
    btn.addEventListener('click',function(e){
      if(window.__dualModeGet && window.__dualModeGet().mode==='challenge'){
        if(window.__dualModeConsumeAttempt && !window.__dualModeConsumeAttempt()){
          e.stopImmediatePropagation(); e.preventDefault();
          btn.disabled=true;
          setTimeout(function(){ if(window.__dualModeGet().attempts>0) btn.disabled=false; },0);
        }
      }
    }, true);
    document.addEventListener('dual-mode-change',function(ev){
      if(ev.detail.mode==='explore') btn.disabled=false;
      else if(ev.detail.attempts<=0) btn.disabled=true;
      else btn.disabled=false;
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else bind();
})();
</script>\n</body>`,
    );
  }
  return html;
}

function patchPendulumClock(html) {
  html = injectCss(html, SHARED_CSS + `
#dual-mode-hud .dual-chip,#challengeStats{
  background:rgba(58,44,28,.92)!important;border-color:rgba(160,120,64,.55)!important;color:var(--enamel,#f7efd8)!important;
}
#modeLabel{color:var(--brass-hi,#f0cf8a)!important}
#modeSelect{background:rgba(74,56,36,.9);border-color:rgba(201,151,63,.55);color:var(--brass-hi,#f0cf8a)}
.bench-hd.dual-bench-row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.bench-hd .bench-hd-text{display:flex;flex-direction:column;gap:3px}
`);
  if (!html.includes('id="dual-mode-hud"')) {
    html = html.replace(
      '<div id="hud">',
      `<div id="hud">${hudHtml()}`,
    );
  }
  if (!html.includes('id="modeSelect"')) {
    html = html.replace(
      `<div class="bench-hd">
      <span class="bench-hd-title">调节摆参数</span>
      <span class="bench-hd-sub">目标 T ≈ 2.000 s · 绿区过关</span>
    </div>`,
      `<div class="bench-hd dual-bench-row">
      <div class="bench-hd-text">
        <span class="bench-hd-title">调节摆参数</span>
        <span class="bench-hd-sub">目标 T ≈ 2.000 s · 绿区过关</span>
      </div>
      ${modeSelectHtml()}
    </div>`,
    );
  }
  html = injectRuntime(html, { maxAttempts: 5 });
  // Gate measure/release buttons if present
  if (!html.includes('dualModePendulumGate')) {
    html = html.replace(
      /<\/body>/i,
      `<script>/* dualModePendulumGate */
(function(){
  function bind(){
    ['btn-drop','btn-measure','btnRelease','btn-go'].forEach(function(id){
      var b=document.getElementById(id); if(!b||b.__dualGate) return;
      b.__dualGate=true;
      b.addEventListener('click',function(e){
        var st=window.__dualModeGet&&window.__dualModeGet();
        if(st&&st.mode==='challenge'&&window.__dualModeConsumeAttempt&&!window.__dualModeConsumeAttempt()){
          e.stopImmediatePropagation(); e.preventDefault();
        }
      },true);
    });
    // also common class buttons in footer
    document.querySelectorAll('#bench .btn, #bench button').forEach(function(b){
      if(b.__dualGate) return;
      if(/重置|复位|reset/i.test(b.textContent||'')) return;
      b.__dualGate=true;
      b.addEventListener('click',function(e){
        var st=window.__dualModeGet&&window.__dualModeGet();
        if(st&&st.mode==='challenge'&&window.__dualModeConsumeAttempt&&!window.__dualModeConsumeAttempt()){
          e.stopImmediatePropagation(); e.preventDefault();
        }
      },true);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else setTimeout(bind,0);
})();
</script>\n</body>`,
    );
  }
  return html;
}

function patchPendulumTarget(html) {
  html = injectCss(html, SHARED_CSS + `
#dual-mode-hud .dual-chip,#challengeStats{
  background:rgba(18,34,46,.92)!important;border-color:#2f4a60!important;color:#b8d8f0!important;
}
#modeLabel{color:#7dd3fc!important}
#modeSelect{background:#12222e;border-color:#3b7ba0;color:#b8d8f0}
.bench-hd.dual-bench-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
`);
  if (!html.includes('id="dual-mode-hud"')) {
    html = html.replace(
      '<div id="hud">',
      `<div id="hud">${hudHtml()}`,
    );
  }
  if (!html.includes('id="modeSelect"')) {
    html = html.replace(
      `<div class="bench-hd">
            <div class="bench-hd-title">调节摆参数</div>
            <div class="bench-hd-sub">摆长 &amp; 角度 → 落入移动矿车</div>
        </div>`,
      `<div class="bench-hd dual-bench-row">
            <div>
              <div class="bench-hd-title">调节摆参数</div>
              <div class="bench-hd-sub">摆长 &amp; 角度 → 落入移动矿车</div>
            </div>
            ${modeSelectHtml()}
        </div>`,
    );
  }
  html = injectRuntime(html, { maxAttempts: 5 });
  if (!html.includes('dualModeTargetGate')) {
    html = html.replace(
      /<\/body>/i,
      `<script>/* dualModeTargetGate */
(function(){
  function bind(){
    document.querySelectorAll('.control-panel .btn, .control-panel button').forEach(function(b){
      if(b.__dualGate||/重置|复位|reset/i.test(b.textContent||'')||/reset/i.test(b.id||'')) return;
      b.__dualGate=true;
      b.addEventListener('click',function(e){
        var st=window.__dualModeGet&&window.__dualModeGet();
        if(st&&st.mode==='challenge'&&window.__dualModeConsumeAttempt&&!window.__dualModeConsumeAttempt()){
          e.stopImmediatePropagation(); e.preventDefault();
        }
      },true);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else setTimeout(bind,0);
})();
</script>\n</body>`,
    );
  }
  return html;
}

function patchCapacitor(html) {
  html = injectCss(html, SHARED_CSS);
  // mark body for dark theme chips via script class
  if (!html.includes('cap-dark')) {
    html = html.replace(/<body([^>]*)>/i, '<body$1 class="cap-dark">');
  }
  if (!html.includes('id="dual-mode-hud"')) {
    html = html.replace(
      '<div id="top-chrome">',
      `<div id="top-chrome">\n${hudHtml()}\n`,
    );
  }
  if (!html.includes('id="modeSelect"')) {
    // ch1=#controls, ch2=#controls2, ch4=#controls4
    html = html.replace(
      /<div id="controls\d*" class="ctrl-panel">/,
      (m) => `${m}\n<div class="dual-bench-row" style="margin-bottom:12px"><span style="color:rgba(0,200,255,.7);letter-spacing:2px;font-size:11px">阶段</span>${modeSelectHtml()}</div>`,
    );
  }
  html = injectRuntime(html, { maxAttempts: 5 });
  if (!html.includes('dualModeCapGate')) {
    html = html.replace(
      /<\/body>/i,
      `<script>/* dualModeCapGate */
(function(){
  function bind(){
    document.querySelectorAll('#controls button, #controls2 button, #controls4 button, .ctrl-panel button, #c4-discharge-btn, #btn-read-cap, #btn-read-ch2').forEach(function(b){
      if(b.__dualGate||/重置|复位|跳过|继续|下一/i.test(b.textContent||'')) return;
      b.__dualGate=true;
      b.addEventListener('click',function(e){
        var st=window.__dualModeGet&&window.__dualModeGet();
        if(st&&st.mode==='challenge'&&window.__dualModeConsumeAttempt&&!window.__dualModeConsumeAttempt()){
          e.stopImmediatePropagation(); e.preventDefault();
        }
      },true);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else setTimeout(bind,50);
})();
</script>\n</body>`,
    );
  }
  return html;
}

const PATCHERS = {
  'projectile-basic': patchProjectileBasic,
  'projectile-cannon': patchProjectileCannon,
  'pendulum-clock': patchPendulumClock,
  'pendulum-target': patchPendulumTarget,
  'capacitor-era-ch1': patchCapacitor,
  'capacitor-era-ch2': patchCapacitor,
  'capacitor-era-ch4': patchCapacitor,
};

function main() {
  for (const [id, fn] of Object.entries(PATCHERS)) {
    const p = path.join(PKG, id, 'game.html');
    if (!fs.existsSync(p)) {
      console.log(id, 'missing');
      continue;
    }
    let html = fs.readFileSync(p, 'utf8');
    const next = fn(html);
    fs.writeFileSync(p, next, 'utf8');
    console.log(id, 'patched', next.length);
  }
  console.log('manual dual-mode done');
}

if (require.main === module) main();
module.exports = { main };
