/**
 * 教师端「需关注」编排告警（非能力鉴定）。
 * 纯函数：复用 session / ability / judge gaps / literacy 已有字段。
 *
 * Browser: also exposed as globalThis.AttentionFlags (load via /static/ui/attention-flags.js).
 */

'use strict';

const ATTENTION_FLAGS_VERSION = 1;

const DISCLAIMER =
  '基于近阶段/代表局过程证据的编排告警，非能力鉴定。';

/** 与 process-detectors.md 子技能 ID 对齐 */
const SKILL_IDS = Object.freeze({
  PASS_WITHOUT_CONTRAST: 'pass_without_contrast',
  CONFOUND_BYPASS: 'confound_bypass',
  EXPLORE_SOLID: 'explore_solid',
  EXPLORE_LUCKY: 'explore_lucky',
  CONTROLLED_CONTRAST: 'controlled_contrast',
});

const FLAG_IDS = Object.freeze({
  PASS_WEAK_COMPARE: 'pass_weak_compare',
  CV_BYPASS_HEAVY: 'cv_bypass_heavy',
  EXPLORE_NO_SOLID: 'explore_no_solid',
});

const FLAG_META = Object.freeze({
  [FLAG_IDS.PASS_WEAK_COMPARE]: Object.freeze({
    id: FLAG_IDS.PASS_WEAK_COMPARE,
    label: '对照不足已过关',
    shortLabel: '少对照',
    skillId: SKILL_IDS.PASS_WITHOUT_CONTRAST,
    title: '有竞赛通关/达标，但过程证据显示有效对照偏少（编排告警，非能力鉴定）',
  }),
  [FLAG_IDS.CV_BYPASS_HEAVY]: Object.freeze({
    id: FLAG_IDS.CV_BYPASS_HEAVY,
    label: '旁路偏高',
    shortLabel: '旁路',
    skillId: SKILL_IDS.CONFOUND_BYPASS,
    title: 'CV/无关量偏重或旁路类 gaps（编排告警，非能力鉴定）',
  }),
  [FLAG_IDS.EXPLORE_NO_SOLID]: Object.freeze({
    id: FLAG_IDS.EXPLORE_NO_SOLID,
    label: '有探究无达成',
    shortLabel: '无达成',
    skillId: SKILL_IDS.EXPLORE_SOLID,
    title: '已触达探究段，但未见扎实 explore_success（编排告警，非能力鉴定）',
  }),
});

const PASS_WEAK_GAP_RE = /偏少对照|少对照|多测几次|过关偏少对照/;
const BYPASS_GAP_RE = /旁路|无关|混淆触碰|永久无关|试探旁路|迷思|拧无关/;

function asList(v) {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sessionGaps(session) {
  if (!session || typeof session !== 'object') return [];
  if (Array.isArray(session.gaps)) return asList(session.gaps);
  const jr = session.judgeResult || session.judge || null;
  if (!jr) return [];
  if (Array.isArray(jr.teacherSummary?.gaps)) return asList(jr.teacherSummary.gaps);
  if (Array.isArray(jr.gaps)) return asList(jr.gaps);
  return [];
}

function abilityOf(session) {
  return session?.abilityScore || session?.ability || null;
}

function isWonSession(session) {
  const a = abilityOf(session);
  const bands = a?.bands || {};
  const resultBand = bands.challengeResult || bands.result || null;
  const rRaw = numOrNull((a?.parts?.challengeResult || a?.parts?.result)?.raw);
  return resultBand === '达标'
    || session?.terminalOutcome === 'pass'
    || session?.sessionOutcome === 'pass'
    || session?.verdict === 'pass'
    || (rRaw != null && rRaw >= 90);
}

function hasPassWeakCompareEvidence(session) {
  const gaps = sessionGaps(session);
  if (gaps.some((g) => PASS_WEAK_GAP_RE.test(g))) return true;
  // 无 gaps 文案时：通关 + 竞赛过程分极薄 + 试次很少（弱启发式，与 PASS_WEAK_COMPARE 同向）
  if (!isWonSession(session)) return false;
  const parts = abilityOf(session)?.parts || {};
  const pc = numOrNull(parts.challengeProcess?.raw);
  const trials = Number(parts.efficiency?.challengeTrials || 0) || 0;
  if (pc != null && pc < 35 && trials <= 1) return true;
  return false;
}

function hasCvBypassEvidence(session) {
  const gaps = sessionGaps(session);
  if (gaps.some((g) => BYPASS_GAP_RE.test(g))) return true;
  const parts = abilityOf(session)?.parts || {};
  if (parts.challengeProcess?.cvOver) return true;
  const metrics = session?.inquiryPath?.metrics
    || session?.judgeResult?.inquiryPath?.metrics
    || null;
  if (metrics?.cvHeavy) return true;
  return false;
}

/**
 * 有探究无达成：
 * - 触达探究（exploreTrials≥1 或 pe/er/路径）
 * - 且无扎实达成：非 solid / Er 偏低 / 幸运一发 / 未达成
 */
function hasExploreNoSolidEvidence(session) {
  const parts = abilityOf(session)?.parts || {};
  const bands = abilityOf(session)?.bands || {};
  const peRaw = numOrNull(parts.exploreProcess?.raw);
  const erRaw = numOrNull(parts.exploreResult?.raw);
  const exploreTrials = Number(parts.efficiency?.exploreTrials || 0) || 0;
  const erTier = parts.exploreResult?.tier || bands.exploreResult || null;
  const touchedExplore = exploreTrials > 0
    || peRaw != null
    || erRaw != null
    || !!(session?.strategyPathSummaryExplore)
    || !!(session?.strategyPathByPhase?.explore)
    || /explore/i.test(String(session?.currentPhase || ''));

  if (!touchedExplore) return false;

  const solid = erTier === 'solid'
    || erTier === '扎实达成'
    || (erRaw != null && erRaw >= 90);
  if (solid) return false;

  const lucky = erTier === 'lucky'
    || erTier === '幸运一发'
    || (erRaw != null && erRaw >= 30 && erRaw < 90);
  const none = erTier === '未达成'
    || erRaw === 0
    || (erRaw == null && exploreTrials >= 1)
    || (erRaw != null && erRaw < 30);

  // 有探究操作但无扎实：幸运一发 / 未达成 / Er 偏低
  if (lucky || none) return true;
  if (erRaw != null && erRaw < 90 && exploreTrials >= 1) return true;
  return false;
}

function makeFlag(id, reasons) {
  const meta = FLAG_META[id];
  if (!meta) return null;
  return {
    id: meta.id,
    label: meta.label,
    shortLabel: meta.shortLabel,
    skillId: meta.skillId,
    title: meta.title,
    reasons: asList(reasons),
  };
}

/**
 * 单局检测。
 * @param {object} session
 * @returns {{ version: number, disclaimer: string, flags: object[], flagIds: string[] }}
 */
function detectSessionAttentionFlags(session) {
  const flags = [];
  if (session && typeof session === 'object') {
    if (isWonSession(session) && hasPassWeakCompareEvidence(session)) {
      flags.push(makeFlag(FLAG_IDS.PASS_WEAK_COMPARE, sessionGaps(session).filter((g) => PASS_WEAK_GAP_RE.test(g))));
    }
    if (hasCvBypassEvidence(session)) {
      flags.push(makeFlag(FLAG_IDS.CV_BYPASS_HEAVY, sessionGaps(session).filter((g) => BYPASS_GAP_RE.test(g))));
    }
    if (hasExploreNoSolidEvidence(session)) {
      const parts = abilityOf(session)?.parts || {};
      const er = parts.exploreResult || {};
      flags.push(makeFlag(FLAG_IDS.EXPLORE_NO_SOLID, [
        er.tier || null,
        er.raw != null ? `Er=${er.raw}` : null,
      ].filter(Boolean)));
    }
  }
  return {
    version: ATTENTION_FLAGS_VERSION,
    disclaimer: DISCLAIMER,
    flags,
    flagIds: flags.map((f) => f.id),
  };
}

/**
 * 学生级：对代表局/近阶段会话取并集（任一局触发则亮旗）。
 * @param {Array<object>} sessions
 * @returns {{ version: number, disclaimer: string, flags: object[], flagIds: string[], sessionCount: number }}
 */
function detectStudentAttentionFlags(sessions) {
  const list = Array.isArray(sessions) ? sessions.filter((s) => s && typeof s === 'object') : [];
  const byId = new Map();
  for (const session of list) {
    const one = detectSessionAttentionFlags(session);
    for (const f of one.flags) {
      const prev = byId.get(f.id);
      if (!prev) {
        byId.set(f.id, { ...f, reasons: [...(f.reasons || [])] });
      } else {
        const merged = new Set([...(prev.reasons || []), ...(f.reasons || [])]);
        prev.reasons = [...merged];
      }
    }
  }
  const order = [
    FLAG_IDS.PASS_WEAK_COMPARE,
    FLAG_IDS.CV_BYPASS_HEAVY,
    FLAG_IDS.EXPLORE_NO_SOLID,
  ];
  const flags = order.map((id) => byId.get(id)).filter(Boolean);
  return {
    version: ATTENTION_FLAGS_VERSION,
    disclaimer: DISCLAIMER,
    flags,
    flagIds: flags.map((f) => f.id),
    sessionCount: list.length,
  };
}

/** 画像页一行摘要文案 */
function formatAttentionFlagsSummary(result) {
  const flags = result?.flags || [];
  if (!flags.length) return '';
  const labels = flags.map((f) => f.label).join(' · ');
  return `需关注：${labels}（基于近阶段过程证据，非能力鉴定）`;
}

const api = {
  ATTENTION_FLAGS_VERSION,
  DISCLAIMER,
  SKILL_IDS,
  FLAG_IDS,
  FLAG_META,
  detectSessionAttentionFlags,
  detectStudentAttentionFlags,
  formatAttentionFlagsSummary,
  // test helpers
  hasPassWeakCompareEvidence,
  hasCvBypassEvidence,
  hasExploreNoSolidEvidence,
  isWonSession,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AttentionFlags = api;
}
