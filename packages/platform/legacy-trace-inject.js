/** Inject PlatformTraceAdapter hook + win bridge into legacy copied HTML samples. */

const TRACE_HOOK = `<!-- trace-adapter-hook -->
<script>
(function(){
  function emit(type, payload) {
    // Pass payload through intact (interim/final/levelsCleared/level must not be stripped).
    var p = payload && typeof payload === 'object' ? payload : {};
    try {
      if (window.PlatformTraceAdapter) {
        window.PlatformTraceAdapter.record(type, p);
        return;
      }
    } catch (e) {}
    try {
      if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter) {
        window.parent.PlatformTraceAdapter.record(type, p);
      }
    } catch (e) {}
  }
  function snapControls() {
    var o = {};
    document.querySelectorAll('input[type="range"], input[type="number"], select').forEach(function(el) {
      var id = el.id || el.name;
      if (id) o[id] = el.value;
    });
    return o;
  }
  // Bind sync so late DOMContentLoaded / craft wrappers cannot miss __emit.
  window.__emit = emit;
  window.__snapControls = snapControls;
  function bindControls() {
    document.querySelectorAll('input[type="range"], input[type="number"]').forEach(function(el) {
      if (el.__platformTraceBound) return;
      el.__platformTraceBound = true;
      el.addEventListener('change', function() {
        if (window.__platformTraceControlsBound) return;
        emit('tuning', { control: el.id || el.name || 'slider', value: el.value });
      });
    });
    document.querySelectorAll('button, [role="button"]').forEach(function(el) {
      if (el.__platformTraceBound) return;
      el.__platformTraceBound = true;
      el.addEventListener('click', function() {
        emit('action', { control: el.id || (el.textContent || '').trim().slice(0, 24) || 'button' });
      });
    });
  }
  function onReady() {
    if (!window.__platformPuzzleOpenEmitted) {
      window.__platformPuzzleOpenEmitted = true;
      emit('puzzle_open', {});
    }
    bindControls();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
</script>`;

const OPERATION_HINT = `<div id="platform-op-hint" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:8px 14px;border-radius:8px;font-size:14px;margin:8px 0 12px;">💡 调节参数后点击<strong>发射</strong>或<strong>测试</strong>按钮开始模拟</div>`;

const WIN_BRIDGE = `<!-- legacy-win-bridge -->
<script>
(function(){
  function emitWin(hintKey) {
    if (window.__legacyWinEmitted) return;
    window.__legacyWinEmitted = true;
    var emit = window.__emit;
    if (!emit) return;
    var controls = window.__snapControls ? window.__snapControls() : {};
    emit('snapshot', { controls: controls, winOk: true, hintKey: hintKey || 'legacy_win' });
    emit('win', { winOk: true });
  }
  var WIN_TEXT = [/完美命中/, /游戏胜利/, /过关！/, /命中目标！/, /🎯\\s*命中目标/, /🏆\\s*过关/];
  function scanWinText() {
    var text = document.body ? document.body.innerText : '';
    for (var i = 0; i < WIN_TEXT.length; i++) {
      if (WIN_TEXT[i].test(text)) {
        emitWin('text_' + i);
        return true;
      }
    }
    return false;
  }
  document.addEventListener('DOMContentLoaded', function() {
    var obs = new MutationObserver(function() { scanWinText(); });
    if (document.body) obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    setInterval(scanWinText, 800);
  });
})();
</script>`;

const SAMPLE_PATCHES = {
  'projectile-basic': [
    {
      from: `winOverlay.classList.add('show');
                    // 埋点 snapshot & win
                    const controlsSnapshot = {
                        's-angle': angleDeg,
                        's-speed': speed
                    };
                    // emit('snapshot', { controls: controlsSnapshot, winOk: true, hintKey: 'hit_target' });
                    // emit('win', { winOk: true });`,
      to: `winOverlay.classList.add('show');
                    const controlsSnapshot = {
                        's-angle': angleDeg,
                        's-speed': speed
                    };
                    if (window.__emit) {
                      window.__emit('snapshot', { controls: controlsSnapshot, winOk: true, hintKey: 'hit_target' });
                      window.__emit('win', { winOk: true });
                    }`,
    },
  ],
  'efield-charge': [
    {
      from: "title: '过关！',",
      to: `title: '过关！',
          onWin: function() {
            if (window.__emit) {
              var c = window.__snapControls ? window.__snapControls() : {};
              window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'efield_clear' });
              window.__emit('win', { winOk: true });
            }
          },`,
    },
  ],
};

function hasTraceHookMarker(html) {
  return /<!-- trace-adapter-hook -->/.test(html);
}

function hasExecutableTraceHook(html) {
  return /window\.__emit\s*=|function\s+__emit\s*\(|PlatformTraceAdapter\.record\s*\(/.test(html);
}

/** @deprecated use hasExecutableTraceHook for gating; marker-only HTML is not sufficient */
function hasTraceHook(html) {
  return hasExecutableTraceHook(html);
}

function hasWinEmit(html) {
  return /(?:emit|emitFn|__emit|__traceHookEmit)\s*\(\s*['"]win['"]|PlatformTraceAdapter\.record\s*\(\s*['"]win['"]/.test(html)
    || /legacy-win-bridge/.test(html);
}

function hasNativeOperationHint(html) {
  const text = String(html || '');
  return /\.top-hint|class=["'][^"']*observe-msg|id=["']observeMsg["']|id=["']platform-op-hint["']/.test(text)
    || /调节参数[\s\S]{0,80}(发射|测试)|点击[「"']?发射/.test(text);
}

function stripLegacyOperationHint(html) {
  let out = String(html || '');
  out = out.replace(/<div id="platform-op-hint"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  if (/<!-- legacy-win-bridge -->/.test(out)) {
    out = out.replace(/<!-- legacy-win-bridge -->[\s\S]*?<\/script>\s*/i, `${WIN_BRIDGE}\n`);
  }
  return out;
}

function injectLegacyTrace(html, sampleId) {
  let out = stripLegacyOperationHint(String(html || ''));

  if (!hasExecutableTraceHook(out)) {
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${TRACE_HOOK}\n${WIN_BRIDGE}\n</body>`);
    } else {
      out += `\n${TRACE_HOOK}\n${WIN_BRIDGE}\n`;
    }
  } else if (!/legacy-win-bridge/.test(out)) {
    out = out.replace(/<\/body>/i, `${WIN_BRIDGE}\n</body>`);
  } else if (/platform-op-hint/.test(out)) {
    out = out.replace(/<!-- legacy-win-bridge -->[\s\S]*?<\/script>\s*/i, `${WIN_BRIDGE}\n`);
  }

  const patches = SAMPLE_PATCHES[sampleId] || [];
  for (const { from, to } of patches) {
    if (out.includes(from) && !out.includes(to.slice(0, 40))) {
      out = out.replace(from, to);
    }
  }

  if (sampleId === 'capacitor-plate') {
    const capPatch = 'if (winOk && !_capBandPrev) SFX.play(\'bandEnter\');';
    const capReplacement = `${capPatch}
    if (winOk && window.__emit) {
      window.__emit('snapshot', { winOk: true, hintKey: 'cap_band' });
      window.__emit('win', { winOk: true });
    }`;
    if (out.includes(capPatch) && !out.includes("hintKey: 'cap_band'")) {
      out = out.replace(capPatch, capReplacement);
    }
  }

  if (sampleId === 'cyclotron-radius') {
    const cycPatch = "document.getElementById('msgTitle').textContent = '🎯 命中目标！';";
    const cycReplacement = `${cycPatch}
        if (window.__emit) {
          var c = window.__snapControls ? window.__snapControls() : {};
          window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'cyclotron_hit' });
          window.__emit('win', { winOk: true });
        }`;
    if (out.includes(cycPatch) && !out.includes("hintKey: 'cyclotron_hit'")) {
      out = out.replace(cycPatch, cycReplacement);
    }
  }

  return out;
}

function auditHtmlContent(html, sample) {
  const text = String(html || '');
  const topic = sample?.topic || '';
  const motionTopic = /抛体|碰撞|振子|圆周|动量|机械能|简谐/.test(topic);

  return {
    id: sample?.id,
    legacy: !!sample?.existingHtml,
    hasHtml: text.length > 100,
    hasRaf: /requestAnimationFrame/.test(text),
    hasCssAnim: /@keyframes|animation:\s*[^;]+[^0]/.test(text),
    hasTraceHookMarker: hasTraceHookMarker(text),
    hasTraceHook: hasExecutableTraceHook(text),
    hasWinEmit: hasWinEmit(text),
    needsFireButton: /btn-fire|btn-test|launch\s*\(|发射|测试热流|测试下滑/.test(text),
    motionTopic,
    staticOnly: motionTopic && !/requestAnimationFrame/.test(text),
  };
}

module.exports = {
  TRACE_HOOK,
  WIN_BRIDGE,
  OPERATION_HINT,
  injectLegacyTrace,
  stripLegacyOperationHint,
  auditHtmlContent,
  hasTraceHookMarker,
  hasExecutableTraceHook,
  hasNativeOperationHint,
  hasTraceHook,
  hasWinEmit,
};
