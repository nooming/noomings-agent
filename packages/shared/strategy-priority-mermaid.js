/**
 * Annotate strategy Mermaid so StrategySelect out-edges show priorityRank / score,
 * ordered top-to-bottom, with trap as dotted edges.
 * Browser + Node. Does not mutate chapter validation labels until applied to a display copy.
 */
(function (root) {
  function isConfoundProbeRoute(route) {
    return route?.kind === 'confoundProbe'
      || /试探混淆/.test(String(route?.label || ''));
  }

  function isTrapRoute(route) {
    if (isConfoundProbeRoute(route)) return false;
    return route?.tier === 'suboptimal'
      || /trap|盲调|多参|多滑/i.test(`${route?.id || ''}${route?.label || ''}`);
  }

  /** Strip prior annotation so re-annotate is idempotent. */
  function stripPriorityAnnotation(label) {
    return String(label || '')
      .replace(/\s*·\s*优先\d+\s*·\s*[\d.]+$/u, '')
      .replace(/\s*·\s*陷阱\s*·\s*[\d.]+$/u, '')
      .replace(/\s*·\s*旁路\s*·\s*[\d.]+$/u, '')
      .replace(/\s*·\s*优先\d+$/u, '')
      .replace(/\s*·\s*陷阱$/u, '')
      .replace(/\s*·\s*旁路$/u, '')
      .trim();
  }

  /** Short display: 单变量·极板间距 → 单变量·间距；单变量·介质材料 → 单变量·介质 */
  function shortDisplayLabel(label) {
    return stripPriorityAnnotation(label)
      .replace(/极板/g, '')
      .replace(/材料$/g, '')
      .trim();
  }

  function normalizeLabelKey(label) {
    return stripPriorityAnnotation(label).replace(/\s+/g, '');
  }

  function routePriorityMeta(route) {
    if (isConfoundProbeRoute(route)) {
      return {
        rank: 98,
        score: route?.score != null ? Number(route.score) : 0.15,
        trap: false,
        confound: true,
      };
    }
    if (isTrapRoute(route)) {
      return {
        rank: 99,
        score: route?.score != null ? Number(route.score) : 0.2,
        trap: true,
        confound: false,
      };
    }
    const rank = route?.priorityRank != null ? Number(route.priorityRank) : 50;
    const score = route?.score != null
      ? Number(route.score)
      : (route?.weight != null ? Number(route.weight) : 0.75);
    return { rank, score, trap: false, confound: false };
  }

  function formatPriorityEdgeLabel(route) {
    const meta = routePriorityMeta(route);
    const short = shortDisplayLabel(route?.label || '');
    const score = (Number.isFinite(meta.score) ? meta.score : 0).toFixed(2);
    if (meta.confound) return `${short} · 旁路 · ${score}`;
    if (meta.trap) return `${short} · 陷阱 · ${score}`;
    return `${short} · 优先${meta.rank} · ${score}`;
  }

  function strokeWidthForMeta(meta) {
    if (meta.confound) return 1.2;
    if (meta.trap) return 1.4;
    if (meta.rank <= 1) return 4.2;
    if (meta.rank === 2) return 3;
    if (meta.rank === 3) return 2.2;
    return 1.6;
  }

  function strokeColorForMeta(meta) {
    if (meta.confound) return '#a16207';
    if (meta.trap) return '#dc2626';
    if (meta.rank <= 1) return '#0f766e';
    if (meta.rank === 2) return '#0369a1';
    if (meta.rank === 3) return '#64748b';
    return '#94a3b8';
  }

  function matchRouteForEdgeLabel(edgeLabel, routes) {
    const key = normalizeLabelKey(edgeLabel);
    if (!key || !Array.isArray(routes)) return null;
    const exact = routes.find(r => normalizeLabelKey(r.label) === key);
    if (exact) return exact;
    return routes.find(r => {
      const rk = normalizeLabelKey(r.label);
      return rk && (key.includes(rk) || rk.includes(key));
    }) || null;
  }

  function findSelectOutEdgeTarget(route, mermaidBody) {
    const edges = route?.highlightEdges || [];
    for (const pair of edges) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      if (/StrategySelect/i.test(String(pair[0]))) return String(pair[1]);
    }
    // Fallback: match Mermaid StrategySelect out-edge by route label (prio styles
    // still work when highlightEdges omit the select fan-out edge).
    const body = String(mermaidBody || '');
    if (!body.trim() || !route) return null;
    const want = normalizeLabelKey(route.label);
    if (!want) return null;
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    let fuzzy = null;
    for (const line of lines) {
      const m = String(line).trim().match(
        /\b(StrategySelect)\b[^\n]*?(-->|-\.->)\s*\|([^|]+)\|\s*([A-Za-z][A-Za-z0-9_]*)/,
      );
      if (!m) continue;
      const edgeKey = normalizeLabelKey(m[3]);
      if (!edgeKey) continue;
      if (edgeKey === want) return m[4];
      if (!fuzzy && (edgeKey.includes(want) || want.includes(edgeKey))) fuzzy = m[4];
    }
    if (fuzzy) return fuzzy;
    if (isTrapRoute(route)) {
      for (const line of lines) {
        const m = String(line).trim().match(
          /\b(StrategySelect)\b[^\n]*?(-->|-\.->)\s*\|([^|]+)\|\s*([A-Za-z][A-Za-z0-9_]*)/,
        );
        if (m && /盲调|多参|trap|多滑/i.test(m[3])) return m[4];
      }
    }
    return null;
  }

  /**
   * Rank routes for StrategySelect fan-out (preferred first by priorityRank, trap last).
   */
  function rankedStrategySelectRoutes(routes) {
    const list = Array.isArray(routes) ? [...routes] : [];
    return list
      .filter(r => r && r.warn !== 'irrelevant')
      .sort((a, b) => {
        const ma = routePriorityMeta(a);
        const mb = routePriorityMeta(b);
        // AV first, then confound bypass, then trap
        const tier = (m) => (m.confound ? 2 : (m.trap ? 3 : 1));
        if (tier(ma) !== tier(mb)) return tier(ma) - tier(mb);
        if (ma.rank !== mb.rank) return ma.rank - mb.rank;
        return String(a.label || '').localeCompare(String(b.label || ''), 'zh');
      });
  }

  function rewriteSelectEdgeLine(line, route) {
    const meta = routePriorityMeta(route);
    const newLabel = formatPriorityEdgeLabel(route);
    let s = String(line);
    // Swap solid → dotted for trap / confound probe
    if (meta.trap || meta.confound) {
      s = s.replace(/-->/g, '-.->').replace(/-\.-\.->/g, '-.->');
    } else {
      s = s.replace(/-\.->/g, '-->');
    }
    s = s.replace(/\|([^|]+)\|/, `|${newLabel}|`);
    return s;
  }

  function ensureTrapClassOnTarget(body, targetId) {
    if (!targetId) return body;
    const re = new RegExp(
      `(\\b${targetId}\\b(?:\\[[^\\]]*\\]|\\([^)]*\\)|\\{[^}]*\\}))(:::strat\\w+)?`,
      'g',
    );
    return String(body).replace(re, (full, nodePart, cls) => {
      if (cls && /stratTrap|stratInvalid/i.test(cls)) return full;
      return `${nodePart}:::stratTrap`;
    });
  }

  /**
   * @param {string} mermaidBody
   * @param {Array} routes strategy.routes
   * @returns {string} display mermaid with priority labels + ordered StrategySelect edges
   */
  function annotateStrategyMermaidPriority(mermaidBody, routes) {
    const raw = String(mermaidBody || '').replace(/\r\n/g, '\n');
    if (!raw.trim() || !Array.isArray(routes) || !routes.length) return raw;

    const lines = raw.split('\n');
    const selectEdgeIdx = [];
    const selectEdges = [];

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t || /^(graph|flowchart|classDef|class)\s/i.test(t)) continue;
      // StrategySelect -->|label| Target  (or -.->)
      const m = t.match(
        /\b(StrategySelect)\b[^\n]*?(-->|-\.->)\s*\|([^|]+)\|\s*([A-Za-z][A-Za-z0-9_]*)/,
      );
      if (!m) continue;
      const label = m[3].trim();
      const to = m[4];
      let route = matchRouteForEdgeLabel(label, routes);
      if (!route) {
        route = routes.find(r => findSelectOutEdgeTarget(r, raw) === to) || null;
      }
      selectEdgeIdx.push(i);
      selectEdges.push({
        index: i,
        line: lines[i],
        to,
        route,
        meta: route ? routePriorityMeta(route) : { rank: 50, score: 0.5, trap: false },
      });
    }

    if (!selectEdges.length) return raw;

    // Prefer route list order when every edge matched
    const ranked = rankedStrategySelectRoutes(routes);
    selectEdges.sort((a, b) => {
      if (a.route && b.route) {
        const ia = ranked.indexOf(a.route);
        const ib = ranked.indexOf(b.route);
        if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
      }
      const tier = (m) => (m.confound ? 2 : (m.trap ? 3 : 1));
      if (tier(a.meta) !== tier(b.meta)) return tier(a.meta) - tier(b.meta);
      if (a.meta.rank !== b.meta.rank) return a.meta.rank - b.meta.rank;
      return a.index - b.index;
    });

    const rewritten = selectEdges.map(e => {
      if (!e.route) return e.line;
      return rewriteSelectEdgeLine(e.line, e.route);
    });

    // Place sorted select-out edges at the first original select-edge slot; remove other slots
    const firstSlot = selectEdgeIdx[0];
    const skip = new Set(selectEdgeIdx);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === firstSlot) {
        rewritten.forEach(l => out.push(l));
        continue;
      }
      if (skip.has(i)) continue;
      out.push(lines[i]);
    }

    let result = out.join('\n');
    for (const e of selectEdges) {
      if ((e.meta.trap || e.meta.confound) && e.to) result = ensureTrapClassOnTarget(result, e.to);
    }
    return result;
  }

  /**
   * Map StrategySelect→target edge keys to priority style meta (for SVG post-style).
   * @param {Array} routes
   * @param {string} [mermaidBody] optional; used to resolve select targets when highlightEdges omit them
   */
  function strategySelectPriorityStyles(routes, mermaidBody) {
    const map = new Map();
    for (const route of rankedStrategySelectRoutes(routes)) {
      const to = findSelectOutEdgeTarget(route, mermaidBody);
      if (!to) continue;
      const meta = routePriorityMeta(route);
      map.set(`StrategySelect->${to}`, {
        ...meta,
        strokeWidth: strokeWidthForMeta(meta),
        stroke: strokeColorForMeta(meta),
        label: formatPriorityEdgeLabel(route),
        routeId: route.id,
      });
    }
    return map;
  }

  const api = {
    isTrapRoute,
    isConfoundProbeRoute,
    stripPriorityAnnotation,
    shortDisplayLabel,
    formatPriorityEdgeLabel,
    routePriorityMeta,
    rankedStrategySelectRoutes,
    annotateStrategyMermaidPriority,
    strategySelectPriorityStyles,
    findSelectOutEdgeTarget,
    strokeWidthForMeta,
    strokeColorForMeta,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof root !== 'undefined') {
    root.StrategyPriorityMermaid = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
