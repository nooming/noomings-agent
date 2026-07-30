const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const {
  hasExecutableTraceHook,
  hasWinEmit,
  injectLegacyTrace,
  WIN_BRIDGE,
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
  const loadIdx = studentPlay.indexOf("frame.addEventListener('load', injectGameTrace)");
  const srcIdx = studentPlay.indexOf('frame.src = item.playUrl');
  assert(loadIdx >= 0 && srcIdx >= 0 && loadIdx < srcIdx,
    'student-play: load listener must be registered before frame.src');

  const adapterSrc = fs.readFileSync(
    path.join(__dirname, '../../../../apps/web/ui/trace-adapter-platform.js'),
    'utf8',
  );
  assert(/skipBindControls/.test(adapterSrc), 'trace adapter must honor skipBindControls');
  assert(/skipPuzzleOpen/.test(adapterSrc), 'trace adapter must honor skipPuzzleOpen');
  assert(/getSessionId/.test(adapterSrc), 'trace adapter must export getSessionId');

  console.log('trace-package-hooks: OK');
}

module.exports = { run };
