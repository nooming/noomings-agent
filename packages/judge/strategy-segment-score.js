/**
 * 策略切段打分：按发射/测试切段，按 routes[].score 加权，禁止「最后一发定整局」。
 *
 * S = Σ α_i * s(route_i)
 *     + β_main * 1[主策略清晰]
 *     - λ_switch * N_switch_eff   （按 switchKind 调节有效切换惩罚）
 *     - λ_cv * f(N_cv)
 *     + β_probe * 1[偶尔探测 CV]
 *     + β_converge * 1[探索收敛且后期清晰]
 *
 * 换向感知（switchKind）：
 *   - focused_redirect：连续块聚焦换向（轻惩罚）
 *   - explore_converge：早期陷阱/CV → 后期单变量（软惩罚 / 小奖励）
 *   - thrash：散乱横跳（保留/加强切换惩罚）
 *   - stable / unknown
 *
 * 探究模式更宽容切换/CV；竞赛模式更严多参/乱切/拧 CV。
 * 「两 AV 之间切换」≠ 陷阱；陷阱仍是同一试次内多 AV。
 */

const { isTrapRoute } = require('./coupled-invalid');

const MODE = {
  explore: {
    mainClarityBonus: 0.06,
    mainClarityThreshold: 0.5,
    switchPenalty: 0.025,
    cvOverPenalty: 0.12,
    cvProbeBonus: 0.025,
    cvProbeMax: 2,
    cvOverRatio: 0.55,
    emptyWeight: 0.15,
    confoundWeight: 0.25,
    redirectSwitchFactor: 0.3,
    convergeSwitchFactor: 0.45,
    thrashSwitchFactor: 1.15,
    convergeClarityBonus: 0.02,
    convergeLateShare: 0.6,
  },
  compete: {
    mainClarityBonus: 0.08,
    mainClarityThreshold: 0.65,
    switchPenalty: 0.07,
    cvOverPenalty: 0.22,
    cvProbeBonus: 0.0,
    cvProbeMax: 1,
    cvOverRatio: 0.35,
    emptyWeight: 0.1,
    confoundWeight: 0.15,
    redirectSwitchFactor: 0.3,
    convergeSwitchFactor: 0.5,
    thrashSwitchFactor: 1.2,
    convergeClarityBonus: 0.015,
    convergeLateShare: 0.65,
  },
};

const LABEL = {
  trap: '多参盲调',
  confound: '混淆触碰',
  empty: '空操作',
};

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function isFireLike(e) {
  if (!e) return false;
  if (e.type === 'snapshot') return true;
  if (e.type === 'win') return true;
  if (e.type === 'action') {
    const c = String(e.payload?.control || '');
    return /fire|launch|test|shot|发射|测试|卸货|btn-fire|btn_fire/i.test(c);
  }
  return false;
}

function controlRole(chapter, controlId) {
  if (!controlId) return null;
  const meta = chapter?.traceMap?.controls?.[controlId];
  if (meta?.role) return meta.role;
  return null;
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

function listCvControls(chapter) {
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const fromScript = cvs.map(c => c.controlId).filter(Boolean);
  if (fromScript.length) return [...new Set(fromScript)];
  const controls = chapter?.traceMap?.controls || {};
  return Object.entries(controls)
    .filter(([, m]) => m?.role === 'irrelevant')
    .map(([id]) => id);
}

function avLabelForControl(chapter, controlId) {
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const hit = avs.find(a => a.controlId === controlId);
  if (hit?.label) return `单变量·${hit.label}`;
  return `单变量·${controlId}`;
}

function findRouteByLabel(routes, label) {
  if (!label || !routes?.length) return null;
  const exact = routes.find(r => String(r.label || '').trim() === label);
  if (exact) return exact;
  return routes.find(r => String(r.label || '').includes(label.replace(/^单变量·/, ''))) || null;
}

function routeScoreOf(route, fallback) {
  if (route?.score != null && Number.isFinite(Number(route.score))) return Number(route.score);
  if (route?.weight != null && Number.isFinite(Number(route.weight))) return Number(route.weight);
  return fallback;
}

/**
 * 按发射/测试切段：每段 = 上次 fire 之后到本次 fire 之间的调节。
 */
function segmentTraceByFire(events, chapter) {
  const list = Array.isArray(events) ? events : [];
  const segments = [];
  let buf = [];
  let segIdx = 0;

  const flush = (fireEvent) => {
    const tunings = buf.filter(e => e.type === 'tuning' || e.type === 'irrelevant_touch');
    const label = classifySegment(tunings, chapter);
    segments.push({
      index: segIdx++,
      label,
      tunings: tunings.map(e => ({
        type: e.type,
        control: e.payload?.control,
        value: e.payload?.value,
        role: controlRole(chapter, e.payload?.control),
      })),
      fireType: fireEvent?.type || null,
      effective: label !== LABEL.empty,
    });
    buf = [];
  };

  for (const e of list) {
    if (e.type === 'tuning' || e.type === 'irrelevant_touch') {
      buf.push(e);
      continue;
    }
    if (isFireLike(e)) {
      // snapshot right after fire with empty buf is the same trial — skip empty duplicate
      if (!buf.length && e.type === 'snapshot') continue;
      flush(e);
    }
  }
  // 尾部未发射的调节不计入有效试次（避免抬高最后一拧）
  if (buf.length) {
    const tunings = buf.filter(e => e.type === 'tuning' || e.type === 'irrelevant_touch');
    if (tunings.length) {
      const label = classifySegment(tunings, chapter);
      segments.push({
        index: segIdx++,
        label,
        tunings: tunings.map(e => ({
          type: e.type,
          control: e.payload?.control,
          value: e.payload?.value,
          role: controlRole(chapter, e.payload?.control),
        })),
        fireType: null,
        effective: false,
        dangling: true,
      });
    }
  }
  return segments;
}

/**
 * @returns {'单变量·…'|'多参盲调'|'混淆触碰'|'空操作'}
 */
function classifySegment(tunings, chapter) {
  if (!tunings.length) return LABEL.empty;

  const avIds = new Set(listAvControls(chapter));
  const cvIds = new Set(listCvControls(chapter));

  const touchedAv = new Set();
  const touchedCv = new Set();
  let otherOps = 0;

  for (const e of tunings) {
    const c = e.payload?.control;
    if (!c) continue;
    const role = controlRole(chapter, c);
    if (cvIds.has(c) || role === 'irrelevant' || e.type === 'irrelevant_touch') {
      touchedCv.add(c);
      continue;
    }
    if (avIds.has(c) || role === 'operation') {
      touchedAv.add(c);
      continue;
    }
    if (role === 'action') continue;
    otherOps += 1;
  }

  if (!touchedAv.size && touchedCv.size) return LABEL.confound;
  if (!touchedAv.size && !touchedCv.size) return LABEL.empty;
  if (touchedAv.size >= 2) return LABEL.trap;
  if (touchedAv.size === 1) {
    // 主路径仍标 AV；夹杂 CV 由外层 cv 记账，不改标签成混淆
    const only = [...touchedAv][0];
    return avLabelForControl(chapter, only);
  }
  if (otherOps >= 2) return LABEL.trap;
  return LABEL.empty;
}

function countMeaningfulSwitches(segmentLabels) {
  let n = 0;
  let prev = null;
  for (const lab of segmentLabels) {
    if (!lab || lab === LABEL.empty) continue;
    if (lab === LABEL.confound) continue; // CV 旁路不算策略切换
    if (prev && prev !== lab) n += 1;
    if (lab !== LABEL.confound) prev = lab;
  }
  return n;
}

function isSingleVarLabel(lab) {
  return !!lab && /^单变量·/.test(lab);
}

/**
 * 折叠连续相同标签；跳过空操作；混淆触碰标为旁路（bypass）。
 * @returns {{ label: string, count: number, bypass: boolean }[]}
 */
function buildStrategySequence(segmentLabels) {
  const seq = [];
  for (const lab of segmentLabels) {
    if (!lab || lab === LABEL.empty) continue;
    const bypass = lab === LABEL.confound;
    if (seq.length && seq[seq.length - 1].label === lab) {
      seq[seq.length - 1].count += 1;
    } else {
      seq.push({ label: lab, count: 1, bypass });
    }
  }
  return seq;
}

function lateDominantSingleShare(effective) {
  if (!effective.length) return 0;
  const start = Math.floor(effective.length * 0.4);
  const late = effective.slice(start);
  if (!late.length) return 0;
  const weights = new Map();
  for (const seg of late) {
    if (!isSingleVarLabel(seg.label)) continue;
    weights.set(seg.label, (weights.get(seg.label) || 0) + 1);
  }
  let bestW = 0;
  for (const w of weights.values()) bestW = Math.max(bestW, w);
  return bestW / late.length;
}

/**
 * @returns {'focused_redirect'|'explore_converge'|'thrash'|'stable'|'unknown'}
 */
function classifySwitchKind(strategySequence, effective) {
  const seq = Array.isArray(strategySequence) ? strategySequence : [];
  const stratBlocks = seq.filter(b => !b.bypass);
  const earlyNoiseCount = effective
    .slice(0, Math.max(1, Math.ceil(effective.length * 0.4)))
    .filter(s => s.label === LABEL.trap || s.label === LABEL.confound).length;
  const last = stratBlocks[stratBlocks.length - 1];
  const earlierHasTrap = stratBlocks.slice(0, -1).some(b => b.label === LABEL.trap);
  const leadingBypassHeavy = seq.length > 0 && seq[0].bypass && seq[0].count >= 2;

  // 探索收敛：早期陷阱/较重 CV → 后期稳定单变量
  if (
    last &&
    isSingleVarLabel(last.label) &&
    last.count >= 2 &&
    (earlierHasTrap || leadingBypassHeavy || earlyNoiseCount >= 2)
  ) {
    return 'explore_converge';
  }

  if (stratBlocks.length <= 1) return 'stable';

  // 聚焦换向：各策略块均为单变量，且换出块长度 ≥ 2
  const allSingle = stratBlocks.every(b => isSingleVarLabel(b.label));
  const qualifiedBlocks = stratBlocks.slice(0, -1).every(b => b.count >= 2);
  if (allSingle && qualifiedBlocks) return 'focused_redirect';

  // 散乱横跳：多块且大量长度为 1 的块
  const unitBlocks = stratBlocks.filter(b => b.count === 1).length;
  const nBlockSwitch = Math.max(0, stratBlocks.length - 1);
  if (nBlockSwitch >= 2 && unitBlocks >= Math.ceil(stratBlocks.length * 0.5)) {
    return 'thrash';
  }
  // 单次短跳（如 1×A→多×B）也偏散乱
  if (nBlockSwitch >= 1 && unitBlocks >= 2 && !qualifiedBlocks) return 'thrash';

  return 'unknown';
}

function switchPenaltyForKind(switchKind, nSwitch, nBlockSwitch, C) {
  const base = C.switchPenalty;
  switch (switchKind) {
    case 'stable':
      return 0;
    case 'focused_redirect':
      return nBlockSwitch * base * (C.redirectSwitchFactor ?? 0.3);
    case 'explore_converge':
      return nSwitch * base * (C.convergeSwitchFactor ?? 0.45);
    case 'thrash':
      return nSwitch * base * (C.thrashSwitchFactor ?? 1.15);
    default:
      return nSwitch * base;
  }
}

function pickDominantSingleVar(segments) {
  const weights = new Map();
  for (const seg of segments) {
    if (!seg.effective) continue;
    if (!/^单变量·/.test(seg.label)) continue;
    weights.set(seg.label, (weights.get(seg.label) || 0) + 1);
  }
  let best = null;
  let bestW = 0;
  for (const [lab, w] of weights) {
    if (w > bestW) {
      best = lab;
      bestW = w;
    }
  }
  return { label: best, weight: bestW, total: [...weights.values()].reduce((a, b) => a + b, 0) };
}

/**
 * @param {object} opts
 * @param {'explore'|'compete'} [opts.mode]
 * @param {object} [opts.constants] 可覆盖 MODE 常数（调优用）
 */
function scoreStrategySegments(segments, chapter, opts = {}) {
  const modeName = opts.mode === 'compete' ? 'compete' : 'explore';
  const C = { ...MODE[modeName], ...(opts.constants || {}) };
  const routes = chapter?.strategy?.routes || [];
  const trapRoute = routes.find(r => isTrapRoute(r)) || null;
  const trapScore = routeScoreOf(trapRoute, 0.2);

  const effective = segments.filter(s => s.effective && !s.dangling);
  const totalEff = effective.length || 0;

  let weighted = 0;
  let weightSum = 0;
  const byLabel = {};

  for (const seg of effective) {
    let s = trapScore;
    let w = 1;
    if (seg.label === LABEL.empty) {
      s = 0.35;
      w = C.emptyWeight;
    } else if (seg.label === LABEL.confound) {
      s = 0.3;
      w = C.confoundWeight;
    } else if (seg.label === LABEL.trap) {
      s = trapScore;
      w = 1;
    } else {
      const route = findRouteByLabel(routes, seg.label);
      s = routeScoreOf(route, 0.75);
      w = 1;
    }
    weighted += s * w;
    weightSum += w;
    byLabel[seg.label] = (byLabel[seg.label] || 0) + 1;
  }

  const base = weightSum > 0 ? weighted / weightSum : 0;

  const dom = pickDominantSingleVar(effective);
  const dominantShare = dom.total > 0 ? dom.weight / (totalEff || 1) : 0;
  const mainClear = !!(dom.label && dominantShare >= C.mainClarityThreshold);
  const mainBonus = mainClear ? C.mainClarityBonus : 0;

  const switchLabels = effective.map(s => s.label);
  const nSwitch = countMeaningfulSwitches(switchLabels);
  const strategySequence = buildStrategySequence(switchLabels);
  const stratBlocks = strategySequence.filter(b => !b.bypass);
  const nBlockSwitch = Math.max(0, stratBlocks.length - 1);
  const switchKind = classifySwitchKind(strategySequence, effective);
  const switchPen = switchPenaltyForKind(switchKind, nSwitch, nBlockSwitch, C);
  const lateShare = lateDominantSingleShare(effective);
  const convergeBonus = (
    switchKind === 'explore_converge' &&
    lateShare >= (C.convergeLateShare ?? 0.6)
  ) ? (C.convergeClarityBonus || 0) : 0;

  // CV 记账：全轨迹调节次数（含非 effective 段，避免漏计）
  const cvIds = new Set(listCvControls(chapter));
  let cvTunings = 0;
  let avTunings = 0;
  for (const seg of segments) {
    for (const t of seg.tunings || []) {
      if (!t.control) continue;
      if (cvIds.has(t.control) || t.role === 'irrelevant' || t.type === 'irrelevant_touch') {
        cvTunings += 1;
      } else if (t.role === 'operation' || listAvControls(chapter).includes(t.control)) {
        avTunings += 1;
      }
    }
  }
  const cvRatio = avTunings > 0 ? cvTunings / avTunings : (cvTunings > 0 ? 1 : 0);
  const cvOver = cvRatio >= C.cvOverRatio || (avTunings > 0 && cvTunings >= Math.max(3, avTunings));
  const cvProbe = !cvOver && cvTunings > 0 && cvTunings <= C.cvProbeMax;
  const cvPen = cvOver ? C.cvOverPenalty * Math.min(1.5, cvRatio + 0.5) : 0;
  const cvBonus = cvProbe ? C.cvProbeBonus : 0;

  // 禁止抬 CV 成高优单变量：主策略不得是 CV 标签
  let cvRaised = false;
  if (dom.label && /质量|厚度|音量|外观|无关/.test(dom.label)) {
    const avLabs = (chapter?.inquiryScript?.adjustmentVariables || []).map(a => `单变量·${a.label}`);
    if (!avLabs.includes(dom.label)) cvRaised = true;
  }

  let score = base + mainBonus - switchPen - cvPen + cvBonus + convergeBonus;
  if (cvRaised) score = Math.min(score, trapScore + 0.05);
  score = clamp01(score);

  return {
    mode: modeName,
    score: round3(score),
    breakdown: {
      base: round3(base),
      mainClarityBonus: round3(mainBonus),
      switchPenalty: round3(switchPen),
      cvPenalty: round3(cvPen),
      cvProbeBonus: round3(cvBonus),
      convergeBonus: round3(convergeBonus),
      nSwitch,
      nBlockSwitch,
      switchKind,
      strategySequence,
      lateDominantShare: round3(lateShare),
      dominantLabel: dom.label,
      dominantShare: round3(dominantShare),
      cvTunings,
      avTunings,
      cvRatio: round3(cvRatio),
      cvOver,
      cvProbe,
      cvRaised,
      segmentCounts: byLabel,
      effectiveTrials: totalEff,
    },
    segments,
    strategySequence,
    switchKind,
    // 显式拒绝「最后一发定局」：主策略取加权主导，而非最后一段
    primaryStrategy: dom.label || (byLabel[LABEL.trap] ? LABEL.trap : null),
    lastSegmentLabel: segments.filter(s => s.effective).slice(-1)[0]?.label || null,
  };
}

function scoreTraceStrategy(events, chapter, opts = {}) {
  const segments = segmentTraceByFire(events, chapter);
  return scoreStrategySegments(segments, chapter, opts);
}

function detectPlayMode(events, chapter) {
  for (const e of events || []) {
    if (e.type === 'phase_change' && /challenge|compete|竞赛/i.test(String(e.payload?.phase || ''))) {
      return 'compete';
    }
    if (e.type === 'mode' && /challenge|compete|竞赛/i.test(String(e.payload?.mode || e.payload?.value || ''))) {
      return 'compete';
    }
  }
  const mm = String(chapter?.strategy?.mermaid || '');
  // 默认探究；仅当轨迹明确进入竞赛才严
  if (/ModeChallenge|竞赛模式/.test(mm) && (events || []).some(e =>
    e.type === 'tuning' && /mode|challenge/i.test(String(e.payload?.control || '')))) {
    return 'compete';
  }
  return 'explore';
}

module.exports = {
  MODE,
  LABEL,
  segmentTraceByFire,
  classifySegment,
  scoreStrategySegments,
  scoreTraceStrategy,
  detectPlayMode,
  listAvControls,
  listCvControls,
  countMeaningfulSwitches,
  buildStrategySequence,
  classifySwitchKind,
  isSingleVarLabel,
};
