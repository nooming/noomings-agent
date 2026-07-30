const { assert } = require('../../../lib/assert');
/**
 * 玩法模式切换 vs 条件参数剖面 hints 回归�? * npm run check:generate �?suite: gameplay-mode-hints
 */
const { extractGameHints, formatGameHintsForPrompt, buildStrategyPromptHints } = require('../../../../packages/generate/hints');

const GAMEPLAY_MODE_STUB = `<!DOCTYPE html><html><body>
<button id="switchFreeBtn" class="mode-toggle">自由模式</button>
<button id="switchChallengeBtn" class="mode-toggle">闯关模式</button>
<button id="switchTutorialBtn" class="mode-toggle">教程模式</button>
<input type="range" id="paramA" min="0" max="100">
<input type="range" id="paramB" min="0" max="100">
<script>
let currentMode = 'challenge';
document.getElementById('switchFreeBtn').addEventListener('click', () => { currentMode = 'free'; });
document.getElementById('switchChallengeBtn').addEventListener('click', () => { currentMode = 'challenge'; });
document.getElementById('applyForceBtn').addEventListener('click', () => {
  const v = document.getElementById('paramA').value;
});
</script></body></html>`;

function run() {
  const sources = [{ path: 'gameplay-mode-stub.html', content: GAMEPLAY_MODE_STUB }];
  const hints = extractGameHints(sources);

  assert(hints.hasGameplayModeSwitch === true, 'expected hasGameplayModeSwitch');
  assert(hints.hasConditionalParamProfile === false, 'gameplay mode stub should not trigger conditional param profile');
  assert(hints.hasCoupledControls === false, 'no checkbox coupling in stub');

  const prompt = formatGameHintsForPrompt(hints) + '\n' + buildStrategyPromptHints(hints);
  assert(!/关态下无效|Env\{/.test(prompt), 'prompt should not contain conditional-param Env template');
  assert(/玩法模式切换/.test(prompt), 'prompt should mention gameplay mode guidance');

  console.log('gameplay-mode-hints-check: ok');
}

module.exports = { run };
