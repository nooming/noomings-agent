/**
 * 本局「一条主错因」：教师端优先展示的过程结论（非新分数维）。
 * 优先级：过关少对照 > 竞赛段混淆当原因 > 多参盲调 > 连拧/快出手 > 探究未扎实达成。
 * 探索收敛到单变量时不升主错因（可标 positive）。
 */

'use strict';

const { scoreTraceStrategy, LABEL } = require('./strategy-segment-score');
const { filterEventsByChallengePhase, filterEventsByExplorePhase } = require('./trace-normalize');
const PASS_WEAK_COMPARE_GAP = '过关偏少对照，建议同一变量多测几次再下结论';
const TIMING_DENSE_TUNE_GAP = '连拧调参偏密、少实测，建议拧后先观察再测';
const TIMING_RUSH_ACTION_GAP = '调参后偏快出手，观察反馈可能不足';

function isPassed(summary) {
  return summary?.align?.dtPath?.includes('R1')
    || summary?.lastSnapshot?.winOk
    || summary?.hasWinEvent;
}

function isCvHeavyInquiry(summary) {
  const m = summary?.inquiryPath?.metrics || {};
  if (m.cvHeavy) return true;
  if ((summary?.irrelevantTouches || 0) > 0 && m.cvOverAv != null && m.cvOverAv >= 0.35) {
    return true;
  }
  return false;
}

function isPassWithWeakComparison(summary) {
  if (!isPassed(summary)) return false;
  if (isCvHeavyInquiry(summary)) return false;
  const m = summary?.inquiryPath?.metrics || {};
  const avTunings = m.avTunings;
  const tuned = Array.isArray(m.tunedControls) ? m.tunedControls : [];
  const sv = m.singleVariableRate;
  if (typeof avTunings === 'number' && avTunings < 2) return true;
  if (tuned.length >= 3 && typeof sv === 'number' && sv < 0.6) return true;
  return false;
}

function hasAdequateContrastEvidence(summary) {
  const m = summary?.inquiryPath?.metrics || {};
  const av = m.avTunings;
  const sv = m.singleVariableRate;
  const hasR1 = !!summary?.inquiryPath?.pathSteps?.includes('R1');
  if (typeof av === 'number' && av >= 2 && (typeof sv !== 'number' || sv >= 0.55)) return true;
  if (hasR1 && typeof av === 'number' && av >= 2) return true;
  return false;
}

const PRIMARY_MISCONCEPTION_VERSION = 1;

const CODE = Object.freeze({
  NONE: 'none',
  POSITIVE_CONVERGED: 'explore_converged',
  PASS_WEAK_COMPARE: 'pass_weak_compare',
  CV_AS_CAUSE: 'cv_as_cause',
  MULTI_AV_TRAP: 'multi_av_trap',
  TIMING_BLIND_TUNE: 'timing_blind_tune',
  EXPLORE_NO_SOLID: 'explore_no_solid',
});

const CHALLENGE_CV_OVER_RATIO = 0.35;
const CHALLENGE_CV_TUNINGS_MIN = 3;

function listCvControls(chapter) {
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const fromScript = cvs.map(c => c.controlId).filter(Boolean);
  if (fromScript.length) return [...new Set(fromScript)];
  const controls = chapter?.traceMap?.controls || {};
  return Object.entries(controls)
    .filter(([, m]) => m?.role === 'irrelevant')
    .map(([id]) => id);
}

function cvLabelForControl(chapter, controlId) {
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const hit = cvs.find(c => c.controlId === controlId);
  if (hit?.label) return String(hit.label);
  return controlId || '无关量';
}

function countTuningsByControl(events, controlIds) {
  const set = new Set(controlIds);
  const counts = new Map();
  for (const e of events || []) {
    if (e?.type !== 'tuning' && e?.type !== 'irrelevant_touch') continue;
    const c = e.payload?.control;
    if (!c || !set.has(c)) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return counts;
}

function dominantControl(counts) {
  let bestId = null;
  let bestN = 0;
  for (const [id, n] of counts.entries()) {
    if (n > bestN) {
      bestN = n;
      bestId = id;
    }
  }
  return bestId ? { controlId: bestId, count: bestN } : null;
}

function findLatestAttribution(events) {
  let attr = null;
  for (const e of events || []) {
    if (e?.type !== 'snapshot') continue;
    const a = e.payload?.attribution;
    if (a != null && String(a).trim()) attr = String(a).trim();
  }
  return attr;
}

function attributionIsCv(attribution, chapter) {
  if (!attribution || attribution === 'mixed' || attribution === 'unsure') return null;
  const cvIds = new Set(listCvControls(chapter));
  if (cvIds.has(attribution)) return attribution;
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  if (cvs.some(c => c.controlId === attribution)) return attribution;
  return null;
}

function sessionGaps(judgeResult) {
  if (!judgeResult) return [];
  const ts = judgeResult.teacherSummary || {};
  if (Array.isArray(ts.gaps) && ts.gaps.length) return ts.gaps.map(String);
  if (Array.isArray(judgeResult.gaps)) return judgeResult.gaps.map(String);
  return [];
}

function exploreNoSolid(abilityScore, summary) {
  const tier = abilityScore?.parts?.exploreResult?.tier;
  const erRaw = abilityScore?.parts?.exploreResult?.raw;
  const exploreTrials = abilityScore?.parts?.efficiency?.exploreTrials;
  const peRaw = abilityScore?.parts?.exploreProcess?.raw;

  if (tier === 'solid' || erRaw === 100) return false;
  if (tier === 'lucky' && peRaw != null && peRaw >= 55) return false;

  const exploreEvents = filterEventsByExplorePhase(summary?.events || []);
  const sawExplore = exploreEvents.some(e =>
    e?.type === 'phase_change' && e.payload?.phase === 'explore')
    || (exploreTrials != null && exploreTrials > 0)
    || (peRaw != null && peRaw > 0);

  if (!sawExplore) return false;
  if (tier === 'none' || erRaw === 0) return true;
  if (tier == null && peRaw != null && peRaw >= 20 && erRaw == null) return true;
  return false;
}

function detectTimingIssue(summary, judgeResult) {
  const gaps = sessionGaps(judgeResult);
  if (gaps.some(g => /连拧|偏快出手/.test(g))) {
    if (gaps.some(g => g.includes('连拧'))) return TIMING_DENSE_TUNE_GAP;
    return TIMING_RUSH_ACTION_GAP;
  }

  const tf = summary?.timingFeatures
    || summary?.inquiryPath?.metrics?.timingFeatures;
  if (!tf) return null;

  if (isPassed(summary) && hasAdequateContrastEvidence(summary)) return null;

  const counts = summary.eventCounts || {};
  const tuneN = Number(counts.tuning || 0) || 0;
  const actionN = Number(counts.action || 0) || 0;
  const m = summary?.inquiryPath?.metrics || {};
  const ttMed = tf.tuneTuneGapMs?.median;
  const ttN = Number(tf.tuneTuneGapMs?.n || 0) || 0;
  const taMed = tf.tuneActionGapMs?.median;
  const taN = Number(tf.tuneActionGapMs?.n || 0) || 0;
  const weakContrast = (typeof m.avTunings === 'number' && m.avTunings < 2)
    || (typeof m.singleVariableRate === 'number' && m.singleVariableRate < 0.5)
    || !summary?.inquiryPath?.pathSteps?.includes('R1');

  if (tuneN >= 6 && actionN <= 1 && ttN >= 4 && ttMed != null && ttMed < 1800) {
    return TIMING_DENSE_TUNE_GAP;
  }
  if (taN >= 3 && taMed != null && taMed < 700 && !isPassed(summary) && weakContrast) {
    return TIMING_RUSH_ACTION_GAP;
  }
  return null;
}

function challengeCvHeavy(events, chapter, abilityScore) {
  const cvOver = abilityScore?.parts?.challengeProcess?.cvOver;
  if (cvOver === true) return { heavy: true, source: 'ability' };

  const chEv = filterEventsByChallengePhase(events);
  const cvIds = listCvControls(chapter);
  if (!cvIds.length) return { heavy: false };

  const counts = countTuningsByControl(chEv, cvIds);
  let cvT = 0;
  let avT = 0;
  for (const e of chEv) {
    if (e?.type !== 'tuning') continue;
    const c = e.payload?.control;
    if (!c) continue;
    if (cvIds.includes(c)) cvT += 1;
    else if (chapter?.traceMap?.controls?.[c]?.role === 'operation') avT += 1;
  }
  const ratio = (cvT + avT) > 0 ? cvT / (cvT + avT) : 0;
  if (cvT >= CHALLENGE_CV_TUNINGS_MIN && ratio >= CHALLENGE_CV_OVER_RATIO) {
    return { heavy: true, source: 'trace', dominant: dominantControl(counts) };
  }

  const score = scoreTraceStrategy(chEv, chapter, { mode: 'compete' });
  if (score?.breakdown?.cvOver || score?.breakdown?.cvRaised) {
    return { heavy: true, source: 'strategy', dominant: dominantControl(counts) };
  }
  return { heavy: false, dominant: dominantControl(counts) };
}

function shouldSuppressForConverge(summary, abilityScore) {
  const kind = summary?.inquiryPath?.metrics?.switchKind;
  if (kind !== 'explore_converge') return false;
  const tier = abilityScore?.parts?.exploreResult?.tier;
  const pe = abilityScore?.parts?.exploreProcess?.raw;
  if (tier === 'solid') return true;
  if (pe != null && pe >= 65) return true;
  return false;
}

/**
 * @param {{
 *   summary: object,
 *   chapter?: object,
 *   events?: object[],
 *   judgeResult?: object,
 *   abilityScore?: object,
 * }} ctx
 */
function computePrimaryMisconception(ctx = {}) {
  const summary = ctx.summary || {};
  const chapter = ctx.chapter || null;
  const events = ctx.events?.length
    ? ctx.events
    : (summary.events || []);
  const judgeResult = ctx.judgeResult || null;
  const abilityScore = ctx.abilityScore || null;

  if (shouldSuppressForConverge(summary, abilityScore)) {
    return {
      version: PRIMARY_MISCONCEPTION_VERSION,
      kind: 'positive',
      code: CODE.POSITIVE_CONVERGED,
      label: '后期已收成单变量',
      hint: '早期试错可写在过程依据里，本局不标主错因。',
    };
  }

  if (isPassWithWeakComparison(summary)) {
    return {
      version: PRIMARY_MISCONCEPTION_VERSION,
      kind: 'issue',
      code: CODE.PASS_WEAK_COMPARE,
      label: PASS_WEAK_COMPARE_GAP,
    };
  }

  const cvInfo = challengeCvHeavy(events, chapter, abilityScore);
  if (cvInfo.heavy) {
    const dom = cvInfo.dominant || dominantControl(
      countTuningsByControl(filterEventsByChallengePhase(events), listCvControls(chapter)),
    );
    const name = dom ? cvLabelForControl(chapter, dom.controlId) : '无关量';
    const attrCv = attributionIsCv(findLatestAttribution(events), chapter);
    let hint = '';
    if (attrCv) {
      hint = `过关归因也选了「${cvLabelForControl(chapter, attrCv)}」（旁路，非主因）。`;
    }
    return {
      version: PRIMARY_MISCONCEPTION_VERSION,
      kind: 'issue',
      code: CODE.CV_AS_CAUSE,
      label: `竞赛段把「${name}」当成了原因`,
      hint: hint || undefined,
      evidence: dom ? { cvControlId: dom.controlId, cvLabel: name, attributionCv: attrCv || undefined } : undefined,
    };
  }

  const chEv = filterEventsByChallengePhase(events);
  const chScore = scoreTraceStrategy(chEv.length ? chEv : events, chapter, { mode: 'compete' });
  const primary = String(chScore?.primaryStrategy || chScore?.breakdown?.dominantLabel || '');
  const trapHeavy = primary === LABEL.trap
    || /多参盲调/.test(primary)
    || (chScore?.breakdown?.segmentCounts?.[LABEL.trap] >= 2);

  if (trapHeavy && (chScore?.breakdown?.effectiveTrials ?? 0) >= 1) {
    return {
      version: PRIMARY_MISCONCEPTION_VERSION,
      kind: 'issue',
      code: CODE.MULTI_AV_TRAP,
      label: '同一试次里混调多个调节量',
      hint: '建议每次只改一项再测试。',
    };
  }

  const timingGap = detectTimingIssue(summary, judgeResult);
  if (timingGap) {
    return {
      version: PRIMARY_MISCONCEPTION_VERSION,
      kind: 'issue',
      code: CODE.TIMING_BLIND_TUNE,
      label: timingGap,
    };
  }

  if (exploreNoSolid(abilityScore, { ...summary, events })) {
    return {
      version: PRIMARY_MISCONCEPTION_VERSION,
      kind: 'issue',
      code: CODE.EXPLORE_NO_SOLID,
      label: '有探究操作但未扎实达成',
    };
  }

  return {
    version: PRIMARY_MISCONCEPTION_VERSION,
    kind: 'none',
    code: CODE.NONE,
    label: '',
  };
}

/**
 * @param {object} judgeResult
 * @param {object} ctx
 * @returns {object}
 */
function attachPrimaryMisconception(judgeResult, ctx = {}) {
  if (!judgeResult || typeof judgeResult !== 'object') return judgeResult;
  const primary = computePrimaryMisconception({
    ...ctx,
    judgeResult,
  });
  return {
    ...judgeResult,
    primaryMisconception: primary,
  };
}

module.exports = {
  PRIMARY_MISCONCEPTION_VERSION,
  CODE,
  computePrimaryMisconception,
  attachPrimaryMisconception,
};
