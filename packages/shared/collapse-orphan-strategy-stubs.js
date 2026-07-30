/**
 * Remove orphan strategy-path stubs not targeted by StrategySelect:
 *   Route1→Adjust1, Route3→Adjust3, Tune6→Fire, RouteR1/RouteMeter, RouteT→AdjustT
 *
 * Keeps live StrategySelect / StrategySelect2 targets even if named Route3.
 * Keeps Adjust* still used by Observe / Retry feedback on live spines.
 * Does not strip challenge-parallel FireC / StrategySelectC subgraphs.
 */
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('./strategy-mermaid-parse.js');

/**
 * Numbered / legacy entry hubs that often duplicate Route_main_* / *Strat.
 * Excludes Route_main* (checked separately).
 */
const ORPHAN_HUB_RE =
  /^(Route\d+[A-Za-z]*|Route(?:R\d*|Meter|T|Ctrl|Av\d*|Single)|Tune\d+|Path\w+|Trap\d*|TrapC|MultiTrap|PathTrap|TuneTrap|TrapRoute)$/i;

function collectSelectTargets(edges) {
  return new Set(
    edges
      .filter(e => /StrategySelect/i.test(e.from))
      .map(e => e.to)
      .filter(Boolean),
  );
}

function allNodeIds(edges, labels) {
  const nodes = new Set();
  edges.forEach(e => {
    if (e.from) nodes.add(e.from);
    if (e.to) nodes.add(e.to);
  });
  if (labels) labels.forEach((_, id) => nodes.add(id));
  return nodes;
}

/** Nodes reachable forward from a seed set. */
function reachableFrom(edges, seeds) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const seen = new Set();
  const q = [...seeds].filter(Boolean);
  for (const id of q) seen.add(id);
  while (q.length) {
    const cur = q.shift();
    for (const nxt of adj.get(cur) || []) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      q.push(nxt);
    }
  }
  return seen;
}

function reachableFromSelect(edges, selectTargets) {
  return reachableFrom(edges, selectTargets);
}

function isOrphanHubCandidate(id, selectTargets, liveReachable) {
  if (!id || selectTargets.has(id)) return false;
  if (liveReachable.has(id)) return false;
  if (/^Route_main/i.test(id)) return false;
  // Canonical bare Trap / ProbeCV stay even if momentarily unlinked
  if (/^(Trap|ProbeCV)$/i.test(id)) return false;
  // Legacy RouteFoo stubs parallel to Route_main_* (not Route_main itself)
  if (/^Route(?!_main)/i.test(id) && !/^Route$/i.test(id)) {
    if (ORPHAN_HUB_RE.test(id) || /^Route[A-Z]/i.test(id)) return true;
  }
  if (ORPHAN_HUB_RE.test(id)) return true;
  return false;
}

function removeNodeMentions(body, nodeId) {
  const esc = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const kept = lines.filter(raw => {
    const line = raw.trim();
    if (!line) return true;
    if (new RegExp(`^${esc}\\s*[\\[({]`).test(line)) return false;
    if (new RegExp(`\\b${esc}\\b`).test(line) && /(-->|-\\.->)/.test(line)) {
      if (new RegExp(`^${esc}\\b`).test(line)) return false;
      if (new RegExp(`(?:-->|-\\.->)\\s*(?:\\|[^|]*\\|\\s*)?${esc}\\b`).test(line)) return false;
      if (new RegExp(`\\b${esc}\\s*(?:-->|-\\.->)`).test(line)) return false;
    }
    return true;
  });
  return kept.join('\n');
}

/**
 * From removed orphan entries, walk downstream into nodes NOT reachable
 * from StrategySelect fan-out (dead zone). Stops at live shared hubs.
 */
function expandDownstreamDeadZone(seedOrphans, edges, selectTargets) {
  const live = reachableFromSelect(edges, selectTargets);
  const removed = new Set(seedOrphans);
  const q = [...seedOrphans];
  while (q.length) {
    const cur = q.shift();
    for (const e of edges) {
      if (e.from !== cur) continue;
      const to = e.to;
      if (!to || removed.has(to) || selectTargets.has(to)) continue;
      if (live.has(to)) continue;
      removed.add(to);
      q.push(to);
    }
  }

  // Sweep closed loops that only connect among non-live nodes and touch removed
  let changed = true;
  while (changed) {
    changed = false;
    const incomingByTo = new Map();
    for (const e of edges) {
      if (removed.has(e.from)) continue;
      if (!incomingByTo.has(e.to)) incomingByTo.set(e.to, []);
      incomingByTo.get(e.to).push(e.from);
    }
    const candidates = new Set();
    for (const e of edges) {
      if (removed.has(e.from)) candidates.add(e.to);
      if (removed.has(e.to)) candidates.add(e.from);
    }
    for (const id of candidates) {
      if (!id || removed.has(id) || selectTargets.has(id) || live.has(id)) continue;
      if (/^(Start|StrategySelect\d*|Env|ModeSelect|Explore|Challenge|Trap|ProbeCV)$/i.test(id)) {
        continue;
      }
      if (!/^(Adjust|Fire|Observe|Win|Retry|Tune|Route|Path|Blind|Check)\w*/i.test(id)) continue;
      if (/^(Fire|Observe|Win|Retry|Adjust|Check|Trap)$/i.test(id)) continue;
      const inc = (incomingByTo.get(id) || []).filter(f => !removed.has(f));
      const outs = edges.filter(x => x.from === id && !removed.has(x.to));
      const onlyDead = outs.every(x => removed.has(x.to) || !live.has(x.to));
      if (inc.length === 0 && onlyDead) {
        removed.add(id);
        changed = true;
      }
    }
  }

  return removed;
}

/**
 * Residual digit-only islands (Adjust3/Fire3/Observe3) left after a prior orphan-hub pass.
 * Skips letter-suffix challenge parallels (FireC, Adjust1C).
 */
function findResidualDigitIslands(edges, selectTargets) {
  const live = reachableFrom(edges, new Set([...selectTargets, 'Start']));
  const removed = new Set();
  const DIGIT_ONLY = /^(Adjust|Fire|Observe|Win|Retry)\d+$/i;
  const nodes = allNodeIds(edges, null);
  for (const id of nodes) {
    if (!DIGIT_ONLY.test(id)) continue;
    if (live.has(id) || selectTargets.has(id)) continue;
    removed.add(id);
  }
  // Expand within digit-only closed component
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      for (const id of [e.from, e.to]) {
        if (removed.has(id) || live.has(id) || selectTargets.has(id)) continue;
        if (!DIGIT_ONLY.test(id)) continue;
        if (removed.has(e.from) || removed.has(e.to)) {
          removed.add(id);
          changed = true;
        }
      }
    }
  }
  return removed;
}

/**
 * @returns {{ mermaid: string, changed: boolean, removedNodes: string[], orphanHubs: string[] }}
 */
function collapseOrphanStrategyStubs(mermaidBody) {
  let mm = String(mermaidBody || '').replace(/\r\n/g, '\n');
  if (!mm.trim()) {
    return { mermaid: mm, changed: false, removedNodes: [], orphanHubs: [] };
  }

  const original = mm;
  const edges0 = parseStrategyMermaidEdges(mm);
  const labels0 = extractStrategyNodeLabels(mm);
  const selectTargets = collectSelectTargets(edges0);
  const liveReachable = reachableFromSelect(edges0, selectTargets);
  const nodes = allNodeIds(edges0, labels0);

  const orphanHubs = [...nodes].filter(id =>
    isOrphanHubCandidate(id, selectTargets, liveReachable));

  const seed = new Set(orphanHubs);
  for (const id of findResidualDigitIslands(edges0, selectTargets)) {
    seed.add(id);
  }

  const removed = seed.size
    ? expandDownstreamDeadZone([...seed], edges0, selectTargets)
    : new Set();

  for (const id of selectTargets) removed.delete(id);
  for (const id of [...removed]) {
    if (/^Route_main/i.test(id)) removed.delete(id);
  }

  if (!removed.size) {
    return { mermaid: mm, changed: false, removedNodes: [], orphanHubs };
  }

  for (const id of [...removed]) {
    mm = removeNodeMentions(mm, id);
  }

  mm = mm.replace(/\n{3,}/g, '\n\n');
  if (!mm.endsWith('\n')) mm += '\n';

  const stillThere = [...removed].filter(id =>
    new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(mm));
  const removedNodes = [...removed].filter(id => !stillThere.includes(id));

  return {
    mermaid: mm,
    changed: mm !== original,
    removedNodes,
    orphanHubs,
  };
}

function remapOrphanRouteHighlights(routes, removedNodes) {
  if (!Array.isArray(routes) || !removedNodes?.length) {
    return { routes, changed: false };
  }
  const removed = new Set(removedNodes);
  let changed = false;
  const next = routes.map(route => {
    let nodes = route.highlightNodes ? [...route.highlightNodes] : null;
    let hlEdges = route.highlightEdges
      ? route.highlightEdges.map(p => (Array.isArray(p) ? [...p] : p))
      : null;
    let rChanged = false;

    if (nodes) {
      const filtered = nodes.filter(id => !removed.has(id));
      if (filtered.length !== nodes.length) {
        nodes = filtered;
        rChanged = true;
      }
    }
    if (hlEdges) {
      const filtered = hlEdges.filter(p =>
        Array.isArray(p) && p.length >= 2 && !removed.has(p[0]) && !removed.has(p[1]));
      if (filtered.length !== hlEdges.length) {
        hlEdges = filtered;
        rChanged = true;
      }
    }
    if (!rChanged) return route;
    changed = true;
    return {
      ...route,
      ...(nodes ? { highlightNodes: nodes } : {}),
      ...(hlEdges ? { highlightEdges: hlEdges } : {}),
    };
  });
  return { routes: next, changed };
}

function collapseOrphanStubsInChapter(chapter) {
  const strat = chapter?.strategy;
  if (!strat?.mermaid) {
    return { chapter, changed: false, removedNodes: [], orphanHubs: [] };
  }
  const result = collapseOrphanStrategyStubs(strat.mermaid);
  if (!result.changed) {
    return {
      chapter,
      changed: false,
      removedNodes: result.removedNodes,
      orphanHubs: result.orphanHubs,
    };
  }
  const remapped = remapOrphanRouteHighlights(strat.routes, result.removedNodes);
  return {
    chapter: {
      ...chapter,
      strategy: {
        ...strat,
        mermaid: result.mermaid,
        ...(remapped.routes ? { routes: remapped.routes } : {}),
      },
    },
    changed: true,
    removedNodes: result.removedNodes,
    orphanHubs: result.orphanHubs,
  };
}

function isOrphanStubHubId(id, selectTargets) {
  if (!id || (selectTargets && selectTargets.has(id))) return false;
  if (/^Route_main/i.test(id)) return false;
  return isOrphanHubCandidate(id, selectTargets || new Set(), new Set());
}

module.exports = {
  ORPHAN_HUB_RE,
  collapseOrphanStrategyStubs,
  collapseOrphanStubsInChapter,
  remapOrphanRouteHighlights,
  collectSelectTargets,
  isOrphanStubHubId,
  reachableFromSelect,
};
