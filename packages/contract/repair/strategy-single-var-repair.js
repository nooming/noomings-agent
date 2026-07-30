const { buildStrategyRoutePlan, buildPerAvStrategyRoutes, TRAP_WARN } = require('../../generate/strategy-route-plan');
const { routeIsMisconceptionRoute } = require('../../shared/strategy-mermaid-parse.js');
const { isTrapRoute } = require('../../judge/coupled-invalid');

function sliderCount(gameHints) {
  return gameHints?.variableKindSummary?.sliderCount
    ?? (gameHints?.sliderControlIds || []).length;
}

function routeLabelMatch(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function isSingleVarRoute(r) {
  return /单变量·|单调/.test(String(r?.label || ''))
    || /^main_single/i.test(String(r?.id || ''));
}

function isDuplicatePreferredRoute(r, planIds) {
  if (planIds.has(r.id)) return true;
  if (isSingleVarRoute(r)) return true;
  if (/^main_/i.test(r.id) && r.id !== 'main') return true;
  return false;
}

function findExistingRoute(routes, planRoute) {
  return routes.find(r =>
    r.id === planRoute.id
    || routeLabelMatch(r.label, planRoute.label)
    || (planRoute.tier === 'suboptimal' && /trap|盲调|多滑条/i.test(`${r.id}${r.label}`)),
  );
}

function mergeHighlightIntoMain(main, donor) {
  if (!donor) return main;
  const nodes = new Set([...(main.highlightNodes || []), ...(donor.highlightNodes || [])]);
  const edgeKeys = new Set(
    (main.highlightEdges || []).map(p => `${p[0]}->${p[1]}`),
  );
  const edges = [...(main.highlightEdges || [])];
  for (const p of donor.highlightEdges || []) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const k = `${p[0]}->${p[1]}`;
    if (edgeKeys.has(k)) continue;
    edgeKeys.add(k);
    edges.push(p);
  }
  return {
    ...main,
    highlightNodes: [...nodes],
    highlightEdges: edges,
  };
}

function mergeRoute(existing, planRoute, mermaidBody) {
  const isTrap = planRoute.tier === 'suboptimal';
  const merged = {
    ...(existing || {}),
    id: isTrap
      ? (existing?.id && /trap/i.test(existing.id) ? existing.id : planRoute.id)
      : (planRoute.id === 'main' ? 'main' : (existing?.id || planRoute.id)),
    label: planRoute.label,
    mapsTo: planRoute.mapsTo?.length ? planRoute.mapsTo : (existing?.mapsTo || []),
    warn: isTrap ? (planRoute.warn || TRAP_WARN) : (planRoute.warn || existing?.warn || ''),
    score: planRoute.score != null ? planRoute.score : existing?.score,
    weight: planRoute.weight != null ? planRoute.weight : existing?.weight,
    ...(planRoute.priorityRank != null ? { priorityRank: planRoute.priorityRank } : {}),
    highlightNodes: existing?.highlightNodes?.length
      ? existing.highlightNodes
      : planRoute.highlightNodes,
    highlightEdges: existing?.highlightEdges || planRoute.highlightEdges || [],
  };
  if (isTrap && mermaidBody) {
    const hl = new Set(merged.highlightNodes || []);
    for (const id of hl) {
      if (/^Win|Victory|Success/i.test(id) || /过关|胜利/.test(id)) hl.delete(id);
    }
    merged.highlightNodes = [...hl];
  }
  return merged;
}

function repairSingleVariableStrategyRoutes(chapter, gameHints) {
  if (!chapter?.strategy || sliderCount(gameHints) < 2) return chapter;

  const perAv = buildPerAvStrategyRoutes(gameHints, chapter);
  const plan = perAv || buildStrategyRoutePlan(gameHints, chapter, gameHints?.analyzeParse);
  const mermaidBody = String(chapter.strategy.mermaid || '');
  const existing = Array.isArray(chapter.strategy.routes) ? chapter.strategy.routes : [];
  const merged = [];
  const usedIds = new Set();
  const planIds = new Set(plan.routes.map(r => r.id));

  for (const planRoute of plan.routes) {
    const pool = existing.filter(r => !usedIds.has(r.id) && !isSingleVarRoute(r));
    const found = findExistingRoute(pool, planRoute)
      || (planRoute.id === 'main'
        ? existing.find(r => /控制变量/.test(r.label || '') && !usedIds.has(r.id))
        : null);
    if (found) usedIds.add(found.id);
    let route = mergeRoute(found, planRoute, mermaidBody);
    if (planRoute.id === 'main') {
      for (const r of existing) {
        if (usedIds.has(r.id)) continue;
        if (/^main_/i.test(r.id) || isSingleVarRoute(r)) {
          route = mergeHighlightIntoMain(route, r);
          usedIds.add(r.id);
        }
      }
    }
    merged.push(route);
  }

  for (const r of existing) {
    if (usedIds.has(r.id)) continue;
    if (routeIsMisconceptionRoute(r, mermaidBody)) {
      merged.push(r);
      continue;
    }
    if (isTrapRoute(r) && !planIds.has(r.id)) {
      merged.push({ ...r, warn: r.warn || TRAP_WARN });
      continue;
    }
    if (isDuplicatePreferredRoute(r, planIds)) continue;
    const dup = merged.some(m => routeLabelMatch(m.label, r.label));
    if (!dup) merged.push(r);
  }

  return {
    ...chapter,
    strategy: {
      ...chapter.strategy,
      routes: merged,
    },
  };
}

module.exports = {
  repairSingleVariableStrategyRoutes,
  repairStrategyRoutes: repairSingleVariableStrategyRoutes,
};
