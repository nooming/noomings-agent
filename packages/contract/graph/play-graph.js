
function walkDt(node, fn) {
  if (!node) return;
  fn(node);
  (node.children || []).forEach(c => walkDt(c, fn));
}

function playConstraints(nodes) {
  return nodes
    .filter(n => (n.group === 'constraint' || /^K\d/.test(n.id)) && n.layer === 'play')
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
}

function teachNodes(nodes) {
  return nodes.filter(n => n.layer === 'teach');
}

function verifyLinks(links) {
  return (links || []).filter(l => l.tp === 'verify');
}

function reachableFrom(startId, links, ids) {
  const adj = new Map();
  for (const l of links || []) {
    if (!adj.has(l.s)) adj.set(l.s, []);
    adj.get(l.s).push(l.t);
  }
  const seen = new Set();
  const q = [startId];
  while (q.length) {
    const c = q.shift();
    if (seen.has(c)) continue;
    seen.add(c);
    for (const n of adj.get(c) || []) {
      if (ids.has(n)) q.push(n);
    }
  }
  return seen;
}

function collectDtStats(tree) {
  let decisions = 0, retries = 0, results = 0, junctions = 0;
  walkDt(tree, n => {
    if (n.t === 'decision') decisions++;
    if (n.t === 'retry') retries++;
    if (n.t === 'result') results++;
    if (n.t === 'junction') junctions++;
  });
  return { decisions, retries, results, junctions };
}

function textIncludesAny(text, parts) {
  const t = text || '';
  return parts.some(p => p && t.includes(p));
}

/** Deterministic walk along play-layer spine from P1 toward result. */
function orderedPlayPathIds(nodes, links) {
  const playNodes = (nodes || []).filter(n => n.layer === 'play');
  const playIds = new Set(playNodes.map(n => n.id));
  const p1 = playNodes.find(n => n.id === 'P1' || n.group === 'premise');
  if (!p1) return [];

  const adj = new Map();
  for (const l of links || []) {
    if (l.tp === 'verify') continue;
    if (!playIds.has(l.s) || !playIds.has(l.t)) continue;
    if (!adj.has(l.s)) adj.set(l.s, []);
    adj.get(l.s).push(l.t);
  }
  for (const [k, vals] of adj) {
    vals.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    adj.set(k, vals);
  }

  const path = [];
  let cur = p1.id;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.push(cur);
    const node = playNodes.find(n => n.id === cur);
    if (node?.group === 'result') break;
    const nexts = adj.get(cur) || [];
    cur = nexts[0] || null;
  }
  return path;
}

function playPathMonotonic(mapsTo, path) {
  if (!Array.isArray(mapsTo) || mapsTo.length < 2 || !path.length) return true;
  let last = -1;
  for (const id of mapsTo) {
    const idx = path.indexOf(id);
    if (idx < 0) continue;
    if (idx < last) return false;
    last = idx;
  }
  return true;
}

module.exports = {
  walkDt,
  playConstraints,
  teachNodes,
  verifyLinks,
  reachableFrom,
  collectDtStats,
  textIncludesAny,
  orderedPlayPathIds,
  playPathMonotonic,
};
