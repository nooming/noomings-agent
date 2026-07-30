const { assert } = require('../../../lib/assert');
/** CLI: strategy-layout regression */
const { detectMacroRouteFanOut } = require('../../../../packages/shared/strategy-mermaid-parse.js');
const { loadChapter } = require('../../../lib/fixture-loader');

const FANOUT_FIXTURE = loadChapter('strategy', 'macroFanout');
const PARALLEL_EXIT_FIXTURE = loadChapter('judge', 'parallelExit');

const BAD_FANOUT = `graph TD
Fire --> CheckGoal{命中目标?}:::stratCond
Fire --> CheckGoal2{命中目标?}:::stratCond
Fire --> CheckGoal3{命中目标?}:::stratCond
Fire --> Observe{观察偏近/偏远?}:::stratCond
Fire --> Observe2{观察偏近/偏远?}:::stratCond
Fire --> Observe3{观察偏近/偏远?}:::stratCond
Start --> StrategySelect{选择策略?}:::stratCond`;

const GOOD_ISOLATED = `graph TD
Start --> StrategySelect{选择策略?}:::stratCond
StrategySelect -->|途径1| Adjust1[调节]
Adjust1 --> Fire1[发射]
Fire1 --> Observe1{观察?}:::stratCond
StrategySelect -->|途径2| Adjust2[调节]
Adjust2 --> Fire2[发射]
Fire2 --> Observe2{观察?}:::stratCond`;

function run() {
  assert(detectMacroRouteFanOut(BAD_FANOUT), 'bad fan-out sample should be detected');
  assert(!detectMacroRouteFanOut(GOOD_ISOLATED), 'isolated routes should not fan out');

  const fanoutChapter = FANOUT_FIXTURE;
  assert(fanoutChapter.strategy?.mermaid, 'macro-fanout fixture mermaid present');
  assert(detectMacroRouteFanOut(fanoutChapter.strategy.mermaid), 'macro-fanout fixture should trigger fan-out detect');
  console.log('macro-fanout fixture: OK');

  if (PARALLEL_EXIT_FIXTURE) {
    const mm = PARALLEL_EXIT_FIXTURE.strategy?.mermaid || '';
    assert(mm && !detectMacroRouteFanOut(mm), 'parallel-exit fixture should not fan out');
  }

  console.log('strategy-layout-check: OK');
}

module.exports = { run };
