/**
 * Persist strategy route feedback highlights (Observe→Adjust→Fire, CheckGoal→Continue→Fire).
 * Generic topology inference; no game ids.
 */
const {
  parseStrategyMermaidEdges,
  expandRouteHighlight,
  routeIsMisconceptionRoute,
  routeIsTrueMisconceptionRoute,
  isAdjustLikeNodeId,
  extractStrategyNodeLabels,
  extractStratResultNodeIds,
  routeNeedsSpineSeed,
  findStrategySelectOutEdge,
} = require('../../shared/strategy-mermaid-parse.js');
const {
  collapseTrapRedundantChains,
  TRAP_LABEL,
} = require('../../shared/collapse-trap-redundant-chains.js');
const {
  collapseOrphanStrategyStubs,
  collapseOrphanStubsInChapter,
} = require('../../shared/collapse-orphan-strategy-stubs.js');

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

/**
 * Ensure StrategySelect is reachable from mode hubs, and dead-end Trap entries
 * wire directly to Fire / loop entry — never inject Trap→TrapStrat synonym bridges.
 */
function repairStrategySelectTopology(mermaidBody) {
  let mm = String(mermaidBody || '').replace(/\r\n/g, '\n');
  if (!mm.trim()) return mm;
  let edges = parseStrategyMermaidEdges(mm);
  const hasSelect = edges.some(e => /StrategySelect/i.test(e.from) || /StrategySelect/i.test(e.to))
    || /\bStrategySelect\b/.test(mm);
  if (!hasSelect) return mm;

  const incomingToSelect = edges.some(e => /StrategySelect/i.test(e.to));
  if (!incomingToSelect) {
    const hub = ['ExploreCore', 'Explore', 'ChallengeCore', 'Challenge', 'ModeSelect', 'Env']
      .find(id => edges.some(e => e.to === id || e.from === id) || new RegExp(`\\b${id}\\b`).test(mm));
    if (hub && !new RegExp(`\\b${hub}\\b[^\\n]*-->\\s*StrategySelect\\b`).test(mm)) {
      mm += `\n${hub} --> StrategySelect`;
    }
  }

  // Dead-end Trap: prefer Trap→Fire (or alias outs' terminal) — do NOT create Trap→TrapStrat
  edges = parseStrategyMermaidEdges(mm);
  const trapTargets = edges
    .filter(e => /StrategySelect/i.test(e.from) && /^(Trap|TrapC|Trap2|TrapRoute)$/i.test(e.to))
    .map(e => e.to);
  for (const trapId of [...new Set(trapTargets)]) {
    const outs = edges.filter(e => e.from === trapId);
    if (outs.length) continue;

    const alias = `${trapId}Strat`;
    const aliasOuts = edges.filter(e => e.from === alias);
    if (aliasOuts.length) {
      // Wire Trap to the same terminals TrapStrat reached (skip synonym Adjust* when possible)
      for (const ao of aliasOuts) {
        let terminal = ao.to;
        if (/^(AdjustBoth|AdjustMulti|AdjustAll|AdjustT|TuneTrap|Blind)/i.test(terminal)) {
          const next = edges.find(e =>
            e.from === terminal && /^(Fire|Retest|Launch|Observe)/i.test(e.to));
          if (next) terminal = next.to;
        }
        if (!new RegExp(`\\b${trapId}\\b\\s*-->\\s*${terminal}\\b`).test(mm)) {
          mm += `\n${trapId} --> ${terminal}`;
        }
      }
      continue;
    }

    const fireNode = ['Fire', 'FireT', 'Fire4', 'Retest', 'Launch']
      .find(id => edges.some(e => e.from === id || e.to === id) || new RegExp(`\\b${id}\\b`).test(mm));
    if (fireNode && !new RegExp(`\\b${trapId}\\b\\s*-->\\s*${fireNode}\\b`).test(mm)) {
      mm += `\n${trapId} --> ${fireNode}`;
      continue;
    }
    const m = mm.match(/\b(Fire\w*|Retest\w*|Launch\w*)\b/);
    if (m && !new RegExp(`\\b${trapId}\\b\\s*-->\\s*${m[1]}\\b`).test(mm)) {
      mm += `\n${trapId} --> ${m[1]}`;
    }
  }

  // Collapse synonym trap spines so repair never re-materializes triple labels
  const collapsed = collapseTrapRedundantChains(mm);
  mm = collapsed.mermaid;

  // Drop numbered RouteN / TuneN stubs not targeted by StrategySelect
  // (avoids dual skeletons parallel to Route_main_* / *Strat)
  const orphaned = collapseOrphanStrategyStubs(mm);
  mm = orphaned.mermaid;

  // Ensure StrategySelect trap targets carry the canonical Chinese label
  edges = parseStrategyMermaidEdges(mm);
  const labels = extractStrategyNodeLabels(mm);
  for (const e of edges) {
    if (!/StrategySelect/i.test(e.from)) continue;
    if (!/^(Trap|TrapC|Trap2|TrapRoute)$/i.test(e.to)) continue;
    const cur = labels.get(e.to) || '';
    if (cur === TRAP_LABEL) continue;
    const esc = e.to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${esc}\\s*[\\[({]`).test(mm)) {
      mm = mm
        .replace(new RegExp(`\\b(${esc})\\(\\[([^\\]]*)\\]\\)`, 'g'), `$1([${TRAP_LABEL}])`)
        .replace(new RegExp(`\\b(${esc})\\[([^\\]]*)\\]`, 'g'), `$1[${TRAP_LABEL}]`);
    } else {
      mm = `${mm.replace(/\s+$/, '')}\n${e.to}[${TRAP_LABEL}]\n`;
    }
  }

  return mm;
}

/**
 * If a 单变量 route label matches an irrelevant KG node, include that I* in mapsTo
 * (e.g. cyclotron 腔室气压 → I1) so KG jump dims the confound dim.
 */
function repairIrrelevantAvMapsTo(chapter) {
  const strat = chapter?.strategy;
  const kgNodes = chapter?.kg?.nodes || [];
  if (!strat?.routes?.length || !kgNodes.length) return chapter;
  const irr = kgNodes.filter(n => n.group === 'irrelevant');
  if (!irr.length) return chapter;

  const routes = strat.routes.map(route => {
    if (route.kind === 'confoundProbe' || /试探混淆/.test(route.label || '')) return route;
    if (!/单变量·/.test(route.label || '')) return route;
    const labelTail = String(route.label || '').replace(/^.*单变量·/, '').replace(/\s+/g, '');
    if (!labelTail) return route;
    const hit = irr.find(n => {
      const nl = String(n.label || '').replace(/\s+/g, '');
      return nl && (nl.includes(labelTail) || labelTail.includes(nl.replace(/[pP]$/, ''))
        || labelTail.includes(nl));
    });
    if (!hit) return route;
    const mapsTo = [...(route.mapsTo || [])];
    if (!mapsTo.includes(hit.id)) mapsTo.push(hit.id);
    // Also fix inquiryScript AV mapsToKg when it wrongly points at O*
    return { ...route, mapsTo };
  });

  let inquiryScript = chapter.inquiryScript;
  if (inquiryScript?.actionVariables?.length && irr.length) {
    const actionVariables = inquiryScript.actionVariables.map(av => {
      const lab = String(av.label || av.symbol || '').replace(/\s+/g, '');
      const hit = irr.find(n => {
        const nl = String(n.label || '').replace(/\s+/g, '');
        return lab && nl && (nl.includes(lab) || lab.includes(nl.replace(/[pP]$/, '')));
      });
      if (!hit) return av;
      if (av.mapsToKg === hit.id) return av;
      return { ...av, mapsToKg: hit.id };
    });
    inquiryScript = { ...inquiryScript, actionVariables };
  }

  return {
    ...chapter,
    inquiryScript,
    strategy: { ...strat, routes },
  };
}

function repairStrategyRouteHighlights(chapter) {
  // Drop orphan RouteN stubs + stale highlight refs before expand/seed
  const orphaned = collapseOrphanStubsInChapter(chapter);
  if (orphaned.changed) chapter = orphaned.chapter;

  let strat = chapter?.strategy;
  let mermaidBody = String(strat?.mermaid || '');
  if (!mermaidBody.trim() || !Array.isArray(strat?.routes)) return chapter;

  const repairedMm = repairStrategySelectTopology(mermaidBody);
  if (repairedMm !== mermaidBody) {
    mermaidBody = repairedMm;
    strat = { ...strat, mermaid: mermaidBody };
    chapter = { ...chapter, strategy: strat };
  }

  const resultKgIds = new Set(
    (chapter.kg?.nodes || []).filter(n => n.group === 'result' && n.layer === 'play').map(n => n.id),
  );
  const edges = parseStrategyMermaidEdges(mermaidBody);

  const routes = strat.routes.map(route => {
    if (routeIsTrueMisconceptionRoute(route, mermaidBody)) return route;

    const isConfound = route.kind === 'confoundProbe' || /试探混淆/.test(route.label || '');
    // Still repair sparse confound loops; skip only when already complete
    if (isConfound && !routeNeedsSpineSeed(route)) return route;

    const expanded = expandRouteHighlight(route, mermaidBody, { resultKgIds });
    // Never persist ProbeCV bleed onto AV / trap routes
    const expandedNodes = isConfound
      ? (expanded.highlightNodes || [])
      : (expanded.highlightNodes || []).filter(id => !/^(ProbeCV|ObserveCV|BackFromCV)/i.test(id));
    const expandedKeys = isConfound
      ? new Set([...(expanded.edgeKeys || [])])
      : new Set([...(expanded.edgeKeys || [])].filter(k => !/ProbeCV|ObserveCV|BackFromCV/i.test(k)));
    const expandedClean = { highlightNodes: expandedNodes, edgeKeys: expandedKeys };
    const origSet = new Set(route.highlightNodes || []);
    const nodeLabels = extractStrategyNodeLabels(mermaidBody);
    const mapsToResult = (route.mapsTo || []).some(id => resultKgIds.has(id));
    const stratResultIds = extractStratResultNodeIds(mermaidBody);
    const needsFull = routeNeedsSpineSeed(route)
      || !expandedNodes.some(id => /^(Fire|Launch|Tune|Observe|Adjust|ProbeCV)/i.test(id));

    const selectEdge = findStrategySelectOutEdge(route, edges);

    // Persist full expanded spine when sparse / missing select edge / false-identical shared spine
    const newNodes = needsFull
      ? [...new Set([
        ...expandedClean.highlightNodes,
        ...(selectEdge ? [selectEdge.from, selectEdge.to] : []),
        ...(mapsToResult && !isConfound ? [...stratResultIds] : []),
      ])]
      : [...new Set([
        ...(route.highlightNodes || []).filter(id => !/^(ProbeCV|ObserveCV|BackFromCV)/i.test(id) || isConfound),
        ...expandedClean.highlightNodes.filter(id => {
          if (isAdjustLikeNodeId(id, nodeLabels)) return true;
          if (/^Continue\d*$/i.test(id)) return true;
          if (/^Retry[A-Za-z]*\d*$/i.test(id)) return true;
          if (/^(Fire|Launch|Tune|Observe|Check|Single|Route)/i.test(id)) return true;
          if (selectEdge && (id === selectEdge.to || id === selectEdge.from)) return true;
          return origSet.has(id);
        }),
        ...(mapsToResult && !isConfound ? [...stratResultIds] : []),
      ])];

    const feedbackPairs = inferFeedbackPairs(route, mermaidBody, expandedClean);
    let highlightEdges = needsFull
      ? []
      : mergeHighlightEdges(route.highlightEdges, feedbackPairs);
    if (expandedClean.edgeKeys?.size) {
      const fromExpand = [...expandedClean.edgeKeys].map(k => {
        const j = k.indexOf('->');
        return j > 0 ? [k.slice(0, j), k.slice(j + 2)] : null;
      }).filter(Boolean);
      highlightEdges = needsFull
        ? mergeHighlightEdges([], fromExpand)
        : mergeHighlightEdges(highlightEdges, fromExpand);
    }
    if (selectEdge) {
      highlightEdges = mergeHighlightEdges(highlightEdges, [[selectEdge.from, selectEdge.to]]);
    }

    // Drop sibling StrategySelect targets from persisted nodes/edges
    if (selectEdge) {
      const siblings = new Set(
        edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to)
          .filter(id => id && id !== selectEdge.to),
      );
      const filteredNodes = newNodes.filter(id => !siblings.has(id));
      highlightEdges = highlightEdges.filter(p =>
        Array.isArray(p) && p.length >= 2 && !siblings.has(p[0]) && !siblings.has(p[1]));
      const changed = filteredNodes.length !== (route.highlightNodes || []).length
        || highlightEdges.length !== (route.highlightEdges || []).length
        || filteredNodes.some((id, i) => id !== (route.highlightNodes || [])[i]);

      if (!changed) {
        return route.highlightFailureBranches === true || isConfound
          ? route
          : { ...route, highlightFailureBranches: true };
      }

      return {
        ...route,
        highlightFailureBranches: isConfound ? false : true,
        highlightNodes: filteredNodes,
        highlightEdges,
      };
    }

    const changed = newNodes.length !== (route.highlightNodes || []).length
      || highlightEdges.length !== (route.highlightEdges || []).length;

    if (!changed) {
      return route.highlightFailureBranches === true || isConfound
        ? route
        : { ...route, highlightFailureBranches: true };
    }

    return {
      ...route,
      highlightFailureBranches: isConfound ? false : true,
      highlightNodes: newNodes,
      highlightEdges,
    };
  });

  let next = {
    ...chapter,
    strategy: { ...strat, routes },
  };
  next = repairIrrelevantAvMapsTo(next);
  return next;
}

module.exports = {
  repairStrategyRouteHighlights,
  repairStrategySelectTopology,
  repairIrrelevantAvMapsTo,
};
