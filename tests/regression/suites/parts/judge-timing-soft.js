/**
 * judge timing 软参与：连拧未测 / 偏快出手 → gaps 辅证，不改 verdict
 */
const { assert } = require('../../../lib/assert');
const {
  applyTimingSoftGaps,
  TIMING_DENSE_TUNE_GAP,
  TIMING_RUSH_ACTION_GAP,
} = require('../../../../packages/judge/judge');
const { computeTimingFeatures } = require('../../../../packages/judge/trace-timing');

function baseResult(gaps = []) {
  return {
    mode: 'rule',
    verdict: 'in_progress',
    strengths: ['有基本操作'],
    gaps: [...gaps],
    teacherSummary: { level: 3, summary: '有基本操作', strengths: ['有基本操作'], gaps: [...gaps], suggestion: '' },
    comment: '[规则模式] 有基本操作',
  };
}

function run() {
  // 连拧未测
  {
    const events = [];
    let ts = 1000;
    for (let i = 0; i < 8; i += 1) {
      events.push({ ts: ts += 500, type: 'tuning', payload: { control: 's-a' } });
    }
    events.push({ ts: ts += 800, type: 'action', payload: { control: 'btn' } });
    const tf = computeTimingFeatures(events);
    const summary = {
      eventCounts: { tuning: 8, action: 1 },
      timingFeatures: tf,
      inquiryPath: { metrics: { avTunings: 3, singleVariableRate: 0.9 }, pathSteps: ['O1'] },
      hasWinEvent: false,
      align: { dtPath: [] },
    };
    const out = applyTimingSoftGaps(baseResult([]), summary);
    assert(out.verdict === 'in_progress', 'verdict unchanged');
    assert(out.gaps.some(g => /连拧/.test(g)), `dense tune gap: ${out.gaps.join('|')}`);
    assert(out.gaps[0] === TIMING_DENSE_TUNE_GAP || out.gaps.includes(TIMING_DENSE_TUNE_GAP), 'dense message');
  }

  // 调参后偏快出手 + 未过关
  {
    const events = [
      { ts: 1000, type: 'tuning', payload: { control: 's-a' } },
      { ts: 1200, type: 'action', payload: { control: 'btn' } },
      { ts: 1400, type: 'tuning', payload: { control: 's-a' } },
      { ts: 1550, type: 'action', payload: { control: 'btn' } },
      { ts: 1700, type: 'tuning', payload: { control: 's-a' } },
      { ts: 1900, type: 'action', payload: { control: 'btn' } },
    ];
    const tf = computeTimingFeatures(events);
    assert(tf.tuneActionGapMs.median < 800, 'median fast');
    const summary = {
      eventCounts: { tuning: 3, action: 3 },
      timingFeatures: tf,
      inquiryPath: { metrics: { avTunings: 1, singleVariableRate: 0.4 }, pathSteps: ['O1'] },
      hasWinEvent: false,
      align: { dtPath: ['O1'] },
    };
    const out = applyTimingSoftGaps(baseResult([]), summary);
    assert(out.verdict === 'in_progress', 'rush verdict unchanged');
    assert(out.gaps.some(g => /偏快出手/.test(g)), `rush gap: ${out.gaps.join('|')}`);
    assert(out.gaps.includes(TIMING_RUSH_ACTION_GAP) || /偏快出手/.test(out.gaps.join('')), 'rush message');
  }

  // gaps 已满 2 条 → 时间不抢位
  {
    const tf = computeTimingFeatures([
      { ts: 1, type: 'tuning', payload: {} },
      { ts: 100, type: 'action', payload: {} },
      { ts: 200, type: 'tuning', payload: {} },
      { ts: 300, type: 'action', payload: {} },
      { ts: 400, type: 'tuning', payload: {} },
      { ts: 500, type: 'action', payload: {} },
    ]);
    const out = applyTimingSoftGaps(
      baseResult(['路径误区A', '路径误区B']),
      {
        eventCounts: { tuning: 3, action: 3 },
        timingFeatures: tf,
        inquiryPath: { metrics: { avTunings: 0, singleVariableRate: 0.2 }, pathSteps: [] },
        hasWinEvent: false,
        align: { dtPath: [] },
      },
    );
    assert(out.gaps.length === 2, 'no third gap');
    assert(!out.gaps.some(g => /偏快出手|连拧/.test(g)), 'timing does not displace');
  }

  // 有对照、后达成 → 勿把短间隔误判为盲拧/偏快出手
  {
    const events = [
      { ts: 1000, type: 'tuning', payload: { control: 's-a' } },
      { ts: 1200, type: 'action', payload: { control: 'btn' } },
      { ts: 1400, type: 'tuning', payload: { control: 's-a' } },
      { ts: 1550, type: 'action', payload: { control: 'btn' } },
      { ts: 1700, type: 'tuning', payload: { control: 's-a' } },
      { ts: 1900, type: 'action', payload: { control: 'btn' } },
    ];
    const tf = computeTimingFeatures(events);
    const out = applyTimingSoftGaps(baseResult([]), {
      eventCounts: { tuning: 3, action: 3 },
      timingFeatures: tf,
      inquiryPath: { metrics: { avTunings: 4, singleVariableRate: 0.85 }, pathSteps: ['O1', 'R1'] },
      hasWinEvent: true,
      align: { dtPath: ['O1', 'R1'] },
    });
    assert(out.verdict === 'in_progress' || out.verdict != null, 'result intact');
    assert(!out.gaps.some(g => /偏快出手|连拧/.test(g)), 'no timing gap after contrast+pass');
  }
}

module.exports = { run };
