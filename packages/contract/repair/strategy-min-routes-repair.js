/**
 * Semantic strategy.routes repair: dedupe synonyms, short labels, ensure method+trap.
 * Generic: gameHints + chapter only.
 */
const {
  buildStrategyRoutePlan,
  countSemanticStrategyRoutes,
  MAIN_METHOD_LABEL,
  TRAP_METHOD_LABEL,
  isLegacyRedundantPreferred,
  isMethodMainLabel,
  isMethodTrapLabel,
  LEGACY_MAIN_LABEL_RE,
} = require('../../generate/strategy-route-plan');
const { buildStrategyRoutePlan: planFn } = require('../../generate/strategy-route-plan');

/** Only collapse verbose 控制变量法 / 观察反馈法 synonyms — keep distinct 单变量·{label} edges. */
const LEGACY_MAIN_PATTERNS = [
  /控制变量法[：:][^|]{10,}/g,
  /观察反馈法/g,
];

function syncMermaidSelectLabels(mermaidBody, oldLabel, newLabel) {
  if (!oldLabel || oldLabel === newLabel || !mermaidBody.includes(oldLabel)) return mermaidBody;
  return mermaidBody.split(oldLabel).join(newLabel);
}

function normalizeMermaidLegacyLabels(mermaidBody) {
  let mm = String(mermaidBody || '');
  for (const re of LEGACY_MAIN_PATTERNS) {
    mm = mm.replace(re, MAIN_METHOD_LABEL);
  }
  const trapLegacy = /多滑条盲调/g;
  if (trapLegacy.test(mm)) mm = mm.replace(trapLegacy, TRAP_METHOD_LABEL);
  return mm;
}

function dedupeAndNormalizeRoutes(routes, gameHints, chapter) {
  const plan = buildStrategyRoutePlan(gameHints, chapter);
  const mainLabel = plan.routes.find(r => r.id === 'main')?.label || MAIN_METHOD_LABEL;
  const trapRoute = plan.routes.find(r => r.tier === 'suboptimal');
  const merged = [];
  const usedKeys = new Set();

  const push = (route) => {
    const isPerAv = /单变量·/.test(String(route.label || ''))
      || (/^main_/i.test(String(route.id || '')) && route.id !== 'main');
    const key = route.tier === 'suboptimal' || isMethodTrapLabel(`${route.id}${route.label}`)
      ? 'trap'
      : (isPerAv
        ? (`perav:${route.id || route.label}`)
        : (isMethodMainLabel(route.label) || route.id === 'main' ? 'main' : route.label));
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    merged.push(route);
  };

  for (const r of routes) {
    if (isLegacyRedundantPreferred(r)) continue;
    let route = { ...r };
    const isPerAv = /单变量·/.test(String(route.label || ''))
      || /^main_/i.test(String(route.id || ''));
    if (isPerAv && route.tier !== 'suboptimal' && !isMethodTrapLabel(`${route.id}${route.label}`)) {
      push(route);
      continue;
    }
    if (route.id === 'main' || (isMethodMainLabel(route.label) && route.tier !== 'suboptimal')) {
      route = {
        ...route,
        id: 'main',
        label: mainLabel,
        warn: route.warn || plan.routes.find(x => x.id === 'main')?.warn || '',
      };
    }
    if (isMethodTrapLabel(`${route.id}${route.label}`) || route.tier === 'suboptimal') {
      route = {
        ...route,
        id: /trap/i.test(route.id) ? route.id : 'trap',
        label: TRAP_METHOD_LABEL,
        warn: route.warn || trapRoute?.warn || '',
      };
    }
    if (
      !isPerAv
      && LEGACY_MAIN_LABEL_RE.test(route.label)
      && route.label.length > mainLabel.length + 4
    ) {
      route.label = mainLabel;
    }
    push(route);
  }

  if (!usedKeys.has('main')) push(plan.routes.find(r => r.id === 'main') || plan.routes[0]);
  if (trapRoute && !usedKeys.has('trap') && plan.routes.some(r => r.tier === 'suboptimal')) {
    push(trapRoute);
  }

  return merged;
}

function repairMinStrategyRoutes(chapter, gameHints) {
  if (!chapter?.strategy) return chapter;

  let mermaid = normalizeMermaidLegacyLabels(chapter.strategy.mermaid || '');
  const routesIn = Array.isArray(chapter.strategy.routes) ? chapter.strategy.routes : [];
  for (const r of routesIn) {
    if (LEGACY_MAIN_LABEL_RE.test(r.label || '')) {
      mermaid = syncMermaidSelectLabels(mermaid, r.label, MAIN_METHOD_LABEL);
    }
    if (/多滑条盲调/.test(r.label || '')) {
      mermaid = syncMermaidSelectLabels(mermaid, r.label, TRAP_METHOD_LABEL);
    }
  }

  let routes = dedupeAndNormalizeRoutes(routesIn, gameHints, chapter);

  const min = gameHints?.minStrategyRoutes ?? 2;
  let effective = countSemanticStrategyRoutes({ ...chapter, strategy: { ...chapter.strategy, mermaid, routes } }, gameHints);

  if (effective < min && routes.length < min) {
    const plan = planFn(gameHints, chapter);
    for (const pr of plan.routes) {
      const has = routes.some(r =>
        (pr.id === 'main' && (r.id === 'main' || isMethodMainLabel(r.label)))
        || (pr.tier === 'suboptimal' && isMethodTrapLabel(`${r.id}${r.label}`)),
      );
      if (!has) routes.push({ ...pr });
    }
    routes = dedupeAndNormalizeRoutes(routes, gameHints, chapter);
    effective = countSemanticStrategyRoutes({ ...chapter, strategy: { mermaid, routes } }, gameHints);
  }

  if (effective >= min || routes.length >= min) {
    return {
      ...chapter,
      strategy: { ...chapter.strategy, mermaid, routes },
    };
  }

  return {
    ...chapter,
    strategy: { ...chapter.strategy, mermaid, routes },
  };
}

module.exports = {
  repairMinStrategyRoutes,
  dedupeAndNormalizeRoutes,
  normalizeMermaidLegacyLabels,
};
