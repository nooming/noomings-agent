/**
 * Collapse redundant multi-param trap spines to a single Trap hub:
 *   StrategySelect -->|多参盲调| Trap[多参盲调] --> Fire
 *
 * Removes Trap→TrapStrat→AdjustBoth / Trap→AdjustMulti / PathTrap→AdjustMulti
 * synonym chains. Shared Observe→AdjustMulti hubs are kept when still referenced.
 */
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('./strategy-mermaid-parse.js');

const TRAP_LABEL = '多参盲调';
const MULTI_LABEL_RE = /多参盲调|同时调多个|同时多调|盲调|调整多个参数|同时调/;
const TRAP_ENTRY_RE = /^(Trap|TrapC|Trap2|TrapRoute|PathTrap|MultiTrap|TuneTrap)$/i;
const REDUNDANT_HOP_RE =
  /^(TrapStrat|TuneTrap|Blind\d*|AdjustBothC?|AdjustMulti|AdjustAll|AdjustT|MultiTrap|PathTrap)$/i;
const TERMINAL_RE = /^(Fire|Retest|Launch|Observe|Win|Retry|Check)/i;

function isTrapSelectEntry(id, selectTargets) {
  return selectTargets.has(id) && TRAP_ENTRY_RE.test(id);
}

function isRedundantMultiHop(id, labels, trapEntry) {
  if (!id || id === trapEntry) return false;
  if (TERMINAL_RE.test(id)) return false;
  // Bare Adjust on a trap spine is always a synonym hop for UX (single-var Adjust stays for AV paths)
  if (/^Adjust$/i.test(id)) return true;
  if (/Strat$/i.test(id) && /Trap/i.test(id)) return true;
  if (REDUNDANT_HOP_RE.test(id)) return true;
  const lab = labels.get(id) || '';
  if (MULTI_LABEL_RE.test(lab) && /^(Adjust|Tune|Blind|Trap|Route)/i.test(id)) return true;
  if (/调整摆长和角度|调整多个/.test(lab) && /^Adjust/i.test(id)) return true;
  return false;
}

function findFireFallback(edges, fromId) {
  const outs = edges.filter(e => e.from === fromId);
  const fire = outs.find(e => /^(Fire|Retest|Launch)/i.test(e.to));
  if (fire) return fire.to;
  const anyFire = edges.find(e => /^(Fire|Retest|Launch)/i.test(e.to) || /^(Fire|Retest|Launch)/i.test(e.from));
  if (anyFire) {
    if (/^(Fire|Retest|Launch)/i.test(anyFire.to)) return anyFire.to;
    return anyFire.from;
  }
  return 'Fire';
}

/**
 * Walk trap entry through synonym hops; return collapse plan.
 */
function planTrapCollapse(trapId, edges, labels) {
  const removedHops = new Set();
  const targets = new Set();
  const visited = new Set();
  const queue = [trapId];

  while (queue.length) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const outs = edges.filter(e => e.from === cur);
    if (!outs.length && cur === trapId) {
      // Dead-end Trap: look for TrapStrat alias outs
      const alias = `${trapId}Strat`;
      const aliasOuts = edges.filter(e => e.from === alias);
      if (aliasOuts.length) {
        removedHops.add(alias);
        queue.push(alias);
        continue;
      }
    }
    for (const e of outs) {
      if (isRedundantMultiHop(e.to, labels, trapId)) {
        removedHops.add(e.to);
        queue.push(e.to);
      } else if (cur === trapId) {
        // Direct non-redundant out already (e.g. Trap→Fire) — keep
        targets.add(e.to);
      } else {
        targets.add(e.to);
      }
    }
  }

  // If we only had redundant hops, targets come from their outs
  if (!targets.size && removedHops.size) {
    for (const hop of removedHops) {
      for (const e of edges.filter(x => x.from === hop)) {
        if (!removedHops.has(e.to) && e.to !== trapId) targets.add(e.to);
      }
    }
  }

  if (!targets.size && removedHops.size) {
    // Prefer Fire reachable from a removed hop
    for (const hop of removedHops) {
      targets.add(findFireFallback(edges, hop));
      break;
    }
  }

  const needsCollapse = removedHops.size > 0;
  return {
    trapId,
    removedHops: [...removedHops],
    targets: [...targets],
    needsCollapse,
  };
}

function rewriteNodeLabel(body, id, newLabel) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let changed = false;
  let out = body;
  out = out.replace(new RegExp(`\\b(${esc})\\(\\[([^\\]]*)\\]\\)`, 'g'), (full, nodeId, oldLab) => {
    if (String(oldLab) === newLabel) return full;
    changed = true;
    return `${nodeId}([${newLabel}])`;
  });
  out = out.replace(new RegExp(`\\b(${esc})\\[([^\\]]*)\\]`, 'g'), (full, nodeId, oldLab) => {
    if (String(oldLab) === newLabel) return full;
    changed = true;
    return `${nodeId}[${newLabel}]`;
  });
  out = out.replace(new RegExp(`\\b(${esc})\\{([^}]*)\\}`, 'g'), (full, nodeId, oldLab) => {
    if (String(oldLab) === newLabel) return full;
    changed = true;
    return `${nodeId}{${newLabel}}`;
  });
  if (!changed) {
    const hasDef = new RegExp(`\\b${esc}\\s*[\\[({]`).test(out);
    if (!hasDef) {
      out = `${out.replace(/\s+$/, '')}\n${id}[${newLabel}]\n`;
      changed = true;
    }
  }
  return { body: out, changed };
}

function removeNodeMentions(body, nodeId) {
  const esc = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const kept = lines.filter(raw => {
    const line = raw.trim();
    if (!line) return true;
    // Standalone def
    if (new RegExp(`^${esc}\\s*[\\[({]`).test(line)) return false;
    // Edge involving node as endpoint (simple cases)
    if (new RegExp(`\\b${esc}\\b`).test(line) && /(-->|-\\.->)/.test(line)) {
      // Keep if node appears only inside a label text? rare — drop line if id is endpoint
      const edgeLike = /-->|-\\.->/.test(line);
      if (edgeLike) {
        // from or to
        if (new RegExp(`^${esc}\\b`).test(line)) return false;
        if (new RegExp(`(?:-->|-\\.->)\\s*(?:\\|[^|]*\\|\\s*)?${esc}\\b`).test(line)) return false;
        if (new RegExp(`\\b${esc}\\s*(?:-->|-\\.->)`).test(line)) return false;
      }
    }
    return true;
  });
  return kept.join('\n');
}

function ensureEdge(body, from, to) {
  const escFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escTo = to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${escFrom}\\b[^\\n]*-->\\s*(?:\\|[^|]*\\|\\s*)?${escTo}\\b`).test(body)) {
    return { body, changed: false };
  }
  return { body: `${body.replace(/\s+$/, '')}\n${from} --> ${to}\n`, changed: true };
}

function removeEdge(body, from, to) {
  const escFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escTo = to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  let changed = false;
  const kept = lines.filter(raw => {
    const line = raw.trim();
    if (!line) return true;
    const re = new RegExp(
      `\\b${escFrom}\\b\\s*(?:-->|-\\.->)\\s*(?:\\|[^|]*\\|\\s*)?${escTo}\\b`,
    );
    if (re.test(line)) {
      // Drop whole line if it's a simple A --> B (possibly with inline labels on nodes)
      changed = true;
      return false;
    }
    return true;
  });
  return { body: kept.join('\n'), changed };
}

function nodeStillReferenced(body, nodeId) {
  const esc = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const edges = parseStrategyMermaidEdges(body);
  if (edges.some(e => e.from === nodeId || e.to === nodeId)) return true;
  // StrategySelect target text only — still a def
  return new RegExp(`\\b${esc}\\b`).test(body);
}

/**
 * @returns {{ mermaid: string, changed: boolean, stats: object, removedNodes: string[] }}
 */
function collapseTrapRedundantChains(mermaidBody) {
  let mm = String(mermaidBody || '').replace(/\r\n/g, '\n');
  if (!mm.trim()) {
    return { mermaid: mm, changed: false, stats: {}, removedNodes: [] };
  }

  const edges0 = parseStrategyMermaidEdges(mm);
  const labels0 = extractStrategyNodeLabels(mm);
  const selectTargets = new Set(
    edges0.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to).filter(Boolean),
  );

  const trapEntries = [...selectTargets].filter(id => TRAP_ENTRY_RE.test(id));
  // Also collapse orphan MultiTrap/PathTrap/TuneTrap/TrapRoute/TrapStrat chains that only feed Adjust*
  for (const e of edges0) {
    if (/^(MultiTrap|PathTrap|TuneTrap|TrapStrat|TrapRoute)$/i.test(e.from) && !selectTargets.has(e.from)) {
      if (!trapEntries.includes(e.from)) trapEntries.push(e.from);
    }
  }

  const stats = {
    trapEntries: trapEntries.length,
    collapsed: 0,
    labelOnly: 0,
    removedHops: 0,
    patterns: {
      trapStratBridge: 0,
      trapToAdjustMulti: 0,
      trapToBlindTune: 0,
      orphanMultiTrap: 0,
      other: 0,
    },
  };

  const allRemoved = new Set();
  const original = mm;

  for (const trapId of trapEntries) {
    const edges = parseStrategyMermaidEdges(mm);
    const labels = extractStrategyNodeLabels(mm);
    const plan = planTrapCollapse(trapId, edges, labels);
    const isSelectTrap = isTrapSelectEntry(trapId, selectTargets);

    if (plan.needsCollapse) {
      stats.collapsed += 1;
      if (plan.removedHops.some(h => /TrapStrat/i.test(h))) stats.patterns.trapStratBridge += 1;
      else if (plan.removedHops.some(h => /Adjust(Both|Multi|All|T)/i.test(h))) {
        stats.patterns.trapToAdjustMulti += 1;
      } else if (plan.removedHops.some(h => /Blind|TuneTrap/i.test(h))) {
        stats.patterns.trapToBlindTune += 1;
      } else if (/^(MultiTrap|PathTrap)/i.test(trapId) && !isSelectTrap) {
        stats.patterns.orphanMultiTrap += 1;
      } else stats.patterns.other += 1;

      stats.removedHops += plan.removedHops.length;

      for (const hop of plan.removedHops) {
        const r1 = removeEdge(mm, trapId, hop);
        mm = r1.body;
        allRemoved.add(hop);
      }

      if (isSelectTrap) {
        for (const to of plan.targets) {
          const ens = ensureEdge(mm, trapId, to);
          mm = ens.body;
        }
        for (const hop of plan.removedHops) {
          const r = removeEdge(mm, trapId, hop);
          mm = r.body;
        }
      } else {
        allRemoved.add(trapId);
      }
    } else if (isSelectTrap) {
      stats.labelOnly += 1;
    }
  }

  // Canonical Chinese label on Trap / TrapC / Trap2 / TrapRoute hubs
  {
    for (const id of ['Trap', 'TrapC', 'Trap2', 'TrapRoute']) {
      if (!new RegExp(`\\b${id}\\b`).test(mm)) continue;
      const lab = rewriteNodeLabel(mm, id, TRAP_LABEL);
      mm = lab.body;
    }
  }

  // Delete hop nodes that are no longer needed (no Observe/select refs)
  for (const hop of allRemoved) {
    const edges = parseStrategyMermaidEdges(mm);
    const selectNow = new Set(
      edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to),
    );
    if (selectNow.has(hop)) continue;
    const incomingKeep = edges.filter(e => e.to === hop && !allRemoved.has(e.from));
    // Keep if Observe / Retry / non-trap still points here (shared feedback hub)
    const keepAsHub = incomingKeep.some(e =>
      /^(Observe|Retry|Continue|Check)/i.test(e.from)
      || (!TRAP_ENTRY_RE.test(e.from) && !allRemoved.has(e.from) && !/Strat$/i.test(e.from)));
    if (keepAsHub) {
      // Only strip trap→hop; hop node stays
      continue;
    }
    mm = removeNodeMentions(mm, hop);
  }

  // Strip orphan multi-hub defs with no remaining edges (e.g. leftover TrapRoute[…])
  {
    const edges = parseStrategyMermaidEdges(mm);
    const selectNow = new Set(
      edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to),
    );
    const referenced = new Set();
    edges.forEach(e => { referenced.add(e.from); referenced.add(e.to); });
    const labels = extractStrategyNodeLabels(mm);
    for (const id of labels.keys()) {
      if (selectNow.has(id) || referenced.has(id)) continue;
      if (!TRAP_ENTRY_RE.test(id) && !REDUNDANT_HOP_RE.test(id) && !/TrapStrat/i.test(id)) continue;
      mm = removeNodeMentions(mm, id);
    }
  }

  // Clean blank runs
  mm = mm.replace(/\n{3,}/g, '\n\n');
  if (!mm.endsWith('\n')) mm += '\n';

  return {
    mermaid: mm,
    changed: mm !== original,
    stats,
    removedNodes: [...allRemoved].filter(id => !nodeStillReferenced(mm, id)
      || !parseStrategyMermaidEdges(mm).some(e => e.from === id || e.to === id)),
  };
}

/**
 * Remap trap-route highlights after collapse.
 */
function remapTrapRouteHighlights(routes, mermaidBody, removedNodes) {
  if (!Array.isArray(routes)) return { routes, changed: false };
  const edges = parseStrategyMermaidEdges(mermaidBody);
  const selectTargets = new Set(
    edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to),
  );
  const removed = new Set(removedNodes || []);
  // Also treat synonym hubs as removable from trap highlights when no longer on trap outs
  const trapOutMap = new Map();
  for (const t of selectTargets) {
    if (!TRAP_ENTRY_RE.test(t)) continue;
    trapOutMap.set(t, new Set(edges.filter(e => e.from === t).map(e => e.to)));
  }

  let changed = false;
  const next = routes.map(route => {
    const isTrap = /trap|盲调|多参/i.test(`${route.id || ''}${route.label || ''}`)
      && !/试探混淆|confound/i.test(`${route.label || ''}${route.kind || ''}`);
    if (!isTrap) return route;

    const selectEdge = edges.find(e =>
      /StrategySelect/i.test(e.from)
      && selectTargets.has(e.to)
      && TRAP_ENTRY_RE.test(e.to)
      && (/多参|盲调/.test(e.label || '') || true));
    // Prefer edge whose label matches route
    const labeled = edges.find(e =>
      /StrategySelect/i.test(e.from)
      && TRAP_ENTRY_RE.test(e.to)
      && /多参|盲调/.test(e.label || ''));
    const trapId = (labeled || selectEdge || edges.find(e =>
      /StrategySelect/i.test(e.from) && TRAP_ENTRY_RE.test(e.to)))?.to;

    let nodes = route.highlightNodes ? [...route.highlightNodes] : null;
    let hlEdges = route.highlightEdges
      ? route.highlightEdges.map(p => (Array.isArray(p) ? [...p] : p))
      : null;
    let rChanged = false;

    const dropId = (id) => {
      if (!id) return false;
      if (removed.has(id)) return true;
      if (/^(TrapStrat)$/i.test(id)) return true;
      if (trapId && REDUNDANT_HOP_RE.test(id) && id !== trapId) {
        const outs = trapOutMap.get(trapId);
        // Drop if trap no longer points to this hop
        if (outs && !outs.has(id)) return true;
      }
      return false;
    };

    if (nodes) {
      const filtered = nodes.filter(id => !dropId(id));
      if (trapId && !filtered.includes(trapId)) filtered.push(trapId);
      // Ensure Fire/Retest if trap points there
      if (trapId) {
        for (const to of (trapOutMap.get(trapId) || [])) {
          if (/^(Fire|Retest|Launch)/i.test(to) && !filtered.includes(to)) filtered.push(to);
        }
      }
      if (filtered.length !== nodes.length || filtered.some((id, i) => id !== nodes[i])) {
        nodes = filtered;
        rChanged = true;
      }
    }

    if (hlEdges) {
      const rebuilt = [];
      const seen = new Set();
      const trapOuts = trapId ? (trapOutMap.get(trapId) || new Set()) : new Set();
      for (const p of hlEdges) {
        if (!Array.isArray(p) || p.length < 2) continue;
        let [a, b] = p;
        // Drop stale trap outs no longer in mermaid (e.g. Trap→Adjust after collapse)
        if (trapId && a === trapId && !trapOuts.has(b)) {
          rChanged = true;
          continue;
        }
        if (dropId(a) || dropId(b)) {
          // Rewrite Trap→hop→Fire into Trap→Fire
          if (trapId && a === trapId && dropId(b)) {
            for (const to of trapOuts) {
              const k = `${trapId}->${to}`;
              if (!seen.has(k)) {
                seen.add(k);
                rebuilt.push([trapId, to]);
              }
            }
          }
          rChanged = true;
          continue;
        }
        const k = `${a}->${b}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rebuilt.push([a, b]);
      }
      // Ensure StrategySelect→Trap and Trap→Fire
      if (trapId) {
        const sel = edges.find(e => /StrategySelect/i.test(e.from) && e.to === trapId);
        if (sel) {
          const k = `${sel.from}->${trapId}`;
          if (!seen.has(k)) {
            seen.add(k);
            rebuilt.push([sel.from, trapId]);
            rChanged = true;
          }
        }
        for (const to of (trapOutMap.get(trapId) || [])) {
          const k = `${trapId}->${to}`;
          if (!seen.has(k)) {
            seen.add(k);
            rebuilt.push([trapId, to]);
            rChanged = true;
          }
        }
      }
      if (rChanged || rebuilt.length !== hlEdges.length) {
        hlEdges = rebuilt;
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

/**
 * Collapse mermaid + remap trap highlights on a chapter.
 */
function collapseTrapChainsInChapter(chapter) {
  const strat = chapter?.strategy;
  if (!strat?.mermaid) {
    return { chapter, changed: false, stats: null, removedNodes: [] };
  }
  const result = collapseTrapRedundantChains(strat.mermaid);
  let routes = strat.routes;
  let hlChanged = false;
  if (result.changed || result.stats?.labelOnly) {
    const remapped = remapTrapRouteHighlights(
      routes,
      result.mermaid,
      result.removedNodes,
    );
    routes = remapped.routes;
    hlChanged = remapped.changed;
  }
  const changed = result.changed || hlChanged;
  if (!changed) return { chapter, changed: false, stats: result.stats, removedNodes: result.removedNodes };

  return {
    chapter: {
      ...chapter,
      strategy: {
        ...strat,
        mermaid: result.mermaid,
        ...(routes ? { routes } : {}),
      },
    },
    changed: true,
    stats: result.stats,
    removedNodes: result.removedNodes,
  };
}

module.exports = {
  TRAP_LABEL,
  collapseTrapRedundantChains,
  collapseTrapChainsInChapter,
  remapTrapRouteHighlights,
  planTrapCollapse,
  isRedundantMultiHop,
};
