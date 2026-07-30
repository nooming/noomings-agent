/**
 * Narrative cleanliness metrics for strategy mermaid / routes.
 * Aligned with quality gate: mechanical Loop* / empty RPref* must not pad structural pass.
 */

const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('../../packages/shared/strategy-mermaid-parse');
const {
  hasObservationFeedbackLoop,
  isMechanicalFeedbackScaffoldId,
} = require('../../packages/contract/strategy/strategy-rules');

const MECHANICAL_NODE_RE = /^(LoopObserve|LoopAdjust|LoopRetest|RPref\d*|BackFromCV)$/i;
const EMPTY_LOOP_NODES = new Set(['LoopObserve', 'LoopAdjust', 'LoopRetest']);

function listMermaidNodeIds(mermaid) {
  const labels = extractStrategyNodeLabels(mermaid || '');
  if (labels instanceof Map) return [...labels.keys()];
  return Object.keys(labels || {});
}

function detectMechanicalPatchNodes(chapter) {
  const mermaid = chapter?.strategy?.mermaid || '';
  const ids = listMermaidNodeIds(mermaid);
  const labelMap = extractStrategyNodeLabels(mermaid);
  const mechanical = ids.filter(id => MECHANICAL_NODE_RE.test(id) || isMechanicalFeedbackScaffoldId(id));
  const usedAsPureGate = mechanical.filter(id => {
    // BackFromCV is legitimate confound-return narrative, not Loop* padding
    if (/^BackFromCV$/i.test(id)) return false;
    const lab = String(
      (labelMap instanceof Map ? labelMap.get(id) : labelMap?.[id]) || id,
    );
    const generic = /观察|微调|再测|控制变量|每次只改|回到主/.test(lab);
    return generic || EMPTY_LOOP_NODES.has(id) || /^RPref\d*$/i.test(id);
  });
  return {
    mechanicalNodeIds: mechanical,
    pureGateLike: usedAsPureGate,
    count: usedAsPureGate.length,
  };
}

function detectEmptyLoops(chapter) {
  const mermaid = chapter?.strategy?.mermaid || '';
  const edges = parseStrategyMermaidEdges(mermaid);
  const ids = new Set(listMermaidNodeIds(mermaid));
  const hasLoopTriplet = ['LoopObserve', 'LoopAdjust', 'LoopRetest'].every(n => ids.has(n));
  if (!hasLoopTriplet) {
    return { hasEmptyLoopScaffold: false, detail: null, hasDomainBridge: hasObservationFeedbackLoop(mermaid) };
  }
  const loopEdges = edges.filter(e =>
    EMPTY_LOOP_NODES.has(e.from) || EMPTY_LOOP_NODES.has(e.to),
  );
  // Domain bridge = gate-qualified Observe→Adjust→Fire loop that does NOT rely on Loop*
  const stripped = mermaid
    .split(/\n/)
    .filter(line => !/\b(LoopObserve|LoopAdjust|LoopRetest)\b/.test(line))
    .join('\n');
  const hasDomainBridge = hasObservationFeedbackLoop(stripped);
  return {
    hasEmptyLoopScaffold: true,
    loopEdgeCount: loopEdges.length,
    hasDomainBridge,
    suspicious: !hasDomainBridge,
    detail: !hasDomainBridge
      ? 'LoopObserve/Adjust/Retest 形成闭环但缺少指向具体调参/发射节点的桥接（纯机械门控）'
      : '含 Loop* 脚手架残留（域环已存在，应拆除）',
  };
}

function normalizeEdgeLabel(s) {
  return String(s || '')
    .replace(/^单变量[·•.]/, '')
    .replace(/^试探混淆[·•.]/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function detectRouteEdgeLabelMismatch(chapter) {
  const mermaid = chapter?.strategy?.mermaid || '';
  const edges = parseStrategyMermaidEdges(mermaid);
  const routeLabels = (chapter?.strategy?.routes || [])
    .map(r => String(r.label || '').trim())
    .filter(Boolean);
  if (!routeLabels.length) {
    return { mismatches: [], coverage: null };
  }
  const selectEdges = edges.filter(e => /StrategySelect/i.test(e.from) && e.label);
  const edgeLabs = selectEdges.map(e => String(e.label || '').trim()).filter(Boolean);
  const mismatches = [];
  for (const rl of routeLabels) {
    if (/多参|盲调|trap/i.test(rl)) continue;
    const rn = normalizeEdgeLabel(rl);
    const hit = edgeLabs.some(el => {
      const en = normalizeEdgeLabel(el);
      return en === rn || en.includes(rn) || rn.includes(en) || el.includes(rl) || rl.includes(el);
    });
    if (!hit && /单变量|混淆/.test(rl)) {
      mismatches.push({ routeLabel: rl, issue: 'no_matching_strategySelect_edge_label' });
    }
  }
  for (const el of edgeLabs) {
    if (/控制变量|每次只改/.test(el)) continue;
    const en = normalizeEdgeLabel(el);
    const hit = routeLabels.some(rl => {
      const rn = normalizeEdgeLabel(rl);
      return en === rn || en.includes(rn) || rn.includes(en);
    });
    if (!hit && /单变量|混淆/.test(el)) {
      mismatches.push({ edgeLabel: el, issue: 'edge_label_not_in_routes' });
    }
  }
  const coverage = edgeLabs.length
    ? Math.round(((edgeLabs.length - mismatches.filter(m => m.edgeLabel).length) / edgeLabs.length) * 1000) / 1000
    : null;
  return { mismatches, coverage, strategySelectEdgeLabels: edgeLabs };
}

/**
 * @returns {{ score: number, flags: object, issues: string[] }}
 * score 1 = clean, 0 = dirty
 */
function assessNarrativeCleanliness(chapter) {
  const mech = detectMechanicalPatchNodes(chapter);
  const loops = detectEmptyLoops(chapter);
  const mismatch = detectRouteEdgeLabelMismatch(chapter);
  const issues = [];
  let score = 1;
  if (mech.count >= 3) {
    score -= 0.35;
    issues.push(`机械门控节点偏多（${mech.pureGateLike.slice(0, 6).join(', ')}）`);
  } else if (mech.count >= 1) {
    score -= 0.15;
    issues.push(`存在机械门控节点：${mech.pureGateLike.slice(0, 4).join(', ')}`);
  }
  if (loops.suspicious) {
    score -= 0.4;
    issues.push(loops.detail || '空环脚手架可疑（纯机械，门控不计合格）');
  } else if (loops.hasEmptyLoopScaffold) {
    score -= 0.2;
    issues.push(loops.detail || '含 LoopObserve 空环脚手架残留（应拆除）');
  }
  if (mismatch.mismatches.length >= 3) {
    score -= 0.25;
    issues.push(`边标签与 routes 不一致 ${mismatch.mismatches.length} 处`);
  } else if (mismatch.mismatches.length >= 1) {
    score -= 0.1;
    issues.push(`边标签与 routes 轻微不一致（${mismatch.mismatches.length}）`);
  }
  score = Math.max(0, Math.round(score * 1000) / 1000);
  return {
    score,
    dirty: score < 0.75,
    flags: {
      mechanical: mech,
      emptyLoops: loops,
      routeEdgeMismatch: {
        count: mismatch.mismatches.length,
        coverage: mismatch.coverage,
        samples: mismatch.mismatches.slice(0, 8),
      },
    },
    issues,
  };
}

module.exports = {
  assessNarrativeCleanliness,
  detectMechanicalPatchNodes,
  detectEmptyLoops,
  detectRouteEdgeLabelMismatch,
};
