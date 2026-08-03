const { assert } = require('../../../lib/assert');
const { tracePathAlign, guessStrategyRoute } = require('../../../../packages/judge/trace-path-align');
const {
  buildLlmJudgeResult,
  applySingleVariablePolicy,
  verdictFromLevel,
} = require('../../../../packages/judge/judge');

function speedOnlyEvents(n = 5) {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < n; i++) {
    events.push({ ts: 10 + i, type: 'tuning', payload: { control: 's-speed', value: String(10 + i) }, ch: 0 });
    events.push({ ts: 20 + i, type: 'action', payload: { control: 'btn-fire' }, ch: 0 });
  }
  events.push({
    ts: 99,
    type: 'snapshot',
    payload: { decisions: { C1: false }, hintKey: 'retry' },
    ch: 0,
  });
  return events;
}

const FIXTURE_CHAPTER = {
  kg: {
    nodes: [
      { id: 'P1', group: 'premise', label: '进入' },
      { id: 'O1', group: 'operation', label: '调参' },
      { id: 'C1', group: 'constraint', label: '落入筐中' },
      { id: 'R1', group: 'result', label: '过关' },
    ],
  },
  traceMap: {
    controls: {
      's-speed': { role: 'operation', kgId: 'O1' },
      's-angle': { role: 'operation', kgId: 'O1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
  },
  strategy: {
    routes: [
      { id: 'main', label: '控制变量：每次只改一项', mapsTo: ['P1', 'O1', 'C1', 'R1'] },
      { id: 'trap', label: '多参盲调', mapsTo: ['P1', 'O1', 'C1'] },
    ],
  },
};

function judgeSingleVariableCheck() {
  const events = speedOnlyEvents(6);
  const inquiryPath = tracePathAlign({ events }, FIXTURE_CHAPTER, 0);

  assert(inquiryPath.metrics.singleVariableRate === 1, 'single variable rate is 1');
  assert(inquiryPath.metrics.tunedControls.includes('s-speed'), 'tuned s-speed');
  assert(inquiryPath.metrics.parameterCoverage === 0.5, 'half parameter coverage');
  assert(inquiryPath.strategyRouteGuess === 'main', 'main route guess');

  const { strategyRouteGuess } = guessStrategyRoute(
    new Set(['O1']),
    0,
    0,
    FIXTURE_CHAPTER.strategy,
    { singleVariableRate: 1 },
  );
  assert(strategyRouteGuess === 'main', 'guessStrategyRoute prefers main for high singleVariableRate');

  const summary = {
    align: { dtPath: [] },
    lastSnapshot: { winOk: false },
    inquiryPath,
    irrelevantTouches: 0,
  };

  const llmJson = '{"level":2,"summary":"仅调速度，未试角度","strengths":["单变量调节"],"gaps":["未尝试调节角度","方法单一"],"suggestion":"建议同时调节角度和速度"}';
  const result = buildLlmJudgeResult(llmJson, summary);

  assert(result.verdict === 'in_progress', 'verdict lifted to in_progress');
  assert(result.teacherSummary.level >= 3, 'level at least 3');
  assert(!result.gaps.some(g => /未尝试调节角度/.test(g)), 'anti-single-var gaps removed');
  assert(!/同时/.test(result.teacherSummary.suggestion || ''), 'no dual-param suggestion');
  assert(result.strengths.some(s => /控制变量|单参|单变量/.test(s)), 'single-var strength added');

  const policyOnly = applySingleVariablePolicy({
    mode: 'llm',
    verdict: 'learning',
    strengths: [],
    gaps: ['未探索角度参数'],
    teacherSummary: { level: 2, summary: '方法单一', strengths: [], gaps: ['未探索角度'], suggestion: '同时调两参' },
    comment: '方法单一',
  }, summary);
  assert(policyOnly.verdict === 'in_progress', 'applySingleVariablePolicy lifts verdict');
  assert(verdictFromLevel(2, summary) === 'in_progress', 'verdictFromLevel respects main single var');

  console.log('judge-single-variable-check: OK');
}

module.exports = { run: judgeSingleVariableCheck };
