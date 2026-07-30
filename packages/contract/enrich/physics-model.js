/** 从 inquiryScript 合成 physicsModel 摘要（enrich 确定性产出） */

const { sanitizeFormulaList } = require('../repair/inquiry-script-sanitize');

function collectFormulas(knowledgePoints) {
  const raw = [];
  for (const kp of knowledgePoints || []) {
    for (const f of kp.formulas || []) raw.push(f);
  }
  return sanitizeFormulaList(raw).slice(0, 6);
}

function buildPhysicsModel(inquiryScript, existingModel) {
  const script = inquiryScript || {};
  const core = existingModel?.core || null;
  const formulas = collectFormulas(script.knowledgePoints);
  const fromCore = sanitizeFormulaList(core?.formulas || []);
  const mergedFormulas = [...new Set([...fromCore, ...formulas])].slice(0, 8);
  const cleanedCore = core
    ? { ...core, formulas: fromCore.length ? fromCore : mergedFormulas }
    : null;
  return {
    formulas: mergedFormulas,
    independentVariables: (script.adjustmentVariables || []).map(a => a.id).filter(Boolean),
    confoundingVariables: (script.confoundingVariables || []).map(c => c.id).filter(Boolean),
    dependentVariables: (script.outputVariables || []).map(o => o.id).filter(Boolean),
    ...(cleanedCore ? { core: cleanedCore } : {}),
  };
}

function renderPhysicsModelMarkdown(chapter) {
  const script = chapter?.inquiryScript || {};
  const model = chapter?.physicsModel || buildPhysicsModel(script);
  const core = model.core;
  const lines = [
    '## 物理模型三要素',
    '',
  ];
  if (core?.updateLoopSummary || core?.winConditionSummary) {
    lines.push('### 源码剥离（core）', '');
    if (core.updateLoopSummary) lines.push(`- 更新循环：${core.updateLoopSummary}`);
    if (core.winConditionSummary) lines.push(`- 过关判定：${core.winConditionSummary}`);
    lines.push('');
  }
  lines.push(
    '### 公式',
    ...(model.formulas.length
      ? model.formulas.map(f => `- ${f}`)
      : ['- （待补全）']),
    '',
    '### 调节变量（自变量）',
    ...((script.adjustmentVariables || []).length
      ? script.adjustmentVariables.map(a => {
        const sym = a.symbol ? ` (${a.symbol})` : '';
        return `- ${a.label || a.controlId}${sym}`;
      })
      : ['- （无）']),
    '',
    '### 混淆变量',
    ...((script.confoundingVariables || []).length
      ? script.confoundingVariables.map(c => `- ${c.label}：${c.reason || '不影响核心结论'}`)
      : ['- （无）']),
    '',
    '### 输出变量（因变量 / 可观测结果）',
    ...((script.outputVariables || []).length
      ? script.outputVariables.map(o => {
        const sym = o.symbol ? ` (${o.symbol})` : '';
        const unit = o.unit ? ` [${o.unit}]` : '';
        return `- ${o.label}${sym}${unit}`;
      })
      : ['- （待补全）']),
    '',
  );
  return lines.join('\n');
}

module.exports = {
  buildPhysicsModel,
  collectFormulas,
  renderPhysicsModelMarkdown,
};
