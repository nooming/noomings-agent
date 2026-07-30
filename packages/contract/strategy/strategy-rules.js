const {
  routeIsMisconceptionRoute,
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
  isAdjustLikeNodeId,
} = require('../../shared/strategy-mermaid-parse.js');

function parseStrategyMermaid(mermaidBody) {
  const mm = String(mermaidBody || '');
  const edges = parseStrategyMermaidEdges(mm);
  const nodes = extractStrategyNodeLabels(mm);
  return { nodes, edges };
}

/** Pure structural padding — must not alone satisfy feedback-loop quality gate. */
function isMechanicalFeedbackScaffoldId(id) {
  return /^(LoopObserve|LoopAdjust|LoopRetest|RPref\d*|BackFromCV)$/i.test(String(id || ''));
}

function ensureEdgeNodesInLabelMap(nodes, edges) {
  for (const e of edges || []) {
    if (e.from && !nodes.has(e.from)) nodes.set(e.from, '');
    if (e.to && !nodes.has(e.to)) nodes.set(e.to, '');
  }
  return nodes;
}

/** Strategy mermaid class layering (teacher reference: few orange core, many default-gray rects). */
function validateStrategyMermaidLayering(mermaidBody) {
  const errors = [];
  const mm = String(mermaidBody || '');
  if (!mm.trim()) return errors;

  const coreCount = (mm.match(/:::stratCore\b/gi) || []).length;
  const rectNodes = [...mm.matchAll(/\b([A-Za-z][\w]*)\[([^\]]+)\](:::strat\w+)?/gi)];
  const stadiumNodes = [...mm.matchAll(/\b([A-Za-z][\w]*)\(\[([^\]]+)\]\)(:::strat\w+)?/gi)];
  const diamondNodes = [...mm.matchAll(/\b([A-Za-z][\w]*)\{([^}]+)\}(:::strat\w+)?/gi)];

  const rectCount = rectNodes.length;
  const maxCore = Math.max(4, Math.ceil(rectCount * 0.25));
  if (coreCount > maxCore) {
    errors.push(
      `quality: too many :::stratCore (${coreCount}, max ${maxCore}); reserve stratCore for 分水岭 (e.g. ModeOff/ModeOn), leave routine steps unclassified`,
    );
  }

  const successLabel = /过关|胜利|命中|成功|🎉/;
  const watershedSuccessExempt = /不影响过关|无效.*过关|关态下.*不影响|不影响.*判定|仅UI|仅 UI/i;
  for (const m of [...rectNodes, ...stadiumNodes]) {
    const label = m[2] || '';
    const cls = m[3] || '';
    if (
      successLabel.test(label)
      && !watershedSuccessExempt.test(label)
      && /:::strat(?:Core|Retry)\b/i.test(cls)
    ) {
      errors.push(`quality: success node must use :::stratResult, not ${cls.trim()} (label: ${label.slice(0, 24)})`);
    }
  }

  const condTagged = diamondNodes.filter(m => /:::stratCond\b/i.test(m[3] || '')).length;
  if (diamondNodes.length && condTagged < diamondNodes.length) {
    errors.push(
      `quality: strategy has ${diamondNodes.length} decision diamond(s) but only ${condTagged} :::stratCond — tag every {?} node`,
    );
  }

  return errors;
}

function uniqueMacroStrategyCount(strat) {
  const mm = String(strat?.mermaid || '');
  const edgeLabels = [...mm.matchAll(/StrategySelect\w*[^-\n]*(?:-->|-\.->)\s*\|([^|]+)\|/gi)]
    .map(m => m[1].trim());
  if (edgeLabels.length) {
    return new Set(edgeLabels.map(l => l.replace(/\s+/g, ''))).size;
  }
  const routes = Array.isArray(strat?.routes) ? strat.routes : [];
  const labels = routes
    .filter(r => r?.label && !/retry|再试|迷思|invalid/i.test(`${r.id || ''}${r.label || ''}`))
    .map(r => String(r.label).trim());
  return new Set(labels).size;
}

function hasObservationFeedbackLoop(mermaidBody) {
  const parsed = parseStrategyMermaid(mermaidBody);
  const edges = parsed.edges;
  if (!edges.length) return false;
  const nodes = ensureEdgeNodesInLabelMap(parsed.nodes, edges);

  const observeRe = /观察|测试|轨迹|落点|偏|命中|高抛|低打|能量|观测|再测|结果|电流/i;
  const adjustTextRe = /调整|微调|修正|补偿|增大|减小|逼近|回调|偏转|调参/;

  const observeNodes = new Set();
  const adjustNodes = new Set();
  nodes.forEach((label, id) => {
    // Mechanical Loop*/empty RPref* must not alone satisfy the gate
    if (isMechanicalFeedbackScaffoldId(id)) return;
    if (/^Observe\w*$/i.test(id) || observeRe.test(label || '') || observeRe.test(id)) {
      observeNodes.add(id);
    }
    if (isAdjustLikeNodeId(id, nodes) || adjustTextRe.test(label || '')) {
      adjustNodes.add(id);
    }
  });

  const adj = new Map();
  edges.forEach(e => {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  });

  const isRetryLike = (id) => {
    const label = nodes.get(id) || '';
    return /retry|再试|重试|迷思|invalid|误区/i.test(label) || /retry|invalid/i.test(id);
  };

  const isDomainRetestLike = (id) => {
    if (isMechanicalFeedbackScaffoldId(id)) return false;
    const label = nodes.get(id) || '';
    return /^(Fire|Launch|Test|Retest|QuickFire)\w*$/i.test(id)
      || /发射|再测|提交|测试|验证/.test(label);
  };

  function bfsPaths(from, maxHops) {
    const results = [];
    const q = [{ id: from, path: [from], hops: 0 }];
    while (q.length) {
      const { id, path, hops } = q.shift();
      if (hops >= maxHops) continue;
      for (const nxt of adj.get(id) || []) {
        if (path.includes(nxt)) continue;
        const nextPath = [...path, nxt];
        results.push({ end: nxt, path: nextPath });
        q.push({ id: nxt, path: nextPath, hops: hops + 1 });
      }
    }
    return results;
  }

  // Observe → Adjust → Observe (direct)
  for (const e1 of edges) {
    if (!observeNodes.has(e1.from) || !adjustNodes.has(e1.to)) continue;
    for (const e2 of edges) {
      if (e2.from === e1.to && observeNodes.has(e2.to)) return true;
    }
  }

  // Observe → Adjust → … → Observe (via Fire/Launch/retest within 3 hops)
  for (const o of observeNodes) {
    for (const e of edges) {
      if (e.from !== o || !adjustNodes.has(e.to)) continue;
      for (const p of bfsPaths(e.to, 3)) {
        if (!observeNodes.has(p.end)) continue;
        const mid = p.path.slice(1, -1).filter(id => !isRetryLike(id));
        if (mid.length > 2) continue;
        // Prefer paths that touch a concrete retest/fire; allow short domain paths too
        if (mid.some(isDomainRetestLike) || mid.length <= 1) return true;
        if (mid.every(id => !isMechanicalFeedbackScaffoldId(id))) return true;
      }
    }
  }

  return false;
}

function hasMechanicalFeedbackScaffold(mermaidBody) {
  const mm = String(mermaidBody || '');
  return /\bLoopObserve\b/.test(mm) && /\bLoopAdjust\b/.test(mm);
}

function isMentalBackboneStrong(mermaidBody) {
  const mm = String(mermaidBody || '');
  const diamonds = [...mm.matchAll(/\{[^}]+\}(:::stratCond)?/gi)];
  const condTagged = (mm.match(/:::stratCond\b/gi) || []).length;
  const labeledBranches = (mm.match(/-->\s*\|[^|]+\|/g) || []).length;
  return condTagged >= 3 && labeledBranches >= 3 && diamonds.length >= 2;
}

function buildStrategyNarrativeWarnings(strat, mermaidBody, hints) {
  const warnings = [];
  const combinedText = [
    String(mermaidBody || ''),
    ...(Array.isArray(strat?.routes) ? strat.routes.map(r => `${r.id || ''}${r.label || ''}${r.warn || ''}`) : []),
  ].join('\n');

  const hasStudentObservationWords = /偏近|偏远|偏高|偏低|高抛|低打|能量|落点|未命中|不足|偏多|偏少|未达标|未进洞|越山|未越山|出界|进洞|碰撞|未击中|偏转|未进|观察|测试/.test(
    combinedText,
  );
  if (!hasStudentObservationWords) {
    warnings.push('strategy 叙事文案缺学生可理解的观察反馈词（偏近/偏远/落点/出界等）');
  }

  const sliderN = hints?.variableKindSummary?.sliderCount
    ?? (hints?.sliderControlIds || []).length
    ?? strat?.hints?.variableKindSummary?.sliderCount
    ?? (strat?.sliderControlIds || []).length;
  if (sliderN >= 2) {
    const hasSingleVarPreferred = /控制变量|每次只|单变量|单参/.test(combinedText);
    if (!hasSingleVarPreferred) {
      warnings.push('strategy 多滑条课缺控制变量/单参 preferred route');
    }
  }

  const routes = (strat?.routes || []).filter(
    r => r?.label && !/retry|再试|迷思|invalid/i.test(r.label),
  );
  if (routes.length >= 2 && !routes.some(r => String(r.warn || '').trim())) {
    warnings.push('≥2 条主 routes 须至少一条填写 warn 误区/次优');
  }

  return warnings;
}

function collectOffModeReachableIds(mermaidBody) {
  const { nodes, edges } = parseStrategyMermaid(mermaidBody);
  const offRoots = new Set();
  let envId = null;
  nodes.forEach((label, id) => {
    if (/Env|环境|模式|mode/i.test(id) || /模式|环境|开关/.test(label)) envId = id;
  });
  edges.forEach(e => {
    if (envId && e.from === envId && /否|关|off|关闭|0/i.test(e.label)) offRoots.add(e.to);
  });
  if (!offRoots.size) {
    nodes.forEach((label, id) => {
      if (/ModeOff|Ideal|OffMode/i.test(id) || /关态|无效|无关|不影响/.test(label)) offRoots.add(id);
    });
  }
  const reach = new Set(offRoots);
  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach(e => {
      if (reach.has(e.from) && !reach.has(e.to)) {
        reach.add(e.to);
        changed = true;
      }
    });
  }
  return reach;
}

function chapterSuggestsConditionalParamProfile(chapter) {
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!/Env|环境|模式|mode/i.test(mm)) return false;
  return /参数|param|变量|无关|无效|ModeOff|ModeOn|Ideal/i.test(mm);
}

function resolveConditionalParamProfile(chapter, gameHints) {
  if (gameHints?.hasConditionalParamProfile != null) return !!gameHints.hasConditionalParamProfile;
  if (gameHints?.hasMassEnvCoupling != null) return !!gameHints.hasMassEnvCoupling;
  return chapterSuggestsConditionalParamProfile(chapter);
}

function hasObservationEdgeOrNodeLabel(mermaidBody) {
  const mm = String(mermaidBody || '');
  const observationEdgeRe = /-->\s*\|[^|]*(?:偏近|偏远|偏高|偏低|高抛|低打|能量|落点|未命中|不足|偏多|偏少|未达标|未进洞|越山|未越山|出界|进洞|碰撞|未击中|偏转|未进)[^|]*\|/i;
  if (observationEdgeRe.test(mm)) return true;

  const { nodes, edges } = parseStrategyMermaid(mm);
  for (const e of edges) {
    const fromLabel = nodes.get(e.from) || '';
    const toLabel = nodes.get(e.to) || '';
    const edgeLabel = e.label || '';
    if (observationEdgeRe.test(`|${edgeLabel}|`)) return true;
    if (/观察|测试/.test(toLabel) && /(?:偏近|偏远|落点|未命中|未达标|不足|出界|进洞|碰撞)/.test(toLabel)) return true;
    if (/^Observe/i.test(e.from) && /(?:偏近|偏远|未命中|未达标|不足|出界|进洞|碰撞|未击中|偏转)/.test(`${edgeLabel}${toLabel}`)) {
      return true;
    }
    if (/命中|目标|达标/.test(fromLabel || e.from) && /观察|测试/.test(toLabel)) return true;
  }

  const observeNodeRe = /\bObserve[\w]*\{[^}]*观察[^}]*\}|\bObserve[\w]*\{[^}]*\?[^}]*\}:::stratCond/i;
  if (observeNodeRe.test(mm)) {
    const hasFeedbackOut = edges.some(e =>
      /^Observe/i.test(e.from)
      && !/进洞|过关|达标|胜利|success|win/i.test(`${e.label || ''}${nodes.get(e.to) || ''}`),
    );
    if (hasFeedbackOut) return true;
  }

  return false;
}

/** Coupled strategy shape: macro pathways, watershed copy, observation labels; conditional-param rules are optional. */
function validateStrategyTeacherAlignment(mermaidBody, opts = {}) {
  const errors = [];
  const coupledMode = !!opts.coupledMode;
  const condParam = !!(opts.conditionalParamProfile ?? opts.massEnvProfile);
  const mm = String(mermaidBody || '');
  if (!mm.trim()) return errors;

  const invalidNodes = [...mm.matchAll(/\b([A-Za-z][\w]*)\[([^\]]+)\]:::stratInvalid/gi)];
  if (coupledMode && condParam && invalidNodes.length) {
    const offReach = collectOffModeReachableIds(mm);
    for (const m of invalidNodes) {
      const id = m[1];
      const label = m[2] || '';
      if (!/参数|param|变量|迷思|无效|无关|误调/i.test(label)) {
        errors.push('quality: :::stratInvalid in conditional-param profile should describe conditional misconception (参数/无效/无关)');
      }
      if (offReach.size && !offReach.has(id)) {
        errors.push(`quality: :::stratInvalid node ${id} must sit in off-mode branch, not active-mode branch`);
      }
    }
    const hasCheckCondParam = /\{[^}]*(参数|param|变量|调整)[^}]*\}:::stratCond/i.test(mm)
      || /CheckParam|CheckCond|CheckB/i.test(mm);
    if (!hasCheckCondParam) {
      errors.push('quality: off branch needs {是否调整条件无效参数?}:::stratCond before stratInvalid loop');
    }
  } else if (coupledMode && invalidNodes.length) {
    const offReach = collectOffModeReachableIds(mm);
    for (const m of invalidNodes) {
      const id = m[1];
      if (offReach.size && !offReach.has(id)) {
        errors.push(`quality: :::stratInvalid node ${id} should be in the mode branch where that control is ineffective`);
      }
    }
  }

  const watershedFanout = (mm.match(/\b(?:ModeOff|Ideal|OffMode|NoDrag)\s*-->\s*[A-Za-z][\w]*\[/gi) || []).length;
  if (watershedFanout > 2) {
    errors.push('quality: after mode watershed use StrategySelect{?}:::stratCond with |途径| edges, not multiple direct fan-out boxes');
  }

  const hasStrategySelect = /\bStrategySelect\s*\{|\{[^}]*策略[^}]*\}:::stratCond/i.test(mm);
  if (!hasStrategySelect && (mm.match(/-->\s*\|[^|]*(?:途径|策略|宏策)[^|]*\|/gi) || []).length < 2) {
    const pathwayEdges = (mm.match(/-->\s*\|[^|]*(?:途径|策略|宏策|控制)[^|]*\|/gi) || []).length;
    if (pathwayEdges < 2 && coupledMode) {
      errors.push('quality: need StrategySelect{选择调参策略?}:::stratCond with >=2 |途径| macro-strategy edges');
    }
  }

  for (const m of [...mm.matchAll(/\b([A-Za-z][\w]*)\[([^\]]+)\](:::stratCore)?/gi)]) {
    const label = m[2] || '';
    if (/^(关态|开态|开启|关闭)(模式)?$/i.test(label.trim()) && label.length < 12) {
      errors.push('quality: stratCore watershed labels should explain mechanism, not bare mode toggle text');
    }
  }

  if (!hasObservationEdgeOrNodeLabel(mm)) {
    errors.push('quality: need >=1 observation edge label (e.g. 偏近/偏远/未命中/不足) or Observe node with observation wording');
  }

  return errors;
}

function validateControlVariableRoutes(strat, hints, mermaidBody = '') {
  const warnings = [];
  const sliderN = hints?.variableKindSummary?.sliderCount
    ?? (hints?.sliderControlIds || []).length;
  if (sliderN < 2) return { ok: true, warnings };

  const routes = Array.isArray(strat?.routes) ? strat.routes : [];
  const mm = String(mermaidBody || strat?.mermaid || '');

  const hasControlVar = routes.some(r => /控制变量|每次只|单变量/.test(r.label || ''))
    || /控制变量|每次只|单变量·/.test(mm);
  if (!hasControlVar) {
    warnings.push('strategy routes 缺少控制变量法途径（控制变量法或每次只调一项）');
  }

  const hasTrap = routes.some(r =>
    /trap|盲调|多滑条/i.test(`${r.id || ''}${r.label || ''}`)
    || /多个变量|盲调|难归因|同时调/.test(String(r.warn || '')),
  );
  if (!hasTrap) {
    warnings.push('strategy routes 缺少多滑条盲调次优途径（须 routes.warn）');
  }

  for (const r of routes) {
    if (/trap|盲调|多滑条/i.test(`${r.id || ''}${r.label || ''}`)) {
      if (!String(r.warn || '').trim()) {
        warnings.push(`strategy.routes[${r.id}]: 多滑条盲调途径须填写 warn 误区提示`);
      }
      if (routeIsMisconceptionRoute(r, mm) === false && (r.highlightNodes || []).some(id => /Win|过关/i.test(id))) {
        warnings.push(`strategy.routes[${r.id}]: trap 途径 highlightNodes 不应含 Win/过关节点`);
      }
    }
  }

  return { ok: warnings.length === 0, warnings };
}

const validateSingleVariableRoutes = validateControlVariableRoutes;

const PREFERRED_ADJUST_CONFLICT_RE = /同时(?:调节|调整|调)|二者|两个参数|两参一起/;
const PREFERRED_ADJUST_OR_RE = /(?:增大|减小|调整|调).{0,12}或.{0,12}(?:增大|减小|调整|调)|固定.{0,8}和.{0,8}(?:同时|一起)/i;

function validateObserveAdjustControlVarConsistency(chapter, hints) {
  const errors = [];
  const warnings = [];
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!mm.trim()) return { ok: true, errors, warnings };

  const { nodes: nodeLabels } = parseStrategyMermaid(mm);
  const routes = chapter?.strategy?.routes || [];
  const preferredRoutes = routes.filter(r =>
    r.tier !== 'suboptimal'
    && !/trap|盲调|多参/i.test(`${r.id}${r.label}`)
    && r.warn !== 'irrelevant',
  );

  const checkText = (text, ctx) => {
    if (!PREFERRED_ADJUST_CONFLICT_RE.test(text) && !PREFERRED_ADJUST_OR_RE.test(text)) return;
    if (/stratInvalid|Invalid|误区|Trap|Multi|盲调/i.test(ctx)) return;
    errors.push(`quality: ${ctx} preferred-path adjust copy must not use dual-param or "A or B" (control-variable method)`);
  };

  nodeLabels.forEach((label, id) => {
    if (!/Adjust|Tune|微调/i.test(id) && !/调整|微调|修正|补偿|增大|减小|同时|或/.test(label)) return;
    checkText(`${id}${label}`, `strategy node ${id}`);
  });

  const edges = mm.match(/-->\s*\|([^|]+)\|/g) || [];
  for (const e of edges) {
    const lab = (e.match(/\|([^|]+)\|/) || [])[1] || '';
    if (/(增大|减小|调整|同时|或)/.test(lab) && !/Invalid|误区/.test(e)) {
      warnings.push('quality: Observe edge label should be observation-only (e.g. 偏近/偏远), not adjust instruction');
    }
  }

  if (preferredRoutes.length && errors.length === 0) {
    const combined = preferredRoutes.map(r => r.label).join(' ');
    if (PREFERRED_ADJUST_CONFLICT_RE.test(combined) || PREFERRED_ADJUST_OR_RE.test(combined)) {
      checkText(combined, 'strategy.routes preferred');
    }
  }

  const sliderN = hints?.variableKindSummary?.sliderCount
    ?? (hints?.sliderControlIds || []).length;
  if (sliderN < 2 && errors.length === 0) return { ok: true, errors, warnings };

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  validateStrategyMermaidLayering,
  uniqueMacroStrategyCount,
  hasObservationFeedbackLoop,
  hasMechanicalFeedbackScaffold,
  isMechanicalFeedbackScaffoldId,
  isMentalBackboneStrong,
  buildStrategyNarrativeWarnings,
  validateControlVariableRoutes,
  validateSingleVariableRoutes,
  resolveConditionalParamProfile,
  validateStrategyTeacherAlignment,
  validateObserveAdjustControlVarConsistency,
  collectOffModeReachableIds,
  collectVacuumReachableIds: collectOffModeReachableIds,
  chapterSuggestsConditionalParamProfile,
  chapterSuggestsMassEnvProfile: chapterSuggestsConditionalParamProfile,
  resolveMassEnvProfile: resolveConditionalParamProfile,
  hasObservationEdgeOrNodeLabel,
  parseStrategyMermaid,
};
