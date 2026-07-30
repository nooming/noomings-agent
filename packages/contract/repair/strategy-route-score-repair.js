/**
 * Assign differentiated score/weight on strategy.routes by AV priorityRank.
 * High-priority single-var routes score higher; trap is lowest.
 * Enables later path scoring vs expert gold without relying on equal LLM weights.
 */

const { getRankedAdjustmentVariables } = require('../../generate/strategy-route-plan');

const SCORE_BY_RANK = {
  1: 1.0,
  2: 0.85,
  3: 0.7,
  4: 0.55,
};
const TRAP_SCORE = 0.2;
const DEFAULT_PREFERRED = 0.75;

function scoreForPriorityRank(rank) {
  const r = Number(rank);
  if (Number.isFinite(r) && SCORE_BY_RANK[r] != null) return SCORE_BY_RANK[r];
  if (Number.isFinite(r) && r > 4) return Math.max(0.35, 0.55 - (r - 4) * 0.08);
  return DEFAULT_PREFERRED;
}

function labelToAvRank(label, rankedAvs) {
  const m = String(label || '').match(/单变量·(.+)$/);
  if (!m) return null;
  const name = m[1].trim();
  const hit = rankedAvs.find(a => a.label === name || String(a.controlId || '').includes(name));
  return hit?.priorityRank ?? null;
}

function isTrapRoute(route) {
  return route?.tier === 'suboptimal'
    || /trap|盲调|多参|多滑/i.test(`${route?.id || ''}${route?.label || ''}`);
}

/**
 * @returns {{ score: number, weight: number, priorityRank?: number }}
 */
function computeRouteScoreFields(route, rankedAvs, indexAmongPreferred) {
  if (isTrapRoute(route)) {
    return { score: TRAP_SCORE, weight: TRAP_SCORE, priorityRank: 99 };
  }
  const fromLabel = labelToAvRank(route.label, rankedAvs);
  const rank = fromLabel
    ?? route.priorityRank
    ?? (indexAmongPreferred + 1);
  const score = scoreForPriorityRank(rank);
  return { score, weight: score, priorityRank: rank };
}

/**
 * Repair routes[] so multi-AV chapters have differentiated score/weight.
 */
function repairStrategyRouteScores(chapter, gameHints) {
  if (!chapter?.strategy?.routes?.length) return chapter;
  const routes = chapter.strategy.routes;
  const preferred = routes.filter(r => !isTrapRoute(r) && r.warn !== 'irrelevant');
  // Only force differentiation when multi preferred routes (multi-AV)
  if (preferred.length < 2 && !routes.some(isTrapRoute)) return chapter;

  const rankedAvs = getRankedAdjustmentVariables(gameHints || {}, chapter);
  let preferredIdx = 0;
  const nextRoutes = routes.map(r => {
    if (r.warn === 'irrelevant') return r;
    const idx = isTrapRoute(r) ? -1 : preferredIdx++;
    const fields = computeRouteScoreFields(r, rankedAvs, Math.max(0, idx));
    // Always overwrite identical/missing scores for consistency
    return {
      ...r,
      score: fields.score,
      weight: fields.weight,
      ...(fields.priorityRank != null && fields.priorityRank < 99
        ? { priorityRank: fields.priorityRank }
        : {}),
    };
  });

  const preferredScores = nextRoutes
    .filter(r => !isTrapRoute(r) && r.warn !== 'irrelevant')
    .map(r => r.score);
  const allSame = preferredScores.length >= 2
    && preferredScores.every(s => s === preferredScores[0]);

  // If still identical (no AV ranks), stair-step by order
  let finalRoutes = nextRoutes;
  if (allSame) {
    let i = 0;
    finalRoutes = nextRoutes.map(r => {
      if (isTrapRoute(r) || r.warn === 'irrelevant') {
        return { ...r, score: TRAP_SCORE, weight: TRAP_SCORE };
      }
      const score = scoreForPriorityRank(i + 1);
      i += 1;
      return { ...r, score, weight: score, priorityRank: i };
    });
  }

  return {
    ...chapter,
    strategy: {
      ...chapter.strategy,
      routes: finalRoutes,
    },
  };
}

function routesNeedScoreRepair(chapter) {
  const routes = chapter?.strategy?.routes || [];
  const preferred = routes.filter(r => !isTrapRoute(r) && r.warn !== 'irrelevant');
  if (preferred.length < 2) return false;
  const missing = preferred.some(r => r.score == null && r.weight == null);
  const scores = preferred.map(r => r.score ?? r.weight).filter(s => s != null);
  const allSame = scores.length >= 2 && scores.every(s => s === scores[0]);
  return missing || allSame || scores.length < preferred.length;
}

module.exports = {
  repairStrategyRouteScores,
  routesNeedScoreRepair,
  computeRouteScoreFields,
  scoreForPriorityRank,
  TRAP_SCORE,
  SCORE_BY_RANK,
};
