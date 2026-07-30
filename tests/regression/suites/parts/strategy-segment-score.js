/**
 * Unit tests: strategy segment scoring (切段 / 换策略 / CV / 多参盲调)
 */
const { assert } = require('../../../lib/assert');
const {
  segmentTraceByFire,
  scoreTraceStrategy,
  classifySegment,
  LABEL,
} = require('../../../../packages/judge/strategy-segment-score');

const CHAPTER = {
  inquiryScript: {
    adjustmentVariables: [
      { controlId: 's-a', label: 'A', priorityRank: 1 },
      { controlId: 's-b', label: 'B', priorityRank: 2 },
    ],
    confoundingVariables: [
      { controlId: 's-mass', label: '质量' },
    ],
  },
  traceMap: {
    controls: {
      's-a': { role: 'operation' },
      's-b': { role: 'operation' },
      's-mass': { role: 'irrelevant' },
      'btn-fire': { role: 'action' },
    },
  },
  strategy: {
    routes: [
      { id: 'main', label: '单变量·A', score: 1.0, priorityRank: 1 },
      { id: 'main_s-b', label: '单变量·B', score: 0.85, priorityRank: 2 },
      { id: 'trap', label: '多参盲调', score: 0.2, tier: 'suboptimal' },
    ],
  },
};

function fire(ts) {
  return { ts, type: 'action', payload: { control: 'btn-fire' }, ch: 0 };
}
function tune(ts, control, value) {
  return { ts, type: 'tuning', payload: { control, value }, ch: 0 };
}
function snap(ts) {
  return { ts, type: 'snapshot', payload: { winOk: false, hintKey: 'retry' }, ch: 0 };
}

function pureSingleA() {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < 4; i++) {
    events.push(tune(10 + i * 3, 's-a', 10 + i));
    events.push(fire(11 + i * 3));
    events.push(snap(12 + i * 3));
  }
  return events;
}

function switchAtoB() {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < 3; i++) {
    events.push(tune(10 + i * 3, 's-a', 10 + i));
    events.push(fire(11 + i * 3));
    events.push(snap(12 + i * 3));
  }
  for (let i = 0; i < 2; i++) {
    events.push(tune(40 + i * 3, 's-b', 20 + i));
    events.push(fire(41 + i * 3));
    events.push(snap(42 + i * 3));
  }
  return events;
}

function aWithOccasionalCv() {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  events.push(tune(5, 's-mass', 1));
  events.push(fire(6));
  events.push(snap(7));
  for (let i = 0; i < 4; i++) {
    events.push(tune(10 + i * 3, 's-a', 10 + i));
    events.push(fire(11 + i * 3));
    events.push(snap(12 + i * 3));
  }
  return events;
}

function multiParamBlind() {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < 4; i++) {
    events.push(tune(10 + i * 4, 's-a', 10 + i));
    events.push(tune(11 + i * 4, 's-b', 20 + i));
    events.push(fire(12 + i * 4));
    events.push(snap(13 + i * 4));
  }
  return events;
}

function overCv() {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < 4; i++) {
    events.push(tune(10 + i * 5, 's-a', 10 + i));
    events.push(tune(11 + i * 5, 's-mass', i));
    events.push(fire(12 + i * 5));
    events.push(snap(13 + i * 5));
  }
  return events;
}

function run() {
  // classify
  assert(
    classifySegment([{ type: 'tuning', payload: { control: 's-a' } }], CHAPTER) === '单变量·A',
    'classify single A',
  );
  assert(
    classifySegment([
      { type: 'tuning', payload: { control: 's-a' } },
      { type: 'tuning', payload: { control: 's-b' } },
    ], CHAPTER) === LABEL.trap,
    'classify trap',
  );
  assert(
    classifySegment([{ type: 'tuning', payload: { control: 's-mass' } }], CHAPTER) === LABEL.confound,
    'classify CV',
  );
  assert(classifySegment([], CHAPTER) === LABEL.empty, 'classify empty');

  const pure = scoreTraceStrategy(pureSingleA(), CHAPTER, { mode: 'explore' });
  assert(pure.primaryStrategy === '单变量·A', 'pure primary A');
  assert(pure.score >= 0.95, `pure high score got ${pure.score}`);
  assert(pure.lastSegmentLabel === '单变量·A', 'last also A');

  const sw = scoreTraceStrategy(switchAtoB(), CHAPTER, { mode: 'explore' });
  assert(sw.primaryStrategy === '单变量·A', 'switch primary still A (not last-shot B)');
  assert(sw.lastSegmentLabel === '单变量·B', 'last segment is B');
  assert(sw.score < pure.score, 'switch score below pure');
  assert(sw.score > 0.7, `switch still decent got ${sw.score}`);
  assert(sw.breakdown.nSwitch >= 1, 'records switch');

  const swCompete = scoreTraceStrategy(switchAtoB(), CHAPTER, { mode: 'compete' });
  assert(swCompete.score < sw.score, 'compete penalizes switch more');

  const cv = scoreTraceStrategy(aWithOccasionalCv(), CHAPTER, { mode: 'explore' });
  assert(cv.primaryStrategy === '单变量·A', 'occasional CV keeps A');
  assert(cv.breakdown.cvProbe === true, 'cv probe flagged');
  assert(cv.score >= 0.9, `occasional CV still high got ${cv.score}`);

  const trap = scoreTraceStrategy(multiParamBlind(), CHAPTER, { mode: 'explore' });
  assert(trap.primaryStrategy === LABEL.trap || trap.breakdown.segmentCounts[LABEL.trap] >= 3, 'trap segments');
  assert(trap.score <= 0.35, `trap low score got ${trap.score}`);

  const over = scoreTraceStrategy(overCv(), CHAPTER, { mode: 'explore' });
  assert(over.breakdown.cvOver === true, 'cv over');
  assert(over.score < pure.score, 'over CV lowers score');
  assert(over.primaryStrategy === '单变量·A', 'CV never becomes primary high route');

  // dangling last tune without fire must not redefine primary
  const dangling = [
    ...pureSingleA(),
    tune(200, 's-b', 99),
  ];
  const dScore = scoreTraceStrategy(dangling, CHAPTER, { mode: 'explore' });
  assert(dScore.primaryStrategy === '单变量·A', 'dangling B tune ignored for primary');

  const segs = segmentTraceByFire(pureSingleA(), CHAPTER);
  assert(segs.every(s => s.label === '单变量·A' || s.dangling), 'all segments A');

  console.log('strategy-segment-score-check: ok');
}

module.exports = { run };
