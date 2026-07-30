function validateDtEnvAlignment(chapter, coupledMode) {
  const errors = [];
  if (!coupledMode) return errors;
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!/Env|模式|环境|mode/i.test(mm)) return errors;
  const root = chapter?.dt?.tree;
  const mapping = String(chapter?.mapping || '');
  if (!root?.children?.length) {
    errors.push('quality: DT must start with mode/env decision when strategy has Env');
    return errors;
  }
  const first = root.children[0];
  if (first?.t !== 'decision' || !/模式|环境|开关|mode|feature/i.test(`${first.n || ''}${first.d || ''}`)) {
    errors.push('quality: DT first decision must be mode/env (align with strategy Env)');
  }
  const envKgRow = /constraint.*\|.*(模式|环境|开关|mode|feature)/i.test(mapping)
    || /\|\s*C\d+\s*\|.*constraint.*(模式|环境|开关)/i.test(mapping);
  if (!envKgRow) {
    errors.push('quality: mapping must include env/mode constraint KG row');
  }
  if (!/模式|环境|开关|mode|feature/.test(mapping)) {
    errors.push('quality: mapping must include env/mode DT decision row');
  }
  return errors;
}

function kgLinkOrderBefore(links, fromId, beforeId, afterId) {
  const adj = new Map();
  for (const l of links || []) {
    if (!adj.has(l.s)) adj.set(l.s, []);
    adj.get(l.s).push(l.t);
  }
  const seen = new Set();
  const q = [fromId];
  let hitBefore = false;
  let hitAfter = false;
  while (q.length) {
    const c = q.shift();
    if (seen.has(c)) continue;
    seen.add(c);
    if (c === beforeId) hitBefore = true;
    if (c === afterId) hitAfter = true;
    if (hitBefore && hitAfter) return true;
    for (const n of adj.get(c) || []) q.push(n);
  }
  return hitBefore && !hitAfter ? true : false;
}

function findEnvConstraintNode(nodes) {
  return nodes.find(n =>
    n.group === 'constraint'
    && n.layer === 'play'
    && /模式|环境|开关|mode|feature/i.test(`${n.label || ''}${n.desc || ''}`),
  );
}

function findConditionalParamConstraintNode(nodes, envNode) {
  return nodes.find(n =>
    n.group === 'constraint'
    && n.layer === 'play'
    && n.id !== envNode?.id
    && /参数|变量|param|secondary|条件/i.test(`${n.label || ''}${n.desc || ''}`),
  );
}

function validateKgConditionalParamCoupling(chapter, coupledMode, conditionalParamProfile) {
  const errors = [];
  if (!coupledMode || !conditionalParamProfile) return errors;
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!/Env|模式|环境|mode/i.test(mm)) return errors;
  const nodes = chapter?.kg?.nodes || [];
  const links = chapter?.kg?.links || [];
  const envNode = findEnvConstraintNode(nodes);
  const paramNode = findConditionalParamConstraintNode(nodes, envNode);
  if (!envNode || !paramNode) {
    if (!envNode) errors.push('quality: conditional-param KG needs env/mode constraint node');
    if (!paramNode) errors.push('quality: conditional-param KG needs conditional parameter constraint node');
    return errors;
  }
  const envBeforeParam = kgLinkOrderBefore(links, 'P1', envNode.id, paramNode.id);
  if (!envBeforeParam) {
    errors.push('quality: KG play chain must reach env constraint before conditional param constraint from P1');
  }
  const offModeHint = /无关|不影响|无效|ideal|无影响|不参与|UI\s*范围|仅.*范围|关态/i.test(
    `${paramNode.desc || ''}${paramNode.label || ''}`,
  );
  const teachHint = nodes.some(n =>
    n.layer === 'teach'
    && /无关|不影响|无效|ideal|无影响|不参与|条件.*参数|关态/i.test(`${n.desc || ''}${n.label || ''}`),
  );
  if (!offModeHint && !teachHint) {
    errors.push('quality: conditional param node desc or teach S* must state param is ineffective in off mode');
  }
  return errors;
}

function validateDtConditionalParamBranch(chapter, coupledMode, conditionalParamProfile) {
  const errors = [];
  if (!coupledMode || !conditionalParamProfile) return errors;
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!/Env|模式|环境|mode/i.test(mm)) return errors;
  const root = chapter?.dt?.tree;
  if (!root?.children?.length) return errors;

  const envDecision = root.children[0];
  if (envDecision?.t !== 'decision') return errors;
  const kids = envDecision.children || [];
  const offBranch = kids.find(c => /^(否|关|off|0|false)$/i.test(String(c._e || '').trim())) || kids[0];
  if (!offBranch) return errors;

  const onBranch = kids.find(c => /^(是|开|on|1|true)$/i.test(String(c._e || '').trim())) || kids[1];
  const condParamRe = /质量|mass|param\s*b|参数\s*B|secondary/i;
  const offModeOkRe = /仅\s*UI|UI\s*范围|不影响|无效|关态|不参与|不.*判定|不.*得分|不.*命中/i;
  const rangeGateRe = /在范围|范围内|满足.*范围/i;

  const collectParamDecisions = subtree => {
    const out = [];
    const walk = n => {
      if (n?.t === 'decision' && condParamRe.test(`${n.n || ''}${n.d || ''}`)) out.push(n);
      (n?.children || []).forEach(walk);
    };
    if (subtree) walk(subtree);
    return out;
  };

  const paramBaseName = name =>
    String(name || '')
      .replace(/仅\s*UI\s*范围/g, '')
      .replace(/在范围\??/g, '')
      .replace(/\?/g, '')
      .trim();

  const offDecisions = collectParamDecisions(offBranch);
  if (!offDecisions.length) return errors;

  const onDecisions = collectParamDecisions(onBranch);
  const onBaseNames = new Set(onDecisions.map(n => paramBaseName(n.n)));

  for (const node of offDecisions) {
    const text = `${node.n || ''}${node.d || ''}`;
    const nameOffModeOk = /仅\s*UI|UI\s*范围/.test(node.n || '');
    const qualified = nameOffModeOk || offModeOkRe.test(text);
    const plainRangeGate = rangeGateRe.test(node.n || '') && !nameOffModeOk;
    const sameAsOn = onBaseNames.has(paramBaseName(node.n));

    if (plainRangeGate && (sameAsOn || onDecisions.some(on => on.n === node.n))) {
      errors.push(`quality: DT off-mode branch must not mirror on-mode range gate "${node.n}"; use「仅 UI 范围?」or omit`);
      continue;
    }
    if (plainRangeGate) {
      errors.push(`quality: DT off-mode conditional param "${node.n}" must use「仅 UI 范围?」or state no impact on hit/score in n/d`);
    } else if (!qualified && condParamRe.test(text)) {
      errors.push(`quality: DT off-mode conditional param decision must mention 仅 UI 范围 or 不影响判定 in n/d`);
    }
  }
  return errors;
}

function validateKgEnvBeforeOperation(chapter) {
  const warnings = [];
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!/Env|环境|模式|mode/i.test(mm)) return warnings;
  const nodes = chapter?.kg?.nodes || [];
  const links = chapter?.kg?.links || [];
  const envNode = findEnvConstraintNode(nodes);
  const o1 = nodes.find(n => n.id === 'O1' || (n.group === 'operation' && n.layer === 'play'));
  if (!envNode || !o1) return warnings;
  const { orderedPlayPathIds } = require('./play-graph');
  const path = orderedPlayPathIds(nodes, links);
  const ei = path.indexOf(envNode.id);
  const oi = path.indexOf(o1.id);
  if (ei >= 0 && oi >= 0 && ei > oi) {
    warnings.push('quality: KG play chain must reach env constraint before operation from P1');
  }
  return warnings;
}

function validateDtHasOperationStep(chapter) {
  const warnings = [];
  const nodes = chapter?.kg?.nodes || [];
  const op = nodes.find(n => n.group === 'operation' && n.layer === 'play');
  if (!op) return warnings;
  const mapping = String(chapter?.mapping || '');
  if (!mapping.includes(op.id)) {
    warnings.push(`quality: mapping must include operation KG id ${op.id}`);
    return warnings;
  }
  const opLabel = op.label || '';
  const tree = chapter?.dt?.tree;
  if (!tree || !opLabel) return warnings;
  let found = false;
  const walk = n => {
    if (found) return;
    const text = `${n.n || ''}${n.d || ''}`;
    if (text.includes(opLabel)) found = true;
    (n.children || []).forEach(walk);
  };
  walk(tree);
  if (!found) {
    warnings.push('quality: dt.tree must include operation step aligned with KG O* mapping');
  }
  return warnings;
}

module.exports = {
  validateDtEnvAlignment,
  validateDtConditionalParamBranch,
  kgLinkOrderBefore,
  validateKgConditionalParamCoupling,
  validateKgMassEnvCoupling: validateKgConditionalParamCoupling,
  validateKgEnvBeforeOperation,
  validateDtHasOperationStep,
  findEnvConstraintNode,
  findConditionalParamConstraintNode,
};
