/**
 * P0: CV 重度轨迹不得被表扬为「控制变量 / 单变量成功」；
 * win/snapshot 不得被 legacyTypes 改写成 tuning。
 */
const { assert } = require('../../../lib/assert');
const { evaluateTraceRules } = require('../../../../packages/judge/evaluate-rules');
const { tracePathAlign, metricCvTouchStats } = require('../../../../packages/judge/trace-path-align');
const { normalizeTraceEvents } = require('../../../../packages/judge/trace-normalize');
const { summarizeTrace } = require('../../../../packages/judge/dt-align');

const CHAPTER = {
  inquiryScript: {
    adjustmentVariables: [
      { controlId: 's-speed', label: '初速度', priorityRank: 1 },
      { controlId: 's-angle', label: '角度', priorityRank: 2 },
    ],
    confoundingVariables: [{ controlId: 's-mass', label: '质量' }],
  },
  kg: {
    nodes: [
      { id: 'P1', group: 'premise', label: '进入' },
      { id: 'O1', group: 'operation', label: '调参' },
      { id: 'I1', group: 'irrelevant', label: '质量' },
      { id: 'C1', group: 'constraint', label: '命中' },
      { id: 'R1', group: 'result', label: '过关' },
    ],
  },
  traceMap: {
    controls: {
      's-speed': { role: 'operation', kgId: 'O1' },
      's-angle': { role: 'operation', kgId: 'O1' },
      's-mass': { role: 'irrelevant', kgId: 'I1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
    legacyTypes: {
      snapshot: { canonical: 'tuning', control: 'btn-test' },
      win: { canonical: 'tuning', control: 'btn-test' },
      action: { canonical: 'tuning', control: 'btn-fire' },
    },
  },
  strategy: {
    routes: [
      {
        id: 'main',
        label: '单变量·初速度',
        mapsTo: ['P1', 'O1', 'C1', 'R1'],
        score: 1,
        priorityRank: 1,
      },
      {
        id: 'confound_mass',
        label: '试探·质量',
        kind: 'confoundProbe',
        warn: 'irrelevant',
        mapsTo: ['I1'],
        score: 0.15,
      },
      { id: 'trap', label: '多参盲调', mapsTo: ['P1', 'O1'], score: 0.2, tier: 'suboptimal' },
    ],
  },
};

function ev(ts, type, payload) {
  return { ts, ch: 0, type, payload };
}

function synthS1() {
  const events = [
    ev(1, 'puzzle_open', {}),
    ev(2, 'phase_change', { phase: 'challenge' }),
  ];
  let t = 10;
  for (let i = 0; i < 3; i++) {
    events.push(ev(t++, 'tuning', { control: 's-speed', value: 10 + i }));
    events.push(ev(t++, 'action', { control: 'btn-fire' }));
    events.push(ev(t++, 'snapshot', { winOk: false, hintKey: 'retry' }));
  }
  events.push(ev(t++, 'tuning', { control: 's-speed', value: 14 }));
  events.push(ev(t++, 'action', { control: 'btn-fire' }));
  events.push(ev(t++, 'snapshot', { winOk: true, hintKey: 'ok' }));
  events.push(ev(t++, 'win', { winOk: true }));
  return events;
}

function synthS3() {
  const events = [
    ev(1, 'puzzle_open', {}),
    ev(2, 'phase_change', { phase: 'challenge' }),
  ];
  let t = 10;
  for (let i = 0; i < 4; i++) {
    events.push(ev(t++, 'tuning', { control: 's-mass', value: i + 1 }));
    events.push(ev(t++, 'tuning', { control: 's-speed', value: 10 + (i % 2) }));
    events.push(ev(t++, 'action', { control: 'btn-fire' }));
    events.push(ev(t++, 'snapshot', { winOk: false, hintKey: 'retry' }));
  }
  return events;
}

function run() {
  // --- legacyTypes must not remap win/snapshot/action ---
  const legacyPoison = {
    events: [
      ev(1, 'snapshot', { winOk: true, hintKey: 'ok' }),
      ev(2, 'win', { winOk: true }),
      ev(3, 'action', { control: 'btn-fire' }),
    ],
  };
  const norm = normalizeTraceEvents(legacyPoison, CHAPTER);
  assert(norm.events[0].type === 'snapshot', 'snapshot stays snapshot despite bad legacyTypes');
  assert(norm.events[1].type === 'win', 'win stays win despite bad legacyTypes');
  assert(norm.events[2].type === 'action', 'action stays action despite bad legacyTypes');

  const winSummary = summarizeTrace(legacyPoison, 0, CHAPTER);
  assert(winSummary.hasWinEvent, 'hasWinEvent after protected normalize');
  assert(winSummary.lastSnapshot?.winOk === true, 'winOk preserved');
  const winJudge = evaluateTraceRules({ ch: 0, trace: legacyPoison, chapter: CHAPTER });
  assert(winJudge.verdict === 'pass', `win → pass got ${winJudge.verdict}`);

  // --- S1 pure AV still high singleVariableRate + may praise ---
  const s1 = synthS1();
  const s1Align = tracePathAlign({ events: s1 }, CHAPTER, 0);
  assert(s1Align.metrics.cvHeavy !== true, 'S1 not cvHeavy');
  assert(s1Align.metrics.singleVariableRate >= 0.8, `S1 high svRate got ${s1Align.metrics.singleVariableRate}`);
  const s1Judge = evaluateTraceRules({ ch: 0, trace: { events: s1 }, chapter: CHAPTER });
  assert(s1Judge.verdict === 'pass', `S1 pass got ${s1Judge.verdict}`);
  assert(
    (s1Judge.strengths || []).some(s => /控制变量|单参/.test(s)) || s1Judge.verdict === 'pass',
    'S1 may keep single-var praise or at least pass',
  );

  // --- S3 CV-heavy: dampened rate, no main praise ---
  const s3 = synthS3();
  const cvStats = metricCvTouchStats(s3, CHAPTER);
  assert(cvStats.cvHeavy === true, 'S3 cvHeavy');
  const s3Align = tracePathAlign({ events: s3 }, CHAPTER, 0);
  assert(s3Align.metrics.cvHeavy === true, 'align cvHeavy');
  assert(
    s3Align.metrics.singleVariableRate == null || s3Align.metrics.singleVariableRate < 0.7,
    `S3 svRate must not look like S1, got ${s3Align.metrics.singleVariableRate}`,
  );
  const s3Judge = evaluateTraceRules({ ch: 0, trace: { events: s3 }, chapter: CHAPTER });
  const strengths = (s3Judge.strengths || []).join(' ');
  assert(
    !/符合控制变量途径|坚持单参调节|主推控制变量/.test(strengths),
    `S3 must not praise single-var: ${strengths}`,
  );
  assert(
    (s3Judge.gaps || []).some(g => /无关|旁路|永久无关/.test(g)),
    `S3 should gap on bypass, gaps=${(s3Judge.gaps || []).join('|')}`,
  );
  assert(
    s3Align.strategyRouteGuess !== 'main' || s3Align.metrics.cvHeavy,
    `route should prefer confound when possible, got ${s3Align.strategyRouteGuess}`,
  );

  console.log('judge-cv-heavy-check: OK');
}

module.exports = { run };
