/** inquiryScript / gameSpec / telemetrySpec 质量子项 */

const {
  isCleanFormula,
  isCrossDomainOutputPollution,
  HOLLOW_OP_RE,
} = require('../repair/inquiry-script-sanitize');
const { routesNeedScoreRepair } = require('../repair/strategy-route-score-repair');

function hasFormulas(knowledgePoints) {
  return (knowledgePoints || []).some(kp =>
    Array.isArray(kp.formulas)
    && kp.formulas.some(f => isCleanFormula(f)),
  );
}

function validateInquiryScript(chapter, gameHints) {
  const errors = [];
  const warnings = [];
  const checklist = {};
  const script = chapter?.inquiryScript;
  const designMode = !!gameHints?.designMode;

  if (!script || typeof script !== 'object') {
    checklist.inquiryScript = false;
    warnings.push('inquiry: inquiryScript missing — run enrichChapterContract or use design mode');
    return { ok: true, errors, warnings, checklist };
  }

  const kp = Array.isArray(script.knowledgePoints) ? script.knowledgePoints : [];
  const av = Array.isArray(script.adjustmentVariables) ? script.adjustmentVariables : [];
  const cv = Array.isArray(script.confoundingVariables) ? script.confoundingVariables : [];
  const ov = Array.isArray(script.outputVariables) ? script.outputVariables : [];
  const flow = Array.isArray(script.inquiryFlow) ? script.inquiryFlow : [];
  const nodeIds = new Set((chapter.kg?.nodes || []).map(n => n.id));
  const controls = chapter.traceMap?.controls || {};
  const opControlIds = new Set(
    Object.entries(controls).filter(([, v]) => v?.role === 'operation').map(([id]) => id),
  );

  checklist.inquiryKnowledgePoints = kp.length >= 1;
  if (!checklist.inquiryKnowledgePoints) errors.push('inquiry: need >=1 knowledgePoint');

  checklist.inquiryAdjustmentVars = av.length >= 1;
  if (!checklist.inquiryAdjustmentVars) errors.push('inquiry: need >=1 adjustmentVariable');

  checklist.inquiryFormulas = hasFormulas(kp);
  if (!checklist.inquiryFormulas) {
    const msg = 'inquiry: need >=1 knowledgePoint with clean formulas';
    if (designMode) errors.push(msg);
    else warnings.push(msg);
  }

  checklist.inquiryFormulasClean = true;
  for (const point of kp) {
    for (const f of point.formulas || []) {
      if (!isCleanFormula(f)) {
        checklist.inquiryFormulasClean = false;
        errors.push(`inquiry: knowledgePoint ${point.id} has polluted formula (HTML/script junk)`);
        break;
      }
    }
  }

  checklist.inquiryOutputVars = ov.length >= 1;
  if (!checklist.inquiryOutputVars) {
    const msg = 'inquiry: need >=1 outputVariable (dependent / observable)';
    if (designMode) errors.push(msg);
    else warnings.push(msg);
  }

  checklist.inquiryNoCrossDomainOv = !isCrossDomainOutputPollution(chapter, ov);
  if (!checklist.inquiryNoCrossDomainOv) {
    errors.push('inquiry: outputVariables look like projectile template on non-projectile chapter (e.g. 射程/最大高度 + 电容)');
  }

  if (gameHints?.hasIrrelevant || cv.length > 0) {
    checklist.inquiryConfounding = cv.length >= 1;
    if (!checklist.inquiryConfounding) {
      warnings.push('inquiry: source suggests confounding variables but confoundingVariables empty');
    }
  } else {
    checklist.inquiryConfounding = true;
  }

  checklist.inquiryFlow = flow.length >= 2;
  if (!checklist.inquiryFlow) errors.push('inquiry: inquiryFlow need >=2 steps');

  if (flow.length >= 1 && kp.length >= 1) {
    const firstKp = kp[0]?.id;
    checklist.inquiryFlowStartsKp = flow[0] === firstKp || /^KP/.test(String(flow[0]));
    if (!checklist.inquiryFlowStartsKp) {
      warnings.push('inquiry: inquiryFlow should start with a knowledgePoint id');
    }
  }

  for (const point of kp) {
    for (const kgId of point.mapsToKg || []) {
      if (kgId && !nodeIds.has(kgId)) {
        errors.push(`inquiry: knowledgePoint ${point.id} mapsToKg ${kgId} not in kg.nodes`);
        checklist.inquiryKnowledgePoints = false;
      }
    }
  }

  checklist.inquiryAvSemantics = true;
  checklist.inquiryAvLabels = true;
  for (const variable of av) {
    if (variable.mapsToKg && !nodeIds.has(variable.mapsToKg)) {
      errors.push(`inquiry: adjustmentVariable ${variable.id} mapsToKg ${variable.mapsToKg} missing`);
      checklist.inquiryAdjustmentVars = false;
    }
    if (variable.controlId && !designMode && controls[variable.controlId]?.role !== 'operation') {
      warnings.push(`inquiry: adjustmentVariable ${variable.controlId} not in traceMap as operation`);
    }
    if (HOLLOW_OP_RE.test(String(variable.label || '').trim())) {
      checklist.inquiryAvLabels = false;
      errors.push(`inquiry: adjustmentVariable ${variable.id} has hollow label「调参操作」`);
    }
    if (av.length >= 2 && (variable.priorityRank == null || !variable.monotonicity)) {
      checklist.inquiryAvSemantics = false;
      warnings.push(`inquiry: AV ${variable.id} missing priorityRank/monotonicity (enrich should backfill)`);
    }
  }

  const o1 = (chapter.kg?.nodes || []).find(n => n.group === 'operation' && n.layer === 'play');
  checklist.inquiryO1Label = !o1 || !HOLLOW_OP_RE.test(String(o1.label || '').trim());
  if (!checklist.inquiryO1Label) {
    errors.push('inquiry: O1 label is hollow「调参操作」— use real control labels');
  }

  const narrativeBlob = `${script.narrative?.intro || ''}\n${(script.narrative?.steps || []).map(s => s.body).join('\n')}`;
  checklist.inquiryNarrativeNoHollow = !/调参操作/.test(narrativeBlob);
  if (!checklist.inquiryNarrativeNoHollow) {
    errors.push('inquiry: narrative still contains hollow「调参操作」');
  }

  checklist.inquiryConfoundingNotOperation = true;
  for (const conf of cv) {
    if (conf.controlId && opControlIds.has(conf.controlId)) {
      errors.push(`inquiry: confounding ${conf.controlId} must not be traceMap operation`);
      checklist.inquiryConfoundingNotOperation = false;
    }
  }

  checklist.inquiryOutputNotOperation = true;
  for (const output of ov) {
    if (output.mapsToKg && !nodeIds.has(output.mapsToKg)) {
      warnings.push(`inquiry: outputVariable ${output.id} mapsToKg ${output.mapsToKg} not in kg.nodes`);
    }
    if (output.controlId && opControlIds.has(output.controlId)) {
      errors.push(`inquiry: output ${output.controlId} must not be traceMap operation`);
      checklist.inquiryOutputNotOperation = false;
    }
  }

  if (chapter.physicsModel) {
    checklist.physicsModel = !!(chapter.physicsModel.dependentVariables?.length >= 1
      || (chapter.physicsModel.formulas || []).some(f => isCleanFormula(f)));
    const polluted = (chapter.physicsModel.formulas || []).some(f => !isCleanFormula(f));
    if (polluted) {
      errors.push('inquiry: physicsModel.formulas contains HTML/script junk');
      checklist.physicsModel = false;
    }
  }

  if (gameSpecPresent(chapter)) {
    checklist.gameSpec = !!(chapter.gameSpec?.controls?.length >= 1);
    if (!checklist.gameSpec) errors.push('inquiry: gameSpec.controls empty');
  }

  if (telemetrySpecPresent(chapter)) {
    checklist.telemetrySpec = !!(chapter.telemetrySpec?.events?.length >= 1);
    if (!checklist.telemetrySpec) errors.push('inquiry: telemetrySpec.events empty');
  }

  const avCount = av.length;
  if (avCount >= 2 && routesNeedScoreRepair(chapter)) {
    checklist.inquiryRouteScores = false;
    warnings.push('inquiry: multi-AV strategy.routes missing differentiated score/weight (enrich should repair)');
  } else {
    checklist.inquiryRouteScores = true;
  }

  const ok = errors.length === 0;
  checklist.inquiryScript = ok;
  return { ok, errors, warnings, checklist };
}

function gameSpecPresent(chapter) {
  return chapter?.gameSpec && typeof chapter.gameSpec === 'object';
}

function telemetrySpecPresent(chapter) {
  return chapter?.telemetrySpec && typeof chapter.telemetrySpec === 'object';
}

module.exports = {
  validateInquiryScript,
  gameSpecPresent,
  telemetrySpecPresent,
  hasFormulas,
};
