/**
 * 子技能三态剖面（Inq-ITS / process-detectors 对齐；不进 ability 加权和）。
 */
'use strict';

const { CODE } = require('./primary-misconception');
const { filterEventsByExplorePhase, filterEventsByChallengePhase } = require('./trace-normalize');
const { scoreTraceStrategy } = require('./strategy-segment-score');

const SUBSKILL_PROFILE_VERSION = 1;

const STATE = Object.freeze({
  ABSENT: 'absent',
  EMERGING: 'emerging',
  ADEQUATE: 'adequate',
});

const STATE_LABEL_ZH = Object.freeze({
  absent: '未出现/待加强',
  emerging: '有迹象',
  adequate: '较充分',
});

const SKILLS = Object.freeze([
  { id: 'controlled_contrast', label: '有效对照' },
  { id: 'confound_bypass', label: '混淆旁路（少犯）' },
  { id: 'pass_without_contrast', label: '过关须对照' },
  { id: 'explore_solid', label: '探究达成' },
  { id: 'timing_monitoring', label: '观察监测' },
]);

function skillEntry(id, label, state, note) {
  return {
    id,
    label,
    state,
    stateLabel: STATE_LABEL_ZH[state] || state,
    note: note || undefined,
  };
}

function isPassed(summary) {
  return summary?.align?.dtPath?.includes('R1')
    || summary?.lastSnapshot?.winOk
    || summary?.hasWinEvent;
}

function isPassWeak(summary) {
  const m = summary?.inquiryPath?.metrics || {};
  if (!isPassed(summary)) return false;
  if (m.cvHeavy) return false;
  if (typeof m.avTunings === 'number' && m.avTunings < 2) return true;
  const tuned = Array.isArray(m.tunedControls) ? m.tunedControls : [];
  const sv = m.singleVariableRate;
  if (tuned.length >= 3 && typeof sv === 'number' && sv < 0.6) return true;
  return false;
}

function sessionGaps(judgeResult) {
  if (!judgeResult) return [];
  const ts = judgeResult.teacherSummary || {};
  if (Array.isArray(ts.gaps) && ts.gaps.length) return ts.gaps.map(String);
  if (Array.isArray(judgeResult.gaps)) return judgeResult.gaps.map(String);
  return [];
}

function computeSubskillProfile(ctx = {}) {
  const summary = ctx.summary || {};
  const abilityScore = ctx.abilityScore || null;
  const judgeResult = ctx.judgeResult || null;
  const primary = ctx.primaryMisconception || judgeResult?.primaryMisconception || null;
  const events = ctx.events || summary.events || [];
  const m = summary?.inquiryPath?.metrics || {};
  const gaps = sessionGaps(judgeResult);

  const sv = m.singleVariableRate;
  const avT = m.avTunings;
  let controlled = STATE.ABSENT;
  if (typeof sv === 'number' && sv >= 0.75 && typeof avT === 'number' && avT >= 2) {
    controlled = STATE.ADEQUATE;
  } else if ((typeof sv === 'number' && sv >= 0.5) || (typeof avT === 'number' && avT >= 1)) {
    controlled = STATE.EMERGING;
  }
  if (primary?.code === CODE.MULTI_AV_TRAP) controlled = STATE.ABSENT;

  let confound = STATE.ADEQUATE;
  if (m.cvHeavy || primary?.code === CODE.CV_AS_CAUSE) confound = STATE.ABSENT;
  else if ((m.cvTunings || 0) >= 1 || gaps.some(g => /旁路|无关|混淆/.test(g))) {
    confound = STATE.EMERGING;
  }

  let passContrast = STATE.ADEQUATE;
  if (isPassWeak(summary) || primary?.code === CODE.PASS_WEAK_COMPARE) passContrast = STATE.ABSENT;
  else if (isPassed(summary) && typeof avT === 'number' && avT < 3) passContrast = STATE.EMERGING;

  const erTier = abilityScore?.parts?.exploreResult?.tier;
  const erRaw = abilityScore?.parts?.exploreResult?.raw;
  const exploreTrials = abilityScore?.parts?.efficiency?.exploreTrials || 0;
  const sawExplore = exploreTrials > 0
    || filterEventsByExplorePhase(events).some(e => e?.type === 'phase_change' && e.payload?.phase === 'explore')
    || abilityScore?.parts?.exploreProcess?.raw != null;

  let explore = STATE.ABSENT;
  if (!sawExplore) {
    explore = STATE.ABSENT;
  } else if (erTier === 'solid' || erRaw === 100) {
    explore = STATE.ADEQUATE;
  } else if (erTier === 'lucky' || (erRaw != null && erRaw >= 30)) {
    explore = STATE.EMERGING;
  } else {
    explore = STATE.ABSENT;
  }

  let timing = STATE.ADEQUATE;
  if (primary?.code === CODE.TIMING_BLIND_TUNE || gaps.some(g => /连拧|偏快出手/.test(g))) {
    timing = STATE.ABSENT;
  } else if (gaps.some(g => /观察/.test(g))) {
    timing = STATE.EMERGING;
  }

  const items = [
    skillEntry('controlled_contrast', '有效对照', controlled),
    skillEntry('confound_bypass', '混淆旁路（少犯）', confound),
    skillEntry('pass_without_contrast', '过关须对照', passContrast),
    skillEntry('explore_solid', '探究达成', explore, sawExplore ? undefined : '未触达探究段'),
    skillEntry('timing_monitoring', '观察监测', timing),
  ];

  return {
    version: SUBSKILL_PROFILE_VERSION,
    skills: items,
  };
}

module.exports = {
  SUBSKILL_PROFILE_VERSION,
  STATE,
  SKILLS,
  computeSubskillProfile,
};
