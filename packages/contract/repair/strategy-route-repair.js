/**
 * Persist strategy route feedback highlights (Observe→Adjust→Fire, CheckGoal→Continue→Fire).
 * Generic topology inference; no game ids.
 */
const {
  parseStrategyMermaidEdges,
  expandRouteHighlight,
  routeIsMisconceptionRoute,
  isAdjustLikeNodeId,
  extractStrategyNodeLabels,
  extractStratResultNodeIds,
} = require('../../shared/strategy-mermaid-parse.js');

function edgePairKey(a, b) {
  return `${a}->${b}`;
}

function mergeHighlightEdges(existing, additions) {
  const seen = new Set();
  const out = [];
  for (const pair of [...(existing || []), ...additions]) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const k = edgePairKey(pair[0], pair[1]);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([pair[0], pair[1]]);
  }
  return out;
}

function inferFeedbackPairs(route, mermaidBody, expanded) {
  const origNodes = new Set(route.highlightNodes || []);
  const origEdgeKeys = new Set(
    (route.highlightEdges || [])
      .filter(p => Array.isArray(p) && p.length >= 2)
      .map(p => edgePairKey(p[0], p[1])),
  );
  const edges = parseStrategyMermaidEdges(mermaidBody);
  const edgeByKey = new Map(edges.map(e => [e.key, e]));
  const nodeLabels = extractStrategyNodeLabels(mermaidBody);
  const addedPairs = [];

  for (const key of expanded.edgeKeys) {
    if (origEdgeKeys.has(key)) continue;
    const e = edgeByKey.get(key);
    if (!e) continue;
    const isFeedback = /^Observe[A-Za-z]*\d*$/i.test(e.from)
      || isAdjustLikeNodeId(e.from, nodeLabels)
      || isAdjustLikeNodeId(e.to, nodeLabels)
      || /^Continue\d*$/i.test(e.from)
      || /^Continue\d*$/i.test(e.to);
    const touchesSpine = origNodes.has(e.from) || origNodes.has(e.to)
      || expanded.highlightNodes.includes(e.from)
      || expanded.highlightNodes.includes(e.to);
    if (isFeedback && touchesSpine) addedPairs.push([e.from, e.to]);
  }
  return addedPairs;
}

function repairStrategyRouteHighlights(chapter) {
  const strat = chapter?.strategy;
  const mermaidBody = String(strat?.mermaid || '');
  if (!mermaidBody.trim() || !Array.isArray(strat?.routes)) return chapter;

  const resultKgIds = new Set(
    (chapter.kg?.nodes || []).filter(n => n.group === 'result' && n.layer === 'play').map(n => n.id),
  );

  const routes = strat.routes.map(route => {
    if (routeIsMisconceptionRoute(route, mermaidBody)) return route;
    if (route.kind === 'confoundProbe' || /试探混淆/.test(route.label || '')) return route;

    const expanded = expandRouteHighlight(route, mermaidBody, { resultKgIds });
    // Never persist ProbeCV bleed onto AV / trap routes
    const expandedNodes = (expanded.highlightNodes || []).filter(id => !/^(ProbeCV|ObserveCV|BackFromCV)/i.test(id));
    const expandedKeys = new Set([...(expanded.edgeKeys || [])].filter(k => !/ProbeCV|ObserveCV|BackFromCV/i.test(k)));
    const expandedClean = { highlightNodes: expandedNodes, edgeKeys: expandedKeys };
    const origSet = new Set(route.highlightNodes || []);
    const nodeLabels = extractStrategyNodeLabels(mermaidBody);
    const mapsToResult = (route.mapsTo || []).some(id => resultKgIds.has(id));
    const stratResultIds = extractStratResultNodeIds(mermaidBody);
    const sparse = !(Array.isArray(route.highlightEdges) && route.highlightEdges.length)
      || (route.highlightNodes || []).length < 6;

    // Persist full expanded spine for sparse 单变量 routes (Start/Select/Win-only bug).
    const newNodes = [...new Set([
      ...(route.highlightNodes || []).filter(id => !/^(ProbeCV|ObserveCV|BackFromCV)/i.test(id)),
      ...expandedClean.highlightNodes.filter(id => {
        if (sparse) return true;
        if (isAdjustLikeNodeId(id, nodeLabels)) return true;
        if (/^Continue\d*$/i.test(id)) return true;
        if (/^Retry[A-Za-z]*\d*$/i.test(id)) return true;
        if (/^(Fire|Launch|Tune|Observe|Check)/i.test(id)) return true;
        return origSet.has(id);
      }),
      ...(mapsToResult ? [...stratResultIds] : []),
    ])];

    const feedbackPairs = inferFeedbackPairs(route, mermaidBody, expandedClean);
    let highlightEdges = mergeHighlightEdges(route.highlightEdges, feedbackPairs);
    if (sparse && expandedClean.edgeKeys?.size) {
      const fromExpand = [...expandedClean.edgeKeys].map(k => {
        const j = k.indexOf('->');
        return j > 0 ? [k.slice(0, j), k.slice(j + 2)] : null;
      }).filter(Boolean);
      highlightEdges = mergeHighlightEdges(highlightEdges, fromExpand);
    }

    const changed = newNodes.length !== (route.highlightNodes || []).length
      || highlightEdges.length !== (route.highlightEdges || []).length;

    if (!changed) {
      return route.highlightFailureBranches === true
        ? route
        : { ...route, highlightFailureBranches: true };
    }

    return {
      ...route,
      highlightFailureBranches: true,
      highlightNodes: newNodes,
      highlightEdges,
    };
  });

  return {
    ...chapter,
    strategy: { ...strat, routes },
  };
}

module.exports = {
  repairStrategyRouteHighlights,
};
