const { assert } = require('../../../lib/assert');
/**
 * Agent think-tree pre-analysis regression.
 */
const { extractGameHints } = require('../../../../packages/generate/hints');
const {
  buildAgentThinkSkeleton,
  enrichAgentThinkWithLlm,
  formatAgentThinkForPrompt,
  mergeAgentThink,
  inferVariableStrategy,
} = require('../../../../packages/generate/agent-think');
const { buildGeneratePrompt } = require('../../../../packages/generate/pipeline');

const MULTI_SLIDER_HTML = `<!DOCTYPE html>
<html><body>
<script>
const paramInputs = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
paramInputs.forEach(key => {
  document.body.insertAdjacentHTML('beforeend',
    '<input type="range" id="input-' + key + '" min="0" max="100">');
});
document.getElementById('gameCanvas');
</script>
</body></html>`;

const IRRELEVANT_HTML = `<!DOCTYPE html>
<html><body>
<script>
// irrelevant_touch decoy control
function set_irrelevant() {}
const toggleGuideBtn = document.getElementById('toggleGuide');
</script>
</body></html>`;

const COND_PARAM_HINTS = {
  tier: 'generic',
  tunableInputCount: 4,
  modeToggleCount: 1,
  hasCoupledControls: true,
  hasConditionalParamProfile: true,
  hasIrrelevant: true,
  sourceComplexity: 'rich',
  minStrategyRoutes: 3,
  sliderControlIds: ['input-a', 'input-b', 'input-c', 'input-d'],
  discreteControlIds: ['airCheckbox'],
  variableKindSummary: { sliderCount: 4, discreteCount: 1 },
  actionTriggerControlIds: ['btnFire'],
  optionalUiToggleIds: ['toggleGuide'],
  actionObserveLoop: true,
  hasScoringTargetWin: true,
};

const STEP_ORDER = [
  'scan_controls',
  'variable_kinds',
  'irrelevant_vars',
  'conditional_invalid',
  'variable_strategy',
  'feedback_loop',
];

function assertStepOrder(steps) {
  const ids = steps.map(s => s.id);
  for (let i = 1; i < STEP_ORDER.length; i++) {
    assert(
      ids.indexOf(STEP_ORDER[i - 1]) < ids.indexOf(STEP_ORDER[i]),
      `step order: ${STEP_ORDER[i - 1]} before ${STEP_ORDER[i]}`,
    );
  }
}

async function run() {
  const multiSources = [{ path: 'multi.html', content: MULTI_SLIDER_HTML }];
  const multiHints = extractGameHints(multiSources);
  const multiSk = buildAgentThinkSkeleton(multiHints);
  assertStepOrder(multiSk.steps);
  assert(!multiHints.hasIrrelevant, 'multi-slider no irrelevant signal');
  assert((multiHints.variableKindSummary?.sliderCount ?? 0) >= 5, 'multi-slider slider count');
  const kindsStep = multiSk.steps.find(s => s.id === 'variable_kinds');
  assert(kindsStep?.sliderIds?.length >= 5, 'variable_kinds has sliderIds');
  const irrStep = multiSk.steps.find(s => s.id === 'irrelevant_vars');
  assert(irrStep?.answer === 'no', 'multi-slider irrelevant_vars no');
  const varStep = multiSk.steps.find(s => s.id === 'variable_strategy');
  assert(varStep?.preferredRoute === '单变量法', 'multi-slider preferredRoute 单变量法');
  assert(varStep?.suboptimalRoutes?.includes('多滑条盲调'), 'multi-slider suboptimal 多滑条盲调');
  assert(varStep?.recommendedRoutes?.length >= 2, 'multi-slider needs >=2 routes');

  const strat3 = inferVariableStrategy({ sliderControlIds: ['a', 'b', 'c'], sourceComplexity: 'moderate' });
  assert(strat3.preferredRoute === '单变量法', 'inferVariableStrategy preferred');
  assert(strat3.suboptimalRoutes.includes('多滑条盲调'), 'inferVariableStrategy suboptimal');

  const irrSources = [{ path: 'irr.html', content: IRRELEVANT_HTML }];
  const irrHints = extractGameHints(irrSources);
  const irrSk = buildAgentThinkSkeleton(irrHints);
  const irrVars = irrSk.steps.find(s => s.id === 'irrelevant_vars');
  assert(irrVars?.answer === 'yes', 'irrelevant html signals yes');

  const condSk = buildAgentThinkSkeleton(COND_PARAM_HINTS);
  assertStepOrder(condSk.steps);
  const condKinds = condSk.steps.find(s => s.id === 'variable_kinds');
  assert(condKinds?.discreteIds?.includes('airCheckbox'), 'cond param discreteIds');
  const condStep = condSk.steps.find(s => s.id === 'conditional_invalid');
  assert(condStep?.answer === 'yes', 'conditional profile yes');
  assert(condStep?.conclusion?.includes('stratInvalid'), 'conditional mentions stratInvalid');
  const condVar = condSk.steps.find(s => s.id === 'variable_strategy');
  assert(condVar?.preferredRoute === '单变量法', 'cond param preferredRoute');
  assert(condVar?.recommendedRoutes?.includes('控制变量法'), 'cond param recommends 控制变量法');
  assert(condSk.steps.some(s => s.id === 'outcome_gates'), 'scoring win adds outcome_gates');

  const promptText = formatAgentThinkForPrompt(condSk);
  assert(promptText.includes('智能体思维树'), 'prompt has header');
  assert(promptText.includes('禁止 I*') || promptText.includes('stratInvalid'), 'prompt has irrelevant/invalid guidance');
  assert(promptText.includes('单变量'), 'prompt has 单变量');
  assert(promptText.includes('次优') || promptText.includes('多滑条盲调'), 'prompt has suboptimal');
  assert(promptText.includes('控制变量法'), 'prompt has route names');
  assert(promptText.includes('Observe'), 'prompt mentions feedback loop');
  assert(promptText.includes('slider/'), 'prompt shows variableKind');

  const merged = mergeAgentThink(condSk, {
    controls: { 'input-a': { role: 'operation', mapsTo: 'O1', reason: 'win 读取 angle', variableKind: 'slider' } },
    variableStrategyPatch: {
      preferredRoute: '单调调参',
      recommendedRoutes: ['单调调参', '控制变量法'],
      suboptimalRoutes: ['多滑条盲调'],
    },
  }, 'hybrid');
  assert(merged.source === 'hybrid', 'merge sets hybrid source');
  assert(merged.controls['input-a'].reason.includes('win'), 'merge patches control reason');
  assert(
    merged.steps.find(s => s.id === 'variable_strategy').preferredRoute === '单调调参',
    'merge patches preferredRoute',
  );

  const ruleOnly = await enrichAgentThinkWithLlm(condSk, multiSources, {});
  assert(ruleOnly.source === 'rule_only', 'no apiKey degrades to rule_only');
  assert(formatAgentThinkForPrompt(ruleOnly).includes('variable_strategy'), 'rule_only still formats prompt');

  const genPrompt = buildGeneratePrompt({
    sources: multiSources,
    gameHints: multiHints,
    agentThink: multiSk,
  });
  assert(genPrompt.includes('智能体思维树'), 'buildGeneratePrompt injects think tree');
  assert(genPrompt.indexOf('智能体思维树') < genPrompt.indexOf('待分析源码'), 'think before source code');
  assert(genPrompt.includes('单变量优策略'), 'generate prompt has single-var quality hint');

  console.log('agent-think-check: OK');
}

module.exports = { run };
