/**
 * 大学生向「过程结论 → 少数能力/素养标签」规则映射（L2 教学解读层）。
 * 输入：本局已有 abilityScore / judge / path / 终局信息；输出四维倾向 + 一句依据。
 * 非标准化测评；证据不足时标 insufficient，勿硬抬强档。
 *
 * Browser mirror: apps/web/ui/literacy-mapping.js (served as /static/ui/literacy-mapping.js).
 * Source of truth is this packages file — keep the UI copy in sync after logic changes.
 */

'use strict';

const LITERACY_PROFILE_VERSION = 1;
const LITERACY_AUDIENCE = 'university';

const DISCLAIMER =
  '基于本局/近阶段过程证据的表现倾向，非标准化测评。';

/** 学生级（近阶段）disclaimer：强调非标准化测评 */
const STUDENT_DISCLAIMER =
  '基于近阶段过程证据的表现倾向，非标准化测评。';

const LEVELS = Object.freeze({
  STRONG: 'strong',
  MODERATE: 'moderate',
  WEAK: 'weak',
  INSUFFICIENT: 'insufficient',
});

const LEVEL_LABELS_ZH = Object.freeze({
  strong: '偏强',
  moderate: '一般',
  weak: '待加强',
  insufficient: '证据不足',
});

/** 档位强弱序：数值越大越强；并列取更弱档时用更小值 */
const LEVEL_RANK = Object.freeze({
  insufficient: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
});

const AGGREGATION_STRATEGY = 'cautious_mode';
const AGGREGATION_STRATEGY_LABEL =
  '众数优先；并列取更弱档（谨慎，避免永远偏强）';

const DIMENSIONS_META = Object.freeze([
  { id: 'inquiry', label: '探究素养' },
  { id: 'reasoning', label: '科学推理' },
  { id: 'problemSolving', label: '问题解决' },
  { id: 'engagement', label: '学习投入' },
]);

const SINGLE_VAR_RE = /单变量|单参|控制变量|主推/;
const BYPASS_RE = /旁路|无关|混淆触碰|永久无关|试探旁路|迷思/;
const MULTI_TRAP_RE = /多参|盲调|trap|尚不清晰|观察偏少/;

/** 证据来源标签（可审计：路径/Pe/gaps/timing 等） */
const EVIDENCE_KIND_LABELS = Object.freeze({
  path: '路径',
  pe: '探究过程(Pe)',
  pc: '竞赛过程(Pc)',
  er: '探究结果(Er)',
  result: '竞赛结果',
  gaps: 'gaps',
  strengths: 'strengths',
  timing: '时间特征',
  trials: '试次',
  terminal: '终局',
  events: '事件量',
  dual: '双模',
});

function normalizeEvidenceKinds(kinds) {
  const list = Array.isArray(kinds) ? kinds.map(String).filter(Boolean) : [];
  const seen = new Set();
  const out = [];
  for (const k of list) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** Coerce evidence to display text; tolerate mistaken object hand-offs (e.g. summarized row). */
function coerceEvidenceText(evidence) {
  if (evidence == null) return '';
  if (typeof evidence === 'string') return evidence;
  if (typeof evidence === 'object') {
    if (typeof evidence.evidence === 'string') return evidence.evidence;
    try {
      return JSON.stringify(evidence);
    } catch (_) {
      return '';
    }
  }
  return String(evidence);
}

function dim(id, level, evidence, kinds) {
  const meta = DIMENSIONS_META.find((d) => d.id === id) || { id, label: id };
  const text = coerceEvidenceText(evidence).trim() || '暂无足够过程证据。';
  const evidenceKinds = normalizeEvidenceKinds(kinds);
  const insufficient = level === LEVELS.INSUFFICIENT;
  const kindsLabel = evidenceKinds
    .map((k) => EVIDENCE_KIND_LABELS[k] || k)
    .join(' · ');
  const evidenceDetail = insufficient
    ? (kindsLabel
      ? `证据不足（依据类型：${kindsLabel}）。${text}`
      : `证据不足。${text}`)
    : (kindsLabel ? `${text}（依据：${kindsLabel}）` : text);
  return {
    id: meta.id,
    label: meta.label,
    level,
    levelLabel: LEVEL_LABELS_ZH[level] || level,
    evidence: text,
    evidenceKinds,
    evidenceKindsLabel: kindsLabel,
    evidenceDetail,
    evidenceInsufficient: insufficient,
  };
}

function asList(v) {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

function pickJudgeTexts(judgeResult) {
  if (!judgeResult || typeof judgeResult !== 'object') {
    return { strengths: [], gaps: [], judged: false, verdict: null };
  }
  const ts = judgeResult.teacherSummary || {};
  return {
    strengths: asList(ts.strengths?.length ? ts.strengths : judgeResult.strengths),
    gaps: asList(ts.gaps?.length ? ts.gaps : judgeResult.gaps),
    judged: true,
    verdict: judgeResult.verdict || null,
  };
}

function pathBlob(summary) {
  if (!summary || typeof summary !== 'object') return '';
  return [
    summary.type,
    summary.text,
    summary.primaryStrategy,
    summary.labelsShort,
    summary.scoredPhase,
  ].filter(Boolean).map(String).join(' ');
}

function resolvePathByPhase(input) {
  if (input?.pathByPhase && typeof input.pathByPhase === 'object') {
    return input.pathByPhase;
  }
  const by = input?.strategyPathByPhase && typeof input.strategyPathByPhase === 'object'
    ? input.strategyPathByPhase
    : {};
  const primary = input?.strategyPathSummary || null;
  const explore = input?.strategyPathSummaryExplore || by.explore || null;
  const challenge = by.challenge
    || (primary?.scoredPhase === 'challenge' ? primary : null);
  const full = by.full
    || (primary && primary.scoredPhase !== 'explore' && primary.scoredPhase !== 'challenge'
      ? primary
      : null);
  return { explore, challenge, full, primary };
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function collectSignals(input) {
  const ability = input?.abilityScore || input?.ability || null;
  const parts = ability?.parts || {};
  const bands = ability?.bands || {};
  const judge = pickJudgeTexts(input?.judgeResult || input?.judge || null);
  const pathByPhase = resolvePathByPhase(input);
  const explorePath = pathBlob(pathByPhase.explore);
  const challengePath = pathBlob(pathByPhase.challenge || pathByPhase.full || pathByPhase.primary);
  const pathAll = `${explorePath} ${challengePath}`;

  const peRaw = numOrNull(parts.exploreProcess?.raw);
  const pcRaw = numOrNull(parts.challengeProcess?.raw);
  const erRaw = numOrNull(parts.exploreResult?.raw);
  const rRaw = numOrNull((parts.challengeResult || parts.result)?.raw);
  const eRaw = numOrNull(parts.efficiency?.raw);
  const exploreTrials = Number(parts.efficiency?.exploreTrials || 0) || 0;
  const challengeTrials = Number(parts.efficiency?.challengeTrials || 0) || 0;
  const erTier = parts.exploreResult?.tier
    || bands.exploreResult
    || null;
  const resultBand = bands.challengeResult || bands.result || null;
  const processBand = bands.process || null;
  const cvOver = !!(parts.challengeProcess?.cvOver);
  const trap = !!(parts.challengeProcess?.trap)
    || MULTI_TRAP_RE.test(String(parts.challengeProcess?.primary || ''));

  const terminalOutcome = input?.terminalOutcome
    || input?.sessionOutcome
    || null;
  const currentPhase = input?.currentPhase || null;
  const sawPhaseChange = input?.sawPhaseChange === true
    || !!(pathByPhase.explore && pathByPhase.challenge)
    || (exploreTrials > 0 && challengeTrials > 0)
    || currentPhase === 'challenge';
  const touchedExplore = exploreTrials > 0
    || peRaw != null
    || erRaw != null
    || !!(pathByPhase.explore)
    || /explore/i.test(String(currentPhase || ''));
  const touchedChallenge = challengeTrials > 0
    || pcRaw != null
    || rRaw != null
    || !!(pathByPhase.challenge)
    || currentPhase === 'challenge'
    || resultBand === '达标'
    || resultBand === '未达标';
  const dualMode = !!(touchedExplore && touchedChallenge);
  const isTerminal = terminalOutcome === 'pass'
    || terminalOutcome === 'exhausted_fail'
    || resultBand === '达标'
    || resultBand === '未达标'
    || judge.verdict === 'pass';
  const won = resultBand === '达标'
    || terminalOutcome === 'pass'
    || judge.verdict === 'pass'
    || (rRaw != null && rRaw >= 90);
  const exhaustedFail = terminalOutcome === 'exhausted_fail'
    || resultBand === '未达标';
  const eventCount = Number(input?.eventCount || 0) || 0;
  const timingFeatures = input?.timingFeatures && typeof input.timingFeatures === 'object'
    ? input.timingFeatures
    : null;
  const startupDelayMs = numOrNull(timingFeatures?.startupDelayMs);
  const tuneActionMedian = numOrNull(timingFeatures?.tuneActionGapMs?.median);
  const tuneActionN = Number(timingFeatures?.tuneActionGapMs?.n || 0) || 0;
  const tuneTuneMedian = numOrNull(timingFeatures?.tuneTuneGapMs?.median);
  const tuneTuneN = Number(timingFeatures?.tuneTuneGapMs?.n || 0) || 0;
  const phaseExploreMs = numOrNull(timingFeatures?.phaseDurationMs?.explore) || 0;
  const phaseChallengeMs = numOrNull(timingFeatures?.phaseDurationMs?.challenge) || 0;
  /** 封顶后的活跃段时长（挂机超长 gap 已在 timing 层封顶，不会抬「高投入」） */
  const activePhaseMs = phaseExploreMs + phaseChallengeMs;
  const cappedActiveEnough = activePhaseMs >= 20_000;
  /** 启动很快且调参↔动作偏短：仅作节奏提示，不作学习投入加分 */
  const rapidOpsHint = startupDelayMs != null && startupDelayMs < 3000
    && tuneActionN >= 3
    && tuneActionMedian != null
    && tuneActionMedian < 1500;
  /** 调参后过快出手：短间隔；档位辅证仍须结合未达成/少对照（有对照后达成勿误判） */
  const rushActionHint = tuneActionN >= 3
    && tuneActionMedian != null
    && tuneActionMedian < 700;
  /** 连拧未测：相邻 tuning 偏密且试次/动作偏少 */
  const denseTuneHint = tuneTuneN >= 4
    && tuneTuneMedian != null
    && tuneTuneMedian < 1800
    && (challengeTrials + exploreTrials) <= 2;

  const strengthJoin = judge.strengths.join(' ');
  const gapJoin = judge.gaps.join(' ');
  const hasSingleVarPraise = SINGLE_VAR_RE.test(strengthJoin)
    || SINGLE_VAR_RE.test(explorePath)
    || SINGLE_VAR_RE.test(String(parts.exploreProcess?.primary || ''));
  const hasBypassGap = BYPASS_RE.test(gapJoin) || cvOver;
  const hasMultiTrap = MULTI_TRAP_RE.test(gapJoin)
    || MULTI_TRAP_RE.test(pathAll)
    || trap;
  const hasReasoningJudge = judge.judged && (
    SINGLE_VAR_RE.test(strengthJoin)
    || BYPASS_RE.test(gapJoin)
    || SINGLE_VAR_RE.test(gapJoin)
    || /推理|对照|收敛|途径/.test(`${strengthJoin} ${gapJoin}`)
  );

  return {
    ability,
    parts,
    bands,
    judge,
    peRaw,
    pcRaw,
    erRaw,
    rRaw,
    eRaw,
    exploreTrials,
    challengeTrials,
    erTier,
    resultBand,
    processBand,
    cvOver,
    trap,
    explorePath,
    challengePath,
    pathAll,
    touchedExplore,
    touchedChallenge,
    dualMode,
    isTerminal,
    won,
    exhaustedFail,
    eventCount,
    hasSingleVarPraise,
    hasBypassGap,
    hasMultiTrap,
    hasReasoningJudge,
    processGate: !!(parts.efficiency?.processGate),
    sawPhaseChange,
    timingFeatures,
    startupDelayMs,
    tuneActionMedian,
    tuneActionN,
    tuneTuneMedian,
    tuneTuneN,
    phaseExploreMs,
    phaseChallengeMs,
    activePhaseMs,
    cappedActiveEnough,
    rapidOpsHint,
    rushActionHint,
    denseTuneHint,
  };
}

function mapInquiry(s) {
  if (!s.touchedExplore && s.peRaw == null && s.erRaw == null) {
    return dim('inquiry', LEVELS.INSUFFICIENT, '本局未见探究段过程记录，证据不足。', []);
  }
  const solid = s.erTier === 'solid' || s.erTier === '扎实达成' || (s.erRaw != null && s.erRaw >= 90);
  const lucky = s.erTier === 'lucky' || s.erTier === '幸运一发' || (s.erRaw != null && s.erRaw >= 30 && s.erRaw < 90);
  const peHigh = s.peRaw != null && s.peRaw >= 70;
  const peMid = s.peRaw != null && s.peRaw >= 40 && s.peRaw < 70;
  const peLow = s.peRaw != null && s.peRaw < 40;
  const clearProcess = s.processBand === '清楚' && s.exploreTrials > 0;
  const kindsBase = [];
  if (s.peRaw != null) kindsBase.push('pe');
  if (s.erRaw != null || s.erTier) kindsBase.push('er');
  if (s.exploreTrials > 0) kindsBase.push('trials');
  if (s.hasSingleVarPraise || s.hasMultiTrap || /单变量|多参|对照/.test(s.explorePath)) kindsBase.push('path');
  if (s.hasSingleVarPraise) kindsBase.push('strengths');

  if ((solid && (peHigh || s.hasSingleVarPraise || clearProcess))
    || (peHigh && s.hasSingleVarPraise && !s.hasMultiTrap)) {
    const bit = solid ? '探究达成较扎实' : '探究过程分偏高';
    const cv = s.hasSingleVarPraise ? '，并见单参/控制变量对照迹象' : '';
    return dim('inquiry', LEVELS.STRONG, `${bit}${cv}。`, kindsBase);
  }
  if (peLow || (s.hasMultiTrap && s.touchedExplore && !solid) || (s.erRaw === 0 && s.exploreTrials >= 2)) {
    const why = peLow
      ? '探究过程分偏低'
      : (s.hasMultiTrap ? '探究路径偏多参/尚不清晰' : '有探究操作但未达成');
    const kinds = [...kindsBase];
    if (s.hasMultiTrap) kinds.push('gaps');
    return dim('inquiry', LEVELS.WEAK, `${why}，探究素养倾向待加强。`, kinds);
  }
  if (peMid || lucky || clearProcess || (s.exploreTrials > 0 && s.peRaw != null)) {
    const why = lucky
      ? '探究结果偏幸运一发'
      : (peMid ? '探究过程中等' : '已有探究过程但未达偏强门槛');
    return dim('inquiry', LEVELS.MODERATE, `${why}，表现为一般。`, kindsBase);
  }
  if (s.touchedExplore) {
    return dim('inquiry', LEVELS.MODERATE, '已进入探究段，但过程量化证据有限，暂标一般。', ['trials', 'path']);
  }
  return dim('inquiry', LEVELS.INSUFFICIENT, '探究相关证据不明确。', kindsBase);
}

function mapReasoning(s) {
  const pathSignal = SINGLE_VAR_RE.test(s.pathAll)
    || BYPASS_RE.test(s.pathAll)
    || s.cvOver
    || s.trap
    || (s.pcRaw != null)
    || (s.peRaw != null && s.hasSingleVarPraise);
  const kindsBase = [];
  if (pathSignal || s.pathAll) kindsBase.push('path');
  if (s.judge.judged) {
    if (s.hasBypassGap || s.hasMultiTrap) kindsBase.push('gaps');
    if (s.hasSingleVarPraise || s.hasReasoningJudge) kindsBase.push('strengths');
  }
  if (s.peRaw != null) kindsBase.push('pe');
  if (s.pcRaw != null) kindsBase.push('pc');

  if (!s.judge.judged && !pathSignal) {
    return dim(
      'reasoning',
      LEVELS.INSUFFICIENT,
      '缺过程评判与路径/过程分信号；可跑规则评判以补充科学推理依据。',
      [],
    );
  }

  if (s.hasBypassGap || (s.cvOver && !s.hasSingleVarPraise)) {
    const src = s.hasBypassGap ? '评判指出旁路/无关量倾向' : '竞赛过程检出混淆旁路（cvOver）';
    return dim('reasoning', LEVELS.WEAK, `${src}，科学推理倾向待加强。`, [...kindsBase, 'gaps']);
  }
  if (s.hasMultiTrap && !s.hasSingleVarPraise && (s.judge.judged || s.pcRaw != null)) {
    return dim('reasoning', LEVELS.WEAK, '路径/过程更接近多参盲调或误区，推理收敛不足。', kindsBase);
  }
  if (s.hasSingleVarPraise && !s.hasBypassGap && (s.judge.judged || s.peRaw != null || s.pcRaw != null)) {
    return dim('reasoning', LEVELS.STRONG, '过程证据支持单参对照/主推途径，未见明显旁路误区。', kindsBase);
  }
  if (s.hasReasoningJudge || (pathSignal && (s.pcRaw != null || s.peRaw != null))) {
    return dim('reasoning', LEVELS.MODERATE, '有路径或评判信号，但强弱证据混杂，推理表现为一般。', kindsBase);
  }
  if (s.judge.judged) {
    return dim('reasoning', LEVELS.MODERATE, '已有评判结果，但缺少明确的单参/旁路类证据，暂标一般。', ['gaps', 'strengths']);
  }
  return dim('reasoning', LEVELS.INSUFFICIENT, '科学推理证据不足。', kindsBase);
}

function appendRushActionCue(evidence, s) {
  // 有对照、后达成：勿误判为偏快出手/盲拧
  if (s.won && s.hasSingleVarPraise && !s.hasMultiTrap && !s.hasBypassGap) return evidence;
  if (s.won && s.pcRaw != null && s.pcRaw >= 55 && (s.challengeTrials >= 2 || s.processGate)) {
    return evidence;
  }
  const cues = [];
  if (s.rushActionHint) {
    const weakOutcome = s.exhaustedFail || !s.won;
    const weakObserve = (s.pcRaw != null && s.pcRaw < 40)
      || (s.challengeTrials <= 1 && !s.processGate)
      || s.hasMultiTrap
      || (s.peRaw != null && s.peRaw < 40);
    if (weakOutcome && weakObserve) {
      cues.push('调节后偏快出手，观察反馈偏少');
    }
  }
  if (s.denseTuneHint && (s.exhaustedFail || !s.won) && !s.hasSingleVarPraise) {
    cues.push('连拧调参偏密、少实测迹象');
  }
  if (!cues.length) return evidence;
  const cue = cues.join('；');
  if (!evidence) return `${cue}。`;
  return evidence.replace(/。\s*$/, '') + `；${cue}。`;
}

function appendEngagementTimingCue(evidence, s) {
  if (!s.timingFeatures) return evidence;
  const bits = [];
  if (s.cappedActiveEnough) {
    bits.push('封顶后活跃段时长可观');
  }
  // 节奏偏快只作说明，明确不作高投入加分
  if (s.rapidOpsHint) {
    bits.push('启动/调参-动作偏快（不作高投入依据）');
  }
  if (!bits.length) return evidence;
  const cue = bits.join('；');
  if (!evidence) return `${cue}。`;
  return evidence.replace(/。\s*$/, '') + `；${cue}。`;
}

function mapProblemSolving(s) {
  if (!s.touchedChallenge && s.rRaw == null && !s.won && !s.exhaustedFail) {
    return dim('problemSolving', LEVELS.INSUFFICIENT, '本局未见竞赛/挑战段结果证据。', []);
  }
  const pcOk = s.pcRaw != null && s.pcRaw >= 55;
  const pcHigh = s.pcRaw != null && s.pcRaw >= 70;
  const effOk = s.eRaw != null && s.eRaw >= 50;
  const processClear = s.processBand === '清楚' || s.processGate;
  const kindsBase = [];
  if (s.rRaw != null || s.won || s.exhaustedFail) kindsBase.push('result');
  if (s.pcRaw != null) kindsBase.push('pc');
  if (s.challengeTrials > 0) kindsBase.push('trials');
  if (s.terminalOutcome || s.isTerminal) kindsBase.push('terminal');
  if (s.hasMultiTrap || s.hasBypassGap) kindsBase.push('gaps');
  const timingKinds = (s.rushActionHint || s.denseTuneHint) ? ['timing'] : [];

  if (s.won && (pcOk || effOk || processClear || s.challengeTrials >= 2)) {
    const bit = pcHigh ? '竞赛过程较扎实' : (effOk ? '效率尚可' : '已通关并有过程记录');
    return dim(
      'problemSolving',
      LEVELS.STRONG,
      appendRushActionCue(`竞赛通关且${bit}，问题解决倾向偏强。`, s),
      [...kindsBase, ...timingKinds],
    );
  }
  if (s.won && s.challengeTrials <= 1 && !pcOk) {
    return dim(
      'problemSolving',
      LEVELS.MODERATE,
      appendRushActionCue('虽通关但挑战过程证据偏薄（或偏幸运），暂标一般。', s),
      [...kindsBase, ...timingKinds],
    );
  }
  if (s.exhaustedFail && (s.hasMultiTrap || (s.pcRaw != null && s.pcRaw < 40) || s.challengeTrials >= 3)) {
    return dim(
      'problemSolving',
      LEVELS.WEAK,
      appendRushActionCue('挑战未通关且过程收敛不足，问题解决倾向待加强。', s),
      [...kindsBase, ...timingKinds],
    );
  }
  if (s.touchedChallenge || s.rRaw != null || s.exhaustedFail) {
    const why = s.exhaustedFail
      ? '机会用尽未通关'
      : (pcOk ? '竞赛过程有一定质量但未通关' : '已进入挑战段');
    return dim(
      'problemSolving',
      LEVELS.MODERATE,
      appendRushActionCue(`${why}，问题解决表现为一般。`, s),
      [...kindsBase, ...timingKinds],
    );
  }
  return dim('problemSolving', LEVELS.INSUFFICIENT, '问题解决证据不足。', kindsBase);
}

function mapEngagement(s) {
  const activeEnough = s.eventCount >= 12
    || (s.exploreTrials + s.challengeTrials) >= 3
    || s.dualMode
    || s.cappedActiveEnough;
  const kindsBase = [];
  if (s.eventCount > 0) kindsBase.push('events');
  if (s.dualMode) kindsBase.push('dual');
  if (s.isTerminal) kindsBase.push('terminal');
  if (s.exploreTrials + s.challengeTrials > 0) kindsBase.push('trials');
  if (s.timingFeatures) kindsBase.push('timing');

  if (!s.touchedExplore && !s.touchedChallenge && s.eventCount < 3
    && s.peRaw == null && s.pcRaw == null) {
    return dim('engagement', LEVELS.INSUFFICIENT, '几乎无有效操作记录，学习投入证据不足。', kindsBase);
  }
  // 时间仅作辅证：封顶后段时长支撑双模/终局，不因超长挂机 gap 抬档
  if (s.dualMode && s.isTerminal && activeEnough) {
    return dim('engagement', LEVELS.STRONG, appendEngagementTimingCue('探究与竞赛双模均有参与且本局已终局，行为投入偏强。', s), kindsBase);
  }
  if (s.dualMode && activeEnough) {
    return dim('engagement', LEVELS.STRONG, appendEngagementTimingCue('探究与竞赛双模均有参与，行为投入偏强。', s), kindsBase);
  }
  if (!s.isTerminal && s.eventCount > 0 && s.eventCount < 12
    && !s.dualMode && (s.exploreTrials + s.challengeTrials) <= 1
    && !s.cappedActiveEnough) {
    return dim('engagement', LEVELS.WEAK, '未终局且操作偏少，行为投入倾向待加强。', kindsBase);
  }
  if (s.isTerminal || s.dualMode || activeEnough) {
    const bits = [];
    if (s.dualMode) bits.push('双模参与');
    else if (s.touchedExplore) bits.push('有探究参与');
    else if (s.touchedChallenge) bits.push('有竞赛参与');
    if (s.isTerminal) bits.push('已终局');
    return dim('engagement', LEVELS.MODERATE, appendEngagementTimingCue(`${bits.join('、') || '有一定操作'}，学习投入表现为一般。`, s), kindsBase);
  }
  return dim('engagement', LEVELS.MODERATE, appendEngagementTimingCue('有少量过程记录，学习投入暂标一般。', s), kindsBase);
}

/**
 * @param {object} input
 * @returns {{ version: number, audience: string, disclaimer: string, dimensions: object[], computedAt: string }}
 */
function computeLiteracyProfile(input) {
  const s = collectSignals(input || {});
  const dimensions = [
    mapInquiry(s),
    mapReasoning(s),
    mapProblemSolving(s),
    mapEngagement(s),
  ];
  const profile = {
    version: LITERACY_PROFILE_VERSION,
    audience: LITERACY_AUDIENCE,
    disclaimer: DISCLAIMER,
    dimensions,
    computedAt: new Date().toISOString(),
  };
  if (s.timingFeatures) profile.timingFeatures = s.timingFeatures;
  return profile;
}

/** Convenience: pull fields from a persisted session row. */
function computeLiteracyProfileFromSession(session, extras) {
  const extra = extras || {};
  if (!session || typeof session !== 'object') {
    return computeLiteracyProfile(extra);
  }
  return computeLiteracyProfile({
    abilityScore: extra.abilityScore || session.abilityScore || null,
    judgeResult: extra.judgeResult || session.judgeResult || null,
    strategyPathSummary: session.strategyPathSummary || null,
    strategyPathSummaryExplore: session.strategyPathSummaryExplore || null,
    strategyPathByPhase: session.strategyPathByPhase || null,
    pathByPhase: extra.pathByPhase || null,
    terminalOutcome: extra.terminalOutcome || session.terminalOutcome || null,
    currentPhase: extra.currentPhase || session.currentPhase || null,
    sawPhaseChange: extra.sawPhaseChange,
    eventCount: extra.eventCount != null ? extra.eventCount : session.eventCount,
    timingFeatures: extra.timingFeatures || session.timingFeatures || null,
  });
}

function looksLikeLiteracyProfile(obj) {
  return !!(obj && typeof obj === 'object' && Array.isArray(obj.dimensions));
}

function looksLikeSessionRow(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (looksLikeLiteracyProfile(obj) && !obj.abilityScore && !obj.judgeResult && !obj.sessionId) {
    return false;
  }
  return !!(obj.abilityScore || obj.judgeResult || obj.sessionId
    || obj.terminalOutcome || obj.strategyPathSummary || obj.strategyPathByPhase
    || obj.eventCount != null || obj.literacyProfile);
}

/**
 * 众数优先；并列时取更弱档（谨慎），避免「永远偏强」。
 * @param {string[]} levels
 * @returns {string}
 */
function mergeLevelsCautiousMode(levels) {
  const list = (Array.isArray(levels) ? levels : [])
    .map(String)
    .filter((lv) => lv in LEVEL_RANK);
  if (!list.length) return LEVELS.INSUFFICIENT;
  const counts = Object.create(null);
  for (const lv of list) counts[lv] = (counts[lv] || 0) + 1;
  let best = list[0];
  let bestCount = counts[best] || 0;
  for (const lv of Object.keys(counts)) {
    const c = counts[lv];
    if (c > bestCount) {
      best = lv;
      bestCount = c;
      continue;
    }
    if (c === bestCount && (LEVEL_RANK[lv] ?? 0) < (LEVEL_RANK[best] ?? 0)) {
      best = lv;
    }
  }
  return best;
}

/**
 * Normalize sessions | profiles | { literacyProfile } into profile entries (newest-first preferred).
 * @param {Array<object>} sessionsOrProfiles
 * @returns {{ profile: object, sessionId: string|null }[]}
 */
function normalizeLiteracyInputs(sessionsOrProfiles) {
  const list = Array.isArray(sessionsOrProfiles) ? sessionsOrProfiles : [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    if (looksLikeLiteracyProfile(item) && !item.literacyProfile) {
      out.push({ profile: item, sessionId: item.sessionId || null });
      continue;
    }
    if (item.literacyProfile && looksLikeLiteracyProfile(item.literacyProfile)
      && !looksLikeSessionRow(item)) {
      out.push({
        profile: item.literacyProfile,
        sessionId: item.sessionId || item.literacyProfile.sessionId || null,
      });
      continue;
    }
    if (looksLikeSessionRow(item)) {
      const profile = item.literacyProfile && looksLikeLiteracyProfile(item.literacyProfile)
        ? item.literacyProfile
        : computeLiteracyProfileFromSession(item);
      out.push({ profile, sessionId: item.sessionId || null });
      continue;
    }
    if (looksLikeLiteracyProfile(item)) {
      out.push({ profile: item, sessionId: null });
    }
  }
  return out;
}

function pickDimSample(profile, dimId) {
  const d = (profile?.dimensions || []).find((x) => x && x.id === dimId);
  if (!d) return null;
  return {
    level: d.level || LEVELS.INSUFFICIENT,
    evidence: String(d.evidence || '').trim(),
    evidenceDetail: String(d.evidenceDetail || d.evidence || '').trim(),
    evidenceKinds: Array.isArray(d.evidenceKinds) ? d.evidenceKinds.slice() : [],
    evidenceKindsLabel: String(d.evidenceKindsLabel || '').trim(),
    evidenceInsufficient: d.evidenceInsufficient === true
      || d.level === LEVELS.INSUFFICIENT,
    levelLabel: d.levelLabel || LEVEL_LABELS_ZH[d.level] || d.level,
  };
}

/**
 * 近阶段依据句：注明「基于 N 局」，并概括最近一局有证据的表述。
 */
function summarizeAggregatedEvidence(samples, level, sessionCount) {
  const n = Number(sessionCount) || samples.length || 0;
  const prefix = n > 0 ? `近阶段（基于 ${n} 局）` : '近阶段';
  if (level === LEVELS.INSUFFICIENT) {
    return {
      evidence: `${prefix}：该维暂无足够过程证据。`,
      evidenceDetail: `${prefix}：证据不足。该维暂无足够过程证据。`,
      evidenceKinds: [],
      evidenceKindsLabel: '',
    };
  }
  const withText = samples.filter((s) => s.evidence && s.level !== LEVELS.INSUFFICIENT);
  const pool = withText.length ? withText : samples.filter((s) => s.evidence);
  const latest = pool.length ? pool[0] : null;
  const kindSet = new Set();
  for (const s of pool) {
    for (const k of (s.evidenceKinds || [])) kindSet.add(k);
  }
  const evidenceKinds = [...kindSet];
  const kindsLabel = evidenceKinds
    .map((k) => EVIDENCE_KIND_LABELS[k] || k)
    .join(' · ');
  if (latest?.evidence) {
    const clipped = latest.evidence.replace(/。\s*$/, '');
    const evidence = `${prefix}：${clipped}。`;
    const detailBase = latest.evidenceDetail
      ? `${prefix}：${String(latest.evidenceDetail).replace(/。\s*$/, '')}。`
      : evidence;
    return {
      evidence,
      evidenceDetail: kindsLabel
        ? `${detailBase.replace(/。\s*$/, '')}（聚合依据类型：${kindsLabel}）。`
        : detailBase,
      evidenceKinds,
      evidenceKindsLabel: kindsLabel,
    };
  }
  const label = LEVEL_LABELS_ZH[level] || level;
  const evidence = `${prefix}：综合近局表现为${label}。`;
  return {
    evidence,
    evidenceDetail: kindsLabel
      ? `${evidence.replace(/。\s*$/, '')}（聚合依据类型：${kindsLabel}）。`
      : evidence,
    evidenceKinds,
    evidenceKindsLabel: kindsLabel,
  };
}

/**
 * 学生级聚合：多局 literacyProfile → studentLiteracyProfile。
 *
 * 调用方宜传入与综合分/雷达同源的代表局（各任务最近 1–2 局终局），或按维已筛选的有证据局。
 * 合并规则（cautious_mode）：每维取众数；并列取更弱档；有非「证据不足」样本时忽略不足档再投票。
 *
 * @param {Array<object>} sessionsOrProfiles
 * @param {object} [opts]
 * @returns {object} studentLiteracyProfile
 */
function aggregateLiteracyProfiles(sessionsOrProfiles, opts) {
  const options = opts || {};
  const entries = normalizeLiteracyInputs(sessionsOrProfiles);
  const sessionCount = entries.length;
  const dimensions = DIMENSIONS_META.map((meta) => {
    const samples = [];
    for (const e of entries) {
      const s = pickDimSample(e.profile, meta.id);
      if (s) samples.push(s);
    }
    if (!samples.length) {
      return dim(
        meta.id,
        LEVELS.INSUFFICIENT,
        sessionCount
          ? `近阶段（基于 ${sessionCount} 局）：该维暂无足够过程证据。`
          : '近阶段暂无过程证据。',
        [],
      );
    }
    const usable = samples.filter((s) => s.level !== LEVELS.INSUFFICIENT);
    const pool = usable.length ? usable : samples;
    const level = mergeLevelsCautiousMode(pool.map((s) => s.level));
    const summarized = summarizeAggregatedEvidence(pool, level, sessionCount);
    const row = dim(meta.id, level, summarized.evidence, summarized.evidenceKinds);
    if (summarized.evidenceDetail) row.evidenceDetail = summarized.evidenceDetail;
    if (summarized.evidenceKindsLabel) row.evidenceKindsLabel = summarized.evidenceKindsLabel;
    return row;
  });

  return {
    version: LITERACY_PROFILE_VERSION,
    audience: LITERACY_AUDIENCE,
    scope: 'student',
    disclaimer: options.disclaimer || STUDENT_DISCLAIMER,
    aggregation: {
      strategy: AGGREGATION_STRATEGY,
      strategyLabel: AGGREGATION_STRATEGY_LABEL,
      sessionCount,
    },
    dimensions,
    computedAt: new Date().toISOString(),
  };
}

const api = {
  LITERACY_PROFILE_VERSION,
  LITERACY_AUDIENCE,
  DISCLAIMER,
  STUDENT_DISCLAIMER,
  LEVELS,
  LEVEL_LABELS_ZH,
  LEVEL_RANK,
  AGGREGATION_STRATEGY,
  AGGREGATION_STRATEGY_LABEL,
  DIMENSIONS_META,
  EVIDENCE_KIND_LABELS,
  computeLiteracyProfile,
  computeLiteracyProfileFromSession,
  mergeLevelsCautiousMode,
  aggregateLiteracyProfiles,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.LiteracyMapping = api;
}
