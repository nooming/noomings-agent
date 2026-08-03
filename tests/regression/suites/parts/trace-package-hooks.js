const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const {
  hasExecutableTraceHook,
  hasWinEmit,
  injectLegacyTrace,
  WIN_BRIDGE,
  TRACE_HOOK,
} = require('../../../../packages/platform/legacy-trace-inject');
const { getPackageGamePath } = require('../../../../packages/shared/data-paths');

const REQUIRED_PACKAGE_HOOKS = [
  'projectile-basic',
  'efield-charge',
  'circular-motion',
];

function run() {
  for (const id of REQUIRED_PACKAGE_HOOKS) {
    const p = getPackageGamePath(id);
    assert(fs.existsSync(p), `${id}: package game.html missing at ${p}`);
    const html = fs.readFileSync(p, 'utf8');
    assert(hasExecutableTraceHook(html), `${id}: missing executable trace hook`);
    assert(hasWinEmit(html), `${id}: missing win emit or legacy-win-bridge`);
    assert(!html.includes('platform-op-hint'), `${id}: must not contain platform-op-hint`);
  }

  assert(!WIN_BRIDGE.includes('platform-op-hint'), 'WIN_BRIDGE must not inject platform-op-hint');

  const markerOnly = `<!DOCTYPE html><html><body>
    <!-- trace-adapter-hook -->
    <input type="range" id="s-v"><button id="go">go</button>
    </body></html>`;
  const patched = injectLegacyTrace(markerOnly, '_generic');
  assert(hasExecutableTraceHook(patched), 'injectLegacyTrace: marker-only HTML should gain executable hook');
  assert(hasWinEmit(patched), 'injectLegacyTrace: marker-only HTML should gain win bridge');

  const studentPlay = fs.readFileSync(
    path.join(__dirname, '../../../../apps/web/ui/pages/student-play.html'),
    'utf8',
  );
  const loadIdx = studentPlay.search(/frame\.addEventListener\(\s*['"]load['"]/);
  const srcIdx = studentPlay.indexOf('frame.src = item.playUrl');
  assert(loadIdx >= 0 && srcIdx >= 0 && loadIdx < srcIdx,
    'student-play: load listener must be registered before frame.src');
  assert(studentPlay.includes('injectGameTrace()'), 'student-play must call injectGameTrace on load');

  const adapterSrc = fs.readFileSync(
    path.join(__dirname, '../../../../apps/web/ui/trace-adapter-platform.js'),
    'utf8',
  );
  assert(/skipBindControls/.test(adapterSrc), 'trace adapter must honor skipBindControls');
  assert(/skipPuzzleOpen/.test(adapterSrc), 'trace adapter must honor skipPuzzleOpen');
  assert(/getSessionId/.test(adapterSrc), 'trace adapter must export getSessionId');

  // Collection policy: range/number tuning on change only (no input spam while dragging).
  const bindBlock = adapterSrc.match(/function bindControls\([\s\S]*?\n  \}/)?.[0] || '';
  assert(bindBlock.includes("addEventListener('change'"), 'bindControls must listen for change');
  assert(
    !/addEventListener\(\s*['"]input['"]/.test(bindBlock),
    'bindControls must not listen for input on range/number (drag spam)',
  );
  assert(
    bindBlock.includes('__platformTraceControlsBound'),
    'bindControls must set __platformTraceControlsBound for game-hook dedupe',
  );

  assert(
    /addEventListener\(\s*['"]change['"]/.test(TRACE_HOOK),
    'TRACE_HOOK must bind tuning on change',
  );
  assert(
    !/addEventListener\(\s*['"]input['"]\s*,\s*function\s*\([^)]*\)\s*\{[\s\S]{0,80}emit\(\s*['"]tuning['"]/.test(TRACE_HOOK),
    'TRACE_HOOK must not emit tuning on input',
  );
  assert(
    TRACE_HOOK.includes('__platformTraceControlsBound'),
    'TRACE_HOOK must skip when platform adapter already bound controls',
  );

  // Lightweight bindControls simulation: many input → 0 tuning; one change → 1 tuning.
  {
    const recorded = [];
    const listeners = new Map();
    const el = {
      id: 's-demo',
      name: '',
      value: '1',
      type: 'range',
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatch(type) {
        for (const fn of listeners.get(type) || []) fn();
      },
    };
    const doc = {
      querySelectorAll(sel) {
        if (sel.includes('range') || sel.includes('number')) return [el];
        return [];
      },
      addEventListener() {},
    };
    // Mirror adapter policy (change-only) without loading browser globals.
    doc.querySelectorAll('input[type="range"], input[type="number"]').forEach((node) => {
      node.addEventListener('change', () => {
        recorded.push({ type: 'tuning', control: node.id || node.name || 'slider', value: node.value });
      });
    });
    el.value = '2'; el.dispatch('input');
    el.value = '3'; el.dispatch('input');
    el.value = '4'; el.dispatch('input');
    assert(recorded.length === 0, 'input events must not record tuning');
    el.value = '5'; el.dispatch('change');
    assert(recorded.length === 1, 'one change must record one tuning');
    assert(recorded[0].value === '5', 'change tuning value must match final slider value');
  }

  // Spot-check a package game: tuning emit on change, not bare input→emit(tuning).
  const rcPath = getPackageGamePath('rc-circuit');
  const rcHtml = fs.readFileSync(rcPath, 'utf8');
  assert(
    /addEventListener\(\s*['"]change['"]\s*,\s*function\s*\([^)]*\)\s*\{[\s\S]{0,120}emit\(\s*['"]tuning['"]/.test(rcHtml),
    'rc-circuit: tuning emit should be on change',
  );
  assert(
    !/addEventListener\(\s*['"]input['"]\s*,\s*function\s*\([^)]*\)\s*\{[\s\S]{0,80}emit\(\s*['"]tuning['"]/.test(rcHtml),
    'rc-circuit: must not emit tuning directly from input',
  );

  console.log('trace-package-hooks: OK');
}

module.exports = { run };
