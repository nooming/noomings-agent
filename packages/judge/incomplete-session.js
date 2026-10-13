/**
 * 未终局会话：分档（教师列表）与轻量规则评判门闩。
 * 综合分仍不计；preview 补 strengths/gaps + 过程拆解 + previewTotal（total 保持 null）。
 */
'use strict';

const { segmentTraceByFire } = require('./strategy-segment-score');
const { filterEventsByExplorePhase, filterEventsByChallengePhase } = require('./trace-normalize');

const MIN_EVENTS_PREVIEW = 4;
const MIN_EVENTS_TOUCH_ONLY = 3;

/** 未终局 preview 能力分/门闩逻辑修订号（升级后触发重刷）。 */
const ABILITY_PREVIEW_REVISION = 1;

const INCOMPLETE_KIND = Object.freeze({
  TOUCH_ONLY: 'touch_only',
  EXPLORE_DROPOUT: 'explore_dropout',
  CHALLENGE_ACTIVE: 'challenge_active',
  RICH_UNJUDGED: 'rich_unjudged',
});

const KIND_LABEL_ZH = Object.freeze({
  touch_only: '点开即走',
  explore_dropout: '探究未完',
  challenge_active: '竞赛未完',
  rich_unjudged: '有过程',
});

function eventCountOf(session) {
  const n = Number(session?.eventCount);
  if (Number.isFinite(n) && n >= 0) return n;
  return Array.isArray(session?.events) ? session.events.length : 0;
}

function effectiveFireTrials(events, chapter) {
  if (!chapter || !Array.isArray(events) || !events.length) return 0;
  try {
    const segs = segmentTraceByFire(events, chapter);
    return segs.filter(s => s.effective && !s.dangling).length;
  } catch {
    return 0;
  }
}

function phaseHasTuningOrFire(events) {
  return (events || []).some(e =>
    e?.type === 'tuning'
    || e?.type === 'action'
    || e?.type === 'win'
    || (e?.type === 'snapshot' && e.payload?.winOk),
  );
}

function sawExplorePhase(session, events) {
  const list = events || [];
  const hasPhaseChange = list.some(e => e.type === 'phase_change');
  if (session?.currentPhase === 'explore') return true;
  if (session?.strategyPathByPhase?.explore) return true;
  if (session?.strategyPathSummaryExplore) return true;
  if (!hasPhaseChange) return false;
  if (list.some(e => e.type === 'phase_change' && e.payload?.phase === 'explore')) return true;
  const explore = filterEventsByExplorePhase(list);
  return phaseHasTuningOrFire(explore);
}

function sawChallengePhase(session, events) {
  const list = events || [];
  const hasPhaseChange = list.some(e => e.type === 'phase_change');
  if (session?.currentPhase === 'challenge') return true;
  if (session?.scoredPhase === 'challenge') return true;
  if (session?.strategyPathByPhase?.challenge) return true;
  if (session?.strategyPathSummary?.scoredPhase === 'challenge') return true;
  if (!hasPhaseChange) return false;
  const challenge = filterEventsByChallengePhase(list);
  return phaseHasTuningOrFire(challenge)
    || list.some(e => e.type === 'phase_change' && e.payload?.phase === 'challenge');
}

/**
 * @param {object} session
 * @param {object} [chapter]
 * @returns {'touch_only'|'explore_dropout'|'challenge_active'|'rich_unjudged'}
 */
function classifyIncompleteKind(session, chapter) {
  const events = session?.events || [];
  const n = eventCountOf(session);
  const trials = effectiveFireTrials(events, chapter);

  if (n <= MIN_EVENTS_TOUCH_ONLY && trials < 1) {
    return INCOMPLETE_KIND.TOUCH_ONLY;
  }
  if (sawChallengePhase(session, events)) {
    return INCOMPLETE_KIND.CHALLENGE_ACTIVE;
  }
  if (sawExplorePhase(session, events)) {
    return INCOMPLETE_KIND.EXPLORE_DROPOUT;
  }
  if (trials >= 1 || n >= MIN_EVENTS_PREVIEW) {
    return INCOMPLETE_KIND.RICH_UNJUDGED;
  }
  return INCOMPLETE_KIND.TOUCH_ONLY;
}

function incompleteKindLabelZh(kind) {
  return KIND_LABEL_ZH[kind] || '未完成';
}

/**
 * 离开页时是否跑规则 preview 评判（非 LLM）。
 */
function shouldRunIncompletePreview(session, chapter) {
  const events = session?.events || [];
  const n = eventCountOf(session);
  if (n >= MIN_EVENTS_PREVIEW) return true;
  if (effectiveFireTrials(events, chapter) >= 1) return true;
  return false;
}

/**
 * 未终局 preview 能力分：强制不计综合 total，保留 parts 供过程档参考。
 */
function resolvePreviewTotal(abilityScore) {
  if (!abilityScore || typeof abilityScore !== 'object') return null;
  const fromField = abilityScore.previewTotal;
  if (Number.isFinite(fromField)) return Math.round(Number(fromField));
  const fromTotal = abilityScore.total;
  if (Number.isFinite(fromTotal)) return Math.round(Number(fromTotal));
  return null;
}

function applyIncompletePreviewAbilityScore(abilityScore) {
  if (!abilityScore || typeof abilityScore !== 'object') return abilityScore;
  const previewTotal = resolvePreviewTotal(abilityScore);
  const out = {
    ...abilityScore,
    preview: true,
    pending: true,
    total: null,
    ...(previewTotal != null
      ? { previewTotal, previewNote: '未终局参考分，不计入班级综合' }
      : {}),
    previewRevision: ABILITY_PREVIEW_REVISION,
  };
  if (out.bands && typeof out.bands === 'object') {
    out.bands = { ...out.bands, result: '未完成' };
  }
  return out;
}

function applyIncompletePreviewJudgeResult(result) {
  if (!result || typeof result !== 'object') return result;
  const out = { ...result, judgePreview: true };
  if (out.mode === 'rule') out.mode = 'rule_preview';
  if (out.verdict === 'pass') out.verdict = 'in_progress';
  if (out.teacherSummary && typeof out.teacherSummary === 'object') {
    out.teacherSummary = { ...out.teacherSummary };
    if (out.teacherSummary.level != null && out.teacherSummary.level >= 4) {
      out.teacherSummary.level = 3;
    }
  }
  return out;
}

module.exports = {
  MIN_EVENTS_PREVIEW,
  ABILITY_PREVIEW_REVISION,
  INCOMPLETE_KIND,
  classifyIncompleteKind,
  incompleteKindLabelZh,
  shouldRunIncompletePreview,
  effectiveFireTrials,
  applyIncompletePreviewAbilityScore,
  applyIncompletePreviewJudgeResult,
};
