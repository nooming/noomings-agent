/**
 * Derive strategy.routes[].mapsTo from KG play chain order (generic topology).
 */
const { orderedPlayPathIds } = require('../graph/play-graph');
const { routeIsMisconceptionRoute } = require('../../shared/strategy-mermaid-parse.js');
const { isTrapRoute } = require('../../judge/coupled-invalid');

function playResultId(chapter) {
  const nodes = chapter?.kg?.nodes || [];
  return (nodes.find(n => n.group === 'result' && n.layer === 'play')
    || nodes.find(n => n.id === 'R1')
    || nodes.find(n => n.group === 'result'))?.id;
}

function buildPlayPathMapsTo(chapter, opts = {}) {
  const nodes = chapter?.kg?.nodes || [];
  const links = chapter?.kg?.links || [];
  const path = orderedPlayPathIds(nodes, links);
  if (!path.length) return [];

  const resultId = playResultId(chapter);
  const includeResult = opts.includeResult !== false;
  const includeEnv = opts.includeEnv !== false;

  let ids = path.filter(id => {
    const n = nodes.find(x => x.id === id);
    if (!n) return false;
    if (n.group === 'result') return includeResult;
    if (!includeEnv && n.group === 'constraint') {
      const { findEnvConstraintNode } = require('../graph/dt-kg-coupling');
      const envNode = findEnvConstraintNode(nodes);
      if (envNode && n.id === envNode.id) return false;
    }
    return n.layer === 'play';
  });

  if (!includeResult && resultId) {
    ids = ids.filter(id => id !== resultId);
  }

  return ids;
}

function repairStrategyMapsToFromKg(chapter, _gameHints) {
  const strat = chapter?.strategy;
  if (!strat?.routes?.length || !chapter?.kg?.nodes?.length) return chapter;

  const mermaidBody = String(strat.mermaid || '');
  const fullPath = buildPlayPathMapsTo(chapter, { includeResult: true, includeEnv: true });
  const noResultPath = buildPlayPathMapsTo(chapter, { includeResult: false, includeEnv: true });

  const routes = strat.routes.map(route => {
    const misconception = routeIsMisconceptionRoute(route, mermaidBody);
    const trap = isTrapRoute(route) || route.tier === 'suboptimal';
    const basePath = (misconception || trap) ? noResultPath : fullPath;
    if (!basePath.length) return route;

    const teachIds = (route.mapsTo || []).filter(id => {
      const n = chapter.kg.nodes.find(x => x.id === id);
      return n?.layer === 'teach';
    });

    const mapsTo = [...basePath];
    for (const tid of teachIds) {
      if (!mapsTo.includes(tid)) mapsTo.push(tid);
    }

    if (mapsTo.length === (route.mapsTo || []).length
      && mapsTo.every((id, i) => id === route.mapsTo[i])) {
      return route;
    }
    return { ...route, mapsTo };
  });

  return { ...chapter, strategy: { ...strat, routes } };
}

module.exports = {
  buildPlayPathMapsTo,
  repairStrategyMapsToFromKg,
};
