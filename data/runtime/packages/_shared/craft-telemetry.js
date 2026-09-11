/**
 * Shared craft telemetry helpers for inquiry packages.
 *
 * New levels: prefer this file over pasting inline dual-mode / explore gate snippets.
 * Do NOT collapse explore_success into win — they are different classroom outcomes.
 *
 * Usage (in game.html, after #modeSelect exists in DOM):
 *   <script src="../_shared/craft-telemetry.js"></script>
 *   <script>
 *     CraftTelemetry.initDualModePhase();
 *     // Optional explore gate (call after a measurement in explore mode):
 *     // CraftTelemetry.noteExploreSuccess(__emit, controls, { minTests: 3, requiredAvIds: ['s-T','s-m'] });
 *   </script>
 */
(function (global) {
  function syncPhaseFromModeSelect() {
    var s = document.getElementById('modeSelect');
    if (!s) return;
    var p = s.value === 'challenge' ? 'challenge' : 'explore';
    try {
      if (typeof global.__platformTraceSetPhase === 'function') {
        global.__platformTraceSetPhase(p);
        global.__craftPhaseEmitted = p;
        return;
      }
      if (global.PlatformTraceAdapter && global.PlatformTraceAdapter.setPhase) {
        global.PlatformTraceAdapter.setPhase(p);
        global.__craftPhaseEmitted = p;
        return;
      }
    } catch (e) {}
    if (global.__craftPhaseEmitted === p) return;
    global.__craftPhaseEmitted = p;
    try {
      if (typeof global.__emit === 'function') global.__emit('phase_change', { phase: p });
      else if (typeof global.__traceEmit === 'function') global.__traceEmit('phase_change', { phase: p });
    } catch (e2) {}
  }

  function initDualModePhase() {
    if (global.__craftDualModeInitBound) {
      syncPhaseFromModeSelect();
      return;
    }
    global.__craftDualModeInitBound = true;
    function run() {
      setTimeout(syncPhaseFromModeSelect, 0);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
    var s = document.getElementById('modeSelect');
    if (s && !s.__craftTelemetryPhaseBound) {
      s.__craftTelemetryPhaseBound = true;
      s.addEventListener('change', syncPhaseFromModeSelect);
    }
  }

  /**
   * Explore-only success gate. Never emits `win`.
   * @param {Function} [emitFn]
   * @param {object} [controls]
   * @param {{ minTests?: number, requiredAvIds?: string[], minAvTouched?: number }} [opts]
   */
  function noteExploreSuccess(emitFn, controls, opts) {
    try {
      opts = opts || {};
      var minTests = opts.minTests != null ? opts.minTests : 3;
      var required = opts.requiredAvIds || null;
      var minAv = opts.minAvTouched != null ? opts.minAvTouched : (required ? required.length : 0);
      var g = global.__exploreSuccessGate || (global.__exploreSuccessGate = { n: 0, keys: Object.create(null), done: false });
      g.n += 1;
      var c = controls || {};
      Object.keys(c).forEach(function (k) { g.keys[k] = 1; });
      var touched = global.__exploreAvTouched || {};
      var avN = 0;
      if (required && required.length) {
        avN = required.filter(function (id) { return !!touched[id]; }).length;
      } else {
        avN = Object.keys(touched).length;
      }
      if (g.done || g.n < minTests || (minAv && avN < minAv)) return;
      g.done = true;
      var emit = emitFn || global.__emit;
      if (typeof emit === 'function') {
        emit('explore_success', { winOk: true, hintKey: 'explore_contrast', controls: c });
      }
    } catch (e) {}
  }

  function resetExploreGate() {
    global.__exploreSuccessGate = { n: 0, keys: Object.create(null), done: false };
    global.__exploreAvTouched = Object.create(null);
  }

  global.CraftTelemetry = {
    initDualModePhase: initDualModePhase,
    syncPhaseFromModeSelect: syncPhaseFromModeSelect,
    noteExploreSuccess: noteExploreSuccess,
    resetExploreGate: resetExploreGate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
