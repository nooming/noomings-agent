/**
 * 会话能力分：与 judge-session / path-summary 共用的计算与合并（避免 preview 被冲掉）。
 */
'use strict';

const {
  computeAbilityScore,
  ABILITY_SCORE_VERSION,
} = require('../judge/ability-score');
const {
  deriveTerminalOutcome,
  isTerminalSession,
  mergeTerminalOutcome,
} = require('../judge/session-terminal');
const {
  applyIncompletePreviewAbilityScore,
  ABILITY_PREVIEW_REVISION,
} = require('../judge/incomplete-session');

function isFiniteAbilityTotal(v) {
  if (v == null || v === '') return false;
  return Number.isFinite(Number(v));
}

function isFinitePreviewTotal(v) {
  return isFiniteAbilityTotal(v);
}

/** 仅认 preview 评判或已落盘的 preview 门闩（不含 kind_only / 仅未终局）。 */
function sessionLooksPreview(session) {
  if (session?.judgeResult?.judgePreview || session?.judgeResult?.mode === 'rule_preview') {
    return true;
  }
  return session?.abilityScore?.preview === true;
}

function sessionNeedsPreviewRescore(session) {
  if (isTerminalSession(session)) return false;
  if (!sessionLooksPreview(session)) return false;
  const rev = Number(session?.abilityScore?.previewRevision);
  return !Number.isFinite(rev) || rev < ABILITY_PREVIEW_REVISION;
}

/**
 * @param {object} session
 * @param {object} chapter
 * @param {{
 *   graphId?: string,
 *   packageId?: string,
 *   terminalOutcome?: string,
 *   incompletePreview?: boolean,
 *   verdict?: string|null,
 * }} [opts]
 */
function computeSessionAbilityScore(session, chapter, opts = {}) {
  const events = Array.isArray(session?.events) ? session.events : [];
  const terminalOutcome = opts.terminalOutcome != null
    ? opts.terminalOutcome
    : mergeTerminalOutcome(
      session?.terminalOutcome,
      deriveTerminalOutcome(session),
    );
  const incompletePreview = opts.incompletePreview === true
    || (opts.incompletePreview !== false
      && sessionLooksPreview(session)
      && !isTerminalSession({ ...session, terminalOutcome }));

  let verdict = opts.verdict;
  if (verdict === undefined) {
    verdict = session?.judgeResult?.verdict ?? session?.verdict ?? null;
  }
  if (incompletePreview && verdict === 'pass') verdict = 'in_progress';

  const pkgId = opts.packageId
    ?? session?.packageId
    ?? session?.catalogId
    ?? null;

  let abilityScore = computeAbilityScore({
    events,
    chapter,
    verdict,
    judged: !!(session?.judged || session?.judgeResult),
    packageId: pkgId,
    graphId: opts.graphId ?? session?.graphId,
    terminalOutcome,
    attemptsExhausted: terminalOutcome === 'exhausted_fail' || session?.attemptsExhausted === true,
  });

  if (incompletePreview) {
    abilityScore = applyIncompletePreviewAbilityScore(abilityScore);
  }
  return abilityScore;
}

/**
 * 合并能力分对象：有限 total 优先冻结；无 total 时保护 preview 门闩与 previewTotal。
 * @param {object|null|undefined} existing
 * @param {object|null|undefined} incoming
 * @returns {object|null}
 */
function mergeAbilityScoreRecords(existing, incoming) {
  if (!incoming) return existing || null;
  if (!existing) return incoming;

  const exp = Number(ABILITY_SCORE_VERSION);
  const exVer = Number(existing.version);
  const inVer = Number(incoming.version);
  const exFinite = isFiniteAbilityTotal(existing.total);
  const inFinite = isFiniteAbilityTotal(incoming.total);
  const exCurrent = Number.isFinite(exVer) && exVer === exp;
  const inCurrent = Number.isFinite(inVer) && inVer === exp;

  if (exFinite && exCurrent) {
    if (inFinite && Number.isFinite(inVer) && inVer > exVer) return incoming;
    return existing;
  }
  if (exFinite && inFinite && inCurrent && (!Number.isFinite(exVer) || inVer > exVer)) {
    return incoming;
  }
  if (exFinite && !inFinite) return existing;
  if (inFinite && inCurrent) return incoming;
  if (inFinite && !exFinite) return incoming;
  if (inCurrent && !exCurrent) return incoming;
  if (exCurrent && !inCurrent) return existing;

  const exPrev = isFinitePreviewTotal(existing.previewTotal);
  const inPrev = isFinitePreviewTotal(incoming.previewTotal);

  if (existing.preview && !incoming.preview) {
    const merged = {
      ...incoming,
      preview: true,
      pending: true,
      total: null,
      previewTotal: inPrev ? incoming.previewTotal : existing.previewTotal,
      previewNote: existing.previewNote || incoming.previewNote,
      previewRevision: existing.previewRevision ?? incoming.previewRevision ?? ABILITY_PREVIEW_REVISION,
      bands: {
        ...(incoming.bands || {}),
        result: '未完成',
      },
    };
    return merged;
  }

  if (inPrev && !exPrev) return incoming;
  if (exPrev && !inPrev) return existing;
  if (inPrev && exPrev) {
    return Number(incoming.previewTotal) >= Number(existing.previewTotal)
      ? incoming
      : existing;
  }

  const exAt = Date.parse(existing.computedAt || '') || 0;
  const inAt = Date.parse(incoming.computedAt || '') || 0;
  return inAt >= exAt ? incoming : existing;
}

function stripPreviewFieldsFromAbility(abilityScore) {
  if (!abilityScore || typeof abilityScore !== 'object') return abilityScore;
  if (!abilityScore.preview && abilityScore.previewTotal == null) return abilityScore;
  const {
    preview,
    previewTotal,
    previewNote,
    previewRevision,
    ...rest
  } = abilityScore;
  return rest;
}

function sessionHasFiniteTerminalTotal(session) {
  const a = session?.abilityScore;
  return !!(a
    && Number(a.version) === Number(ABILITY_SCORE_VERSION)
    && isFiniteAbilityTotal(a.total));
}

module.exports = {
  ABILITY_SCORE_VERSION,
  ABILITY_PREVIEW_REVISION,
  isFiniteAbilityTotal,
  computeSessionAbilityScore,
  mergeAbilityScoreRecords,
  sessionHasFiniteTerminalTotal,
  sessionLooksPreview,
  sessionNeedsPreviewRescore,
  stripPreviewFieldsFromAbility,
};
