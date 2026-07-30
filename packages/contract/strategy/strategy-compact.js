/**
 * Merge numbered parallel strategy subgraphs (Fire2/Observe2/Win2) into canonical nodes.
 * Generic: regex + topology only, no game ids.
 */
const {
  parseStrategyMermaidEdges,
  routeNodeBase,
  sortStrategyMermaidEdges,
  findStartNode,
} = require('../../shared/strategy-mermaid-parse.js');

const MERGE_BASES = ['Fire', 'Observe', 'CheckGoal', 'Launch', 'Win', 'Continue'];
const HUB_IDS = new Set(['Start', 'StrategySelect', 'Env', 'ModeOff', 'ModeOn', 'Ideal', 'OffMode', 'NoDrag']);

function extractNodeDefs(mermaidBody) {
  const defs = new Map();
  const body = String(mermaidBody || '');
  const patterns = [
    /\b([A-Za-z][A-Za-z0-9_]*)(\(\[[^\]]+\]\)|\[[^\]]+\]|\{[^}]+\})(:::strat\w+)?/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(body)) !== null) {
      if (!defs.has(m[1])) defs.set(m[1], `${m[2]}${m[3] || ''}`);
    }
  }
  return defs;
}

function collectNodeIds(mermaidBody, edges) {
  const ids = new Set();
  for (const id of extractNodeDefs(mermaidBody).keys()) ids.add(id);
  for (const e of edges) {
    ids.add(e.from);
    ids.add(e.to);
  }
  return ids;
}

function suffixRank(id, base) {
  const m = String(id).match(new RegExp(`^${base}(\\d*)$`, 'i'));
  if (!m) return null;
  if (!m[1]) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 999;
}

function pickCanonicalId(variants, base, defs) {
  const sorted = [...variants].sort((a, b) => {
    const ra = suffixRank(a, base) ?? 999;
    const rb = suffixRank(b, base) ?? 999;
    return ra - rb;
  });
  if (base === 'Win') {
    const withResult = sorted.find(id => /:::stratResult/i.test(defs.get(id) || ''));
    if (withResult) return withResult;
  }
  return sorted[0];
}

function countNumberedParallelCopies(mermaidBody) {
  const edges = parseStrategyMermaidEdges(mermaidBody);
  const ids = collectNodeIds(mermaidBody, edges);
  let maxGroup = 0;
  for (const base of MERGE_BASES) {
    const variants = [...ids].filter(id => routeNodeBase(id) === base);
    if (variants.length >= 2) maxGroup = Math.max(maxGroup, variants.length);
  }
  return maxGroup;
}

function shouldCompactStrategy(chapter, gameHints) {
  if (gameHints?.levelContext?.focusMode !== 'challenge') return false;
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!mm.trim()) return false;
  const routes = chapter?.strategy?.routes;
  if (!Array.isArray(routes) || routes.length < 2) return false;
  return countNumberedParallelCopies(mm) >= 2;
}

function buildIdRemap(mermaidBody, edges) {
  const defs = extractNodeDefs(mermaidBody);
  const ids = collectNodeIds(mermaidBody, edges);
  const remap = new Map();

  for (const base of MERGE_BASES) {
    const variants = [...ids].filter(id => routeNodeBase(id) === base);
    if (variants.length < 2) continue;
    const canonical = pickCanonicalId(variants, base, defs);
    for (const id of variants) {
      if (id !== canonical) remap.set(id, canonical);
    }
  }

  const byBase = new Map();
  for (const id of ids) {
    if (HUB_IDS.has(id)) continue;
    const base = routeNodeBase(id);
    if (!base) continue;
    if (MERGE_BASES.some(b => b.toLowerCase() === base.toLowerCase())) continue;
    if (!byBase.has(base)) byBase.set(base, new Set());
    byBase.get(base).add(id);
  }
  for (const [, variantSet] of byBase) {
    const variants = [...variantSet];
    if (variants.length < 2) continue;
    if (!variants.some(v => /\d+$/.test(v))) continue;
    const base = routeNodeBase(variants[0]);
    const canonical = pickCanonicalId(variants, base, defs);
    for (const id of variants) {
      if (id !== canonical) remap.set(id, canonical);
    }
  }

  return remap;
}

function remapEdge(e, idRemap) {
  const from = idRemap.get(e.from) || e.from;
  const to = idRemap.get(e.to) || e.to;
  if (from === to) return null;
  return {
    ...e,
    from,
    to,
    key: `${from}->${to}`,
  };
}

function edgeDedupeKey(e) {
  return `${e.from}->${e.to}|${String(e.label || '').trim()}|${e.dotted ? 'd' : 's'}`;
}

function reachableFromRoots(edges, roots) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const seen = new Set();
  const q = [...roots];
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const nxt of adj.get(id) || []) q.push(nxt);
  }
  return seen;
}

function rebuildMermaidBody(originalBody, edges, defs) {
  const header = String(originalBody || '').match(/^(graph\s+\w+)/i)?.[1] || 'graph TD';
  const lines = [header];
  const usedDefs = new Set();
  for (const e of edges) {
    usedDefs.add(e.from);
    usedDefs.add(e.to);
    const label = e.label ? `|${e.label}|` : '';
    const arrow = e.dotted ? '-.->' : '-->';
    lines.push(`${e.from} ${arrow}${label} ${e.to}`);
  }
  for (const id of usedDefs) {
    if (defs.has(id)) lines.push(`${id}${defs.get(id)}`);
  }
  return sortStrategyMermaidEdges(lines.join('\n'));
}

function remapRouteField(route, idRemap) {
  const mapId = id => idRemap.get(id) || id;
  const highlightNodes = [...new Set((route.highlightNodes || []).map(mapId))];
  const highlightEdges = [];
  const seen = new Set();
  for (const pair of route.highlightEdges || []) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const mapped = [mapId(pair[0]), mapId(pair[1])];
    const k = `${mapped[0]}->${mapped[1]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    highlightEdges.push(mapped);
  }
  return { ...route, highlightNodes, highlightEdges };
}

function compactStrategyMacroGraph(chapter, gameHints) {
  if (!shouldCompactStrategy(chapter, gameHints)) return chapter;

  const mm = String(chapter.strategy.mermaid || '');
  const edges = parseStrategyMermaidEdges(mm);
  const idRemap = buildIdRemap(mm, edges);
  if (!idRemap.size) return chapter;

  const defs = extractNodeDefs(mm);
  const remappedDefs = new Map();
  for (const [id, def] of defs) {
    const nid = idRemap.get(id) || id;
    if (!remappedDefs.has(nid)) remappedDefs.set(nid, def);
  }

  const edgeMap = new Map();
  for (const e of edges) {
    const ne = remapEdge(e, idRemap);
    if (!ne) continue;
    const dk = edgeDedupeKey(ne);
    if (!edgeMap.has(dk)) edgeMap.set(dk, ne);
  }
  let newEdges = [...edgeMap.values()];

  const startId = findStartNode(mm, newEdges) || 'Start';
  const roots = new Set([startId]);
  for (const e of newEdges) {
    if (HUB_IDS.has(e.from)) roots.add(e.to);
  }
  for (const route of chapter.strategy.routes || []) {
    for (const n of route.highlightNodes || []) {
      roots.add(idRemap.get(n) || n);
    }
  }
  const reachable = reachableFromRoots(newEdges, [...roots]);
  newEdges = newEdges.filter(e => reachable.has(e.from) && reachable.has(e.to));

  const newMermaid = rebuildMermaidBody(mm, newEdges, remappedDefs);
  const newRoutes = (chapter.strategy.routes || []).map(r => remapRouteField(r, idRemap));

  return {
    ...chapter,
    strategy: {
      ...chapter.strategy,
      mermaid: newMermaid,
      routes: newRoutes,
    },
  };
}

module.exports = {
  compactStrategyMacroGraph,
  shouldCompactStrategy,
  countNumberedParallelCopies,
  buildIdRemap,
  MERGE_BASES,
};
