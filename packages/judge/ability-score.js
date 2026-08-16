/**
 * 平台能力总分 v4（教师侧排序/详情拆解；非 RL、非包内玩法分）。
 *
 * S = 0.25*R + 0.08*Er + 0.24*Pe + 0.24*Pc + 0.19*E
 * 固定权重求和：缺维（null）该项贡献 0，**不**把权重摊给其它维。
 * R = 竞赛结果（challengeResult）；Er = 探究结果（exploreResult，小权重）。
 * Er raw：none=0 / lucky=40 / solid=100；null（未探究）→ 贡献 0、不摊权重。
 * lucky 对总分弱于 solid（权重×raw：3.2 vs 8）。
 * 探究 Pe 占满分 100 中固定 24：有本局探究过程才计分，否则 +0/24。
 * 归因一致时加权和后再 +5（封顶 100）。
 *
 * v4：拆「探究结果 / 竞赛结果」；竞赛结果仅看竞赛段（禁止用探究 win / explore_success 顶替）；
 * 探究结果 = none/lucky/solid（探究段 explore_success，兼容旧轨迹 win/winOk × 探究过程门闩）。
 * 向后兼容：parts.result / bands.result 仍写出，语义 = 竞赛结果。
 *
 * v3 相对 v2：取消 renorm；无 phase_change 不再整局算探究；Pe 永不抬高 R/Pc/E。
 *
 * 过程档（option B）：由 Pe/Pc/processGate/cvOver/trap 映射为
 * 清楚 / 部分清楚 / 尚不清晰 / 未评估。
 */

const { scoreTraceStrategy } = require('./strategy-segment-score');
const {
  filterEventsByChallengePhase,
  filterEventsByExplorePhase,
  resolveStrategyPathScoreScope,
} = require('./trace-normalize');

const ABILITY_SCORE_VERSION = 4;

/** 幸运一发：E 上限与总分软封顶 */
const LUCKY_ONESHOT_E = 25;
const LUCKY_ONESHOT_TOTAL_CAP = 62;

/** 探究结果展示分：none→0（有探究操作）或 null（未探究）；lucky / solid */
const EXPLORE_RESULT_LUCKY = 40;
const EXPLORE_RESULT_SOLID = 100;

const ABILITY_SCORE_WEIGHTS = Object.freeze({
  /** 竞赛结果 */
  R: 0.25,
  /** 探究结果（小权重；lucky/solid 靠 raw 拉开） */
  Er: 0.08,
  Pe: 0.24,
  Pc: 0.24,
  E: 0.19,
});

/** 归因一致 → 加权和后扁平加分（封顶 100）；无归因不罚 */
const ATTRIBUTION_BONUS = 5;

const DEFAULT_CANNON_LEVELS = 4;

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function isTuningOrFire(e) {
  return e?.type === 'tuning' || e?.type === 'action';
}

function countOps(events) {
  return (events || []).filter(isTuningOrFire).length;
}

/** 竞赛通关：仅 win / snapshot.winOk；不认 explore_success */
function hasWin(events) {
  return (events || []).some(e => e.type === 'win' || (e.type === 'snapshot' && e.payload?.winOk));
}

/**
 * 探究达成：优先 explore_success（主口径）。
 * 兼容旧轨迹探究段 win / snapshot.winOk（deprecated，新产品勿再发）。
 * 勿用于竞赛结果。
 */
function hasExploreSuccess(events) {
  return (events || []).some((e) => {
    if (e?.type === 'explore_success') return true;
    if (e?.type === 'win') return true;
    if (e?.type === 'snapshot' && e.payload?.winOk) return true;
    return false;
  });
}

function hasAttemptsExhausted(events) {
  return (events || []).some((e) => {
    if (e?.type === 'attempts_exhausted') return true;
    if (e?.type === 'snapshot' && e?.payload) {
      if (e.payload.attemptsExhausted === true) return true;
      if (e.payload.hintKey === 'attempts_exhausted') return true;
    }
    return false;
  });
}

function listAvControls(chapter) {
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const fromScript = avs.map(a => a.controlId).filter(Boolean);
  if (fromScript.length) return [...new Set(fromScript)];
  const controls = chapter?.traceMap?.controls || {};
  return Object.entries(controls)
    .filter(([, m]) => m?.role === 'operation')
    .map(([id]) => id);
}

/**
 * 多关进度：优先 payload.levelsCleared / interim+至多一个 final；
 * 无旗标时回退为 legacy win / winOk 次数（大炮真实轨迹常只有 {winOk:true}）。
 * 自由要塞额外 final 不叠加（封顶 levelsTotal）。
 * @returns {{ multiLevel: boolean, levelsCleared: number, levelsTotal: number } | null}
 */
function detectMultiLevelProgress(events, opts = {}) {
  const list = events || [];
  const wins = list.filter(e => e.type === 'win');
  const winOkSnaps = list.filter(e => e.type === 'snapshot' && e.payload?.winOk);
  const flagSources = wins.length ? wins : winOkSnaps;
  const hasFlags = flagSources.some(
    e => e.payload?.interim === true || e.payload?.final === true,
  );
  const pkg = String(opts.packageId || opts.graphId || '');
  const forced = opts.multiLevel === true || opts.levelsTotal != null;
  const isCannon = /projectile-cannon|cannon/i.test(pkg);
  // 非大炮且无多关旗标/强制：保持单关 R
  if (!hasFlags && !forced && !isCannon) return null;

  const levelsTotal = Number(opts.levelsTotal) > 0
    ? Math.round(Number(opts.levelsTotal))
    : DEFAULT_CANNON_LEVELS;

  const fromPayload = [...wins, ...winOkSnaps]
    .map(e => e.payload?.levelsCleared)
    .filter(n => Number.isFinite(n))
    .pop();
  if (fromPayload != null) {
    return {
      multiLevel: true,
      levelsCleared: clamp(Math.round(fromPayload), 0, levelsTotal),
      levelsTotal,
    };
  }

  // level / levelIndex：取挑战阶段最大关号（1-based）；0-based 则 +1
  const levelNums = [...wins, ...winOkSnaps]
    .map(e => e.payload?.level ?? e.payload?.levelIndex)
    .filter(n => Number.isFinite(Number(n)))
    .map(Number);
  if (levelNums.length) {
    const maxLv = Math.max(...levelNums);
    const cleared = maxLv >= 1 ? Math.round(maxLv) : Math.round(maxLv) + 1;
    return {
      multiLevel: true,
      levelsCleared: clamp(cleared, 0, levelsTotal),
      levelsTotal,
    };
  }

  if (hasFlags) {
    const interimCount = flagSources.filter(e => e.payload?.interim === true).length;
    const hasFinal = flagSources.some(
      e => e.payload?.final === true && e.payload?.interim !== true,
    );
    const levelsCleared = clamp(interimCount + (hasFinal ? 1 : 0), 0, levelsTotal);
    return { multiLevel: true, levelsCleared, levelsTotal };
  }

  // Legacy：无 interim/final 时，按 win 次数计关；无 win 则用 winOk snapshot。
  // 同一关常成对 emit snapshot+win → 优先 win，避免双计。
  const legacyClears = wins.length > 0 ? wins.length : winOkSnaps.length;
  return {
    multiLevel: true,
    levelsCleared: clamp(legacyClears, 0, levelsTotal),
    levelsTotal,
  };
}

function computeResultRaw(events, opts = {}) {
  const verdict = opts.verdict || null;
  const won = hasWin(events) || verdict === 'pass';
  const exhausted = !!opts.attemptsExhausted || hasAttemptsExhausted(events);

  const progress = detectMultiLevelProgress(events, opts);
  if (progress?.multiLevel) {
    // 多关：cleared==0 且无 win → R=0（不因 ambiguous pass 虚抬）；
    // legacy 单条无旗标 win → 至多 1/N（通常 R=25），不发明高 R。
    const fullyCleared = progress.levelsTotal > 0
      && progress.levelsCleared >= progress.levelsTotal;
    if (fullyCleared || won) {
      const raw = progress.levelsTotal > 0
        ? round1(100 * progress.levelsCleared / progress.levelsTotal)
        : 100;
      return {
        raw,
        note: `多关 ${progress.levelsCleared}/${progress.levelsTotal}`,
        progress,
        pending: false,
      };
    }
    if (exhausted) {
      const raw = progress.levelsTotal > 0
        ? round1(100 * progress.levelsCleared / progress.levelsTotal)
        : 0;
      return {
        raw,
        note: `机会用尽 · 多关 ${progress.levelsCleared}/${progress.levelsTotal}`,
        progress,
        pending: false,
        attemptsExhausted: true,
      };
    }
    // 未终局：过程可预览，结果未完成
    return {
      raw: null,
      note: `未完成/进行中 · 多关 ${progress.levelsCleared}/${progress.levelsTotal}`,
      progress,
      pending: true,
    };
  }

  const judged = opts.judged != null ? !!opts.judged : !!verdict;
  const ops = countOps(events);

  if (won || verdict === 'pass') {
    return { raw: 100, note: '过关', progress: null, pending: false };
  }
  // 未达标仅机会用尽：结果分落盘，非 pending
  if (exhausted) {
    if (ops <= 0) {
      return { raw: 0, note: '机会用尽（几乎无操作）', progress: null, pending: false, attemptsExhausted: true };
    }
    return { raw: 20, note: '机会用尽未过关', progress: null, pending: false, attemptsExhausted: true };
  }
  // 非终局（含 in_progress / learning / 未评判）：结果未完成
  if (!judged || verdict === 'in_progress' || verdict === 'learning' || verdict == null) {
    return { raw: null, note: '未完成/进行中', progress: null, pending: true };
  }
  // 已评判但非过关且非机会用尽 → 仍视为未终局（不再当未达标）
  return { raw: null, note: '未完成（非终局）', progress: null, pending: true };
}

function phaseHasOps(events) {
  return (events || []).some(isTuningOrFire);
}

function applyExploreAdjustments(raw100, scoreResult, parameterCoverage) {
  let raw = raw100;
  const bd = scoreResult?.breakdown || {};
  const kind = bd.switchKind || scoreResult?.switchKind;
  const trials = bd.effectiveTrials ?? 0;
  if (kind === 'explore_converge') raw += 5;
  if (kind === 'thrash') raw -= 10;
  if (
    parameterCoverage != null
    && Number.isFinite(parameterCoverage)
    && parameterCoverage < 0.35
    && trials >= 2
  ) {
    raw -= 8;
  }
  return clamp(raw, 0, 100);
}

function applyChallengeAdjustments(raw100, scoreResult) {
  let raw = raw100;
  const bd = scoreResult?.breakdown || {};
  const primary = String(scoreResult?.primaryStrategy || bd.dominantLabel || '');
  const kind = bd.switchKind || scoreResult?.switchKind;
  const trials = bd.effectiveTrials ?? 0;
  const trap = /盲调|多参|trap/i.test(primary);
  const cvOver = !!bd.cvOver || !!bd.cvRaised;

  if (kind === 'explore_converge') raw += 5;
  if (cvOver) raw = Math.min(raw, 55);
  if (trap && trials >= 1) raw = Math.min(raw, 50);
  return clamp(raw, 0, 100);
}

function scorePhaseProcess(events, chapter, mode) {
  if (!phaseHasOps(events)) {
    return {
      raw: null,
      strategyScore: null,
      primary: null,
      switchKind: null,
      cvOver: false,
      trap: false,
      effectiveTrials: 0,
      scoreResult: null,
    };
  }
  const scoreResult = scoreTraceStrategy(events, chapter, { mode });
  const s = scoreResult?.score;
  let raw = Number.isFinite(s) ? round1(100 * s) : null;
  if (raw == null) {
    return {
      raw: null,
      strategyScore: null,
      primary: null,
      switchKind: null,
      cvOver: false,
      trap: false,
      effectiveTrials: 0,
      scoreResult,
    };
  }
  const bd = scoreResult.breakdown || {};
  const primary = scoreResult.primaryStrategy || null;
  const trap = /盲调|多参|trap/i.test(String(primary || ''));
  if (mode === 'explore') {
    raw = applyExploreAdjustments(raw, scoreResult, null);
  } else {
    raw = applyChallengeAdjustments(raw, scoreResult);
  }
  return {
    raw: round1(raw),
    strategyScore: s,
    primary,
    switchKind: bd.switchKind || scoreResult.switchKind || null,
    cvOver: !!bd.cvOver || !!bd.cvRaised,
    trap,
    effectiveTrials: bd.effectiveTrials ?? 0,
    scoreResult,
  };
}

function computeProcessGate(pe, pc) {
  const peOk = pe.raw != null && pe.raw >= 60;
  const pcOk = pc.raw != null && pc.raw >= 60;
  const gateScore =
    (pc.raw != null && pcOk) || (pc.raw == null && pe.raw != null && peOk);
  const cvOk = !pc.cvOver;
  // 单试次多参陷阱：竞赛仅 1 有效试次且主策略多参 → 门闩失败
  const singleTrialTrap = pc.raw != null && pc.effectiveTrials === 1 && pc.trap;
  const processGate = !!(gateScore && cvOk && !singleTrialTrap);
  return {
    processGate,
    reasons: { gateScore, cvOk, singleTrialTrap },
  };
}

function efficiencyRaw(processGate, challengeTrials, exploreTrials) {
  const T = challengeTrials;
  const gate = !!processGate;
  if (T === 0) {
    // 无竞赛操作：用探究试次弱映射
    if (exploreTrials <= 0) return null;
    if (gate) {
      if (exploreTrials <= 2) return 70;
      if (exploreTrials <= 5) return 60;
      return 50;
    }
    if (exploreTrials <= 2) return 40;
    return 45;
  }
  // v2: 一发且门闩失败 → 更严（幸运碰中）
  if (T === 1) return gate ? 100 : LUCKY_ONESHOT_E;
  if (T <= 3) return gate ? 85 : 45;
  if (T <= 6) return gate ? 70 : 50;
  return gate ? 55 : 50;
}

function findLatestAttribution(events) {
  let attr = null;
  for (const e of events || []) {
    if (e.type !== 'snapshot') continue;
    const a = e.payload?.attribution;
    if (a != null && String(a).trim()) attr = String(a).trim();
  }
  return attr;
}

/**
 * 归因与会话主导 AV / 证据一致 → 小奖励。
 * mixed/unsure 或无归因 → 不加不罚。
 */
function evaluateAttributionBonus(events, chapter, preferScore, fallbackScore) {
  const attribution = findLatestAttribution(events);
  if (!attribution) {
    return { raw: 0, contrib: 0, attribution: null, aligned: false, note: '无归因事件' };
  }
  if (attribution === 'mixed' || attribution === 'unsure') {
    return { raw: 0, contrib: 0, attribution, aligned: false, note: '归因未指向单变量' };
  }

  const scoreResult = preferScore?.scoreResult || fallbackScore?.scoreResult || null;
  const primary = String(
    scoreResult?.primaryStrategy
    || scoreResult?.breakdown?.dominantLabel
    || preferScore?.primary
    || fallbackScore?.primary
    || '',
  );
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const hit = avs.find(a => a.controlId === attribution)
    || (listAvControls(chapter).includes(attribution)
      ? { controlId: attribution, label: attribution }
      : null);

  if (!hit) {
    return { raw: 0, contrib: 0, attribution, aligned: false, note: '归因控件未识别为 AV' };
  }

  const label = String(hit.label || '');
  const aligned = !!(
    primary
    && (
      (label && primary.includes(label))
      || primary.includes(hit.controlId)
      || primary.includes(attribution)
    )
  );

  // 证据摘要提及同一控件也算对齐
  let evidenceHit = false;
  for (const e of events || []) {
    if (e.type !== 'snapshot' || !e.payload?.evidenceSummary) continue;
    const es = String(e.payload.evidenceSummary);
    if (es.includes(hit.controlId) || (label && es.includes(label))) evidenceHit = true;
  }

  const ok = aligned || (evidenceHit && /单变量/.test(primary));
  if (ok) {
    return {
      raw: ATTRIBUTION_BONUS,
      contrib: ATTRIBUTION_BONUS,
      attribution,
      aligned: true,
      note: '归因与主导 AV/证据一致 +5',
    };
  }
  return { raw: 0, contrib: 0, attribution, aligned: false, note: '归因与主导路径不一致（不加分）' };
}

/**
 * v1/v2 遗留：缺维时对非 null 权重归一。v3 主路径已不用；保留供对照/迁移。
 */
function renormWeightedSum(parts, weights) {
  const keys = ['R', 'Er', 'Pe', 'Pc', 'E'];
  let wSum = 0;
  const active = [];
  for (const k of keys) {
    if (parts[k] != null && Number.isFinite(parts[k])) {
      wSum += weights[k];
      active.push(k);
    }
  }
  if (!active.length || wSum <= 0) return null;
  let s = 0;
  for (const k of active) {
    s += (weights[k] / wSum) * parts[k];
  }
  return s;
}

/**
 * v3/v4 固定权重：S = Σ w_i * raw_i；缺维跳过（贡献 0），不抬高其它维。
 * raw 为 0–100；w 为份额（如 0.25 → 满分贡献 25）。
 */
function fixedWeightedSum(parts, weights) {
  const keys = ['R', 'Er', 'Pe', 'Pc', 'E'];
  let any = false;
  let s = 0;
  for (const k of keys) {
    if (parts[k] != null && Number.isFinite(parts[k])) {
      s += weights[k] * parts[k];
      any = true;
    }
  }
  return any ? s : null;
}

function mapProcessBand({ pe, pc, processGate, total, pending }) {
  const peRaw = pe?.raw;
  const pcRaw = pc?.raw;
  const bothNull = peRaw == null && pcRaw == null;
  const trials = (pe?.effectiveTrials || 0) + (pc?.effectiveTrials || 0);
  if (total == null && pending) return '未评估';
  if (bothNull || (trials <= 0 && bothNull)) return '未评估';
  if (peRaw == null && pcRaw == null) return '未评估';

  const available = [peRaw, pcRaw].filter(v => v != null);
  const minP = available.length ? Math.min(...available) : null;
  const severe = !!(pc?.cvOver || pc?.trap || pe?.trap);
  const low = available.some(v => v < 45) || (severe && !processGate);

  if (low || (severe && minP != null && minP < 60)) {
    return '尚不清晰';
  }
  if (processGate && minP != null && minP >= 75 && !pc?.cvOver && !pc?.trap) {
    // 无探究（Pe null）时：竞赛一发过高易被标「清楚」→ 要求竞赛试次≥2
    if (peRaw == null && (pc?.effectiveTrials || 0) < 2) {
      return '部分清楚';
    }
    return '清楚';
  }
  return '部分清楚';
}

/**
 * 结果三态（冻结口径）：
 * - 达标：过关 / win / 多关全清
 * - 未达标：仅机会用尽且未过关
 * - 未完成：其余（含 in_progress / learning / 中途离开；非终局）
 */
function mapResultBand(resultPart, verdict, pending, opts = {}) {
  const won = !!opts.won || verdict === 'pass'
    || (resultPart?.raw != null && resultPart.raw >= 100)
    || (resultPart?.progress
      && resultPart.progress.levelsTotal > 0
      && resultPart.progress.levelsCleared >= resultPart.progress.levelsTotal);
  if (won) return '达标';

  const exhausted = !!opts.attemptsExhausted || !!resultPart?.attemptsExhausted;
  if (exhausted) return '未达标';

  return '未完成';
}

/**
 * 探究过程门闩（对齐竞赛幸运一发）：Pe 够格、有效试次≥2、非混调/thrash。
 * 仅用于探究结果 solid vs lucky，不写入竞赛结果。
 */
function computeExploreResultGate(pe) {
  const peOk = pe?.raw != null && pe.raw >= 60;
  const trials = pe?.effectiveTrials || 0;
  const trialsOk = trials >= 2;
  const notMuddy = !pe?.trap && pe?.switchKind !== 'thrash';
  const ok = !!(peOk && trialsOk && notMuddy);
  return {
    ok,
    reasons: { peOk, trialsOk, notMuddy, trials },
  };
}

/**
 * 探究结果：none / lucky / solid。
 * - 无分段或未探究操作 → raw null（不进均值）
 * - 有探究操作但无探究达成（explore_success；兼容旧 win/winOk）→ raw 0（none）
 * - 有探究达成但过程门闩失败 → lucky=40
 * - 达成且门闩通过 → solid=100
 * 禁止用本结果填竞赛结果；竞赛段不认 explore_success。
 */
function computeExploreResult(exploreEvents, pe, hasPhase) {
  if (!hasPhase) {
    return {
      raw: null,
      tier: 'none',
      note: '无分段·不计探究结果',
      gate: false,
      gateReasons: null,
    };
  }
  const exploreOps = phaseHasOps(exploreEvents);
  const exploreWon = hasExploreSuccess(exploreEvents);
  if (!exploreOps && !exploreWon) {
    return {
      raw: null,
      tier: 'none',
      note: '未探究',
      gate: false,
      gateReasons: null,
    };
  }
  if (!exploreWon) {
    return {
      raw: 0,
      tier: 'none',
      note: '探究未达成',
      gate: false,
      gateReasons: null,
    };
  }
  const { ok: gate, reasons: gateReasons } = computeExploreResultGate(pe);
  if (gate) {
    return {
      raw: EXPLORE_RESULT_SOLID,
      tier: 'solid',
      note: '探究扎实达成',
      gate: true,
      gateReasons,
    };
  }
  return {
    raw: EXPLORE_RESULT_LUCKY,
    tier: 'lucky',
    note: '探究幸运一发/过程不足',
    gate: false,
    gateReasons,
  };
}

function mapExploreResultBand(exploreResult) {
  const tier = exploreResult?.tier || 'none';
  if (tier === 'solid') return '扎实达成';
  if (tier === 'lucky') return '幸运一发';
  if (exploreResult?.raw == null) return null;
  return '未达成';
}

function shortPathLabel(primary, phaseKey) {
  const s = String(primary || '').trim();
  const prefix = phaseKey === 'explore' ? '探究' : (phaseKey === 'challenge' ? '竞赛' : '路径');
  if (!s) return null;
  if (/盲调|多参|trap/i.test(s)) return `${prefix}·混调`;
  if (/混淆|confound|无关/i.test(s)) return `${prefix}·混淆`;
  if (/空操作|empty/i.test(s)) return `${prefix}·观察偏少`;
  if (/单变量/.test(s)) return `${prefix}·单变量`;
  return `${prefix}·其它`;
}

function emptyPhaseProcess() {
  return {
    raw: null,
    strategyScore: null,
    primary: null,
    switchKind: null,
    cvOver: false,
    trap: false,
    effectiveTrials: 0,
    scoreResult: null,
  };
}

/**
 * @param {object} input
 * @param {object[]} input.events
 * @param {object} input.chapter
 * @param {string} [input.verdict]
 * @param {boolean} [input.judged]
 * @param {string} [input.packageId]
 * @param {string} [input.graphId]
 * @param {number} [input.levelsTotal]
 * @param {boolean} [input.multiLevel]
 * @param {object} [input.exploreScore] 可选预计算
 * @param {object} [input.challengeScore]
 */
function computeAbilityScore(input = {}) {
  const events = Array.isArray(input.events) ? input.events : [];
  const chapter = input.chapter || {};
  const weights = { ...ABILITY_SCORE_WEIGHTS };

  const attemptsExhausted = hasAttemptsExhausted(events)
    || input.attemptsExhausted === true
    || input.terminalOutcome === 'exhausted_fail';

  const hasPhase = events.some(e => e.type === 'phase_change');
  let exploreEvents;
  let challengeEvents;
  if (hasPhase) {
    exploreEvents = filterEventsByExplorePhase(events);
    challengeEvents = filterEventsByChallengePhase(events);
  } else {
    // 无分段 → 不把整局当探究；Pe/Pc 皆不计过程块
    exploreEvents = [];
    challengeEvents = [];
  }

  // 竞赛结果用相位过滤后的完整竞赛段（含仅 win、无 tuning 的多关局）；勿被过程评分清空
  const challengeEventsForResult = hasPhase ? challengeEvents.slice() : events;

  // 有分段时用 resolve 校验竞赛段；无分段不抬竞赛过程（仅影响 Pc，不影响竞赛结果）
  if (hasPhase) {
    const challengeScope = resolveStrategyPathScoreScope(events, { phaseScope: 'challenge' });
    if (challengeScope.scoredPhase === 'challenge') {
      challengeEvents = challengeScope.events;
    } else if (!phaseHasOps(challengeEvents)) {
      challengeEvents = [];
    }
  }

  // 竞赛结果：仅竞赛段（有分段时）；禁止用探究 win / explore_success / 整局 verdict=pass 顶替
  const challengeWon = hasWin(challengeEventsForResult)
    || (!hasPhase && (input.verdict === 'pass' || hasWin(events)));
  const challengeAttemptsExhausted = hasPhase
    ? (hasAttemptsExhausted(challengeEventsForResult) || attemptsExhausted)
    : attemptsExhausted;
  const resultInfo = computeResultRaw(challengeEventsForResult, {
    // 有分段且竞赛未赢：不把整局 pass 传给结果分
    verdict: hasPhase
      ? (challengeWon ? 'pass' : (challengeAttemptsExhausted ? (input.verdict || 'learning') : null))
      : input.verdict,
    judged: hasPhase
      ? (challengeWon || challengeAttemptsExhausted || phaseHasOps(challengeEventsForResult) || !!input.judged)
      : input.judged,
    packageId: input.packageId,
    graphId: input.graphId,
    levelsTotal: input.levelsTotal,
    multiLevel: input.multiLevel,
    attemptsExhausted: challengeAttemptsExhausted && !challengeWon,
  });

  const pe = (input.exploreScore && hasPhase)
    ? hydrateFromScoreResult(input.exploreScore, 'explore')
    : scorePhaseProcess(exploreEvents, chapter, 'explore');
  const pc = (input.challengeScore && hasPhase)
    ? hydrateFromScoreResult(input.challengeScore, 'compete')
    : (hasPhase && phaseHasOps(challengeEvents)
      ? scorePhaseProcess(challengeEvents, chapter, 'compete')
      : emptyPhaseProcess());

  // 探究无有效试次 → Pe null（contrib=0；不抬高其它维）
  if ((pe.effectiveTrials || 0) <= 0) {
    pe.raw = null;
  }

  const exploreResultInfo = computeExploreResult(exploreEvents, pe, hasPhase);

  const { processGate, reasons: gateReasons } = computeProcessGate(pe, pc);
  const challengeTrials = pc.effectiveTrials || 0;
  const exploreTrials = pe.effectiveTrials || 0;
  let eRaw = efficiencyRaw(processGate, challengeTrials, exploreTrials);

  const luckyOneShot = !!(challengeWon && challengeTrials === 1 && !processGate);
  if (luckyOneShot && eRaw != null) {
    eRaw = Math.min(eRaw, LUCKY_ONESHOT_E);
  }

  const attr = evaluateAttributionBonus(events, chapter, pc.raw != null ? pc : pe, pe);

  const rawParts = {
    R: resultInfo.raw,
    Er: exploreResultInfo.raw,
    Pe: pe.raw,
    Pc: pc.raw,
    E: eRaw,
  };

  let weighted = fixedWeightedSum(rawParts, weights);
  // 竞赛结果未完成且未通关：列表显示「—」（探究 win 不解除 pending）
  // 机会用尽失败是终局，不算 incompletePending
  const incompletePending = !!resultInfo.pending
    && resultInfo.raw == null
    && !challengeWon
    && !challengeAttemptsExhausted;

  // 两端皆无有效过程试次且结果也空 → total null
  let total = null;
  if (!incompletePending) {
    if (weighted != null) {
      total = clamp(Math.round(weighted + (attr.aligned ? ATTRIBUTION_BONUS : 0)), 0, 100);
    } else if (resultInfo.raw != null && eRaw == null && pe.raw == null && pc.raw == null) {
      // 仅有竞赛结果、无过程：固定权重下只拿 R（+ 若有 Er）份额（不再 renorm 成满分）
      const erPart = exploreResultInfo.raw != null && Number.isFinite(exploreResultInfo.raw)
        ? weights.Er * exploreResultInfo.raw
        : 0;
      total = clamp(Math.round(weights.R * resultInfo.raw + erPart), 0, 100);
    }
  }
  // 幸运一发总分软封顶（相对扎实一发拉开）
  if (luckyOneShot && total != null) {
    total = Math.min(total, LUCKY_ONESHOT_TOTAL_CAP);
  }

  const pending = incompletePending
    || (total == null && pe.raw == null && pc.raw == null && countOps(events) < 1);

  /** 固定权重贡献：contrib = w * raw；null → 0（名义分母不变） */
  const contrib = (raw, w) => {
    if (raw == null || !Number.isFinite(raw)) return 0;
    return round1(w * raw);
  };

  const processBand = mapProcessBand({
    pe, pc, processGate, total, pending: !!resultInfo.pending && total == null,
  });
  // 档位判定勿把整局 verdict=pass（可能来自探究 win）当成竞赛达标
  const resultBand = mapResultBand(resultInfo, challengeWon ? 'pass' : null, resultInfo.pending, {
    won: challengeWon,
    attemptsExhausted: challengeAttemptsExhausted && !challengeWon,
  });
  const exploreResultBand = mapExploreResultBand(exploreResultInfo);

  const challengeResultPart = {
    raw: resultInfo.raw,
    contrib: contrib(resultInfo.raw, weights.R),
    note: resultInfo.note,
    progress: resultInfo.progress,
  };
  const exploreResultPart = {
    raw: exploreResultInfo.raw,
    contrib: contrib(exploreResultInfo.raw, weights.Er),
    tier: exploreResultInfo.tier,
    note: exploreResultInfo.note,
    gate: exploreResultInfo.gate,
    gateReasons: exploreResultInfo.gateReasons,
  };

  return {
    version: ABILITY_SCORE_VERSION,
    total,
    pending,
    weights: { ...weights },
    parts: {
      // 兼容：result = 竞赛结果（语义收窄后）
      result: challengeResultPart,
      challengeResult: challengeResultPart,
      exploreResult: exploreResultPart,
      exploreProcess: {
        raw: pe.raw,
        contrib: contrib(pe.raw, weights.Pe),
        strategyScore: pe.strategyScore,
        primary: pe.primary,
        switchKind: pe.switchKind,
      },
      challengeProcess: {
        raw: pc.raw,
        contrib: contrib(pc.raw, weights.Pc),
        strategyScore: pc.strategyScore,
        primary: pc.primary,
        switchKind: pc.switchKind,
        cvOver: pc.cvOver,
        trap: pc.trap,
      },
      efficiency: {
        raw: eRaw,
        contrib: contrib(eRaw, weights.E),
        processGate,
        challengeTrials,
        exploreTrials,
        gateReasons,
      },
      attribution: {
        raw: attr.raw,
        contrib: attr.aligned ? ATTRIBUTION_BONUS : 0,
        attribution: attr.attribution,
        aligned: attr.aligned,
        note: attr.note,
      },
    },
    bands: {
      process: processBand,
      result: resultBand,
      challengeResult: resultBand,
      exploreResult: exploreResultBand,
    },
    labelsShort: {
      pathExplore: shortPathLabel(pe.primary, 'explore'),
      pathChallenge: shortPathLabel(pc.primary, 'challenge'),
    },
    computedAt: new Date().toISOString(),
  };
}

function hydrateFromScoreResult(scoreResult, mode) {
  if (!scoreResult || scoreResult.score == null) {
    return {
      raw: null,
      strategyScore: null,
      primary: null,
      switchKind: null,
      cvOver: false,
      trap: false,
      effectiveTrials: 0,
      scoreResult: scoreResult || null,
    };
  }
  let raw = round1(100 * scoreResult.score);
  if (mode === 'explore') raw = applyExploreAdjustments(raw, scoreResult, null);
  else raw = applyChallengeAdjustments(raw, scoreResult);
  const bd = scoreResult.breakdown || {};
  const primary = scoreResult.primaryStrategy || null;
  return {
    raw: round1(raw),
    strategyScore: scoreResult.score,
    primary,
    switchKind: bd.switchKind || scoreResult.switchKind || null,
    cvOver: !!bd.cvOver || !!bd.cvRaised,
    trap: /盲调|多参|trap/i.test(String(primary || '')),
    effectiveTrials: bd.effectiveTrials ?? 0,
    scoreResult,
  };
}

module.exports = {
  ABILITY_SCORE_VERSION,
  ABILITY_SCORE_WEIGHTS,
  ATTRIBUTION_BONUS,
  LUCKY_ONESHOT_E,
  LUCKY_ONESHOT_TOTAL_CAP,
  EXPLORE_RESULT_LUCKY,
  EXPLORE_RESULT_SOLID,
  computeAbilityScore,
  detectMultiLevelProgress,
  computeResultRaw,
  computeExploreResult,
  computeExploreResultGate,
  computeProcessGate,
  efficiencyRaw,
  mapProcessBand,
  mapResultBand,
  mapExploreResultBand,
  hasWin,
  hasExploreSuccess,
  hasAttemptsExhausted,
  evaluateAttributionBonus,
  renormWeightedSum,
  fixedWeightedSum,
  findLatestAttribution,
};
