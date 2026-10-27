/**
 * 形成性评判包：子技能 + 诊断 + LLM 稳定字段
 */
const { assert } = require('../../../lib/assert');
const { attachFormativeAssessment, mergeLlmJudgeWithRuleStable, dedupGapsForPrimary } = require('../../../../packages/judge/formative-bundle');
const { CODE } = require('../../../../packages/judge/primary-misconception');
const { ruleJudge } = require('../../../../packages/judge/judge');
const { summarizeTrace } = require('../../../../packages/judge/dt-align');

const CHAPTER = {
  inquiryScript: {
    adjustmentVariables: [{ controlId: 's-speed', label: '初速度' }],
    confoundingVariables: [{ controlId: 's-wind', label: '侧风' }],
  },
  kg: {
    nodes: [
      { id: 'P1', group: 'premise' },
      { id: 'O1', group: 'operation' },
      { id: 'R1', group: 'result' },
    ],
  },
  traceMap: {
    controls: {
      's-speed': { role: 'operation', kgId: 'O1' },
      's-wind': { role: 'irrelevant', kgId: 'O1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
  },
  strategy: {
    routes: [
      { id: 'main', label: '单变量·初速度', score: 1 },
      { id: 'trap', label: '多参盲调', score: 0.2 },
    ],
  },
};

function ev(ts, type, payload) {
  return { ts, ch: 0, type, payload };
}

function run() {
  const events = [
    ev(1, 'phase_change', { phase: 'challenge' }),
    ev(10, 'tuning', { control: 's-speed', value: 12 }),
    ev(11, 'action', { control: 'btn-fire' }),
    ev(12, 'win', {}),
  ];
  const summary = summarizeTrace({ events }, 0, CHAPTER);
  const jr = attachFormativeAssessment(ruleJudge(summary, CHAPTER), {
    summary, chapter: CHAPTER, events,
  });

  assert(jr.formativeAssessment?.version >= 1, 'formative version');
  assert(jr.formativeAssessment.subskillProfile?.skills?.length >= 4, 'subskills');
  assert(jr.formativeAssessment.diagnostics?.contrastDepth, 'contrast depth');
  assert(jr.primaryMisconception?.code === CODE.PASS_WEAK_COMPARE, 'primary code');
  assert(jr.primaryShortLabel === '少对照', 'short label');
  assert(jr.formativeAssessment.remediation?.text, 'remediation text');
  assert(jr.teacherSummary?.suggestion, 'suggestion filled');

  const deduped = dedupGapsForPrimary(
    ['过关偏少对照，建议同一变量多测几次', '其他 gap'],
    jr.primaryMisconception,
  );
  assert(deduped.length <= 2, 'dedup len');
  assert(!deduped.some(g => /偏少对照/.test(g)) || deduped.length === 1, 'primary gap deduped');

  const llmFake = {
    mode: 'llm',
    verdict: 'learning',
    teacherSummary: { level: 1, summary: 'LLM 摘要', gaps: ['gap1'], suggestion: '' },
    gaps: ['gap1'],
  };
  const merged = mergeLlmJudgeWithRuleStable(llmFake, jr);
  assert(merged.verdict === jr.verdict, 'verdict from rule');
  assert(merged.formativeAssessment === jr.formativeAssessment, 'formative from rule');
  assert(merged.teacherSummary.summary === 'LLM 摘要', 'keep llm summary');

  // 幸运过关 → 主错因（与旧 primary-misconception 套件合并）
  {
    const ev2 = (ts, type, payload) => ({ ts, ch: 0, type, payload });
    const events2 = [
      ev2(1, 'phase_change', { phase: 'challenge' }),
      ev2(10, 'tuning', { control: 's-wind', value: 1 }),
      ev2(11, 'tuning', { control: 's-wind', value: 2 }),
      ev2(12, 'tuning', { control: 's-wind', value: 3 }),
      ev2(13, 'tuning', { control: 's-speed', value: 5 }),
      ev2(14, 'action', { control: 'btn-fire' }),
    ];
    const CH2 = {
      ...CHAPTER,
      inquiryScript: {
        adjustmentVariables: [{ controlId: 's-speed', label: '初速度' }],
        confoundingVariables: [{ controlId: 's-wind', label: '侧风' }],
      },
    };
    const summary2 = summarizeTrace({ events: events2 }, 0, CH2);
    const pm = attachFormativeAssessment(ruleJudge(summary2, CH2), {
      summary: summary2, chapter: CH2, events: events2,
    });
    assert(pm.primaryMisconception?.code === CODE.CV_AS_CAUSE, 'cv as cause');
    assert(/侧风/.test(pm.primaryMisconception.label || ''), 'cv label');
  }

  console.log('formative-bundle-check: OK');
}

module.exports = { run };
