/**
 * 已 win/pass 但竞赛段有效对照不足 → gaps 含「过关偏少对照…」
 * 启发式：avTunings < 2；或 ≥3 种 AV 且 singleVariableRate < 0.6
 */
const { assert } = require('../../../lib/assert');
const { evaluateTraceRules } = require('../../../../packages/judge/evaluate-rules');
const { ruleJudge, isPassWithWeakComparison, PASS_WEAK_COMPARE_GAP } = require('../../../../packages/judge/judge');
const { summarizeTrace } = require('../../../../packages/judge/dt-align');

const CHAPTER = {
  inquiryScript: {
    adjustmentVariables: [
      { controlId: 's-speed', label: '初速度', priorityRank: 1 },
      { controlId: 's-angle', label: '角度', priorityRank: 2 },
      { controlId: 's-height', label: '高度', priorityRank: 3 },
    ],
  },
  kg: {
    nodes: [
      { id: 'P1', group: 'premise', label: '进入' },
      { id: 'O1', group: 'operation', label: '调参' },
      { id: 'C1', group: 'constraint', label: '命中' },
      { id: 'R1', group: 'result', label: '过关' },
    ],
  },
  traceMap: {
    controls: {
      's-speed': { role: 'operation', kgId: 'O1' },
      's-angle': { role: 'operation', kgId: 'O1' },
      's-height': { role: 'operation', kgId: 'O1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
  },
  strategy: {
    routes: [
      { id: 'main', label: '单变量', mapsTo: ['P1', 'O1', 'C1', 'R1'], score: 1, priorityRank: 1 },
      { id: 'trap', label: '多参盲调', mapsTo: ['P1', 'O1'], score: 0.2, tier: 'suboptimal' },
    ],
  },
};

function ev(ts, type, payload) {
  return { ts, ch: 0, type, payload };
}

/** 几乎没调参就 win → 对照不足 */
function synthLuckyWin() {
  return [
    ev(1, 'puzzle_open', {}),
    ev(2, 'phase_change', { phase: 'challenge' }),
    ev(10, 'tuning', { control: 's-speed', value: 12 }),
    ev(11, 'action', { control: 'btn-fire' }),
    ev(12, 'snapshot', { winOk: true, hintKey: 'ok' }),
    ev(13, 'win', { winOk: true }),
  ];
}

/** 多 AV 混调后 win → 对照不足 */
function synthMixedWin() {
  const events = [
    ev(1, 'puzzle_open', {}),
    ev(2, 'phase_change', { phase: 'challenge' }),
  ];
  let t = 10;
  for (let i = 0; i < 2; i++) {
    events.push(ev(t++, 'tuning', { control: 's-speed', value: 10 + i }));
    events.push(ev(t++, 'tuning', { control: 's-angle', value: 30 + i }));
    events.push(ev(t++, 'tuning', { control: 's-height', value: 5 + i }));
    events.push(ev(t++, 'action', { control: 'btn-fire' }));
    events.push(ev(t++, 'snapshot', { winOk: false, hintKey: 'retry' }));
  }
  events.push(ev(t++, 'tuning', { control: 's-speed', value: 14 }));
  events.push(ev(t++, 'tuning', { control: 's-angle', value: 40 }));
  events.push(ev(t++, 'tuning', { control: 's-height', value: 8 }));
  events.push(ev(t++, 'action', { control: 'btn-fire' }));
  events.push(ev(t++, 'snapshot', { winOk: true, hintKey: 'ok' }));
  events.push(ev(t++, 'win', { winOk: true }));
  return events;
}

/** 单参多测后 win → 不应标「偏少对照」 */
function synthFocusedWin() {
  const events = [
    ev(1, 'puzzle_open', {}),
    ev(2, 'phase_change', { phase: 'challenge' }),
  ];
  let t = 10;
  for (let i = 0; i < 4; i++) {
    events.push(ev(t++, 'tuning', { control: 's-speed', value: 10 + i }));
    events.push(ev(t++, 'action', { control: 'btn-fire' }));
    events.push(ev(t++, 'snapshot', { winOk: false, hintKey: 'retry' }));
  }
  events.push(ev(t++, 'tuning', { control: 's-speed', value: 15 }));
  events.push(ev(t++, 'action', { control: 'btn-fire' }));
  events.push(ev(t++, 'snapshot', { winOk: true, hintKey: 'ok' }));
  events.push(ev(t++, 'win', { winOk: true }));
  return events;
}

function hasWeakGap(judge) {
  return (judge.gaps || []).some(g => /偏少对照|多测几次/.test(g));
}

function run() {
  const lucky = synthLuckyWin();
  const luckySummary = summarizeTrace({ events: lucky }, 0, CHAPTER);
  assert(luckySummary.hasWinEvent || luckySummary.lastSnapshot?.winOk, 'lucky win detected');
  assert(isPassWithWeakComparison(luckySummary), 'lucky win → weak comparison');
  const luckyJudge = evaluateTraceRules({ ch: 0, trace: { events: lucky }, chapter: CHAPTER });
  assert(luckyJudge.verdict === 'pass', `lucky still pass got ${luckyJudge.verdict}`);
  assert(hasWeakGap(luckyJudge), `lucky gaps should include weak-compare, got ${JSON.stringify(luckyJudge.gaps)}`);
  assert(
    (luckyJudge.gaps || []).some(g => g.includes('偏少对照') || g.startsWith(PASS_WEAK_COMPARE_GAP.slice(0, 6))),
    'gap text matches PASS_WEAK_COMPARE_GAP theme',
  );

  const mixed = synthMixedWin();
  const mixedSummary = summarizeTrace({ events: mixed }, 0, CHAPTER);
  assert(isPassWithWeakComparison(mixedSummary), 'mixed win → weak comparison');
  const mixedJudge = ruleJudge(mixedSummary, CHAPTER);
  assert(mixedJudge.verdict === 'pass', 'mixed still pass');
  assert(hasWeakGap(mixedJudge), `mixed gaps should include weak-compare, got ${JSON.stringify(mixedJudge.gaps)}`);

  const focused = synthFocusedWin();
  const focusedSummary = summarizeTrace({ events: focused }, 0, CHAPTER);
  assert(!isPassWithWeakComparison(focusedSummary), 'focused multi-trial should NOT be weak');
  const focusedJudge = evaluateTraceRules({ ch: 0, trace: { events: focused }, chapter: CHAPTER });
  assert(focusedJudge.verdict === 'pass', 'focused pass');
  assert(!hasWeakGap(focusedJudge), `focused must not get weak-compare gap, got ${JSON.stringify(focusedJudge.gaps)}`);

  console.log('judge-pass-weak-compare-check: OK');
}

module.exports = { run };
