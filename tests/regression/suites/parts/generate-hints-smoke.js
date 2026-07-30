const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { getAgentDir } = require('../../../../packages/shared/paths');
const { extractGameHints } = require('../../../../packages/generate/hints');

function run() {
  const raw = process.env.AGENT_SMOKE_HTML;
  if (!raw || !String(raw).trim()) {
    console.log('generate-hints-smoke: SKIP (AGENT_SMOKE_HTML not set)');
    return;
  }

  const agentDir = getAgentDir();
  const paths = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  assert(paths.length > 0, 'AGENT_SMOKE_HTML must list at least one file');

  for (const rel of paths) {
    const abs = path.isAbsolute(rel) ? rel : path.join(agentDir, rel);
    assert(fs.existsSync(abs), `AGENT_SMOKE_HTML missing file: ${rel}`);
    const hints = extractGameHints([{ path: path.basename(abs), content: fs.readFileSync(abs, 'utf8') }]);
    assert(hints.tier === 'generic', `tier must stay generic for ${rel}`);
    assert(hints.hasEnvironmentFork === undefined, 'no hasEnvironmentFork');
    console.log(`${path.basename(abs)}:`, JSON.stringify({
      modeToggleCount: hints.modeToggleCount,
      tunableInputCount: hints.tunableInputCount,
      hasCoupledControls: hints.hasCoupledControls,
      sourceComplexity: hints.sourceComplexity,
      minStrategyRoutes: hints.minStrategyRoutes,
      hasMultipleLevels: hints.hasMultipleLevels,
      levelCount: hints.levelCount,
    }, null, 2));
  }
  console.log('generate-hints-smoke: OK');
}

module.exports = { run };
