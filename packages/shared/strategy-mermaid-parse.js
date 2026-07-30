/**
 * Shared Mermaid strategy edge parser (browser + Node validate).
 * Avoids HTML-breaking arrow sequences in regex when inlined in graph.html script.
 */
(function (root) {
  const ARROW_SOLID = '--' + '>';
  const MERMAID_EDGE_SPLIT = new RegExp('(-\\.->|' + ARROW_SOLID + ')');

  function extractMermaidNodeId(seg) {
    const s = seg.trim().replace(/:::strat\w+/g, '');
    const m = s.match(/\b([A-Za-z][A-Za-z0-9_]*)\s*(?:$|\(|\[|\{|")/) || s.match(/^([A-Za-z][A-Za-z0-9_]*)/);
    return m ? m[1] : null;
  }

  function parseTargetSeg(seg) {
    let s = seg.trim().replace(/:::strat\w+/g, '');
    let label = null;
    const lm = s.match(/^\|([^|]*)\|([\s\S]*)$/);
    if (lm) {
      label = lm[1];
      s = lm[2].trim();
    }
    return { id: extractMermaidNodeId(s), label };
  }

  /** Mermaid dash-label edges: rewrite to pipe form for shared arrow splitter. */
  function normalizeDashLabelEdges(line) {
    return String(line).replace(
      /(\b[A-Za-z][A-Za-z0-9_]*)\s+--\s+([^-\n]+?)\s+-->/g,
      (_, from, label) => `${from} -->|${String(label).trim()}|`
    );
  }

  function parseStrategyMermaidEdges(body) {
    const edges = [];
    const lines = (body || '').replace(/\r\n/g, '\n').split('\n');

    for (const raw of lines) {
      const line = normalizeDashLabelEdges(raw.trim());
      if (!line || /^graph\s|^flowchart\s|^classDef\s|^class\s/i.test(line)) continue;
      const parts = line.split(MERMAID_EDGE_SPLIT);
      if (parts.length < 3) continue;
      let from = extractMermaidNodeId(parts[0]);
      for (let i = 1; i < parts.length; i += 2) {
        const arrow = parts[i];
        if (arrow !== ARROW_SOLID && arrow !== '-.->') continue;
        const { id: to, label } = parseTargetSeg(parts[i + 1] || '');
        if (from && to) {
          edges.push({
            from,
            to,
            dotted: arrow === '-.->',
            label,
            key: `${from}->${to}`,
          });
        }
        from = to;
      }
    }
    return edges;
  }

  function addEdgeKey(keys, from, to) {
    if (from && to) keys.add(`${from}->${to}`);
  }

  function shortestPathEdgeKeys(from, to, edges) {
    if (!from || !to || from === to) return [];
    const adj = new Map();
    edges.forEach(e => {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push({ to: e.to, key: e.key });
    });
    const q = [{ id: from, path: [] }];
    const seen = new Set([from]);
    while (q.length) {
      const { id, path } = q.shift();
      for (const { to: nxt, key } of adj.get(id) || []) {
        if (seen.has(nxt)) continue;
        const nextPath = [...path, key];
        if (nxt === to) return nextPath;
        seen.add(nxt);
        q.push({ id: nxt, path: nextPath });
      }
    }
    return [];
  }

  function shortestPathNodes(from, to, edges) {
    if (!from || !to) return [];
    if (from === to) return [from];
    const keys = shortestPathEdgeKeys(from, to, edges);
    if (!keys.length) return [];
    const nodes = [from];
    keys.forEach(k => {
      const i = k.indexOf('->');
      if (i >= 0) nodes.push(k.slice(i + 2));
    });
    return nodes;
  }

  function findStartNode(mermaidBody, edges) {
    const body = String(mermaidBody || '');
    for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
      const line = raw.trim();
      if (!/:::stratStart\b/i.test(line)) continue;
      const id = extractMermaidNodeId(line.split(/-->/)[0] || line);
      if (id) return id;
    }
    const parsed = edges || parseStrategyMermaidEdges(mermaidBody);
    const inDeg = new Map();
    parsed.forEach(e => {
      if (!inDeg.has(e.from)) inDeg.set(e.from, 0);
      if (!inDeg.has(e.to)) inDeg.set(e.to, 0);
      inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
    });
    const roots = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    if (roots.includes('Start')) return 'Start';
    return roots[0] || 'Start';
  }

  function addEdgeKeyEndpoints(nodeSet, keySet) {
    keySet.forEach(k => {
      const i = k.indexOf('->');
      if (i < 0) return;
      nodeSet.add(k.slice(0, i));
      nodeSet.add(k.slice(i + 2));
    });
  }

  function routeEntryNodes(highlightNodes, edges) {
    const hlSet = new Set(highlightNodes || []);
    const sources = (highlightNodes || []).filter(n =>
      !edges.some(e => e.to === n && hlSet.has(e.from)),
    );
    if (sources.length) return sources;
    return (highlightNodes || []).filter(n =>
      edges.some(e => e.to === n && !hlSet.has(e.from)),
    );
  }

  function extractStratResultNodeIds(mermaidBody) {
    const ids = new Set();
    const body = normalizeStrategyNodeClasses(String(mermaidBody || ''));
    const classRe = /\b([A-Za-z][A-Za-z0-9_]*)(?:\(\[[^\]]*\]|\[[^\]]*\]|\{[^}]*\}):::strat(?:Result|End|Success)\b/gi;
    let m;
    while ((m = classRe.exec(body)) !== null) ids.add(m[1]);
    const labelRes = [
      /\b([A-Za-z][A-Za-z0-9_]*)\(\[([^\]]+)\]\)(:::strat\w+)?/gi,
      /\b([A-Za-z][A-Za-z0-9_]*)\[([^\]]+)\](:::strat\w+)?/gi,
      /\b([A-Za-z][A-Za-z0-9_]*)\{([^}]+)\}(:::strat\w+)?/gi,
    ];
    for (const re of labelRes) {
      while ((m = re.exec(body)) !== null) {
        const label = String(m[2] || '').replace(/^"|"$/g, '').trim();
        const stratClass = m[3] || '';
        const decl = m[0] || '';
        if (/:::strat(?:Cond|Retry|Invalid)\b/i.test(stratClass)
          || /:::strat(?:Cond|Retry|Invalid)\b/i.test(decl)) continue;
        if (/\{/.test(decl) && /\?/.test(label)) continue;
        if (STRATEGY_SUCCESS_LABEL.test(label) && !STRATEGY_SUCCESS_LABEL_EXEMPT.test(label)) {
          ids.add(m[1]);
        }
      }
    }
    return ids;
  }

      const STRATEGY_SUCCESS_LABEL = /过关|胜利|命中|成功|完成|通过|🎉/;
  const STRATEGY_SUCCESS_LABEL_EXEMPT = /不影响过关|无效.*过关|关态下.*不影响|不影响.*判定|仅UI|仅 UI/i;
  const SUCCESS_EDGE_LABEL = /^(是|yes|ok|达标|命中|成功|过关|胜利|完成|通过|正确|命中目标|达标了)$/i;
  const FAILURE_EDGE_LABEL = /否|未|不|偏近|偏远|偏低|偏高|retry|再试|迷思|无效|失败|miss|no/i;

function isSuccessBranchEdge(edge, resultIds) {
    const lbl = String(edge.label || '').trim();
    if (!lbl) return resultIds.has(edge.to) && !edge.dotted;
    if (FAILURE_EDGE_LABEL.test(lbl)) return false;
    return SUCCESS_EDGE_LABEL.test(lbl);
  }

  function routeShouldAppendSuccessOutcomes(route, opts) {
    if (route?.warn === 'irrelevant') return false;
    if (routeIsMisconceptionRoute(route, opts?.mermaidBody)) return false;
    const resultKgIds = opts?.resultKgIds;
    if (resultKgIds == null) return true;
    if (resultKgIds.size === 0) return false;
    return (route.mapsTo || []).some(id => resultKgIds.has(id));
  }

  function extractStratInvalidNodeIds(mermaidBody) {
    const ids = new Set();
    const body = normalizeStrategyNodeClasses(String(mermaidBody || ''));
    const classRe = /\b([A-Za-z][A-Za-z0-9_]*)(?:\(\[[^\]]*\]|\[[^\]]*\]|\{[^}]*\}):::stratInvalid\b/gi;
    let m;
    while ((m = classRe.exec(body)) !== null) ids.add(m[1]);
    return ids;
  }

    const MISCONCEPTION_ROUTE_WARN_RE = /无效|迷思|不影响|invalid|misconception|无关变量|陷阱|trap|误调.*迷思|关态下|关态.*无效/i;
  const MISCONCEPTION_ROUTE_NODE_RE = /Invalid|Misconception|Trap/i;

  /** Trap / invalid / off-mode routes must not highlight stratResult success exits. */
  function routeIsMisconceptionRoute(route, mermaidBody) {
    if (route?.warn === 'irrelevant') return true;
    const warn = String(route?.warn || '');
    if (MISCONCEPTION_ROUTE_WARN_RE.test(warn)) return true;
    const hl = route?.highlightNodes || [];
    if (hl.some(id => MISCONCEPTION_ROUTE_NODE_RE.test(String(id)))) return true;
    if (mermaidBody) {
      const invalidIds = extractStratInvalidNodeIds(mermaidBody);
      if (hl.some(id => invalidIds.has(id))) return true;
    }
    return false;
  }

  function stripMisconceptionSuccessHighlights(nodeSet, keySet, mermaidBody, route) {
    if (!routeIsMisconceptionRoute(route, mermaidBody)) return;
    const resultIds = extractStratResultNodeIds(mermaidBody);
    for (const id of resultIds) nodeSet.delete(id);
    for (const key of [...keySet]) {
      const i = key.indexOf('->');
      if (i < 0) continue;
      if (resultIds.has(key.slice(i + 2))) keySet.delete(key);
    }
  }

  function sanitizeMisconceptionRouteHighlights(routes, mermaidBody) {
    if (!Array.isArray(routes)) return routes;
    const resultIds = extractStratResultNodeIds(mermaidBody || '');
    if (!resultIds.size) return routes;
    return routes.map(route => {
      if (!routeIsMisconceptionRoute(route, mermaidBody)) return route;
      const highlightNodes = (route.highlightNodes || []).filter(id => !resultIds.has(id));
      const highlightEdges = (route.highlightEdges || []).filter(pair =>
        !Array.isArray(pair) || pair.length < 2 || !resultIds.has(pair[1]),
      );
      if (highlightNodes.length === (route.highlightNodes || []).length
        && highlightEdges.length === (route.highlightEdges || []).length) {
        return route;
      }
      return { ...route, highlightNodes, highlightEdges };
    });
  }

  function extractStratRetryNodeIds(mermaidBody) {
    const ids = new Set();
    const body = normalizeStrategyNodeClasses(String(mermaidBody || ''));
    const classRe = /\b([A-Za-z][A-Za-z0-9_]*)(?:\(\[[^\]]*\]|\[[^\]]*\]|\{[^}]*\}):::stratRetry\b/gi;
    let m;
    while ((m = classRe.exec(body)) !== null) ids.add(m[1]);
    const labelRes = [
      /\b([A-Za-z][A-Za-z0-9_]*)\(\[([^\]]+)\]\)(:::strat\w+)?/gi,
      /\b([A-Za-z][A-Za-z0-9_]*)\[([^\]]+)\](:::strat\w+)?/gi,
    ];
    for (const re of labelRes) {
      while ((m = re.exec(body)) !== null) {
        const label = String(m[2] || '').replace(/^"|"$/g, '').trim();
        if (/��|��|retry/i.test(label)) ids.add(m[1]);
      }
    }
    return ids;
  }

  function extractStratCondNodeIds(mermaidBody) {
    const ids = new Set();
    const body = normalizeStrategyNodeClasses(String(mermaidBody || ''));
    const classRe = /\b([A-Za-z][A-Za-z0-9_]*)(?:\(\[[^\]]*\]|\[[^\]]*\]|\{[^}]*\}):::stratCond\b/gi;
    let m;
    while ((m = classRe.exec(body)) !== null) ids.add(m[1]);
    return ids;
  }

  /** Pairwise path may only use nodes declared on the route (prevents shared-hub bleed). */
  function pathRespectsHlOrig(pathKeys, hlOrig) {
    if (!pathKeys.length) return false;
    for (const key of pathKeys) {
      const i = key.indexOf('->');
      if (i < 0) return false;
      const from = key.slice(0, i);
      const to = key.slice(i + 2);
      if (!hlOrig.has(from) || !hlOrig.has(to)) return false;
    }
    return true;
  }

  function addRestrictedPairwiseKeys(keys, hl, hlOrig, pathFn, mermaidBody, hasExplicitSpine) {
    for (let i = 0; i < hl.length; i++) {
      for (let j = i + 1; j < hl.length; j++) {
        const a = hl[i];
        const b = hl[j];
        if (hasExplicitSpine && shouldSkipSpinePairwise(a, b, mermaidBody)) continue;
        for (const path of [pathFn(a, b), pathFn(b, a)]) {
          if (pathRespectsHlOrig(path, hlOrig)) path.forEach(k => keys.add(k));
        }
      }
    }
  }

  function isSharedRouteTerminal(id, mermaidBody) {
    if (extractStratResultNodeIds(mermaidBody).has(id)) return true;
    if (extractStratRetryNodeIds(mermaidBody).has(id)) return true;
    return /^Retry\d*$/i.test(id);
  }

  function shouldSkipSpinePairwise(a, b, mermaidBody) {
    return isSharedRouteTerminal(a, mermaidBody) || isSharedRouteTerminal(b, mermaidBody);
  }

  function branchReachableHighlight(root, hlSet, edges) {
    if (hlSet.has(root)) return true;
    const adj = new Map();
    edges.forEach(e => {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e.to);
    });
    const q = [root];
    const seen = new Set([root]);
    while (q.length) {
      const id = q.shift();
      if (hlSet.has(id)) return true;
      for (const nxt of adj.get(id) || []) {
        if (seen.has(nxt)) continue;
        seen.add(nxt);
        q.push(nxt);
      }
    }
    return false;
  }

  /** At macro forks, forbid paths through sibling branches not on this route. */
  function forkSiblingExclusions(edges, hlSet) {
    const forbidden = new Set();
    const byFrom = new Map();
    edges.forEach(e => {
      if (!byFrom.has(e.from)) byFrom.set(e.from, []);
      if (!byFrom.get(e.from).includes(e.to)) byFrom.get(e.from).push(e.to);
    });
    byFrom.forEach((children, from) => {
      if (children.length < 2) return;
      const active = children.filter(child => branchReachableHighlight(child, hlSet, edges));
      if (active.length === 1) {
        children.forEach(c => {
          if (c !== active[0]) forbidden.add(c);
        });
      }
    });
    return forbidden;
  }

  function numberedRouteSiblingExclusions(hlSet, mermaidBody) {
    const forbidden = new Set();
    const edges = parseStrategyMermaidEdges(mermaidBody);
    const ids = new Set();
    edges.forEach(e => {
      ids.add(e.from);
      ids.add(e.to);
    });
    const basesInHl = new Map();
    for (const id of hlSet) {
      const m = String(id).match(/^([A-Za-z]+?)(\d*)$/);
      if (!m) continue;
      const base = m[1];
      if (!/^(Observe|CheckGoal|Adjust|Fire|Tune|Launch|Strategy|Strat)/i.test(base)) continue;
      const suffix = m[2] || '';
      if (!basesInHl.has(base)) basesInHl.set(base, new Set());
      basesInHl.get(base).add(suffix);
    }
    for (const id of ids) {
      const m = String(id).match(/^([A-Za-z]+?)(\d*)$/);
      if (!m) continue;
      const base = m[1];
      if (!basesInHl.has(base)) continue;
      const suffix = m[2] || '';
      const allowed = basesInHl.get(base);
      if (allowed.size >= 1 && !allowed.has(suffix)) forbidden.add(id);
    }
    return forbidden;
  }

  /** When exactly one direct child is declared on the route, forbid sibling macro-strategy entries. */
  function directStrategyBranchExclusions(edges, hlOrig) {
    const forbidden = new Set();
    if (!hlOrig || !hlOrig.size) return forbidden;
    const byFrom = new Map();
    edges.forEach(e => {
      if (!byFrom.has(e.from)) byFrom.set(e.from, []);
      if (!byFrom.get(e.from).includes(e.to)) byFrom.get(e.from).push(e.to);
    });
    byFrom.forEach((children, from) => {
      if (children.length < 2) return;
      if (!/StrategySelect/i.test(from)) return;
      const declared = children.filter(child => hlOrig.has(child));
      if (declared.length !== 1) return;
      const keep = declared[0];
      children.forEach(c => {
        if (c !== keep) forbidden.add(c);
      });
    });
    return forbidden;
  }

  function collectPathForbidden(edges, hlSet, mermaidBody, hlOrig) {
    const forbidden = forkSiblingExclusions(edges, hlSet);
    directStrategyBranchExclusions(edges, hlOrig || hlSet).forEach(id => forbidden.add(id));
    if (detectMacroRouteFanOut(mermaidBody)) {
      numberedRouteSiblingExclusions(hlSet, mermaidBody).forEach(id => forbidden.add(id));
    }
    return forbidden;
  }

  function shortestPathEdgeKeysAvoiding(from, to, edges, forbidden) {
    if (!from || !to || from === to) return [];
    const adj = new Map();
    edges.forEach(e => {
      if (forbidden.has(e.to)) return;
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push({ to: e.to, key: e.key });
    });
    const q = [{ id: from, path: [] }];
    const seen = new Set([from]);
    while (q.length) {
      const { id, path } = q.shift();
      for (const { to: nxt, key } of adj.get(id) || []) {
        if (seen.has(nxt)) continue;
        const nextPath = [...path, key];
        if (nxt === to) return nextPath;
        seen.add(nxt);
        q.push({ id: nxt, path: nextPath });
      }
    }
    return [];
  }

  /** Replace highlightEdges shortcuts that are not direct mermaid edges with actual paths. */
  function resolvePhantomHighlightEdges(keySet, nodeSet, edges, pathFn) {
    const edgeKeys = new Set(edges.map(e => e.key));
    const phantom = [...keySet].filter(k => !edgeKeys.has(k));
    for (const key of phantom) {
      const i = key.indexOf('->');
      if (i < 0) continue;
      const from = key.slice(0, i);
      const to = key.slice(i + 2);
      const path = pathFn(from, to);
      if (!path.length) continue;
      keySet.delete(key);
      path.forEach(k => keySet.add(k));
      path.forEach(k => {
        const j = k.indexOf('->');
        if (j >= 0) {
          nodeSet.add(k.slice(0, j));
          nodeSet.add(k.slice(j + 2));
        }
      });
    }
  }

  function appendRouteSuccessOutcomes(nodeSet, keySet, edges, mermaidBody, route, opts) {
    if (!routeShouldAppendSuccessOutcomes(route, { ...(opts || {}), mermaidBody })) return;
    const resultIds = extractStratResultNodeIds(mermaidBody);
    if (!resultIds.size) return;
    const hlOrig = new Set(route.highlightNodes || []);
    edges.forEach(e => {
      if (!resultIds.has(e.to) || !nodeSet.has(e.from)) return;
      if (!hlOrig.has(e.from) && !hlOrig.has(e.to)) return;
      if (!isSuccessBranchEdge(e, resultIds)) return;
      nodeSet.add(e.to);
      keySet.add(e.key);
    });
  }

  function observeRetrySameBranch(observeId, retryId) {
    const o = String(observeId).match(/^Observe([A-Za-z]*\d*)$/i);
    const r = String(retryId).match(/^Retry([A-Za-z]*\d*)$/i);
    if (!o || !r) return false;
    const oSuffix = o[1] || '1';
    const rSuffix = r[1] || '1';
    return oSuffix === rSuffix;
  }

  function nodeBranchSuffix(id, baseRe) {
    const m = String(id || '').match(baseRe);
    return m ? (m[1] || '') : null;
  }

  function branchSuffixesMatch(gateId, targetId) {
    if (/^Observe[A-Za-z]*\d*$/i.test(gateId)) {
      return observeRetrySameBranch(gateId, targetId)
        || observeContinueSameBranch(gateId, targetId);
    }
    const gCheck = String(gateId).match(/^CheckGoal([A-Za-z]*\d*)$/i);
    if (gCheck) {
      const gSuffix = gCheck[1] || '';
      const c = String(targetId).match(/^Continue([A-Za-z]*\d*)$/i);
      if (c) return (c[1] || '') === gSuffix;
      const r = String(targetId).match(/^Retry([A-Za-z]*\d*)$/i);
      if (r) return (r[1] || '') === gSuffix;
    }
    return failureGateRetrySameBranch(gateId, targetId);
  }

  function observeContinueSameBranch(observeId, continueId) {
    const o = String(observeId).match(/^Observe([A-Za-z]*\d*)$/i);
    const c = String(continueId).match(/^Continue([A-Za-z]*\d*)$/i);
    if (!o || !c) return false;
    return (o[1] || '') === (c[1] || '');
  }

  function isRetestOperationId(id) {
    return /^(Fire|Launch|Tune|QuickFire)([A-Za-z]*\d*)?$/i.test(String(id || ''));
  }

  function retestOpSuffixMatches(sourceId, opId) {
    const src = nodeBranchSuffix(sourceId, /^(?:Observe|CheckGoal|Adjust)([A-Za-z]*\d*)$/i);
    if (src === null) return true;
    const op = nodeBranchSuffix(opId, /^(?:Fire|Launch|Tune)([A-Za-z]*\d*)$/i);
    if (op === null) return false;
    return src === op;
  }

  /** Node id �?display label from mermaid defs (shared by expand + compact). */
  function extractStrategyNodeLabels(mermaidBody) {
    const labels = new Map();
    const body = String(mermaidBody || '');
    const re = /\b([A-Za-z][A-Za-z0-9_]*)(?:\(\[([^\]]+)\]\)|\[([^\]]+)\]|\{([^}]+)\})/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      if (!labels.has(m[1])) labels.set(m[1], m[2] || m[3] || m[4] || '');
    }
    return labels;
  }

  const ADJUST_ID_RE = /^Adjust\w*\d*$/i;
  const ADJUST_PARAM_RE = /^(Decrease|Increase|FineTune|Retune|Calibrate|Analyze)\w*\d*$/i;
  const ADJUST_TEXT_RE = /t|�|�c|e|�'|�|<�|�|Ol|�/i;

  function isAdjustLikeNodeId(id, nodeLabels) {
    const s = String(id || '');
    if (ADJUST_ID_RE.test(s) || ADJUST_PARAM_RE.test(s)) return true;
    if (/^ReAim|^LockAim|^Lock\d*$/i.test(s)) return true;
    const label = nodeLabels instanceof Map ? (nodeLabels.get(s) || '') : '';
    return ADJUST_TEXT_RE.test(`${s}${label}`);
  }

  function extractRetestNodeIds(mermaidBody, edges) {
    const ids = new Set(extractStratRetryNodeIds(mermaidBody));
    for (const e of edges || []) {
      if (/^Continue\d*$/i.test(e.from)) ids.add(e.from);
      if (/^Continue\d*$/i.test(e.to)) ids.add(e.to);
    }
    const body = String(mermaidBody || '');
    const continueRe = /\b(Continue\d*)\(\[|\b(Continue\d*)\[|\b(Continue\d*)\{/gi;
    let m;
    while ((m = continueRe.exec(body)) !== null) {
      ids.add(m[1] || m[2] || m[3]);
    }
    return ids;
  }

  function followAdjustToRetestOp(adjustId, observeSuffix, nodeSet, keySet, edges, nodeLabels, depth = 0) {
    if (depth > 3) return;
    for (const e of edges) {
      if (e.from !== adjustId) continue;
      if (isRetestOperationId(e.to) && retestOpSuffixMatches(`Observe${observeSuffix}`, e.to)) {
        nodeSet.add(e.to);
        keySet.add(e.key);
        continue;
      }
      const chainOk = isAdjustLikeNodeId(e.to, nodeLabels)
        || /^ReAim|^LockAim|^Lock\d*$/i.test(String(e.to));
      if (chainOk && !/^Judge|^CheckGoal|^Observe/i.test(String(e.to))) {
        if (!nodeSet.has(e.to)) {
          nodeSet.add(e.to);
          keySet.add(e.key);
          followAdjustToRetestOp(e.to, observeSuffix, nodeSet, keySet, edges, nodeLabels, depth + 1);
        }
      }
    }
  }

  /** When route spine includes Observe/CheckGoal, light feedback adjust + continue loops. */
  function appendRouteObserveAdjustFireLoop(nodeSet, keySet, edges, mermaidBody, route) {
    if (route?.warn === 'irrelevant') return;
    const resultIds = extractStratResultNodeIds(mermaidBody);
    const retestIds = extractRetestNodeIds(mermaidBody, edges);
    const nodeLabels = extractStrategyNodeLabels(mermaidBody);

    const observeOnRoute = [...nodeSet].filter(id => /^Observe[A-Za-z]*\d*$/i.test(id));
    for (const obsId of observeOnRoute) {
      const obsSuffix = nodeBranchSuffix(obsId, /^Observe([A-Za-z]*\d*)$/i);
      if (obsSuffix === null) continue;
      for (const e of edges) {
        if (e.from !== obsId) continue;
        if (isSuccessBranchEdge(e, resultIds)) continue;
        if (resultIds.has(e.to)) continue;
        if (/^(CheckGoal|Judge|Observe)[A-Za-z]*\d*$/i.test(e.to)) continue;
        const feedbackTarget = isAdjustLikeNodeId(e.to, nodeLabels)
          || /^Continue\d*$/i.test(e.to)
          || /^Retry[A-Za-z]*\d*$/i.test(e.to)
          || /^ReAim|^LockAim|^Lock\d*$/i.test(String(e.to));
        if (!feedbackTarget) continue;
        nodeSet.add(e.to);
        keySet.add(e.key);
        if (isAdjustLikeNodeId(e.to, nodeLabels) || /^ReAim|^Lock/i.test(String(e.to))) {
          followAdjustToRetestOp(e.to, obsSuffix, nodeSet, keySet, edges, nodeLabels);
        } else if (isRetestOperationId(e.to) && retestOpSuffixMatches(obsId, e.to)) {
          nodeSet.add(e.to);
        }
      }
    }

    const checkGoals = [...nodeSet].filter(id => /^CheckGoal[A-Za-z]*\d*$/i.test(id));
    for (const cgId of checkGoals) {
      for (const e of edges) {
        if (e.from !== cgId) continue;
        if (isSuccessBranchEdge(e, resultIds)) continue;
        if (!retestIds.has(e.to) && !/^Continue\d*$/i.test(e.to)) continue;
        if (!branchSuffixesMatch(cgId, e.to)) continue;
        nodeSet.add(e.to);
        keySet.add(e.key);
        for (const e2 of edges) {
          if (e2.from !== e.to) continue;
          if (isRetestOperationId(e2.to) && retestOpSuffixMatches(cgId, e2.to)) {
            nodeSet.add(e2.to);
            keySet.add(e2.key);
          }
        }
      }
    }
  }

  function failureGateRetrySameBranch(gateId, retryId) {
    if (/^Continue\d*$/i.test(retryId)) return branchSuffixesMatch(gateId, retryId);
    if (/^Observe[A-Za-z]*\d*$/i.test(gateId)) return observeRetrySameBranch(gateId, retryId);
    const r = String(retryId).match(/^Retry([A-Za-z]*\d*)$/i);
    if (!r) return false;
    const rSuffix = r[1] || '';
    const gCheck = String(gateId).match(/^CheckGoal([A-Za-z]*\d*)$/i);
    if (gCheck) {
      if (!rSuffix) return true;
      return (gCheck[1] || '') === rSuffix;
    }
    const gJudge = String(gateId).match(/^Judge([A-Za-z]*\d*)$/i);
    if (gJudge) {
      if (!rSuffix) return true;
      return (gJudge[1] || '') === rSuffix;
    }
    return false;
  }

  function isFailureGateNode(id, mermaidBody) {
    if (/^(Observe|CheckGoal|Judge)[A-Za-z]*\d*$/i.test(id)) return true;
    return extractStratCondNodeIds(mermaidBody).has(id);
  }

  function isFailureRetryEdge(edge, retryIds) {
    if (/^Continue\d*$/i.test(edge.to)) {
      const lbl = String(edge.label || '').trim();
      if (lbl && SUCCESS_EDGE_LABEL.test(lbl)) return false;
      return true;
    }
    if (!retryIds.has(edge.to)) return false;
    const lbl = String(edge.label || '').trim();
    if (!lbl) return true;
    if (SUCCESS_EDGE_LABEL.test(lbl)) return false;
    return true;
  }

  function isRetryDeclaredForRoute(route, gateId, retryId) {
    if (route?.highlightFailureBranches === true) return true;
    const hlOrig = new Set(route.highlightNodes || []);
    if (hlOrig.has(retryId)) return true;
    if (hlOrig.has(gateId) && branchSuffixesMatch(gateId, retryId)) return true;
    if (hlOrig.has(gateId) && failureGateRetrySameBranch(gateId, retryId)) return true;
    for (const pair of route.highlightEdges || []) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      if (pair[0] === gateId && pair[1] === retryId) return true;
    }
    return false;
  }

  function routeShouldAppendFailureOutcomes(route, edges, mermaidBody) {
    if (route?.warn === 'irrelevant') return false;
    if (route?.highlightFailureBranches === true) return true;
    const hlOrig = new Set(route.highlightNodes || []);
    for (const n of hlOrig) {
      if (/^Retry[A-Za-z]*\d*$/i.test(n)) return true;
      if (/^Continue\d*$/i.test(n)) return true;
    }
    for (const pair of route.highlightEdges || []) {
      if (Array.isArray(pair) && pair.length >= 2 && /^Retry[A-Za-z]*\d*$/i.test(pair[1])) return true;
      if (Array.isArray(pair) && pair.length >= 2 && /^Continue\d*$/i.test(pair[1])) return true;
    }
    const retryIds = extractRetestNodeIds(mermaidBody, edges);
    for (const n of hlOrig) {
      if (!isFailureGateNode(n, mermaidBody)) continue;
      if (edges.some(e =>
        e.from === n
        && (branchSuffixesMatch(e.from, e.to) || failureGateRetrySameBranch(e.from, e.to))
        && isFailureRetryEdge(e, retryIds),
      )) return true;
    }
    return false;
  }

  function appendRouteFailureOutcomes(nodeSet, keySet, edges, mermaidBody, route) {
    if (!routeShouldAppendFailureOutcomes(route, edges, mermaidBody)) return;
    const retryIds = extractRetestNodeIds(mermaidBody, edges);
    if (!retryIds.size) return;
    const hlOrig = new Set(route.highlightNodes || []);
    edges.forEach(e => {
      const isRetest = retryIds.has(e.to) || /^Continue\d*$/i.test(e.to);
      if (!isRetest || !nodeSet.has(e.from)) return;
      if (!isFailureGateNode(e.from, mermaidBody)) return;
      if (!branchSuffixesMatch(e.from, e.to) && !failureGateRetrySameBranch(e.from, e.to)) return;
      if (!isFailureRetryEdge(e, retryIds)) return;
      if (!isRetryDeclaredForRoute(route, e.from, e.to) && !/^Continue\d*$/i.test(e.to)) return;
      if (route?.highlightFailureBranches !== true && !hlOrig.has(e.from) && !hlOrig.has(e.to)
        && !/^Continue\d*$/i.test(e.to)) return;
      nodeSet.add(e.to);
      keySet.add(e.key);
    });
  }

  /** When a Retry/Continue node is on the route, include return edge to declared route node. */
  function appendRouteRetryReturnEdges(nodeSet, keySet, edges, route) {
    const hlOrig = new Set(route.highlightNodes || []);
    edges.forEach(e => {
      const fromIsRetest = /^Retry[A-Za-z]*\d*$/i.test(e.from) || /^Continue\d*$/i.test(e.from);
      if (!fromIsRetest) return;
      if (!nodeSet.has(e.from)) return;
      if (!hlOrig.has(e.to) && !nodeSet.has(e.to)) return;
      if (isRetestOperationId(e.to) || hlOrig.has(e.to)) {
        nodeSet.add(e.to);
        keySet.add(e.key);
      }
    });
  }

  /** Retry return + gate�Retry failure edges (topology-driven). */
  function appendFailureAndRetryLoop(nodeSet, keySet, edges, mermaidBody, route) {
    appendRouteFailureOutcomes(nodeSet, keySet, edges, mermaidBody, route);
    appendRouteRetryReturnEdges(nodeSet, keySet, edges, route);
  }

  
  function isConfoundProbeRouteLike(route) {
    return route?.kind === 'confoundProbe'
      || /试探混淆/.test(String(route?.label || ''));
  }

  function isConfoundVisualNodeId(id) {
    return /^(ProbeCV|ObserveCV|BackFromCV)\d*$/i.test(String(id || ''));
  }

  function stripConfoundBleedFromRoute(nodeSet, keySet, route) {
    if (isConfoundProbeRouteLike(route)) return;
    for (const id of [...nodeSet]) {
      if (isConfoundVisualNodeId(id)) nodeSet.delete(id);
    }
    for (const k of [...keySet]) {
      const i = k.indexOf('->');
      if (i < 0) continue;
      const a = k.slice(0, i);
      const b = k.slice(i + 2);
      if (isConfoundVisualNodeId(a) || isConfoundVisualNodeId(b)) keySet.delete(k);
      if (/试探混淆/.test(a) || /试探混淆/.test(b)) keySet.delete(k);
    }
  }

  function normalizeRouteLabelKey(label) {
    return String(label || '')
      .replace(/\s*·\s*优先\d+(?:\s*·\s*[\d.]+)?$/u, '')
      .replace(/\s*·\s*陷阱(?:\s*·\s*[\d.]+)?$/u, '')
      .replace(/\s*·\s*旁路(?:\s*·\s*[\d.]+)?$/u, '')
      .replace(/\s+/g, '')
      .trim();
  }

  function preferSpineNodeScore(id) {
    const s = String(id || '');
    if (/^Adjust/i.test(s)) return 55;
    if (/Route|Strat(?!egySelect)/i.test(s)) return 50;
    if (/^(Fire|Launch|Tune)/i.test(s)) return 45;
    if (/^Observe/i.test(s)) return 35;
    if (/^Check/i.test(s)) return 30;
    if (/^(Win|Continue|Victory)/i.test(s)) return 25;
    if (/^(Retry|Fail|Invalid|ModeOff|Trap)/i.test(s)) return -5;
    return 8;
  }

  function findStrategySelectOutEdge(route, edges) {
    const selectEdges = edges.filter(e => /StrategySelect/i.test(e.from) && e.label);
    if (!selectEdges.length) return null;
    const want = normalizeRouteLabelKey(route && route.label);
    if (want) {
      let hit = selectEdges.find(e => normalizeRouteLabelKey(e.label) === want);
      if (hit) return hit;
      hit = selectEdges.find(e => {
        const k = normalizeRouteLabelKey(e.label);
        return k && want && (k.includes(want) || want.includes(k));
      });
      if (hit) return hit;
    }
    if (/trap|盲调|多参|多滑/i.test(String((route && route.id) || '') + String((route && route.label) || ''))) {
      return selectEdges.find(e => /盲调|多参|trap|多滑/i.test(e.label || '')) || null;
    }
    const idm = String((route && route.id) || '').match(/^main[_-](.+)$/i);
    if (idm) {
      const frag = idm[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (frag) {
        const fragShort = frag.replace(/^s/, '');
        for (const e of selectEdges) {
          const q = [e.to];
          const seen = new Set(q);
          while (q.length) {
            const cur = q.shift();
            const curNorm = String(cur).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (preferSpineNodeScore(cur) >= 45 && curNorm.includes(fragShort)) return e;
            if (/^Adjust/i.test(cur) && curNorm.includes(fragShort.slice(0, Math.min(4, fragShort.length)))) {
              return e;
            }
            for (const nx of edges) {
              if (nx.from !== cur || seen.has(nx.to)) continue;
              if (preferSpineNodeScore(nx.to) < 0) continue;
              seen.add(nx.to);
              q.push(nx.to);
            }
          }
        }
      }
    }
    return null;
  }

  function greedySpineFromEntry(entry, edges, forbidden, maxDepth) {
    const nodes = [entry];
    const pairs = [];
    let cur = entry;
    const depth = maxDepth == null ? 14 : maxDepth;
    for (let d = 0; d < depth; d++) {
      const outs = edges.filter(e => e.from === cur && !forbidden.has(e.to));
      if (!outs.length) break;
      // From Observe/Check: prefer Win/success, never dive into Adjust* (feedback loops)
      const ranked = outs
        .map(e => {
          let score = preferSpineNodeScore(e.to);
          if (/^(Observe|Check)/i.test(cur)) {
            if (/^(Win|Victory|Success|Continue)/i.test(e.to)) score = 80;
            else if (/^Adjust/i.test(e.to) || /^Retry/i.test(e.to)) score = -1;
          }
          return { e: e, score: score };
        })
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score);
      if (!ranked.length) break;
      const best = ranked[0].e;
      pairs.push([best.from, best.to]);
      nodes.push(best.to);
      cur = best.to;
      if (/^(Win|Victory|Success)/i.test(cur)) break;
      if (/^(Observe|Check)/i.test(cur)) {
        // one more hop to Win if present, then stop
        const winEdge = edges.find(e =>
          e.from === cur && !forbidden.has(e.to) && /^(Win|Victory|Success)/i.test(e.to));
        if (winEdge) {
          pairs.push([winEdge.from, winEdge.to]);
          nodes.push(winEdge.to);
        }
        break;
      }
    }
    return { nodes: nodes, pairs: pairs };
  }

  /**
   * Sparse 单变量 routes often only declare Start/StrategySelect/Win.
   * Seed spine from StrategySelect -->|label| entry so expand can light Adjust/Fire/Observe.
   */
  function seedSingleVarRouteSpine(route, mermaidBody, edges, startId) {
    const empty = { entry: null, nodes: [], edgePairs: [], keys: [] };
    if (!route || routeIsMisconceptionRoute(route, mermaidBody)) return empty;
    const selectEdge = findStrategySelectOutEdge(route, edges);
    if (!selectEdge) return empty;
    const entry = selectEdge.to;
    const siblings = edges
      .filter(e => /StrategySelect/i.test(e.from))
      .map(e => e.to)
      .filter(id => id && id !== entry);
    const forbidden = new Set(siblings);
    let prefixKeys = startId
      ? shortestPathEdgeKeysAvoiding(startId, entry, edges, forbidden)
      : [];
    if ((!prefixKeys || !prefixKeys.length) && startId && startId !== entry) {
      prefixKeys = shortestPathEdgeKeys(startId, entry, edges);
      if (!prefixKeys.length) return empty;
    }
    const walk = greedySpineFromEntry(entry, edges, forbidden);
    const nodes = new Set();
    const edgePairs = [];
    const keys = new Set();
    const ingestKeys = function (pathKeys) {
      (pathKeys || []).forEach(k => {
        keys.add(k);
        const j = k.indexOf('->');
        if (j < 0) return;
        const a = k.slice(0, j);
        const b = k.slice(j + 2);
        nodes.add(a);
        nodes.add(b);
        edgePairs.push([a, b]);
      });
    };
    ingestKeys(prefixKeys);
    nodes.add(entry);
    walk.nodes.forEach(n => nodes.add(n));
    walk.pairs.forEach(p => {
      edgePairs.push(p);
      keys.add(p[0] + '->' + p[1]);
    });
    keys.add(selectEdge.key);
    edgePairs.push([selectEdge.from, selectEdge.to]);
    nodes.add(selectEdge.from);
    return { entry: entry, nodes: [...nodes], edgePairs: edgePairs, keys: [...keys] };
  }

  function pruneHighlightToSelectEntry(highlightNodes, entry, edges) {
    if (!entry) return highlightNodes || [];
    const siblings = new Set(
      edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to).filter(id => id && id !== entry),
    );
    if (!siblings.size) return highlightNodes || [];
    return (highlightNodes || []).filter(id => !siblings.has(id));
  }

function expandRouteHighlight(route, mermaidBody, opts) {
    const edges = parseStrategyMermaidEdges(mermaidBody);
    const startId = findStartNode(mermaidBody, edges);
    const spineSeed = seedSingleVarRouteSpine(route, mermaidBody, edges, startId);
    const sparse = !(Array.isArray(route.highlightEdges) && route.highlightEdges.length > 0)
      || (route.highlightNodes || []).length < 6;
    let effectiveNodes = [...(route.highlightNodes || [])];
    if (spineSeed.entry && sparse) {
      effectiveNodes = [...new Set([...effectiveNodes, ...spineSeed.nodes])];
      effectiveNodes = pruneHighlightToSelectEntry(effectiveNodes, spineSeed.entry, edges);
    } else if (spineSeed.entry) {
      // Even with explicit spine, drop sibling StrategySelect targets to avoid bleed.
      effectiveNodes = pruneHighlightToSelectEntry(effectiveNodes, spineSeed.entry, edges);
    }
    if (spineSeed.entry && spineSeed.nodes && spineSeed.nodes.length) {
      const keep = new Set(spineSeed.nodes);
      effectiveNodes = effectiveNodes.filter(id => {
        // Drop other-route Adjust*/Route* not on this spine
        if (/^Adjust/i.test(id) && !/^Adjust$/i.test(id)) return keep.has(id);
        if (/Route/i.test(id) && !/StrategySelect/i.test(id)) return keep.has(id) || id === spineSeed.entry;
        return true;
      });
    }
    const siblingEntries = spineSeed.entry
      ? new Set(
        edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to).filter(id => id && id !== spineSeed.entry),
      )
      : new Set();
    const rawEdges = (Array.isArray(route.highlightEdges) && route.highlightEdges.length > 0)
      ? route.highlightEdges
      : (spineSeed.edgePairs.length ? spineSeed.edgePairs : (route.highlightEdges || []));
    const filteredEdges = siblingEntries.size
      ? rawEdges.filter(pair => {
        if (!Array.isArray(pair) || pair.length < 2) return false;
        return !siblingEntries.has(pair[0]) && !siblingEntries.has(pair[1]);
      })
      : rawEdges;
    const syntheticRoute = {
      ...route,
      highlightNodes: effectiveNodes,
      highlightEdges: filteredEdges,
    };
    const hlOrig = new Set(syntheticRoute.highlightNodes || []);
    const nodeSet = new Set(syntheticRoute.highlightNodes || []);
    // 1 seedSpine — highlightNodes + highlightEdges (+ restricted pairwise in buildRouteHighlightEdgeKeys)
    const keySet = buildRouteHighlightEdgeKeys(syntheticRoute, mermaidBody);
    if (spineSeed.keys && spineSeed.keys.length && sparse) {
      spineSeed.keys.forEach(k => keySet.add(k));
      spineSeed.nodes.forEach(n => nodeSet.add(n));
    }
    const hasExplicitSpine = Array.isArray(syntheticRoute.highlightEdges) && syntheticRoute.highlightEdges.length > 0;
    const forbidden = collectPathForbidden(edges, nodeSet, mermaidBody, hlOrig);
    const pathFn = (from, to) =>
      (forbidden.size
        ? shortestPathEdgeKeysAvoiding(from, to, edges, forbidden)
        : shortestPathEdgeKeys(from, to, edges));

    if (!hasExplicitSpine) {
      const entries = routeEntryNodes(syntheticRoute.highlightNodes, edges);
      for (const entry of entries) {
        const pathKeys = pathFn(startId, entry);
        if (!pathRespectsHlOrig(pathKeys, hlOrig)) continue;
        pathKeys.forEach(k => keySet.add(k));
        pathKeys.forEach(k => {
          const j = k.indexOf('->');
          if (j >= 0) {
            nodeSet.add(k.slice(0, j));
            nodeSet.add(k.slice(j + 2));
          }
        });
      }
    }
    // 2 resolvePhantomEdges — expand highlightEdges shortcuts not in Mermaid
    resolvePhantomHighlightEdges(keySet, nodeSet, edges, pathFn);
    addEdgeKeyEndpoints(nodeSet, keySet);
    appendRouteObserveAdjustFireLoop(nodeSet, keySet, edges, mermaidBody, syntheticRoute);
    // 3 appendSuccessOutcomes / 4 appendFailureAndRetryLoop
    appendRouteSuccessOutcomes(nodeSet, keySet, edges, mermaidBody, syntheticRoute, opts || {});
    appendFailureAndRetryLoop(nodeSet, keySet, edges, mermaidBody, syntheticRoute);
    stripMisconceptionSuccessHighlights(nodeSet, keySet, mermaidBody, syntheticRoute);
    stripConfoundBleedFromRoute(nodeSet, keySet, syntheticRoute);
    // Final pass: drop other-route Adjust*/Route* that feedback loops may reintroduce
    if (spineSeed.entry && spineSeed.nodes && spineSeed.nodes.length) {
      const keep = new Set(spineSeed.nodes);
      // Keep Adjust* that are direct feedback from an already-highlighted Observe*
      edges.forEach(e => {
        if (nodeSet.has(e.from) && /^Observe/i.test(e.from) && /^Adjust/i.test(e.to)) {
          keep.add(e.to);
          nodeSet.add(e.to);
          keySet.add(e.key);
        }
      });
      for (const id of [...nodeSet]) {
        if (/^Adjust/i.test(id) && !/^Adjust$/i.test(id) && !keep.has(id)) nodeSet.delete(id);
        if (/Route/i.test(id) && !/StrategySelect/i.test(id) && id !== spineSeed.entry && !keep.has(id)) {
          nodeSet.delete(id);
        }
      }
      for (const k of [...keySet]) {
        const j = k.indexOf('->');
        if (j < 0) continue;
        const a = k.slice(0, j);
        const b = k.slice(j + 2);
        if (!nodeSet.has(a) || !nodeSet.has(b)) keySet.delete(k);
      }
    }
    return { highlightNodes: [...nodeSet], edgeKeys: keySet };
  }

  function buildRouteHighlightEdgeKeys(route, mermaidBody) {
    const keys = new Set();
    const nodes = new Set(route.highlightNodes || []);
    const hlOrig = new Set(route.highlightNodes || []);
    const edges = parseStrategyMermaidEdges(mermaidBody);
    const hasExplicitSpine = Array.isArray(route.highlightEdges) && route.highlightEdges.length > 0;

    (route.highlightEdges || []).forEach(pair => {
      if (Array.isArray(pair) && pair.length >= 2) addEdgeKey(keys, pair[0], pair[1]);
    });

    if (!hasExplicitSpine) {
      edges.forEach(e => {
        if (!isConfoundProbeRouteLike(route) && (/试探混淆/.test(e.label || '') || isConfoundVisualNodeId(e.to))) {
          return;
        }
        if (nodes.has(e.from) && nodes.has(e.to)) keys.add(e.key);
        else if (e.dotted && nodes.has(e.from)) keys.add(e.key);
      });
      const forbidden = collectPathForbidden(edges, nodes, mermaidBody, hlOrig);
      const pathFn = (from, to) =>
        (forbidden.size
          ? shortestPathEdgeKeysAvoiding(from, to, edges, forbidden)
          : shortestPathEdgeKeys(from, to, edges));
      const hl = route.highlightNodes || [];
      addRestrictedPairwiseKeys(keys, hl, hlOrig, pathFn, mermaidBody, false);
    } else {
      const forbidden = collectPathForbidden(edges, nodes, mermaidBody, hlOrig);
      const pathFn = (from, to) =>
        (forbidden.size
          ? shortestPathEdgeKeysAvoiding(from, to, edges, forbidden)
          : shortestPathEdgeKeys(from, to, edges));
      const hl = route.highlightNodes || [];
      addRestrictedPairwiseKeys(keys, hl, hlOrig, pathFn, mermaidBody, true);
    }
    return keys;
  }

  /** Parse Mermaid flowchart edge / edge-label SVG id �?"From->To" (supports diagram-prefixed ids). */
  function edgeKeyFromMermaidSvgId(id) {
    if (!id) return null;
    let m = id.match(/edge-label-([^-]+)-([^-]+)/i);
    if (m) return `${m[1]}->${m[2]}`;
    m = id.match(/edgeLabel-L_([^_]+)_([^_]+)/i);
    if (m) return `${m[1]}->${m[2]}`;
    m = id.match(/edgeLabel-([^-]+)-([^-]+)/i);
    if (m) return `${m[1]}->${m[2]}`;
    m = id.match(/(?:^|[-])L_([^_]+)_([^_]+)_/);
    if (m) return `${m[1]}->${m[2]}`;
    m = id.match(/(?:^|[-])L-([^-]+)-([^-]+)(?:-|$)/i);
    return m ? `${m[1]}->${m[2]}` : null;
  }

  function edgeKeyFromMermaidClassName(className) {
    if (!className) return null;
    const cls = String(className);
    const from = cls.match(/(?:^|\s)LS-([A-Za-z][A-Za-z0-9_]*)\b/);
    const to = cls.match(/(?:^|\s)LE-([A-Za-z][A-Za-z0-9_]*)\b/);
    if (from && to) return `${from[1]}->${to[1]}`;
    return null;
  }

  function suggestHighlightEdges(route, mermaidBody) {
    const keys = buildRouteHighlightEdgeKeys(
      { highlightNodes: route.highlightNodes || [], highlightEdges: [] },
      mermaidBody
    );
    return Array.from(keys).map(k => {
      const i = k.indexOf('->');
      return [k.slice(0, i), k.slice(i + 2)];
    });
  }

  function edgeExistsInMermaid(mermaidBody, from, to) {
    return parseStrategyMermaidEdges(mermaidBody).some(e => e.from === from && e.to === to);
  }

  const INVALID_STRAT_CLASS_PLACEMENT =
    /(\]|\}|\))\s+:::strat\w+|\(:::(strat\w+)\s*(-\.->|-->)/i;

  const NODE_WITH_CLASS_ARROW =
    /([A-Za-z][A-Za-z0-9_]*)(\[[^\]]*\]|\{[^}]*\}|\([^)]*\))(:::strat\w+)\s*(-\.->|-->)\s*/g;

  const LABEL_NEEDS_QUOTES = /[()":#;&|]/;

  function escapeMermaidLabelText(text) {
    return String(text).replace(/"/g, '#quot;');
  }

  /** Mermaid 10`[` ~�+ `()` I{�\ Node["~"] */
  function quoteMermaidNodeLabels(segment) {
    return String(segment).replace(
      /([A-Za-z][A-Za-z0-9_]*)(\[)([^\]]*)(\])(:::strat\w+)?/g,
      (match, id, _open, label, _close, stratClass) => {
        if (/^\s*"/.test(label)) return match;
        if (!LABEL_NEEDS_QUOTES.test(label)) return match;
        return `${id}["${escapeMermaidLabelText(label.trim())}"]${stratClass || ''}`;
      },
    ).replace(
      /([A-Za-z][A-Za-z0-9_]*)(\{)([^}]*)(\})(:::strat\w+)?/g,
      (match, id, _open, label, _close, stratClass) => {
        if (/^\s*"/.test(label)) return match;
        if (!LABEL_NEEDS_QUOTES.test(label)) return match;
        return `${id}{"${escapeMermaidLabelText(label.trim())}"}${stratClass || ''}`;
      },
    );
  }

  /** LLM 8� class �4�( L��?class '(���4U� �?*/
  function sanitizeStrategyMermaidLine(line) {
    let s = normalizeDashLabelEdges(String(line).trim());
    if (!s || /^(graph|flowchart)\s/i.test(s) || /^classDef\s/i.test(s) || /^class\s/i.test(s)) {
      return s;
    }
    s = s.replace(/(\]|\}|\))\s+:::(strat\w+)/g, '$1:::$2');
    s = s.replace(
      NODE_WITH_CLASS_ARROW,
      (_, id, shape, stratClass, arrow) => `${id}${shape}${stratClass}\n  ${id} ${arrow} `,
    );
    s = quoteMermaidNodeLabels(s);
    return s;
  }

  function normalizeStrategyNodeClasses(body) {
    return String(body || '')
      .replace(/:::stratEnd\b/g, ':::stratResult')
      .replace(/:::stratOp\b/g, ':::stratCore');
  }

  function stratNodeLayer(body, nodeId) {
    const lines = String(body || '').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!new RegExp(`\\b${nodeId}\\b`).test(line)) continue;
      if (/:::stratStart\b/i.test(line)) return 0;
      if (/:::stratCond\b/i.test(line)) return 1;
      if (/:::stratCore\b/i.test(line)) return 2;
      if (/:::stratResult\b/i.test(line)) return 4;
      if (/:::stratInvalid|:::stratRetry\b/i.test(line)) return 5;
    }
    return 3;
  }

  /** Stable topological edge order for consistent Dagre layout. */
  function sortStrategyMermaidEdges(body) {
    const normalized = normalizeStrategyNodeClasses(String(body || '').replace(/\r\n/g, '\n'));
    const lines = normalized.split('\n');
    const headerLine = lines.find(l => /^(graph|flowchart)\s/i.test(l.trim()))?.trim() || 'graph TD';
    const classDefLines = lines.filter(l => /^classDef\s/i.test(l.trim()));
    const classLines = lines.filter(l => /^class\s/i.test(l.trim()) && !/^classDef\s/i.test(l.trim()));

    const edgeEntries = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t || /^(graph|flowchart)\s/i.test(t) || /^classDef\s/i.test(t) || /^class\s/i.test(t)) continue;
      const edges = parseStrategyMermaidEdges(t);
      if (edges.length) {
        const e = edges[0];
        edgeEntries.push({
          line,
          from: e.from,
          to: e.to,
          fromLayer: stratNodeLayer(normalized, e.from),
          toLayer: stratNodeLayer(normalized, e.to),
        });
      } else {
        edgeEntries.push({ line, from: '', to: '', fromLayer: 3, toLayer: 3 });
      }
    }

    edgeEntries.sort((a, b) => {
      const la = Math.min(a.fromLayer, a.toLayer);
      const lb = Math.min(b.fromLayer, b.toLayer);
      if (la !== lb) return la - lb;
      const fa = a.from || '';
      const fb = b.from || '';
      if (fa !== fb) return fa.localeCompare(fb);
      return (a.to || '').localeCompare(b.to || '');
    });

    return [headerLine, ...edgeEntries.map(e => e.line), ...classDefLines, ...classLines].join('\n');
  }

  function sanitizeStrategyMermaid(body) {
    const sanitized = normalizeStrategyNodeClasses(String(body || ''))
      .replace(/\r\n/g, '\n')
      .split('\n')
      .flatMap(line => sanitizeStrategyMermaidLine(line).split('\n'))
      .join('\n');
    return sortStrategyMermaidEdges(sanitized);
  }

  function hasUnquotedSpecialMermaidLabels(body) {
    const text = String(body || '');
    const bracketRe = /\[([^\]]+)\]/g;
    let m;
    while ((m = bracketRe.exec(text)) !== null) {
      const inner = m[1];
      if (/^\s*"/.test(inner)) continue;
      if (LABEL_NEEDS_QUOTES.test(inner)) return true;
    }
    const braceRe = /\{([^}]+)\}/g;
    while ((m = braceRe.exec(text)) !== null) {
      const inner = m[1];
      if (/^\s*"/.test(inner)) continue;
      if (LABEL_NEEDS_QUOTES.test(inner)) return true;
    }
    return false;
  }

  function hasInvalidStrategyMermaidSyntax(body) {
    const text = String(body || '');
    return INVALID_STRAT_CLASS_PLACEMENT.test(text) || hasUnquotedSpecialMermaidLabels(text);
  }

  const ROUTE_HUB_SKIP = new Set([
    'Start', 'StrategySelect', 'Env', 'ModeOff', 'ModeOn', 'Ideal', 'OffMode', 'NoDrag',
  ]);

  function isRouteBranchTarget(id) {
    const s = String(id || '');
    return /^(Observe|CheckGoal|Adjust|Fire|Tune|Launch|Retry|Win)/i.test(s)
      || /(?:Observe|CheckGoal|Adjust|Fire|Tune|Launch)\d+$/i.test(s);
  }

  function routeNodeBase(id) {
    const m = String(id || '').match(/^([A-Za-z]+?)(\d+)?$/);
    return m ? m[1] : null;
  }

  /** Hub node fans out to numbered parallel copies (CheckGoal2/Observe3) or Fire�?+ branch targets. */
  function detectMacroRouteFanOut(mermaidBody) {
    const edges = parseStrategyMermaidEdges(mermaidBody);
    const outMap = new Map();
    for (const e of edges) {
      if (!outMap.has(e.from)) outMap.set(e.from, new Set());
      outMap.get(e.from).add(e.to);
    }
    for (const [from, targets] of outMap) {
      if (ROUTE_HUB_SKIP.has(from)) continue;

      const numberedGroups = new Map();
      for (const t of targets) {
        const base = routeNodeBase(t);
        if (!base || !/^(Observe|CheckGoal|Adjust|Fire|Tune|Launch)$/i.test(base)) continue;
        if (!numberedGroups.has(base)) numberedGroups.set(base, new Set());
        numberedGroups.get(base).add(t);
      }
      for (const [, ids] of numberedGroups) {
        if (ids.size >= 2) return true;
      }

      if (/^(Fire|Launch|Tune)$/i.test(from)) {
        const branchTargets = [...targets].filter(isRouteBranchTarget);
        if (branchTargets.length >= 3) return true;
      }
    }
    return false;
  }

  const api = {
    ARROW_SOLID,
    MERMAID_EDGE_SPLIT,
    normalizeDashLabelEdges,
    normalizeStrategyNodeClasses,
    sanitizeStrategyMermaid,
    sanitizeStrategyMermaidLine,
    sortStrategyMermaidEdges,
    quoteMermaidNodeLabels,
    hasUnquotedSpecialMermaidLabels,
    hasInvalidStrategyMermaidSyntax,
    parseStrategyMermaidEdges,
    buildRouteHighlightEdgeKeys,
    expandRouteHighlight,
    extractStratResultNodeIds,
    extractStratCondNodeIds,
    extractStratRetryNodeIds,
    extractStrategyNodeLabels,
    isAdjustLikeNodeId,
    appendRouteSuccessOutcomes,
    appendRouteFailureOutcomes,
    appendRouteRetryReturnEdges,
    appendRouteObserveAdjustFireLoop,
    extractRetestNodeIds,
    routeNodeBase,
    branchSuffixesMatch,
    routeShouldAppendSuccessOutcomes,
    routeShouldAppendFailureOutcomes,
    routeIsMisconceptionRoute,
    sanitizeMisconceptionRouteHighlights,
    stripMisconceptionSuccessHighlights,
    extractStratInvalidNodeIds,
    isSuccessBranchEdge,
    isFailureRetryEdge,
    observeRetrySameBranch,
    failureGateRetrySameBranch,
    isFailureGateNode,
    pathRespectsHlOrig,
    findStartNode,
    shortestPathNodes,
    shortestPathEdgeKeys,
    edgeKeyFromMermaidSvgId,
    edgeKeyFromMermaidClassName,
    suggestHighlightEdges,
    edgeExistsInMermaid,
    detectMacroRouteFanOut,
    seedSingleVarRouteSpine,
    findStrategySelectOutEdge,
    normalizeRouteLabelKey,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof root !== 'undefined') {
    root.StrategyMermaidParse = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {});
