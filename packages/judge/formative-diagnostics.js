/**
 * 形成性诊断面：对照深度、双模一致性、解释一致性、证据可评性、CV 试探 vs 信念。
 */
'use strict';

const { scoreTraceStrategy } = require('./strategy-segment-score');
const { filterEventsByExplorePhase, filterEventsByChallengePhase } = require('./trace-normalize');
const FORMATIVE_DIAGNOSTICS_VERSION = 1;

function listCvControls(chapter) {
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const ids = cvs.map(c => c.controlId).filter(Boolean);
  if (ids.length) return [...new Set(ids)];
  const controls = chapter?.traceMap?.controls || {};
  return Object.entries(controls)
    .filter(([, meta]) => meta?.role === 'irrelevant')
    .map(([id]) => id);
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

function isPassed(summary) {
  return summary?.align?.dtPath?.includes('R1')
    || summary?.lastSnapshot?.winOk
    || summary?.hasWinEvent;
}

function computeContrastDepth(summary) {
  const m = summary?.inquiryPath?.metrics || {};
  const av = m.avTunings;
  const sv = m.singleVariableRate;
  if (typeof av !== 'number' && sv == null) {
    return { level: 'unknown', label: '对照深度未评估' };
  }
  if (isPassed(summary) && typeof av === 'number' && av < 2) {
    return { level: 'thin', label: '对照偏薄（过关但有效对照少）' };
  }
  if (typeof sv === 'number' && sv >= 0.75 && typeof av === 'number' && av >= 3) {
    return { level: 'solid', label: '对照较扎实' };
  }
  if (typeof av === 'number' && av >= 2) {
    return { level: 'adequate', label: '对照基本够用' };
  }
  return { level: 'thin', label: '对照偏薄' };
}

function computeDualModeCoherence(ctx) {
  const { chapter, events = [] } = ctx;
  const exploreEv = filterEventsByExplorePhase(events);
  const challengeEv = filterEventsByChallengePhase(events);
  const hasExplorePhase = exploreEv.some(e => e?.type === 'phase_change' && e.payload?.phase === 'explore');
  const hasChallengePhase = challengeEv.some(e => e?.type === 'phase_change' && e.payload?.phase === 'challenge')
    || challengeEv.length > 0;

  if (!hasExplorePhase && !hasChallengePhase) {
    return { level: 'unknown', label: '未上报阶段，无法比较双模' };
  }
  if (!hasExplorePhase || !hasChallengePhase) {
    return { level: 'unknown', label: '仅单段证据，双模一致性未评估' };
  }

  const peScore = scoreTraceStrategy(exploreEv, chapter, { mode: 'explore' });
  const pcScore = scoreTraceStrategy(challengeEv, chapter, { mode: 'compete' });
  const pePrimary = String(peScore?.primaryStrategy || '');
  const pcPrimary = String(pcScore?.primaryStrategy || '');

  const peSingle = /^单变量·/.test(pePrimary);
  const pcSingle = /^单变量·/.test(pcPrimary);
  const pcTrap = /多参盲调/.test(pcPrimary);
  const pcCv = pcScore?.breakdown?.cvOver;

  if (peSingle && (pcSingle || (!pcTrap && !pcCv))) {
    return { level: 'aligned', label: '探究与竞赛策略基本一致' };
  }
  if (peSingle && (pcTrap || pcCv)) {
    return { level: 'regressed', label: '探究段已单参，竞赛段退回混调/旁路' };
  }
  return { level: 'unknown', label: '双模策略关系不明确' };
}

function computeAttributionAlignment(ctx) {
  const { chapter, events = [], summary, abilityScore } = ctx;
  const attribution = findLatestAttribution(events);
  if (!attribution) {
    return { code: 'missing', label: '未作答归因（不扣分）' };
  }
  if (attribution === 'unsure' || attribution === 'mixed') {
    return { code: 'neutral', label: '归因未指向单变量（中性）' };
  }
  const cvIds = new Set(listCvControls(chapter));
  if (cvIds.has(attribution)) {
    return { code: 'cv_belief', label: '归因选了混淆/旁路量' };
  }

  const pePrimary = String(
    abilityScore?.parts?.exploreProcess?.primary
    || summary?.inquiryPath?.metrics?.dominantLabel
    || '',
  );
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const hit = avs.find(a => a.controlId === attribution);
  const label = hit?.label || attribution;

  if (pePrimary && (pePrimary.includes(label) || pePrimary.includes(attribution))) {
    return { code: 'aligned', label: '归因与过程主调节一致' };
  }
  if (/多参|盲调|旁路|混淆/.test(pePrimary)) {
    return { code: 'process_mismatch', label: '归因与过程主策略不一致' };
  }
  return { code: 'neutral', label: '归因已答，与过程弱相关' };
}

function computeCvProbeNote(ctx) {
  const { chapter, events = [], summary } = ctx;
  const exploreEv = filterEventsByExplorePhase(events);
  const challengeEv = filterEventsByChallengePhase(events);
  const cvIds = listCvControls(chapter);
  if (!cvIds.length) {
    return { exploreProbe: false, competeBypass: false, label: '本关无配置混淆量' };
  }

  let exploreCv = 0;
  for (const e of exploreEv) {
    if (e?.type !== 'tuning') continue;
    if (cvIds.includes(e.payload?.control)) exploreCv += 1;
  }
  const m = summary?.inquiryPath?.metrics || {};
  const competeBypass = !!m.cvHeavy
    || (abilityScorePart(ctx)?.challengeProcess?.cvOver === true);

  const exploreProbe = exploreCv > 0 && exploreCv <= 2 && !competeBypass;
  let label = '未明显试探混淆量';
  if (exploreProbe && !competeBypass) label = '探究段有少量试探 CV（可接受）';
  if (competeBypass) label = '竞赛段混淆/旁路偏重';
  if (exploreProbe && competeBypass) label = '探究曾试探 CV，但竞赛段仍旁路偏重';

  return { exploreProbe, competeBypass, label };
}

function abilityScorePart(ctx) {
  return ctx.abilityScore?.parts || null;
}

function computeEvidenceSufficiency(ctx) {
  const { chapter, events = [], summary, abilityScore } = ctx;
  const reasons = [];
  const sawPhase = (events || []).some(e => e?.type === 'phase_change');
  if (!sawPhase) reasons.push('未上报 phase_change');

  const peNull = abilityScore?.parts?.exploreProcess?.raw == null;
  const erNull = abilityScore?.parts?.exploreResult?.raw == null;
  if (peNull && erNull && sawPhase) reasons.push('探究段过程/结果缺维');

  const hasTraceMap = !!(chapter?.traceMap?.controls && Object.keys(chapter.traceMap.controls).length);
  const hasAv = !!(chapter?.inquiryScript?.adjustmentVariables?.length);
  if (!hasTraceMap && !hasAv) reasons.push('关卡 traceMap/调节量未配置');

  const hasKg = !!(chapter?.kg?.nodes?.length);
  if (!hasKg) reasons.push('图谱节点缺失，路径对齐弱');

  if (!reasons.length) {
    return { level: 'ok', label: '证据可评', reasons: [] };
  }
  if (reasons.length >= 2 || !hasTraceMap) {
    return { level: 'insufficient', label: '证据不足，部分结论未评估', reasons };
  }
  return { level: 'partial', label: '证据部分缺失', reasons };
}

function computeFormativeDiagnostics(ctx = {}) {
  return {
    version: FORMATIVE_DIAGNOSTICS_VERSION,
    contrastDepth: computeContrastDepth(ctx.summary || {}),
    dualModeCoherence: computeDualModeCoherence(ctx),
    attributionAlignment: computeAttributionAlignment(ctx),
    cvProbe: computeCvProbeNote(ctx),
    evidenceSufficiency: computeEvidenceSufficiency(ctx),
  };
}

module.exports = {
  FORMATIVE_DIAGNOSTICS_VERSION,
  computeFormativeDiagnostics,
};
