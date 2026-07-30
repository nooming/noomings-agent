const {
  routeIsMisconceptionRoute,
  parseStrategyMermaidEdges,
  expandRouteHighlight,
  isAdjustLikeNodeId,
  extractStrategyNodeLabels,
} = require('../../shared/strategy-mermaid-parse.js');
const { countNumberedParallelCopies } = require('../strategy/strategy-compact');

function mermaidHasObserveAdjustFeedback(mermaidBody) {
  const edges = parseStrategyMermaidEdges(mermaidBody);
  const nodeLabels = extractStrategyNodeLabels(mermaidBody);
  return edges.some(e =>
    /^Observe[A-Za-z]*\d*$/i.test(e.from)
    && (isAdjustLikeNodeId(e.to, nodeLabels)
      || /^Continue\d*$/i.test(e.to)
      || /^Retry[A-Za-z]*\d*$/i.test(e.to)),
  );
}

function edgeKeyParts(key) {
  const i = key.indexOf('->');
  if (i < 0) return null;
  return { from: key.slice(0, i), to: key.slice(i + 2) };
}

function routeHasFeedbackLoopHighlighted(route, mermaidBody, resultKgIds) {
  if (route?.warn === 'irrelevant' || routeIsMisconceptionRoute(route, mermaidBody)) return true;
  // Confound / 试探混淆 routes use ObserveCV, not domain Observe→Adjust→Fire
  if (/confound|混淆|probe/i.test(`${route?.id || ''}${route?.label || ''}`)) return true;
  const spineHasObserve = (route.highlightNodes || []).some(n =>
    /^Observe(?!CV)[A-Za-z]*\d*$/i.test(n),
  );
  if (!spineHasObserve) return true;
  if (!mermaidHasObserveAdjustFeedback(mermaidBody)) return true;

  const expanded = expandRouteHighlight(route, mermaidBody, { resultKgIds });
  const keys = expanded.edgeKeys;
  const nodeLabels = extractStrategyNodeLabels(mermaidBody);
  const hasObserveAdjust = [...keys].some(k => {
    const p = edgeKeyParts(k);
    if (!p) return false;
    return /^Observe(?!CV)[A-Za-z]*\d*$/i.test(p.from) && isAdjustLikeNodeId(p.to, nodeLabels);
  });
  const hasAdjustRetest = [...keys].some(k => {
    const p = edgeKeyParts(k);
    if (!p) return false;
    return isAdjustLikeNodeId(p.from, nodeLabels)
      && /^(Fire|Launch|Tune|QuickFire)[A-Za-z]*\d*$/i.test(p.to);
  });
  const hasContinueRetest = [...keys].some(k => {
    const p = edgeKeyParts(k);
    if (!p) return false;
    return /^Continue[A-Za-z]*\d*$/i.test(p.from)
      && /^(Fire|Launch|Tune|QuickFire)[A-Za-z]*\d*$/i.test(p.to);
  });
  return (hasObserveAdjust && hasAdjustRetest) || hasContinueRetest;
}

function validateRouteFeedbackHighlights(chapter, hints) {
  const errors = [];
  const warnings = [];
  const mermaidBody = String(chapter?.strategy?.mermaid || '');
  if (!mermaidBody.trim()) return { errors, warnings, ok: true };

  const resultKgIds = new Set(
    (chapter.kg?.nodes || []).filter(n => n.group === 'result' && n.layer === 'play').map(n => n.id),
  );
  const routes = chapter.strategy?.routes || [];
  let allOk = true;

  for (const route of routes) {
    if (!routeHasFeedbackLoopHighlighted(route, mermaidBody, resultKgIds)) {
      allOk = false;
      errors.push(
        `quality: strategy.routes (${route.id}): spine has Observe but expanded highlight lacks Observe→Adjust→Fire feedback loop`,
      );
    }
  }

  const edgeCount = parseStrategyMermaidEdges(mermaidBody).length;
  const isChallenge = hints?.levelContext?.focusMode === 'challenge';
  if (isChallenge && edgeCount > 40 && hints?.sourceComplexity !== 'rich') {
    warnings.push(
      `quality: challenge-level strategy.mermaid has ${edgeCount} edges (>40); prefer shared Fire/Observe/CheckGoal/Win loop`,
    );
  }
  if (isChallenge && countNumberedParallelCopies(mermaidBody) >= 2) {
    warnings.push(
      'quality: strategy has numbered parallel Fire/Observe copies; enrich should compact on refresh',
    );
  }

  return { errors, warnings, ok: allOk };
}

module.exports = { validateRouteFeedbackHighlights };
