/**
 * Strategy route highlight expansion �?layered regression (synthetic + fixtures + optional output).
 * npm run check:strategy �?suite: strategy-route-highlight
 */
const fs = require('fs');
const path = require('path');
const {
  buildRouteHighlightEdgeKeys,
  expandRouteHighlight,
  extractStratResultNodeIds,
} = require('../../../../packages/shared/strategy-mermaid-parse.js');

const {
  loadChapter,
  loadGenericBundle,
  fixturesRoot,
} = require('../../../lib/fixture-loader');

const MULTI_FORK_FIXTURE = () => loadChapter('strategy', 'multiFork');
const SHARED_HUB_FIXTURE = () => loadChapter('strategy', 'sharedHub');
const RESTRICTED_PAIRWISE_FIXTURE = () => loadChapter('strategy', 'restrictedPairwise');
const PHANTOM_CONTINUE_FIXTURE = () => loadChapter('strategy', 'phantomContinue');
const MULTI_GATE_RETRY_FIXTURE = () => loadChapter('strategy', 'multiGateRetry');
const FIX = fixturesRoot();

const RESULT_R1 = new Set(['R1']);

const { assert } = require('../../../lib/assert');

/** Tier 0 �?synthetic mermaid graphs (no fixture dependency) */
function tier0Synthetic() {
  const forkBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Fork{选择?}:::stratCond',
    'Fork -->|A| PathA[路径A]',
    'Fork -->|B| PathB[路径B]',
    'PathA --> Shared[共享]',
    'PathB --> Shared',
  ].join('\n');
  const forkRoute = {
    id: 'path_b',
    label: '路径B',
    mapsTo: ['R1'],
    highlightNodes: ['PathB', 'Shared'],
    highlightEdges: [['PathB', 'Shared']],
  };
  const forkExp = expandRouteHighlight(forkRoute, forkBody, { resultKgIds: RESULT_R1 });
  assert(forkExp.highlightNodes.includes('PathB'), 'fork: PathB highlighted');
  assert(
    ![...forkExp.edgeKeys].some(k => k.includes('PathA')),
    'fork: must not include PathA branch',
  );
  assert(!forkExp.highlightNodes.includes('PathA'), 'fork: must not highlight PathA');

  const successClassBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Dec{达标?}:::stratCond',
    'Dec -->|是| Done[过关]:::stratResult',
    'Dec -->|否| Retry[重试]',
  ].join('\n');
  const loopRoute = {
    id: 'loop',
    mapsTo: ['R1'],
    highlightNodes: ['Retry', 'Dec'],
    highlightEdges: [['Dec', 'Retry']],
  };
  const classExp = expandRouteHighlight(loopRoute, successClassBody, { resultKgIds: RESULT_R1 });
  assert(classExp.highlightNodes.includes('Done'), 'success class: Done appended');
  assert(classExp.edgeKeys.has('Dec->Done'), 'success class: Dec->Done');

  const successLabelBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Dec{达标?}:::stratCond',
    'Dec -->|是| Done[过关]',
    'Dec -->|否| Retry[重试]',
  ].join('\n');
  assert(extractStratResultNodeIds(successLabelBody).has('Done'), 'label fallback detects Done');
  const gateBody = [
    'graph TD',
    'Fire[发射] --> CheckGoal{命中目标?}:::stratCond',
    'CheckGoal -->|是| Win[过关]:::stratResult',
  ].join('\n');
  assert(!extractStratResultNodeIds(gateBody).has('CheckGoal'), 'stratCond gate must not be result id');

  const terminalRetryBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Strat[策略]',
    'Strat --> Fire1[发射]',
    'Fire1 --> Observe1{观察?}:::stratCond',
    'Observe1 -->|偏近| Adjust1[微调]',
    'Adjust1 --> Fire1',
    'Observe1 -->|否| Retry1[重置重试]:::stratRetry',
    'Observe1 -->|是| Win[过关]:::stratResult',
    'Fire1 --> Observe2{观察2?}:::stratCond',
    'Observe2 -->|否| Retry2[其他重试]:::stratRetry',
  ].join('\n');
  const terminalRetryRoute = {
    id: 'mag',
    highlightNodes: ['Start', 'Strat', 'Fire1', 'Observe1', 'Adjust1', 'Retry1', 'Win'],
    highlightEdges: [
      ['Start', 'Strat'],
      ['Strat', 'Fire1'],
      ['Fire1', 'Observe1'],
      ['Observe1', 'Adjust1'],
      ['Adjust1', 'Fire1'],
      ['Observe1', 'Win'],
    ],
  };
  const terminalExp = expandRouteHighlight(terminalRetryRoute, terminalRetryBody, { resultKgIds: RESULT_R1 });
  assert(terminalExp.edgeKeys.has('Observe1->Retry1'), 'terminal retry: Observe1->Retry1');
  assert(terminalExp.highlightNodes.includes('Retry1'), 'terminal retry: Retry1 node');
  assert(
    ![...terminalExp.edgeKeys].some(k => k.startsWith('Retry1->')),
    'terminal retry: no fictitious Retry1 outgoing edges',
  );
  assert(!terminalExp.edgeKeys.has('Observe1->Retry2'), 'terminal retry: no cross-number Observe1->Retry2');
  assert(!terminalExp.highlightNodes.includes('Retry2'), 'terminal retry: no Retry2 bleed');

  const multiObserveRetryBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> StrategySelect{选择?}:::stratCond',
    'StrategySelect -->|A| Strat1[策略1]',
    'StrategySelect -->|B| Strat2[策略2]',
    'Strat1 --> Fire1[发射]',
    'Strat2 --> Fire2[发射]',
    'Fire1 --> Observe1{观察1?}:::stratCond',
    'Fire2 --> Observe2{观察2?}:::stratCond',
    'Observe1 -->|否| Retry1[重试1]:::stratRetry',
    'Observe2 -->|否| Retry2[重试2]:::stratRetry',
    'Observe1 -->|是| Win[过关]:::stratResult',
    'Observe2 -->|是| Win',
  ].join('\n');
  const strat1Route = {
    id: 'strat1',
    highlightNodes: ['Start', 'StrategySelect', 'Strat1', 'Fire1', 'Observe1', 'Win'],
    highlightEdges: [
      ['Start', 'StrategySelect'],
      ['StrategySelect', 'Strat1'],
      ['Strat1', 'Fire1'],
      ['Fire1', 'Observe1'],
      ['Observe1', 'Win'],
    ],
  };
  const strat1Exp = expandRouteHighlight(strat1Route, multiObserveRetryBody, { resultKgIds: RESULT_R1 });
  assert(strat1Exp.edgeKeys.has('Observe1->Retry1'), 'multi observe: Observe1->Retry1');
  assert(!strat1Exp.edgeKeys.has('Observe2->Retry2'), 'multi observe: no Observe2->Retry2 bleed');
  assert(!strat1Exp.highlightNodes.includes('Retry2'), 'multi observe: no Retry2 node');

  const sharedRetryBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Fire[发射]',
    'Fire --> CheckGoal{命中?}:::stratCond',
    'Fire --> CheckGoal2{命中2?}:::stratCond',
    'CheckGoal -->|否| Retry[重试]:::stratRetry',
    'CheckGoal2 -->|否| Retry',
    'CheckGoal -->|是| Win[过关]:::stratResult',
    'CheckGoal2 -->|是| Win',
  ].join('\n');
  const checkGoalRoute = {
    id: 'route1',
    highlightNodes: ['Start', 'Fire', 'CheckGoal', 'Win'],
    highlightEdges: [['Fire', 'CheckGoal'], ['CheckGoal', 'Win']],
  };
  const cgExp = expandRouteHighlight(checkGoalRoute, sharedRetryBody, { resultKgIds: RESULT_R1 });
  assert(cgExp.edgeKeys.has('CheckGoal->Retry'), 'shared retry hub: CheckGoal->Retry');
  assert(cgExp.highlightNodes.includes('Retry'), 'shared retry hub: Retry node');
  assert(!cgExp.edgeKeys.has('CheckGoal2->Retry'), 'shared retry hub: no CheckGoal2->Retry bleed');

  const retryLoopBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Adjust1[调整]',
    'Adjust1 --> Fire1[发射]',
    'Fire1 --> Observe1{观察?}:::stratCond',
    'Observe1 -->|出界| Retry1[重置]:::stratRetry',
    'Observe1 -->|命中| Win[过关]:::stratResult',
    'Retry1 --> Adjust1',
  ].join('\n');
  const retryLoopRoute = {
    id: 'step',
    highlightNodes: ['Start', 'Adjust1', 'Fire1', 'Observe1', 'Win'],
    highlightEdges: [
      ['Start', 'Adjust1'],
      ['Adjust1', 'Fire1'],
      ['Fire1', 'Observe1'],
      ['Observe1', 'Win'],
    ],
  };
  const retryLoopExp = expandRouteHighlight(retryLoopRoute, retryLoopBody, { resultKgIds: RESULT_R1 });
  assert(retryLoopExp.edgeKeys.has('Observe1->Retry1'), 'retry loop: Observe1->Retry1');
  assert(retryLoopExp.edgeKeys.has('Retry1->Adjust1'), 'retry loop: Retry1->Adjust1');

  const judgeRetryBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Adjust[调节]',
    'Adjust --> Fire[发射]',
    'Fire --> Observe{观察?}:::stratCond',
    'Observe -->|否| Judge{偏近或偏远}:::stratCond',
    'Judge -->|偏近| DecreaseA[减小]',
    'Judge -->|偏远| IncreaseA[增大]',
    'Judge -->|出界| Retry[重置]:::stratRetry',
    'Observe -->|是| Win[过关]:::stratResult',
    'DecreaseA --> Adjust',
    'IncreaseA --> Adjust',
    'Retry --> Adjust',
  ].join('\n');
  const judgeRoute = {
    id: 'sync',
    highlightNodes: ['Start', 'Adjust', 'Fire', 'Observe', 'Judge', 'DecreaseA', 'IncreaseA', 'Win'],
    highlightEdges: [
      ['Start', 'Adjust'],
      ['Adjust', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Judge'],
      ['Judge', 'DecreaseA'],
      ['DecreaseA', 'Adjust'],
      ['Observe', 'Win'],
    ],
  };
  const judgeExp = expandRouteHighlight(judgeRoute, judgeRetryBody, { resultKgIds: RESULT_R1 });
  assert(judgeExp.edgeKeys.has('Judge->Retry'), 'judge retry: Judge->Retry');
  assert(judgeExp.edgeKeys.has('Retry->Adjust'), 'judge retry: Retry->Adjust');
  assert(judgeExp.highlightNodes.includes('Retry'), 'judge retry: Retry node');

  const undeclaredRetryRoute = {
    id: 'observe-only',
    highlightNodes: ['Observe1', 'Win'],
    highlightEdges: [['Observe1', 'Win']],
  };
  const undeclaredExp = expandRouteHighlight(undeclaredRetryRoute, terminalRetryBody, { resultKgIds: RESULT_R1 });
  assert(undeclaredExp.edgeKeys.has('Observe1->Retry1'), 'observe on route auto-highlights Observe1->Retry1');
  assert(undeclaredExp.highlightNodes.includes('Retry1'), 'observe on route adds Retry1 node');

  const adjustLoopBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Strat[策略]',
    'Strat --> Fire[发射]',
    'Fire --> Observe{观察?}:::stratCond',
    'Observe -->|偏近| Adjust1[微调]',
    'Observe -->|偏远| Adjust2[大幅]',
    'Adjust1 --> Fire',
    'Adjust2 --> Fire',
    'Observe -->|是| Win[过关]:::stratResult',
  ].join('\n');
  const adjustLoopRoute = {
    id: 'mag',
    highlightNodes: ['Start', 'Strat', 'Fire', 'Observe', 'Adjust1', 'Adjust2', 'Win'],
    highlightEdges: [
      ['Start', 'Strat'],
      ['Strat', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Adjust1'],
      ['Adjust1', 'Fire'],
      ['Observe', 'Win'],
    ],
  };
  const adjustExp = expandRouteHighlight(adjustLoopRoute, adjustLoopBody, { resultKgIds: RESULT_R1 });
  assert(adjustExp.edgeKeys.has('Observe->Adjust2'), 'adjust loop: Observe->Adjust2');
  assert(adjustExp.edgeKeys.has('Adjust2->Fire'), 'adjust loop: Adjust2->Fire return edge');

  const sharedAdjustBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> StrategySelect{选择策略?}:::stratCond',
    'StrategySelect -->|参数 B 优先| ParamBFirst[先调参数 B]',
    'StrategySelect -->|参数 A 优先| ParamAFirst[先调参数 A]',
    'StrategySelect -->|同步| Sync[同步微调]',
    'ParamBFirst --> Adjust[调节]',
    'ParamAFirst --> Adjust',
    'Sync --> Adjust',
    'Adjust --> Fire[发射]',
    'Fire --> Observe{观察?}:::stratCond',
    'Observe -->|是| Win[过关]:::stratResult',
  ].join('\n');
  const qFirstRoute = {
    id: 'route-q',
    highlightNodes: ['Start', 'StrategySelect', 'ParamAFirst', 'Adjust', 'Fire', 'Observe', 'Win'],
    highlightEdges: [
      ['Start', 'StrategySelect'],
      ['StrategySelect', 'ParamAFirst'],
      ['ParamAFirst', 'Adjust'],
      ['Adjust', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Win'],
    ],
  };
  const qExp = expandRouteHighlight(qFirstRoute, sharedAdjustBody, { resultKgIds: RESULT_R1 });
  assert(qExp.highlightNodes.includes('ParamAFirst'), 'shared adjust: ParamAFirst highlighted');
  assert(!qExp.highlightNodes.includes('ParamBFirst'), 'shared adjust: must not highlight ParamBFirst');
  assert(!qExp.edgeKeys.has('StrategySelect->ParamBFirst'), 'shared adjust: no StrategySelect->ParamBFirst');
  assert(!qExp.edgeKeys.has('ParamBFirst->Adjust'), 'shared adjust: no ParamBFirst->Adjust');

  const continueWinBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Strat[策略]',
    'Strat --> Fire[发射]',
    'Fire --> Observe{观察}:::stratCond',
    'Observe -->|未飞出| Continue[继续观察]',
    'Continue -->|命中| Win[过关]:::stratResult',
    'Observe -->|出界| Retry[重试]:::stratRetry',
  ].join('\n');
  const continueWinRoute = {
    id: 'boundary',
    highlightNodes: ['Start', 'Strat', 'Fire', 'Observe', 'Win'],
    highlightEdges: [
      ['Start', 'Strat'],
      ['Strat', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Win'],
    ],
  };
  const continueExp = expandRouteHighlight(continueWinRoute, continueWinBody, { resultKgIds: RESULT_R1 });
  assert(continueExp.edgeKeys.has('Continue->Win'), 'phantom resolve: Continue->Win');
  assert(continueExp.edgeKeys.has('Observe->Continue'), 'phantom resolve: Observe->Continue');
  assert(!continueExp.edgeKeys.has('Observe->Win'), 'phantom resolve: removes Observe->Win shortcut');

  const labelExp = expandRouteHighlight(loopRoute, successLabelBody, { resultKgIds: RESULT_R1 });
  assert(labelExp.highlightNodes.includes('Done'), 'success label: Done appended');
  assert(labelExp.edgeKeys.has('Dec->Done'), 'success label: Dec->Done');

  const misconceptionBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Dec{调整?}:::stratCond',
    'Dec -->|是| Done[过关]:::stratResult',
    'Dec -->|否| Retry[重试]',
    'Start --> Trap[迷思]:::stratInvalid',
    'Trap --> Retry',
  ].join('\n');
  const misconceptionRoute = {
    id: 'misconception',
    mapsTo: ['O1'],
    highlightNodes: ['Retry', 'Dec'],
    highlightEdges: [['Dec', 'Retry']],
  };
  const misExp = expandRouteHighlight(misconceptionRoute, misconceptionBody, { resultKgIds: RESULT_R1 });
  assert(!misExp.highlightNodes.includes('Done'), 'misconception: no Done when mapsTo lacks result');
  assert(!misExp.edgeKeys.has('Dec->Done'), 'misconception: no Dec->Done without result mapsTo');

  const dualMacroBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> StrategySelect{选择策略?}:::stratCond',
    'StrategySelect -->|A| StratA[策略A]:::stratCore',
    'StrategySelect -->|B| StratB[策略B]:::stratCore',
    'StratA --> Launch1[测试A]',
    'StratB --> Launch2[测试B]',
    'Launch1 --> Observe1{观察1?}:::stratCond',
    'Launch2 --> Observe2{观察2?}:::stratCond',
    'Observe1 -->|未达标| Adjust1[调整A]',
    'Adjust1 --> Launch1',
    'Observe1 -->|达标| Win[过关]:::stratResult',
    'Observe2 -->|未达标| Adjust2[调整B]',
    'Adjust2 --> Launch2',
    'Observe2 -->|达标| Win',
  ].join('\n');
  const dualRouteB = {
    id: 'route_b',
    label: '策略B',
    mapsTo: ['R1'],
    highlightNodes: ['Start', 'StrategySelect', 'StratB', 'Launch2', 'Observe2', 'Adjust2', 'Win'],
    highlightEdges: [
      ['Start', 'StrategySelect'],
      ['StrategySelect', 'StratB'],
      ['StratB', 'Launch2'],
      ['Launch2', 'Observe2'],
      ['Observe2', 'Adjust2'],
      ['Adjust2', 'Launch2'],
      ['Observe2', 'Win'],
    ],
  };
  const dualExp = expandRouteHighlight(dualRouteB, dualMacroBody, { resultKgIds: RESULT_R1 });
  assert(dualExp.highlightNodes.includes('StratB'), 'dual macro: StratB highlighted');
  assert(
    ![...dualExp.edgeKeys].some(k => /StratA|Launch1|Observe1|Adjust1/.test(k)),
    'dual macro route B must not bleed strategy A branch',
  );
  assert(!dualExp.highlightNodes.includes('StratA'), 'dual macro: must not highlight StratA');
  assert(dualExp.highlightNodes.includes('Win'), 'dual macro: Win highlighted');
}

/** Tier 1 �?generic-chapter.json */
function tier1Generic() {
  const generic = loadGenericBundle().chapter;
  const body = generic.strategy.mermaid;
  const main = generic.strategy.routes.find(r => r.id === 'main');
  const trap = generic.strategy.routes.find(r => r.id === 'trap');
  assert(main && trap, 'generic routes present');

  const mainExp = expandRouteHighlight(main, body, { resultKgIds: new Set(['R1']) });
  assert(mainExp.highlightNodes.includes('Win'), 'generic main includes Win');
  assert(mainExp.edgeKeys.has('Main->Win'), 'generic main Main->Win');

  const mainNoWin = {
    ...main,
    highlightNodes: ['Start', 'Main'],
    highlightEdges: [['Start', 'Main']],
  };
  const appended = expandRouteHighlight(mainNoWin, body, { resultKgIds: new Set(['R1']) });
  assert(appended.highlightNodes.includes('Win'), 'generic: append Win when missing from highlightNodes');
  assert(appended.edgeKeys.has('Main->Win'), 'generic: append Main->Win unlabeled success edge');

  const trapExp = expandRouteHighlight(trap, body, { resultKgIds: new Set(['R1']) });
  assert(!trapExp.highlightNodes.includes('Win'), 'generic trap must not highlight Win');

  const airOffBody = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Env{空气阻力?}:::stratCond',
    'Env -->|关| ModeOff[关态]:::stratCore',
    'Env -->|开| ModeOn[开态]:::stratCore',
    'ModeOff --> InvalidAirOff[误关阻力]:::stratInvalid',
    'InvalidAirOff --> ModeOff',
    'ModeOff --> StrategySelect{选择?}:::stratCond',
    'StrategySelect --> FireS[发射]',
    'FireS --> ObserveS{观察?}:::stratCond',
    'ObserveS -->|进洞| Win[过关]:::stratResult',
  ].join('\n');
  const airOffRoute = {
    id: 'route-invalid-air-off',
    label: '空气阻力关闭时的无效调参',
    mapsTo: ['P1', 'O1', 'R1'],
    warn: '空气阻力关闭时，调节空气阻力相关参数不影响轨迹',
    highlightNodes: ['Start', 'Env', 'ModeOff', 'InvalidAirOff', 'FireS', 'ObserveS', 'Win'],
    highlightEdges: [['Start', 'Env'], ['Env', 'ModeOff'], ['ModeOff', 'InvalidAirOff']],
  };
  const airOffExp = expandRouteHighlight(airOffRoute, airOffBody, { resultKgIds: new Set(['R1']) });
  assert(!airOffExp.highlightNodes.includes('Win'), 'air-off misconception must not highlight Win');
}

/** Tier 2 �?coupled-mode-aligned-chapter.json */
function tier2Aligned() {
  const aligned = loadChapter('judge', 'coupledAligned');
  const mainRoute = aligned.strategy.routes.find(r => r.id === 'main');
  const mainExpanded = expandRouteHighlight(mainRoute, aligned.strategy.mermaid, {
    resultKgIds: new Set(['R1']),
  });
  assert(mainExpanded.highlightNodes.includes('Start'), 'aligned main includes Start after expand');
  assert(mainExpanded.highlightNodes.includes('Win'), 'aligned main includes Win');
  assert(mainExpanded.edgeKeys.has('ObserveA->Win'), 'aligned main ObserveA->Win');
  assert(mainExpanded.edgeKeys.has('StratA->TestA'), 'aligned main keeps loop bridge edges');

  const baseKeys = buildRouteHighlightEdgeKeys(mainRoute, aligned.strategy.mermaid);
  assert(baseKeys.size >= 8, 'aligned main base edge keys');

  const blindRoute = aligned.strategy.routes.find(r => r.id === 'blind');
  const blindExp = expandRouteHighlight(blindRoute, aligned.strategy.mermaid, { resultKgIds: new Set(['R1']) });
  assert(blindExp.edgeKeys.has('ObserveB->RetryB'), 'aligned blind ObserveB->RetryB');
  assert(blindExp.edgeKeys.has('RetryB->StratB'), 'aligned blind RetryB->StratB loop');
}

/** Tier 3 �?multi-fork route fixture */
function tier3MultiFork() {
  const ch = MULTI_FORK_FIXTURE();
  const body = ch.strategy.mermaid;
  const resultKgIds = new Set(['R1']);
  const r1 = ch.strategy.routes.find(r => r.id === 'r1');
  const r2 = ch.strategy.routes.find(r => r.id === 'r2');
  const r3 = ch.strategy.routes.find(r => r.id === 'r3');
  const r4 = ch.strategy.routes.find(r => r.id === 'r4');
  const r5 = ch.strategy.routes.find(r => r.id === 'r5');
  assert(r1 && r2 && r5, 'multi-fork routes r1/r2/r5 present');

  const exp1 = expandRouteHighlight(r1, body, { resultKgIds });
  ['Start', 'Env', 'ModeOff', 'StrategySelect', 'PathAFirst'].forEach(n => {
    assert(exp1.highlightNodes.includes(n), `multi-fork r1 expanded node ${n}`);
  });
  assert(exp1.edgeKeys.has('StrategySelect->PathAFirst'), 'multi-fork r1 StrategySelect->PathAFirst');
  assert(exp1.edgeKeys.has('Start->Env'), 'multi-fork r1 Start->Env');
  assert(exp1.edgeKeys.size >= 8, `multi-fork r1 expanded keys >= 8, got ${exp1.edgeKeys.size}`);
  assert(
    ![...exp1.edgeKeys].some(k => k.includes('PathBFirst')),
    'multi-fork r1 must not include PathBFirst branch',
  );
  assert(!exp1.highlightNodes.includes('PathBFirst'), 'multi-fork r1 must not highlight PathBFirst');
  assert(exp1.highlightNodes.includes('Win'), 'multi-fork r1 must highlight Win');
  assert(exp1.edgeKeys.has('CheckGoal->Win'), 'multi-fork r1 CheckGoal->Win');

  const exp2 = expandRouteHighlight(r2, body, { resultKgIds });
  assert(exp2.edgeKeys.has('StrategySelect->PathBFirst'), 'multi-fork r2 StrategySelect->PathBFirst');
  assert(
    ![...exp2.edgeKeys].some(k => k.includes('PathAFirst')),
    'multi-fork r2 must not include PathAFirst branch',
  );
  assert(!exp2.highlightNodes.includes('PathAFirst'), 'multi-fork r2 must not highlight PathAFirst');
  assert(exp2.highlightNodes.includes('Win'), 'multi-fork r2 must highlight Win');
  assert(exp2.edgeKeys.has('CheckGoal->Win'), 'multi-fork r2 CheckGoal->Win');

  if (r3 && r4) {
    const exp3 = expandRouteHighlight(r3, body, { resultKgIds });
    const exp4 = expandRouteHighlight(r4, body, { resultKgIds });
    assert(exp3.edgeKeys.has('StrategySelect2->ParamBFirst'), 'multi-fork r3 ParamBFirst branch');
    assert(exp4.edgeKeys.has('StrategySelect2->ComboPath'), 'multi-fork r4 ComboPath branch');
    assert(exp3.highlightNodes.includes('Win'), 'multi-fork r3 must highlight Win');
    assert(exp3.edgeKeys.has('CheckGoal2->Win'), 'multi-fork r3 CheckGoal2->Win');
    assert(exp4.highlightNodes.includes('Win'), 'multi-fork r4 must highlight Win');
    assert(exp4.edgeKeys.has('CheckGoal2->Win'), 'multi-fork r4 CheckGoal2->Win');
    assert(
      ![...exp3.edgeKeys].some(k => k.includes('ComboPath')),
      'multi-fork r3 must not include ComboPath branch',
    );
    assert(
      ![...exp4.edgeKeys].some(k => k.includes('ParamBFirst')),
      'multi-fork r4 must not include ParamBFirst branch',
    );
  }

  const exp5 = expandRouteHighlight(r5, body, { resultKgIds });
  assert(exp5.highlightNodes.includes('Start'), 'multi-fork r5 Start');
  assert(exp5.highlightNodes.includes('Env'), 'multi-fork r5 Env');
  assert(exp5.edgeKeys.has('Start->Env'), 'multi-fork r5 Start->Env');
  assert(exp5.edgeKeys.has('ModeOff->CheckB'), 'multi-fork r5 ModeOff->CheckB resolved from shortcut');
  assert(exp5.edgeKeys.has('CheckB->InvalidParamB'), 'multi-fork r5 CheckB->InvalidParamB');
  assert(!exp5.edgeKeys.has('ModeOff->InvalidParamB'), 'multi-fork r5 phantom ModeOff->InvalidParamB removed');
  assert(!exp5.highlightNodes.includes('Win'), 'multi-fork r5 must not highlight Win');
  assert(!exp5.edgeKeys.has('CheckGoal->Win'), 'multi-fork r5 must not include CheckGoal->Win');
}

/** Tier 4 �?shared Fire hub + numbered CheckGoal copies */
function tier4SharedHub() {
  const ch = SHARED_HUB_FIXTURE();
  const body = ch.strategy.mermaid;
  const resultKgIds = new Set(['R1']);
  const route1 = ch.strategy.routes.find(r => r.id === 'route1');
  const route2 = ch.strategy.routes.find(r => r.id === 'route2');
  assert(route1 && route2, 'shared-hub routes present');

  const exp1 = expandRouteHighlight(route1, body, { resultKgIds });
  assert(!exp1.highlightNodes.includes('CheckGoal2'), 'shared-hub route1 must not highlight CheckGoal2');
  assert(!exp1.highlightNodes.includes('Strategy2'), 'shared-hub route1 must not highlight Strategy2');
  assert(!exp1.highlightNodes.includes('Observe2'), 'shared-hub route1 must not highlight Observe2');
  assert(!exp1.edgeKeys.has('Fire->CheckGoal2'), 'shared-hub route1 must not edge Fire->CheckGoal2');
  assert(exp1.edgeKeys.has('Fire->CheckGoal'), 'shared-hub route1 Fire->CheckGoal');
  assert(exp1.highlightNodes.includes('Win'), 'shared-hub route1 Win');

  const exp2 = expandRouteHighlight(route2, body, { resultKgIds });
  assert(!exp2.highlightNodes.includes('Observe'), 'shared-hub route2 must not highlight unnumbered Observe');
  assert(!exp2.highlightNodes.includes('Strategy1'), 'shared-hub route2 must not highlight Strategy1');
  assert(!exp2.highlightNodes.includes('CheckGoal'), 'shared-hub route2 must not highlight CheckGoal');
  assert(exp2.edgeKeys.has('Fire->CheckGoal2'), 'shared-hub route2 Fire->CheckGoal2');
}

/** Tier 5 �?restricted pairwise (L1 Judge bleed) */
function tier5RestrictedPairwise() {
  const ch = RESTRICTED_PAIRWISE_FIXTURE();
  const body = ch.strategy.mermaid;
  const resultKgIds = new Set(['R1']);
  const qRoute = ch.strategy.routes.find(r => r.id === 'param-a-first');
  const syncRoute = ch.strategy.routes.find(r => r.id === 'sync');
  const route3 = ch.strategy.routes.find(r => r.id === 'route-3');
  assert(qRoute && syncRoute && route3, 'restricted-pairwise routes present');

  const qExp = expandRouteHighlight(qRoute, body, { resultKgIds });
  assert(!qExp.highlightNodes.includes('Judge'), 'restricted pairwise param-a-first: no Judge bleed');
  assert(!qExp.highlightNodes.includes('DecreaseA'), 'restricted pairwise param-a-first: no DecreaseA bleed');
  assert(!qExp.highlightNodes.includes('IncreaseA'), 'restricted pairwise param-a-first: no IncreaseA bleed');
  assert(!qExp.edgeKeys.has('Observe->Judge'), 'restricted pairwise param-a-first: no Observe->Judge');
  assert(!qExp.edgeKeys.has('Judge->DecreaseA'), 'restricted pairwise param-a-first: no Judge->DecreaseA');
  assert(qExp.edgeKeys.has('StrategySelect->ParamAFirst'), 'restricted pairwise param-a-first: StrategySelect->ParamAFirst');
  assert(qExp.edgeKeys.has('Observe->Win'), 'restricted pairwise param-a-first: Observe->Win');

  const syncExp = expandRouteHighlight(syncRoute, body, { resultKgIds });
  assert(syncExp.edgeKeys.has('Judge->Retry'), 'restricted pairwise sync: Judge->Retry');
  assert(syncExp.edgeKeys.has('Retry->Adjust'), 'restricted pairwise sync: Retry->Adjust');
  assert(syncExp.edgeKeys.has('Judge->DecreaseA'), 'restricted pairwise sync: Judge->DecreaseA');

  const route3Exp = expandRouteHighlight(route3, body, { resultKgIds });
  assert(route3Exp.edgeKeys.has('Judge->Retry'), 'restricted pairwise route-3: Judge->Retry');
  assert(route3Exp.edgeKeys.has('Retry->Adjust'), 'restricted pairwise route-3: Retry->Adjust');
}

function tier6FixtureRegression() {
  const resultKgIds = new Set(['R1']);

  const phantom = PHANTOM_CONTINUE_FIXTURE();
  const r2 = phantom.strategy.routes.find(r => r.id === 'route-2');
  const exp52 = expandRouteHighlight(r2, phantom.strategy.mermaid, { resultKgIds });
  assert(!exp52.highlightNodes.includes('Adjust1'), 'phantom route-2 must not highlight Adjust1');
  assert(!exp52.highlightNodes.includes('Fire1'), 'phantom route-2 must not highlight Fire1');
  assert(!exp52.highlightNodes.includes('Observe1'), 'phantom route-2 must not highlight Observe1');
  assert(exp52.edgeKeys.has('Continue->Win'), 'phantom route-2 Continue->Win via phantom resolve');
  assert(exp52.edgeKeys.has('Observe3->Continue'), 'phantom route-2 Observe3->Continue');
  assert(exp52.highlightNodes.includes('Continue'), 'phantom route-2 Continue node');
  assert(!exp52.edgeKeys.has('Observe3->Win'), 'phantom route-2 phantom Observe3->Win removed');

  const r1 = phantom.strategy.routes.find(r => r.id === 'route-1');
  const r3 = phantom.strategy.routes.find(r => r.id === 'route-3');
  const exp51 = expandRouteHighlight(r1, phantom.strategy.mermaid, { resultKgIds });
  assert(exp51.edgeKeys.has('Observe1->Retry1'), 'phantom route-1 Observe1->Retry1');
  assert(exp51.edgeKeys.has('Retry1->Adjust1'), 'phantom route-1 Retry1->Adjust1');
  const exp53 = expandRouteHighlight(r3, phantom.strategy.mermaid, { resultKgIds });
  assert(exp53.edgeKeys.has('Observe2->Retry2'), 'phantom route-3 Observe2->Retry2');
  assert(exp53.edgeKeys.has('Retry2->Adjust2'), 'phantom route-3 Retry2->Adjust2');

  const multiGate = MULTI_GATE_RETRY_FIXTURE();
  const body = multiGate.strategy.mermaid;
  for (const r of multiGate.strategy.routes.filter(x => /^route[123]$/.test(x.id))) {
    const exp = expandRouteHighlight(r, body, { resultKgIds });
    assert(!exp.highlightNodes.includes('CheckGoal2') || r.id === 'route2', `multi-gate ${r.id} CheckGoal2 bleed`);
    assert(!exp.highlightNodes.includes('CheckGoal3') || r.id === 'route3', `multi-gate ${r.id} CheckGoal3 bleed`);
    assert(!exp.edgeKeys.has('Fire->CheckGoal2') || r.id !== 'route1', 'multi-gate route1 Fire->CheckGoal2');
    assert(!exp.edgeKeys.has('Fire->CheckGoal3') || r.id === 'route3', 'multi-gate route1/2 Fire->CheckGoal3');
    const gate = r.id === 'route2' ? 'CheckGoal2' : r.id === 'route3' ? 'CheckGoal3' : 'CheckGoal';
    assert(exp.edgeKeys.has(`${gate}->Retry`), `multi-gate ${r.id} ${gate}->Retry`);
    assert(exp.highlightNodes.includes('Retry'), `multi-gate ${r.id} Retry node`);
    if (r.id === 'route1') {
      assert(!exp.edgeKeys.has('CheckGoal2->Retry'), 'multi-gate route1 no CheckGoal2->Retry');
    }
  }

  const routeA = multiGate.strategy.routes.find(r => r.id === 'route-a');
  const routeB = multiGate.strategy.routes.find(r => r.id === 'route-b');
  const routeC = multiGate.strategy.routes.find(r => r.id === 'route-c');
  const expA = expandRouteHighlight(routeA, body, { resultKgIds });
  assert(expA.edgeKeys.has('PrepLink->Fire1'), 'multi-gate route-a PrepLink->Fire1');
  assert(expA.edgeKeys.has('Observe1->Retry1'), 'multi-gate route-a Observe1->Retry1');
  assert(!expA.edgeKeys.has('Observe2->Retry2'), 'multi-gate route-a no Observe2->Retry2');
  const expB = expandRouteHighlight(routeB, body, { resultKgIds });
  assert(expB.edgeKeys.has('Observe2->Retry2'), 'multi-gate route-b Observe2->Retry2');
  const expC = expandRouteHighlight(routeC, body, { resultKgIds });
  assert(expC.edgeKeys.has('Observe3->Retry3'), 'multi-gate route-c Observe3->Retry3');

  const restricted = RESTRICTED_PAIRWISE_FIXTURE();
  const paramARoute = restricted.strategy.routes.find(r => r.id === 'param-a-first');
  const exp11 = expandRouteHighlight(paramARoute, restricted.strategy.mermaid, { resultKgIds });
  assert(!exp11.highlightNodes.includes('ParamBFirst'), 'fixture param-a-first must not highlight ParamBFirst');
  assert(!exp11.highlightNodes.includes('Judge'), 'fixture param-a-first must not highlight Judge');
  assert(!exp11.highlightNodes.includes('DecreaseA'), 'fixture param-a-first must not highlight DecreaseA');
  assert(!exp11.edgeKeys.has('StrategySelect->ParamBFirst'), 'fixture param-a-first no StrategySelect->ParamBFirst');
  assert(!exp11.edgeKeys.has('Judge->DecreaseA'), 'fixture param-a-first no Judge->DecreaseA');
  assert(exp11.edgeKeys.has('StrategySelect->ParamAFirst'), 'fixture param-a-first StrategySelect->ParamAFirst');
  assert(!exp11.edgeKeys.has('Judge->Retry'), 'fixture param-a-first no Judge->Retry');

  console.log('fixture highlight regression: OK');
}

function run() {
  tier0Synthetic();
  tier1Generic();
  tier2Aligned();
  tier3MultiFork();
  tier4SharedHub();
  tier5RestrictedPairwise();
  tier6FixtureRegression();
  console.log('strategy-route-highlight: OK');
}

module.exports = { run };
