const { assert } = require('../../../lib/assert');
const { validateObserveAdjustControlVarConsistency } = require('../../../../packages/contract/strategy/strategy-rules');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');

function run() {
  const hints = {
    sliderControlIds: ['input-angle', 'input-speed'],
    variableKindSummary: { sliderCount: 2 },
    minStrategyRoutes: 2,
  };

  const bad = {
    strategy: {
      mermaid: [
        'graph TD',
        'Observe1{观察?}:::stratCond',
        'Adjust1[同时调整 angle 和 speed]',
        'Observe1 -->|偏近| Adjust1',
      ].join('\n'),
      routes: [{ id: 'main', label: '控制变量：每次只改一项', tier: 'preferred' }],
    },
  };
  const badCheck = validateObserveAdjustControlVarConsistency(bad, hints);
  assert(!badCheck.ok, 'dual-param adjust should fail');

  const ok = {
    strategy: {
      mermaid: [
        'graph TD',
        'Observe1{观察?}:::stratCond',
        'Adjust1[只调 angle]',
        'Observe1 -->|偏近| Adjust1',
      ].join('\n'),
      routes: [{ id: 'main', label: '控制变量：每次只改一项', tier: 'preferred' }],
    },
  };
  const okCheck = validateObserveAdjustControlVarConsistency(ok, hints);
  assert(okCheck.ok, 'single-param adjust ok');

  console.log('observe-adjust-cvar: OK');
}

module.exports = { run };
