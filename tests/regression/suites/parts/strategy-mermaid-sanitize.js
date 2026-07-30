const { assert } = require('../../../lib/assert');
const {
  sanitizeStrategyMermaid,
  hasInvalidStrategyMermaidSyntax,
  hasUnquotedSpecialMermaidLabels,
  sortStrategyMermaidEdges,
} = require('../../../../packages/shared/strategy-mermaid-parse.js');
const {
  validateStrategyMermaidLayering,
  validateStrategyTeacherAlignment,
  validateChapterQuality,
  hasObservationFeedbackLoop,
} = require('../../../../packages/contract');
const { loadChapter } = require('../../../lib/fixture-loader');

const SAMPLE_BAD =
  'graph TD\n  A[开始挑战] :::stratStart --> B[调整参数] :::stratCond\n  B --> C[提交测试] :::stratAction';

const SAMPLE_PARENS =
  'graph TD\nB --> L[调整参数B(关态无效)]:::stratInvalid\nL --> B';

function makeChapter(strategyMermaid, routes) {
  return {
    mapping: '| DT 节点 | KG id | KG type | 备注 |\n|---|---|---|---|\n| 过关 | R1 | result | skip retry |',
    kg: {
      title: '测试章',
      sub: '测试',
      nodes: [
        { id: 'P1', label: '开始', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入测试关卡并观察参数' },
        { id: 'O1', label: '提交', group: 'operation', layer: 'play', level: 1, r: 22, desc: '执行一次提交测试以观察得分变化' },
        { id: 'C1', label: '参数 A 约束', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '参数 A 需落在有效窗口' },
        { id: 'C2', label: '参数 C 约束', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '参数 C 需支撑目标得分' },
        { id: 'R1', label: '过关', group: 'result', layer: 'play', level: 4, r: 22, desc: '得分达标即判定通关' },
        { id: 'S1', label: '教学', group: 'method', layer: 'teach', level: 1, r: 22, desc: '讲解观察与调参闭环' },
        { id: 'S2', label: '教学2', group: 'core', layer: 'teach', level: 1, r: 22, desc: '讲解模式分叉与变量作用' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'method' },
        { s: 'C1', t: 'C2', tp: 'core' },
        { s: 'C2', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
      ],
    },
    dt: {
      title: '测试DT',
      sub: '测试',
      tree: {
        n: '开始', t: 'root', d: '进入测试',
        children: [{
          n: '命中?', t: 'decision', d: '判断命中',
          children: [
            { _e: '否', n: '重试', t: 'retry', d: '调整后再试' },
            { _e: '是', n: '过关', t: 'result', d: '命中目标' },
          ],
        }],
      },
    },
    winSync: { title: '测试章', sub: '过关' },
    traceMap: { controls: { paramA: { kgId: 'O1', role: 'operation' } } },
    strategy: { title: '策略', sub: '策略', mermaid: strategyMermaid, routes },
  };
}

function run() {
  const bad = SAMPLE_BAD;
  assert(hasInvalidStrategyMermaidSyntax(bad), '::: sample invalid before sanitize');
  const fixed = sanitizeStrategyMermaid(bad);
  assert(!hasInvalidStrategyMermaidSyntax(fixed), '::: sample valid after sanitize');
  assert(!/\]\s+:::strat/.test(fixed), 'no space before :::strat after ]');
  assert(fixed.includes('A[开始挑战]:::stratStart'), 'class attached to node A');
  assert(/A\s+-->\s+B\[调整参数\]:::stratCond/.test(fixed), 'edge A --> B on own segment');

  assert(hasUnquotedSpecialMermaidLabels(SAMPLE_PARENS), 'parens sample needs quote before sanitize');
  const fixedParens = sanitizeStrategyMermaid(SAMPLE_PARENS);
  assert(!hasUnquotedSpecialMermaidLabels(fixedParens), 'parens quoted after sanitize');
  assert(fixedParens.includes('L["调整参数B(关态无效)"]:::stratInvalid'), 'L label double-quoted');

  const aliasSample = 'graph TD\nN[过关]:::stratEnd\nO[提交]:::stratOp';
  const aliasFixed = sanitizeStrategyMermaid(aliasSample);
  assert(aliasFixed.includes(':::stratResult'), 'stratEnd -> stratResult');
  assert(aliasFixed.includes(':::stratCore'), 'stratOp -> stratCore');
  assert(!/:::stratEnd\b/.test(aliasFixed), 'no stratEnd after normalize');
  assert(!/:::stratOp\b/.test(aliasFixed), 'no stratOp after normalize');

  const launchLoopMermaid = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Launch1[执行测试]',
    'Launch1 --> Observe1{观察结果?}:::stratCond',
    'Observe1 -->|未达标| Adjust1[调整参数A]',
    'Adjust1 --> Launch1',
    'Observe1 -->|达标| Win[过关]:::stratResult',
  ].join('\n');
  assert(hasObservationFeedbackLoop(launchLoopMermaid), 'Launch→Observe→Adjust multi-hop feedback loop');

  const mechanicalOnlyLoop = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Win[过关]:::stratResult',
    'LoopObserve{观察偏高/偏低/达标?}:::stratCond',
    'LoopAdjust[单变量微调]',
    'LoopRetest[再测验证]',
    'LoopObserve -->|未达标| LoopAdjust',
    'LoopAdjust --> LoopRetest',
    'LoopRetest --> LoopObserve',
    'LoopObserve -->|达标| Win',
  ].join('\n');
  assert(!hasObservationFeedbackLoop(mechanicalOnlyLoop), 'pure LoopObserve scaffold must NOT pass feedback gate');

  const domainPlusLeftoverLoop = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Fire[发射]',
    'Fire --> Observe{观察落点?}:::stratCond',
    'Observe -->|偏近| Adjust1[调整初速度]',
    'Adjust1 --> Fire',
    'Observe -->|命中| Win[过关]:::stratResult',
    'LoopObserve{观察偏高/偏低/达标?}:::stratCond',
    'LoopAdjust[单变量微调]',
    'LoopRetest[再测验证]',
    'LoopObserve -->|未达标| LoopAdjust',
    'LoopAdjust --> LoopRetest',
    'LoopRetest --> LoopObserve',
  ].join('\n');
  assert(hasObservationFeedbackLoop(domainPlusLeftoverLoop), 'domain Observe→Adjust→Fire still passes with leftover Loop*');

  const adjustIdOnlyLoop = [
    'graph TD',
    'Fire[发射光]',
    'Observe{观察光电流?}:::stratCond',
    'Observe -->|偏远| Adjust',
    'Adjust --> Fire',
    'Fire --> Observe',
    'Observe -->|有电流| Win[过关]:::stratResult',
  ].join('\n');
  assert(hasObservationFeedbackLoop(adjustIdOnlyLoop), 'Adjust id without Chinese label still counts as domain adjust');


  const sorted1 = sortStrategyMermaidEdges(
    'graph TD\nRetry --> A\nStart --> Env\nEnv --> Win[过关]:::stratResult\nWin --> B',
  );
  const sorted2 = sortStrategyMermaidEdges(
    'graph TD\nEnv --> Win[过关]:::stratResult\nStart --> Env\nRetry --> A\nWin --> B',
  );
  assert(sorted1 === sorted2, 'sortStrategyMermaidEdges is stable across input order');

  const goodLayer =
    'graph TD\nStart([开始]):::stratStart\nStart --> Env{模式?}:::stratCond\nEnv -->|关| ModeOff[关态分水岭]:::stratCore\nModeOff --> Tune[调参]\nTune --> CheckGoal{达标?}:::stratCond\nCheckGoal -->|是| Win[过关]:::stratResult';
  assert(validateStrategyMermaidLayering(goodLayer).length === 0, 'good layering passes');

  const badCore =
    'graph TD\nA[调1]:::stratCore\nB[调2]:::stratCore\nC[调3]:::stratCore\nD[调4]:::stratCore\nE[调5]:::stratCore\nF[调6]:::stratCore';
  assert(validateStrategyMermaidLayering(badCore).some(e => e.includes('too many')), 'stratCore cap');

  const badWin = 'graph TD\nCheckGoal{达标?}\nCheckGoal -->|是| Win[过关]:::stratCore';
  assert(validateStrategyMermaidLayering(badWin).some(e => e.includes('stratResult')), 'win must be stratResult');

  const badDiamond = 'graph TD\nA{未标 cond}\nA --> B';
  assert(validateStrategyMermaidLayering(badDiamond).some(e => e.includes('stratCond')), 'diamond needs stratCond');

  const cognitiveGoodMermaid = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Env{高级模式?}:::stratCond',
    'Env -->|关| ModeOff[关态：参数 B 无效]:::stratCore',
    'Env -->|开| ModeOn[开态：参数 B 有效]:::stratCore',
    'ModeOff --> CheckB{是否调整参数 B?}:::stratCond',
    'CheckB -->|是| Invalid[关态误调参数 B]:::stratInvalid',
    'Invalid --> ModeOff',
    'CheckB -->|否| StrategySelect{选择调参策略?}:::stratCond',
    'StrategySelect -->|途径A 控制变量| StratA[固定 C 调 A]',
    'StratA --> ObserveA{观察得分}:::stratCond',
    'ObserveA -->|偏低| AdjustA[增大 A]',
    'AdjustA --> ReTestA[提交测试]',
    'ReTestA --> ObserveA',
    'StrategySelect -->|途径B 盲调| StratB[凭经验同时调参]',
    'StratB --> ObserveB{观察偏高/偏低}:::stratCond',
    'ObserveB -->|偏低| AdjustB[调整参数 C]',
    'AdjustB --> ReTestB[再次测试]',
    'ReTestB --> ObserveB',
    'ObserveA -->|达标| Win[过关]:::stratResult',
    'ObserveB -->|达标| Win',
  ].join('\n');
  const cognitiveGoodRoutes = [
    { id: 'routeA', label: '控制变量法', mapsTo: ['P1', 'O1', 'C1', 'R1'] },
    { id: 'routeB', label: '经验盲调法', mapsTo: ['P1', 'O1', 'C2', 'R1'], warn: '注意未达标风险' },
  ];

  const coupledCh = loadChapter('judge', 'coupledAligned');
  const coupledQ = validateChapterQuality(coupledCh, {
    minConstraints: 4,
    minTeachNodes: 3,
    minVerifyLinks: 1,
    minNodes: 10,
    maxNodes: 30,
    minStrategyRoutes: 2,
    hasCoupledControls: true,
    hasConditionalParamProfile: true,
    hasIrrelevant: true,
    modeToggleCount: 1,
  });
  assert(coupledQ.checklist.dtEnvAlignment, 'aligned fixture dtEnvAlignment');
  assert(coupledQ.checklist.kgConditionalParamCoupling, 'aligned fixture kgConditionalParamCoupling');
  assert(coupledQ.checklist.strategyTeacherAlignment, 'aligned fixture strategyTeacherAlignment');

  const goodQuality = validateChapterQuality(
    makeChapter(cognitiveGoodMermaid, cognitiveGoodRoutes),
    { minConstraints: 2, minTeachNodes: 2, minVerifyLinks: 1, minNodes: 7, maxNodes: 30, minStrategyRoutes: 2 },
  );
  assert(goodQuality.checklist.strategyMacroPaths, 'cognitive good macro paths');
  assert(goodQuality.checklist.strategyFeedbackLoop, 'cognitive good feedback loop');
  assert(goodQuality.checklist.strategyMentalBackbone, 'cognitive good backbone');

  const linearBadMermaid = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> A[调整参数 A]',
    'A --> B[调整参数 B]',
    'B --> C[调整参数 C]',
    'C --> D[提交]',
    'D --> E{达标?}:::stratCond',
    'E -->|是| Win[过关]:::stratResult',
    'E -->|否| Retry[再试]:::stratRetry',
    'Retry --> A',
  ].join('\n');
  const linearBadRoutes = [{ id: 'route1', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'R1'] }];
  const linearQuality = validateChapterQuality(
    makeChapter(linearBadMermaid, linearBadRoutes),
    { minConstraints: 2, minTeachNodes: 2, minVerifyLinks: 1, minNodes: 7, maxNodes: 30, minStrategyRoutes: 2 },
  );
  assert(!linearQuality.checklist.strategyMacroPaths, 'linear should fail macro path count');
  assert(!linearQuality.checklist.strategyFeedbackLoop, 'linear should fail feedback loop');
  assert(!linearQuality.checklist.strategyMentalBackbone, 'linear should fail mental backbone');

  const teacherGood = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Env{高级模式?}:::stratCond',
    'Env -->|关| ModeOff[关态：参数 B 无效]:::stratCore',
    'ModeOff --> CheckB{是否调整参数 B?}:::stratCond',
    'CheckB -->|是| Invalid[关态误调参数 B]:::stratInvalid',
    'Invalid --> ModeOff',
    'CheckB -->|否| StrategySelect{选择调参策略?}:::stratCond',
    'StrategySelect -->|途径A 控制变量| StratA[固定 C 调 A]',
    'StratA --> Observe{观察得分}:::stratCond',
    'Observe -->|偏低| Adjust[增大 A]',
    'Adjust --> Test[提交测试]',
    'Test --> Observe',
    'Observe -->|达标| Win[过关]:::stratResult',
    'Env -->|开| ModeOn[开态：参数 B 有效]:::stratCore',
  ].join('\n');
  assert(
    validateStrategyTeacherAlignment(teacherGood, { coupledMode: true, conditionalParamProfile: true }).length === 0,
    'teacher-aligned sample',
  );

  const teacherBadInvalid = [
    'graph TD',
    'Start([开始]):::stratStart',
    'Start --> Env{模式?}:::stratCond',
    'Env -->|开| ModeOn[开态]:::stratCore',
    'ModeOn --> Invalid[误调参数 A]:::stratInvalid',
    'Invalid --> ModeOn',
  ].join('\n');
  assert(
    validateStrategyTeacherAlignment(teacherBadInvalid, { coupledMode: true, conditionalParamProfile: true })
      .some(e => /branch|off-mode|active-mode/i.test(e)),
    'active-mode invalid should fail',
  );

  const wrap = loadChapter('judge', 'coupled');
  const ch = wrap.chapter || wrap;
  const gq = validateChapterQuality(ch, {
    minConstraints: 1,
    minTeachNodes: 2,
    minVerifyLinks: 1,
    minNodes: 6,
    maxNodes: 30,
    minStrategyRoutes: 2,
    hasCoupledControls: true,
    hasConditionalParamProfile: false,
    modeToggleCount: 1,
  });
  assert(gq.checklist.kgConditionalParamCoupling, 'generic coupled: kgConditionalParamCoupling N/A passes');

  console.log('strategy-mermaid-sanitize: OK');
}

module.exports = { run };
