/**
 * 主路径 id 泛化（main_s-*）与 weakProbe 切段标签/得分
 */
const { assert } = require('../../../lib/assert');
const { tracePathAlign } = require('../../../../packages/judge/trace-path-align');
const {
  isMainLikeRouteGuess,
  segmentLabelForControl,
} = require('../../../../packages/judge/strategy-route-kind');
const {
  classifySegment,
  scoreTraceStrategy,
} = require('../../../../packages/judge/strategy-segment-score');
const {
  applySingleVariablePolicy,
  buildLlmJudgeResult,
} = require('../../../../packages/judge/judge');
const { normalizeTraceEvents } = require('../../../../packages/judge/trace-normalize');

const CH1 = {
  kg: {
    nodes: [
      { id: 'P1', group: 'premise' },
      { id: 'O1', group: 'operation' },
      { id: 'C1', group: 'constraint' },
      { id: 'R1', group: 'result' },
    ],
  },
  traceMap: {
    controls: {
      's-dist': { role: 'operation', kgId: 'O1' },
      'btn-test': { role: 'action', kgId: 'O1' },
    },
  },
  inquiryScript: {
    adjustmentVariables: [
      { controlId: 's-dist', label: '极板间距', role: 'primary', priorityRank: 1 },
    ],
  },
  strategy: {
    routes: [
      { id: 'main_s-dist', label: '单变量·极板间距', score: 1, priorityRank: 1 },
      { id: 'trap', label: '多参盲调', score: 0.2, tier: 'suboptimal' },
    ],
  },
};

const PENDULUM_WEAK = {
  inquiryScript: {
    adjustmentVariables: [
      { controlId: 's-L', label: '杆长', role: 'primary', priorityRank: 1 },
      { controlId: 's-m', label: '锤质量', role: 'secondary', priorityRank: 3 },
    ],
    confoundingVariables: [{ controlId: 's-angle', label: '摆角' }],
  },
  traceMap: {
    controls: {
      's-L': { role: 'operation' },
      's-m': { role: 'operation' },
      's-angle': { role: 'irrelevant' },
      'btn-measure': { role: 'action' },
    },
    legacyControls: { 's-len': 's-L', 's-mass': 's-m' },
  },
  strategy: {
    routes: [
      { id: 'main_s-L', label: '单变量·杆长', score: 1 },
      { id: 'weak_s_m', label: '弱相关·锤质量', kind: 'weakProbe', score: 0.5 },
      { id: 'trap', label: '多参盲调', score: 0.2, tier: 'suboptimal' },
    ],
  },
};

function distOnlyEvents() {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < 5; i++) {
    events.push({ ts: 10 + i, type: 'tuning', payload: { control: 's-dist', value: i }, ch: 0 });
    events.push({ ts: 11 + i, type: 'action', payload: { control: 'btn-test' }, ch: 0 });
  }
  return events;
}

function run() {
  assert(isMainLikeRouteGuess('main_s-dist', CH1.strategy.routes), 'main_s-dist is main-like');
  assert(!isMainLikeRouteGuess('weak_s_m', PENDULUM_WEAK.strategy.routes), 'weak not main-like');

  const ip = tracePathAlign({ events: distOnlyEvents() }, CH1, 0);
  assert(ip.strategyRouteGuess === 'main_s-dist', 'guess main_s-dist');
  assert(ip.metrics.mainLikeRouteGuess === true, 'mainLikeRouteGuess true');
  assert(ip.metrics.singleVariableRate === 1, 'singleVariableRate 1');

  const summary = {
    align: { dtPath: [] },
    lastSnapshot: { winOk: false },
    inquiryPath: ip,
    irrelevantTouches: 0,
  };
  const lifted = applySingleVariablePolicy({
    verdict: 'learning',
    strengths: [],
    gaps: ['未探索另一参数'],
    teacherSummary: { level: 2, summary: 'x', strengths: [], gaps: [], suggestion: '' },
  }, summary, CH1);
  assert(lifted.verdict === 'in_progress', 'main_s-* lifts verdict');

  const llm = buildLlmJudgeResult(
    '{"level":2,"summary":"只调间距","strengths":[],"gaps":["方法单一"],"suggestion":""}',
    summary,
    CH1,
  );
  assert(llm.verdict === 'in_progress', 'LLM path main_s in_progress');

  const weakLabel = segmentLabelForControl(PENDULUM_WEAK, 's-m');
  assert(weakLabel === '弱相关·锤质量', 'secondary → 弱相关 label');
  const tunings = [{ type: 'tuning', payload: { control: 's-m', value: 1 } }];
  assert(classifySegment(tunings, PENDULUM_WEAK) === '弱相关·锤质量', 'classify weak segment');

  const weakEvents = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < 3; i++) {
    weakEvents.push({ ts: 10 + i, type: 'tuning', payload: { control: 's-m', value: i }, ch: 0 });
    weakEvents.push({ ts: 11 + i, type: 'action', payload: { control: 'btn-measure' }, ch: 0 });
  }
  const scored = scoreTraceStrategy(weakEvents, PENDULUM_WEAK, { mode: 'explore' });
  assert(scored.score <= 0.62, `weak-only score not inflated (${scored.score})`);

  const legacy = normalizeTraceEvents({
    events: [{ type: 'tuning', payload: { control: 's-len', value: 1 } }],
  }, PENDULUM_WEAK);
  assert(legacy.events[0].payload.control === 's-L', 'legacy s-len → s-L');
  assert(legacy.meta.legacyControlsApplied >= 1, 'legacyControlsApplied');

  console.log('judge-route-kind-check: ok');
}

module.exports = { run };
