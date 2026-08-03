/**
 * 轨迹 → 探究路径对齐（图谱驱动 + 归一化事件）
 */
const { alignFromGeneratedSnapshot, alignFromDecisionsOnly } = require('./dt-align-core');
const { playConstraints } = require('../contract');
const { isFailureSnapshot } = require('./inquiry-profiles');
const { analyzeCoupledTouches, isTrapRoute } = require('./coupled-invalid');
const {
  filterEventsForChapter,
  normalizeTraceForChapter,
  buildControlRegistry,
  kgIdForControl,
  isIrrelevantEvent,
  isOperationTuning,
  snapshotPayloadFromEvent,
} = require('./trace-normalize');

/**
 * 参数覆盖度事件选择：
 * - 无 phase_change → 全量（与 challenge 过滤结果相同）
 * - 有 phase_change → 优先探究段（explore）；探究段无 operation 调参时回退 explore∪challenge（本章全量）
 * 竞赛策略类指标仍用 challenge 事件，不走此选择器。
 */
function resolveCoverageEvents(trace, chapter, ch, challengeEvents) {
  const chapterFiltered = filterEventsForChapter(trace, ch);
  const hasPhase = chapterFiltered.some(e => e.type === 'phase_change');
  if (!hasPhase) {
    return {
      coverageEvents: challengeEvents,
      coverageSource: 'full',
    };
  }
  const { events: exploreEvents } = normalizeTraceForChapter(trace, chapter, ch, {
    phaseFilter: 'explore',
  });
  const exploreHasOpTuning = exploreEvents.some(e => isOperationTuning(e, chapter));
  if (exploreHasOpTuning) {
    return {
      coverageEvents: exploreEvents,
      coverageSource: 'explore',
    };
  }
  const { events: unionEvents } = normalizeTraceForChapter(trace, chapter, ch, {
    phaseFilter: false,
  });
  return {
    coverageEvents: unionEvents,
    coverageSource: 'union',
  };
}
const {
  scoreTraceStrategy,
  detectPlayMode,
} = require('./strategy-segment-score');

function collectTouchedKgIds(events, chapter) {
  const touched = new Set();
  const nodes = chapter?.kg?.nodes || [];
  const resultId = nodes.find(n => n.group === 'result')?.id || 'R1';

  for (const e of events) {
    if (isOperationTuning(e, chapter)) {
      touched.add(kgIdForControl(chapter, e.payload?.control));
    }
    if (isIrrelevantEvent(e, chapter)) {
      const reg = buildControlRegistry(chapter);
      const control = e.payload?.control;
      const kgId = control ? reg.controls[control]?.kgId : null;
      const irr = nodes.find(n => n.group === 'irrelevant');
      touched.add(kgId || irr?.id || 'I1');
    }
    const payload = snapshotPayloadFromEvent(e);
    if (payload?.decisions) {
      for (const [id, ok] of Object.entries(payload.decisions)) {
        if (ok === true) touched.add(id);
      }
    }
    if (payload?.winOk) touched.add(resultId);
  }
  return touched;
}

function buildPathSteps(events, chapter) {
  const nodes = chapter?.kg?.nodes || [];
  const reg = buildControlRegistry(chapter);
  const steps = [];

  for (const e of events) {
    if (isIrrelevantEvent(e, chapter)) {
      const id = kgIdForControl(chapter, e.payload?.control)
        || nodes.find(n => n.group === 'irrelevant')?.id;
      if (id && steps[steps.length - 1] !== id) steps.push(id);
    }
    if (isOperationTuning(e, chapter)) {
      const id = kgIdForControl(chapter, e.payload?.control);
      if (id && steps[steps.length - 1] !== id) steps.push(id);
    }
  }

  let payload = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const p = snapshotPayloadFromEvent(events[i]);
    if (p?.decisions) {
      payload = p;
      break;
    }
  }
  if (!payload) {
    for (let i = events.length - 1; i >= 0; i--) {
      const p = snapshotPayloadFromEvent(events[i]);
      if (p) {
        payload = p;
        break;
      }
    }
  }
  const align = nodes.length
    ? alignFromGeneratedSnapshot(payload, nodes)
    : alignFromDecisionsOnly(payload);

  for (const id of align.dtPath) {
    if (!steps.includes(id)) steps.push(id);
  }
  return { pathSteps: steps, align, lastPayload: payload };
}

function isConfoundProbeRoute(r) {
  if (!r) return false;
  if (r.kind === 'confoundProbe' || r.warn === 'irrelevant') return true;
  return /试探|旁路|confound|irrelevant/i.test(`${r.id || ''}${r.label || ''}`);
}

function guessStrategyRoute(touchedIds, irrelevantCount, misconceptionCount, strategy, opts = {}) {
  const routes = strategy?.routes || [];
  if (!routes.length) {
    return { strategyRouteGuess: null, routeScores: {} };
  }
  const singleVariableRate = opts.singleVariableRate;
  const priorityAvs = opts.priorityAvs || [];
  const cvHeavy = !!opts.cvHeavy;
  const scores = {};
  for (const r of routes) {
    const maps = new Set(r.mapsTo || []);
    let score = 0;
    for (const id of touchedIds) {
      if (maps.has(id)) score += 1;
    }
    if (r.warn === 'irrelevant' && irrelevantCount > 0) score += 3;
    if (isTrapRoute(r) && misconceptionCount > 0) score += 3;
    if (r.id === 'main' && touchedIds.has('R1')) score += 2;
    // CV 重度时不得因「AV 自身单参」抬主路径
    if (r.id === 'main' && singleVariableRate != null && singleVariableRate >= 0.8 && !cvHeavy) {
      score += 2;
    }
    if (singleVariableRate != null && singleVariableRate < 0.5 && isTrapRoute(r)) score += 2;
    if (cvHeavy && isConfoundProbeRoute(r) && irrelevantCount > 0) score += 4;
    if (cvHeavy && (r.id === 'main' || /^main[_-]/i.test(String(r.id || '')))) score -= 3;
    for (const av of priorityAvs) {
      const lab = av.label || '';
      if (lab && String(r.label || '').includes(lab) && !cvHeavy) {
        score += Math.max(1, 4 - (av.priorityRank || 4));
      }
    }
    scores[r.id] = score;
  }
  let best = null;
  let bestScore = -1;
  for (const [id, s] of Object.entries(scores)) {
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return { strategyRouteGuess: best, routeScores: scores };
}

function collectRetryHints(events) {
  const hints = [];
  for (const e of events) {
    if (e.type !== 'snapshot') continue;
    const hk = e.payload?.hintKey;
    if (!hk || hk === 'ok' || hk === 'unknown') continue;
    if (!hints.includes(hk)) hints.push(hk);
  }
  return hints;
}

/**
 * CV / 无关控件触碰统计（challenge 段归一化后事件）。
 * cvHeavy：竞赛段拧无关量占比高，不得当作清晰单变量主路径。
 */
function metricCvTouchStats(events, chapter) {
  let avTunings = 0;
  let cvTunings = 0;
  for (const e of events || []) {
    if (isIrrelevantEvent(e, chapter)) {
      cvTunings += 1;
      continue;
    }
    if (isOperationTuning(e, chapter)) avTunings += 1;
  }
  const total = avTunings + cvTunings;
  const cvRatio = total > 0 ? cvTunings / total : 0;
  const cvOverAv = avTunings > 0 ? cvTunings / avTunings : (cvTunings > 0 ? 1 : 0);
  const cvHeavy = cvTunings > 0 && (
    avTunings === 0
    || cvOverAv >= 0.35
    || (cvTunings >= 3 && cvTunings >= avTunings)
  );
  return {
    avTunings,
    cvTunings,
    cvRatio: Math.round(cvRatio * 100) / 100,
    cvOverAv: Math.round(cvOverAv * 100) / 100,
    cvHeavy,
  };
}

function metricSingleVariableRate(events, chapter, cvStats = null) {
  const tuning = events.filter(e => e.type === 'tuning' && isOperationTuning(e, chapter));
  const cv = cvStats || metricCvTouchStats(events, chapter);

  // 只有 CV、没有 AV：不算「单变量成功」
  if (!tuning.length) {
    if (cv.cvTunings > 0) return 0;
    return null;
  }
  if (tuning.length === 1 && !cv.cvHeavy) return 1;

  let rapidMix = 0;
  for (let k = 2; k < tuning.length; k++) {
    const c0 = tuning[k - 2].payload?.control;
    const c1 = tuning[k - 1].payload?.control;
    const c2 = tuning[k].payload?.control;
    if (c0 && c1 && c2 && c0 !== c1 && c1 !== c2) rapidMix += 1;
  }
  const pairs = tuning.length - 1;
  const mixPenalty = pairs ? rapidMix / pairs : 0;

  let bursts = 0;
  let i = 0;
  while (i < tuning.length) {
    const control = tuning[i].payload?.control;
    let j = i + 1;
    while (j < tuning.length && tuning[j].payload?.control === control) j += 1;
    bursts += 1;
    i = j;
  }
  const burstScore = bursts ? 1 : 1;
  let rate = Math.max(0, Math.min(1, burstScore * (1 - mixPenalty * 0.5)));

  // CV 重度：压低 singleVariableRate，避免 S3 看起来像 S1
  if (cv.cvHeavy) {
    const damp = Math.max(0.15, 1 - Math.min(1, cv.cvOverAv));
    rate = Math.min(rate, 0.4) * damp;
  }
  return Math.round(rate * 100) / 100;
}

function metricParameterCoverage(events, chapter) {
  const controls = chapter?.traceMap?.controls || {};
  const operationIds = Object.entries(controls)
    .filter(([, meta]) => meta?.role === 'operation')
    .map(([id]) => id);
  if (!operationIds.length) {
    return { tunedControls: [], operationControlCount: 0, parameterCoverage: null };
  }
  const tuned = new Set();
  for (const e of events) {
    if (isOperationTuning(e, chapter)) {
      const c = e.payload?.control;
      if (c) tuned.add(c);
    }
  }
  const tunedControls = [...tuned];
  const operationControlCount = operationIds.length;
  const parameterCoverage = operationControlCount
    ? Math.round((tunedControls.length / operationControlCount) * 100) / 100
    : null;
  return { tunedControls, operationControlCount, parameterCoverage };
}

function metricRationalCorrection(events, chapter) {
  const snaps = events.filter(e => e.type === 'snapshot');
  if (snaps.length < 2) return null;
  const constraints = playConstraints(chapter?.kg?.nodes || []);
  let attempts = 0;
  let improved = 0;

  for (let i = 0; i < snaps.length - 1; i++) {
    const a = snaps[i].payload || {};
    const b = snaps[i + 1].payload || {};
    if (!isFailureSnapshot(a, chapter)) continue;
    attempts += 1;
    const decA = a.decisions || {};
    const decB = b.decisions || {};
    let better = !!b.winOk;
    if (!better) {
      for (const c of constraints) {
        if (decA[c.id] === false && decB[c.id] === true) {
          better = true;
          break;
        }
      }
    }
    if (!better && b.hintKey === 'ok') better = true;
    if (better) improved += 1;
  }
  if (!attempts) return null;
  return Math.round((improved / attempts) * 100) / 100;
}

function metricBoundaryAware(events, chapter, ch) {
  const irrIdx = events.findIndex(e => isIrrelevantEvent(e, chapter));
  if (irrIdx >= 0) {
    const after = events.slice(irrIdx + 1);
    const converged = after.some(e => {
      const p = snapshotPayloadFromEvent(e);
      return p?.winOk || e.type === 'win';
    });
    const refocused = after.some(e => isOperationTuning(e, chapter));
    const noMoreIrr = !after.some(e => isIrrelevantEvent(e, chapter));
    return converged || (refocused && noMoreIrr);
  }

  return null;
}

/**
 * @param {object} trace
 * @param {object} chapter
 * @param {number} ch
 */
function tracePathAlign(trace, chapter, ch) {
  const { events, meta } = normalizeTraceForChapter(trace, chapter, ch);
  const chaptersTouched = [...new Set(
    (trace?.events || [])
      .map(e => e.ch)
      .filter(n => typeof n === 'number'),
  )];

  const coupled = analyzeCoupledTouches(events, chapter);
  let permanentIrrelevantCount = 0;
  for (const e of events) {
    if (e.type === 'irrelevant_touch') permanentIrrelevantCount += 1;
    else if (e.type === 'tuning') {
      const role = chapter?.traceMap?.controls?.[e.payload?.control]?.role;
      if (role === 'irrelevant') permanentIrrelevantCount += 1;
    }
  }

  const { pathSteps, align } = buildPathSteps(events, chapter);
  const touched = collectTouchedKgIds(events, chapter);
  const irrelevantKg = (chapter?.kg?.nodes || [])
    .filter(n => n.group === 'irrelevant')
    .map(n => n.id)
    .filter(id => touched.has(id));

  const misconceptionCount = coupled.misconceptionControls.length;
  const cvStats = metricCvTouchStats(events, chapter);
  const singleVariableRate = metricSingleVariableRate(events, chapter, cvStats);

  // 覆盖度看探究段（explore-primary）；其余策略指标仍基于 challenge 过滤后的 events
  const { coverageEvents, coverageSource } = resolveCoverageEvents(trace, chapter, ch, events);
  const paramCoverage = metricParameterCoverage(coverageEvents, chapter);
  const paramCoverageChallenge = coverageSource === 'full'
    ? paramCoverage
    : metricParameterCoverage(events, chapter);

  const priorityAvs = (chapter?.inquiryScript?.adjustmentVariables || [])
    .filter(a => a.priorityRank != null)
    .sort((a, b) => a.priorityRank - b.priorityRank);

  const { strategyRouteGuess, routeScores } = guessStrategyRoute(
    touched,
    permanentIrrelevantCount,
    misconceptionCount,
    chapter?.strategy,
    { singleVariableRate, priorityAvs, cvHeavy: cvStats.cvHeavy },
  );

  const irrelevantTouches = irrelevantKg.length
    ? irrelevantKg
    : (permanentIrrelevantCount
      ? [(chapter?.kg?.nodes || []).find(n => n.group === 'irrelevant')?.id || 'I1']
      : []);

  const playMode = detectPlayMode(events, chapter);
  const strategySegmentScore = scoreTraceStrategy(events, chapter, { mode: playMode });

  return {
    eventCount: events.length,
    chaptersTouched,
    pathSteps,
    irrelevantTouches,
    misconceptionTouches: coupled.misconceptionControls,
    retryHints: collectRetryHints(events),
    strategyRouteGuess,
    routeScores,
    strategySegmentScore,
    metrics: {
      singleVariableRate,
      rationalCorrectionRate: metricRationalCorrection(events, chapter),
      boundaryAware: metricBoundaryAware(events, chapter, ch),
      tunedControls: paramCoverage.tunedControls,
      operationControlCount: paramCoverage.operationControlCount,
      parameterCoverage: paramCoverage.parameterCoverage,
      parameterCoverageChallenge: paramCoverageChallenge.parameterCoverage,
      parameterCoverageSource: coverageSource,
      strategyScore: strategySegmentScore.score,
      primaryStrategy: strategySegmentScore.primaryStrategy,
      switchKind: strategySegmentScore.switchKind || strategySegmentScore.breakdown?.switchKind || null,
      strategySequence: strategySegmentScore.strategySequence || strategySegmentScore.breakdown?.strategySequence || [],
      nSwitch: strategySegmentScore.breakdown?.nSwitch ?? null,
      nBlockSwitch: strategySegmentScore.breakdown?.nBlockSwitch ?? null,
      playMode,
      cvTunings: cvStats.cvTunings,
      avTunings: cvStats.avTunings,
      cvRatio: cvStats.cvRatio,
      cvOverAv: cvStats.cvOverAv,
      cvHeavy: cvStats.cvHeavy,
    },
    align,
    normalizeMeta: meta,
  };
}

module.exports = {
  filterEventsForChapter,
  resolveCoverageEvents,
  tracePathAlign,
  guessStrategyRoute,
  metricParameterCoverage,
  metricSingleVariableRate,
  metricCvTouchStats,
  scoreTraceStrategy,
  detectPlayMode,
};
