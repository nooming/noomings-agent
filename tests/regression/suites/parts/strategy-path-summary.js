/**
 * Unit-ish checks for non-spoiler strategy path summary copy.
 */
const { assert } = require('../../../lib/assert');
const {
  formatSummary,
  pathTypeLabel,
  studentAdvice,
  detectNearTies,
} = require('../../../../apps/web/ui/strategy-path-summary');

function run() {
  assert(pathTypeLabel('单变量·速度') === '单变量探究（速度）', 'single-var type');
  assert(pathTypeLabel('多参盲调') === '多参混调型', 'trap type');

  const trapScore = {
    primaryStrategy: '多参盲调',
    score: 0.22,
    breakdown: {
      nSwitch: 1,
      cvTunings: 0,
      avTunings: 4,
      cvOver: false,
      segmentCounts: { '多参盲调': 3 },
      effectiveTrials: 3,
      mainClarityBonus: 0,
    },
  };
  const student = formatSummary(trapScore, { audience: 'student', showScore: false });
  assert(!/最优|应先调|优先调/.test(student.text + student.advice), 'no spoiler words');
  assert(student.advice.length > 8, 'has advice');
  assert(student.score === 0.22, 'score kept internally');
  assert(!/吻合度/.test(student.text), 'student text hides score by default');

  const teacher = formatSummary(trapScore, { audience: 'teacher', showScore: true });
  assert(/吻合度/.test(teacher.text), 'teacher can show score');
  assert(teacher.teacherDetail?.segmentCounts['多参盲调'] === 3, 'teacher detail');

  const degraded = formatSummary(trapScore, {
    audience: 'student',
    alignmentOk: false,
    degradeReason: 'events_empty',
  });
  assert(degraded.degraded === true, 'degraded flag');
  assert(/埋点/.test(degraded.advice), 'degrade mentions trace');

  const near = formatSummary(
    { primaryStrategy: '单变量·A', score: 0.9, breakdown: { mainClarityBonus: 0.06, nSwitch: 0, cvTunings: 0, segmentCounts: {} } },
    { audience: 'student', nearTies: [{ label: '单变量·A', score: 1 }, { label: '单变量·B', score: 0.95 }] },
  );
  assert(/接近/.test(near.text + near.advice), 'near-tie soft wording');

  const ties = detectNearTies(null, {
    strategy: {
      routes: [
        { label: '单变量·A', score: 1 },
        { label: '单变量·B', score: 0.95 },
        { label: '多参盲调', score: 0.2 },
      ],
    },
  });
  assert(ties.length === 2, 'detect near ties excludes trap');

  const cvAdvice = studentAdvice({
    primaryStrategy: '单变量·A',
    breakdown: { cvOver: true, cvTunings: 5, avTunings: 2, nSwitch: 0, segmentCounts: {} },
  });
  assert(/无关|装饰|旁路/.test(cvAdvice), 'cv over advice');

  const redirectAdvice = studentAdvice({
    primaryStrategy: '单变量·A',
    breakdown: { switchKind: 'focused_redirect', nSwitch: 1, nBlockSwitch: 1, segmentCounts: {}, mainClarityBonus: 0.06 },
  });
  assert(/聚焦换向/.test(redirectAdvice), 'redirect tip');
  assert(!/最优/.test(redirectAdvice), 'redirect no spoiler');

  const convergeAdvice = studentAdvice({
    primaryStrategy: '单变量·A',
    breakdown: { switchKind: 'explore_converge', nSwitch: 1, segmentCounts: { '多参盲调': 2 }, mainClarityBonus: 0 },
  });
  assert(/收敛|收束/.test(convergeAdvice), 'converge tip');

  const thrashAdvice = studentAdvice({
    primaryStrategy: '单变量·A',
    breakdown: { switchKind: 'thrash', nSwitch: 5, nBlockSwitch: 5, segmentCounts: {}, mainClarityBonus: 0 },
  });
  assert(/散|连续/.test(thrashAdvice), 'thrash tip');

  console.log('strategy-path-summary-check: ok');
}

module.exports = { run };
