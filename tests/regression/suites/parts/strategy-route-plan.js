const { assert } = require('../../../lib/assert');
const {
  buildStrategyRoutePlan,
  buildPerAvStrategyRoutes,
  buildControlVarLabel,
  sliderParamLabel,
  MAIN_METHOD_LABEL,
  TRAP_METHOD_LABEL,
} = require('../../../../packages/generate/strategy-route-plan');

function run() {
  const hints5 = {
    sliderControlIds: ['input-alpha', 'input-beta', 'input-gamma', 'input-delta', 'input-epsilon'],
    variableKindSummary: { sliderCount: 5, discreteCount: 0 },
  };
  const plan = buildStrategyRoutePlan(hints5);
  assert(plan.routes.length === 2, '5 sliders without AV list → control var + trap');
  assert(plan.routes[0].id === 'main', 'first route is main');
  assert(plan.routes[0].label === MAIN_METHOD_LABEL, 'main is short control-var label');
  const trap = plan.routes.find(r => r.tier === 'suboptimal');
  assert(trap?.id === 'trap' && trap.label === TRAP_METHOD_LABEL, 'trap id/label');
  assert(trap?.warn.includes('难归因'), 'trap warn');
  assert(plan.mermaidHints.strategySelectLabels.length === 2, 'two pathway labels');

  assert(sliderParamLabel('input-speed') === 'speed', 'param label from input-');
  assert(buildControlVarLabel(hints5) === MAIN_METHOD_LABEL, 'buildControlVarLabel short');

  const hints1 = {
    sliderControlIds: ['input-x'],
    variableKindSummary: { sliderCount: 1, discreteCount: 0 },
  };
  const plan1 = buildStrategyRoutePlan(hints1);
  assert(plan1.routes.length === 1, 'single slider → 1 preferred, no trap');
  assert(!plan1.routes.some(r => r.tier === 'suboptimal'), 'no trap for 1 slider');

  // Multi-AV ranked list → per-AV routes with differentiated scores
  const chapter = {
    inquiryScript: {
      adjustmentVariables: [
        { id: 'AV1', controlId: 'input-alpha', label: 'α', priorityRank: 1 },
        { id: 'AV2', controlId: 'input-beta', label: 'β', priorityRank: 2 },
      ],
    },
  };
  const perAv = buildPerAvStrategyRoutes(hints5, chapter);
  assert(perAv.routes.filter(r => /单变量·/.test(r.label)).length === 2, 'two per-AV routes');
  assert(perAv.routes.some(r => r.id === 'trap'), 'trap present');
  const scores = perAv.routes.filter(r => r.id !== 'trap').map(r => r.score);
  assert(new Set(scores).size >= 2, `scores differ: ${scores}`);

  console.log('strategy-route-plan-check: OK');
}

module.exports = { run };
