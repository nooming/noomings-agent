const { hasFormulas } = require('../../packages/contract/validate/validate-inquiry-script');
const { validateInquiryScript } = require('../../packages/contract/validate/validate-inquiry-script');

function collectFormulas(draft) {
  return (draft.knowledgePoints || []).flatMap(kp => kp.formulas || []);
}

function collectLabels(items) {
  return (items || []).map(v => [v.label, v.symbol, v.id].filter(Boolean).join(' ')).join(' ');
}

function matchAny(text, patterns) {
  if (!patterns?.length) return true;
  const hay = String(text || '');
  return patterns.some(p => {
    if (p instanceof RegExp || (typeof p === 'object' && p?.source)) {
      const re = p instanceof RegExp ? p : new RegExp(p.source, p.flags || 'i');
      return re.test(hay);
    }
    return hay.toLowerCase().includes(String(p).toLowerCase());
  });
}

function checkFormulasContain(formulas, patterns) {
  if (!patterns?.length) return true;
  const joined = formulas.join(' ');
  return matchAny(joined, patterns);
}

function checkLabelsContain(items, patterns) {
  if (!patterns?.length) return true;
  return matchAny(collectLabels(items), patterns);
}

function checkOutputLabelsContain(outputVars, patterns) {
  if (!patterns?.length) return true;
  const text = (outputVars || []).map(o => [o.label, o.symbol, o.id].filter(Boolean).join(' ')).join(' ');
  return matchAny(text, patterns);
}

function controlIds(items) {
  return new Set((items || []).map(v => v.controlId).filter(Boolean));
}

function symbols(items) {
  return new Set((items || []).map(v => v.symbol).filter(Boolean));
}

function runParseChecks(expected, draft) {
  const checks = [];
  const failures = [];
  const kp = draft.knowledgePoints || [];
  const av = draft.adjustmentVariables || [];
  const cv = draft.confoundingVariables || [];
  const ov = draft.outputVariables || [];
  const formulas = collectFormulas(draft);

  function record(name, ok, detail) {
    checks.push({ name, ok, detail });
    if (!ok) failures.push(detail || name);
  }

  record('hasFormulas', hasFormulas(kp), 'missing formulas in knowledgePoints');

  if (expected.formulasContain) {
    record(
      'formulasContain',
      checkFormulasContain(formulas, expected.formulasContain),
      `formulas missing expected tokens: ${expected.formulasContain.join(', ')}`,
    );
  }

  if (expected.minKnowledgePoints != null) {
    record(
      'minKnowledgePoints',
      kp.length >= expected.minKnowledgePoints,
      `need >=${expected.minKnowledgePoints} knowledgePoints, got ${kp.length}`,
    );
  }

  if (expected.minAdjustmentVars != null) {
    record(
      'minAdjustmentVars',
      av.length >= expected.minAdjustmentVars,
      `need >=${expected.minAdjustmentVars} adjustmentVariables, got ${av.length}`,
    );
  }

  if (expected.minOutputVars != null) {
    record(
      'minOutputVars',
      ov.length >= expected.minOutputVars,
      `need >=${expected.minOutputVars} outputVariables, got ${ov.length}`,
    );
  }

  if (expected.adjustmentLabelsContain) {
    record(
      'adjustmentLabelsContain',
      checkLabelsContain(av, expected.adjustmentLabelsContain),
      `adjustment labels missing: ${expected.adjustmentLabelsContain.join(', ')}`,
    );
  }

  if (expected.outputLabelsContain) {
    record(
      'outputLabelsContain',
      checkOutputLabelsContain(ov, expected.outputLabelsContain),
      `output labels missing: ${expected.outputLabelsContain.join(', ')}`,
    );
  }

  if (expected.confoundingMin != null) {
    record(
      'confoundingMin',
      cv.length >= expected.confoundingMin,
      `need >=${expected.confoundingMin} confoundingVariables, got ${cv.length}`,
    );
  }

  const avIds = controlIds(av);
  const cvIds = controlIds(cv);
  const overlap = [...avIds].filter(id => cvIds.has(id));
  record(
    'controlIdDisjoint',
    overlap.length === 0,
    overlap.length ? `AV/CV controlId overlap: ${overlap.join(', ')}` : '',
  );

  const avSyms = symbols(av);
  const ovSyms = symbols(ov);
  const symOverlap = [...ovSyms].filter(s => avSyms.has(s));
  record(
    'outputNotInAdjustment',
    symOverlap.length === 0,
    symOverlap.length ? `OV symbol overlaps AV: ${symOverlap.join(', ')}` : '',
  );

  const score = checks.filter(c => c.ok).length;
  const total = checks.length;
  return {
    pass: failures.length === 0,
    score,
    total,
    checks,
    failures,
  };
}

function evaluateDesignSample(sample, result, options = {}) {
  const draft = result.inquiryDraft || result;
  const parseEval = runParseChecks(sample.expected || {}, draft);

  if (options.parseOnly) {
    return { ...parseEval, mode: 'parse' };
  }

  const checks = [...parseEval.checks];
  const failures = [...parseEval.failures];
  const chapter = result.chapter;
  const gameHints = { designMode: true, ...(result.gameHints || {}) };

  if (chapter) {
    const v = validateInquiryScript(chapter, gameHints);
    checks.push({
      name: 'validateInquiryScript',
      ok: v.ok,
      detail: v.errors.join('; ') || 'ok',
    });
    if (!v.ok) failures.push(...v.errors);

    const qErrors = result.quality?.errors || [];
    const maxErrors = options.maxQualityErrors ?? 0;
    const qOk = qErrors.length <= maxErrors;
    checks.push({
      name: 'qualityErrors',
      ok: qOk,
      detail: qErrors.join('; ') || 'ok',
    });
    if (!qOk) failures.push(...qErrors);

    const bundleUser = result.promptBundle?.user || '';
    const bundleOk = bundleUser.includes('物理模型三要素');
    checks.push({
      name: 'promptBundlePhysicsSection',
      ok: bundleOk,
      detail: bundleOk ? 'ok' : 'promptBundle.user missing 物理模型三要素',
    });
    if (!bundleOk) failures.push('promptBundle.user missing 物理模型三要素');
  } else {
    checks.push({ name: 'chapterPresent', ok: false, detail: 'no chapter in result' });
    failures.push('no chapter in result');
  }

  const score = checks.filter(c => c.ok).length;
  const total = checks.length;
  return {
    pass: failures.length === 0,
    score,
    total,
    checks,
    failures,
    mode: 'full',
  };
}

module.exports = {
  evaluateDesignSample,
  runParseChecks,
  matchAny,
  collectFormulas,
};
