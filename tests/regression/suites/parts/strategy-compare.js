const { assert } = require('../../../lib/assert');
/**
 * 通用源码结构 hints 抽检
 * npm run check:strategy �?suite: strategy-compare
 */
const fs = require('fs');
const path = require('path');
const { extractGameHints } = require('../../../../packages/generate/hints');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function run() {
  const filePath = argValue('--file');
  let sources;
  if (filePath) {
    const abs = path.resolve(filePath);
    sources = [{ path: path.basename(abs), content: fs.readFileSync(abs, 'utf8') }];
  } else {
    const html = '<html><title>fixture</title><input type="checkbox" id="mode"><input type="range" id="a"></html>';
    sources = [{ path: 'fixture.html', content: html }];
    console.log('no --file: using minimal fixture HTML for hints smoke test');
  }

  const hints = extractGameHints(sources);
  assert(hints.tier === 'generic', 'tier must stay generic');
  assert(hints.hasEnvironmentFork === undefined, 'no hasEnvironmentFork');
  assert(hints.massDragCoupled === undefined, 'no massDragCoupled');

  console.log('gameHints:', JSON.stringify({
    modeToggleCount: hints.modeToggleCount,
    tunableInputCount: hints.tunableInputCount,
    hasCoupledControls: hints.hasCoupledControls,
    sourceComplexity: hints.sourceComplexity,
    minStrategyRoutes: hints.minStrategyRoutes,
  }, null, 2));
  console.log('strategy-compare-check: OK');
}

module.exports = { run };
