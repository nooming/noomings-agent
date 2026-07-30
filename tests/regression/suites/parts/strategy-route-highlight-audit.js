/**
 * Full strategy route highlight audit �?all chapter × route combinations.
 * npm run check:strategy �?suite: strategy-route-highlight-audit
 */
const fs = require('fs');
const path = require('path');
const {
  expandRouteHighlight,
  parseStrategyMermaidEdges,
  extractStratResultNodeIds,
  extractStratRetryNodeIds,
  extractRetestNodeIds,
  branchSuffixesMatch,
  isFailureGateNode,
  failureGateRetrySameBranch,
  isFailureRetryEdge,
  detectMacroRouteFanOut,
  shortestPathEdgeKeys,
  isAdjustLikeNodeId,
  extractStrategyNodeLabels,
} = require('../../../../packages/shared/strategy-mermaid-parse.js');

const ROOT = path.join(__dirname, '../..');
const { loadChapter, loadGenericBundle, loadTrace, listStrategyChapters, fixturesRoot } = require('../../../lib/fixture-loader');
const FIX = fixturesRoot();

const EXPAND_ALLOWLIST = new Set(['Win', 'Start', 'Env', 'ModeOff', 'ModeOn', 'CheckB']);
/** Known non-yangben fixture noise: never-lit-edge ratio warnings on multiFork are expected (macro fan-out isolation). */
const FIXTURE_WARN_SOFTEN = new Set(['multiFork']);

function isExpandAllowedNode(id, mermaidBody) {
  if (EXPAND_ALLOWLIST.has(id)) return true;
  if (/^Continue\d*$/i.test(id)) return true;
  const nodeLabels = extractStrategyNodeLabels(mermaidBody);
  if (isAdjustLikeNodeId(id, nodeLabels)) return true;
  if (/^Retry[A-Za-z]*\d*$/i.test(id)) return true;
  if (extractStratResultNodeIds(mermaidBody).has(id)) return true;
  return false;
}

function macroStrategySiblings(mermaidBody) {
  const edges = parseStrategyMermaidEdges(mermaidBody);
  const siblings = new Map();
  edges.forEach(e => {
    if (!/StrategySelect/i.test(e.from)) return;
    if (!siblings.has(e.from)) siblings.set(e.from, []);
    if (!siblings.get(e.from).includes(e.to)) siblings.get(e.from).push(e.to);
  });
  return siblings;
}

function loadChapters() {
  return listStrategyChapters();
}

function auditRoute(ctx) {
  const { chapterId, source, route, chapter } = ctx;
  const mermaidBody = chapter.strategy.mermaid;
  const edges = parseStrategyMermaidEdges(mermaidBody);
  const edgeKeySet = new Set(edges.map(e => e.key));
  const hlOrig = new Set(route.highlightNodes || []);
  const resultKgIds = new Set(
    (chapter.kg?.nodes || []).filter(n => n.group === 'result' && n.layer === 'play').map(n => n.id),
  );
  const expanded = expandRouteHighlight(route, mermaidBody, { resultKgIds });
  const failures = [];
  const warnings = [];
  const loc = `${source} route=${route.id} (${chapterId})`;

  const resolvedPhantomNodes = new Set();
  const declaredEdgeEndpoints = new Set();
  for (const pair of route.highlightEdges || []) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    declaredEdgeEndpoints.add(pair[0]);
    declaredEdgeEndpoints.add(pair[1]);
    const key = `${pair[0]}->${pair[1]}`;
    if (edgeKeySet.has(key)) continue;
    const path = shortestPathEdgeKeys(pair[0], pair[1], edges);
    path.forEach(k => {
      const j = k.indexOf('->');
      if (j < 0) return;
      resolvedPhantomNodes.add(k.slice(0, j));
      resolvedPhantomNodes.add(k.slice(j + 2));
    });
  }

  for (const key of expanded.edgeKeys) {
    if (!edgeKeySet.has(key)) {
      failures.push({ check: 'no-phantom-edge-keys', loc, detail: `phantom edge key ${key}` });
    }
  }

  for (const nodeId of expanded.highlightNodes) {
    if (hlOrig.has(nodeId)) continue;
    if (isExpandAllowedNode(nodeId, mermaidBody)) continue;
    if (resolvedPhantomNodes.has(nodeId)) continue;
    if (declaredEdgeEndpoints.has(nodeId)) continue;
    failures.push({
      check: 'no-undeclared-nodes',
      loc,
      detail: `expanded node ${nodeId} not in route highlightNodes`,
    });
  }

  const stratSiblings = macroStrategySiblings(mermaidBody);
  for (const [, children] of stratSiblings) {
    if (children.length < 2) continue;
    const declared = children.filter(c => hlOrig.has(c));
    if (declared.length !== 1) continue;
    const keep = declared[0];
    for (const sib of children) {
      if (sib === keep) continue;
      if (expanded.highlightNodes.includes(sib)) {
        failures.push({
          check: 'no-sibling-strategy-bleed',
          loc,
          detail: `sibling macro entry ${sib} highlighted (keep=${keep})`,
        });
      }
      for (const key of expanded.edgeKeys) {
        if (key.includes(sib)) {
          failures.push({
            check: 'no-sibling-strategy-bleed',
            loc,
            detail: `edge ${key} references sibling macro entry ${sib}`,
          });
        }
      }
    }
  }

  if (detectMacroRouteFanOut(mermaidBody)) {
    const basesInHl = new Map();
    for (const id of hlOrig) {
      const m = String(id).match(/^([A-Za-z]+?)(\d*)$/);
      if (!m) continue;
      const base = m[1];
      if (!/^(Observe|CheckGoal|Adjust|Fire|Tune|Launch|Strategy|Strat)/i.test(base)) continue;
      if (!basesInHl.has(base)) basesInHl.set(base, new Set());
      basesInHl.get(base).add(m[2] || '');
    }
    for (const id of expanded.highlightNodes) {
      const m = String(id).match(/^([A-Za-z]+?)(\d*)$/);
      if (!m) continue;
      const base = m[1];
      if (!basesInHl.has(base)) continue;
      const allowed = basesInHl.get(base);
      if (allowed.size >= 1 && !allowed.has(m[2] || '')) {
        failures.push({
          check: 'no-sibling-strategy-bleed',
          loc,
          detail: `numbered sibling ${id} bleed (allowed suffixes: ${[...allowed].join(',')})`,
        });
      }
    }
  }

  const retryIds = extractRetestNodeIds(mermaidBody, edges);
  for (const gateId of hlOrig) {
    if (!isFailureGateNode(gateId, mermaidBody)) continue;
    for (const e of edges) {
      if (e.from !== gateId) continue;
      if (!branchSuffixesMatch(e.from, e.to) && !failureGateRetrySameBranch(e.from, e.to)) continue;
      if (!isFailureRetryEdge(e, retryIds)) continue;
      if (!expanded.edgeKeys.has(e.key)) {
        failures.push({
          check: 'failure-loop-complete',
          loc,
          detail: `missing failure edge ${e.key} for declared gate ${gateId}`,
        });
      }
      const returnEdge = edges.find(re => re.from === e.to && hlOrig.has(re.to));
      if (returnEdge && !expanded.edgeKeys.has(returnEdge.key)) {
        failures.push({
          check: 'failure-loop-complete',
          loc,
          detail: `missing retry return ${returnEdge.key}`,
        });
      }
    }
  }

  const nodeLabels = extractStrategyNodeLabels(mermaidBody);
  const hasObserveOnSpine = [...hlOrig].some(id => /^Observe[A-Za-z]*\d*$/i.test(id));
  const mermaidHasFeedback = edges.some(e =>
    /^Observe[A-Za-z]*\d*$/i.test(e.from)
    && (isAdjustLikeNodeId(e.to, nodeLabels) || /^Continue\d*$/i.test(e.to)),
  );
  if (hasObserveOnSpine && mermaidHasFeedback) {
    const hasObsAdj = [...expanded.edgeKeys].some(k => {
      const i = k.indexOf('->');
      return i > 0 && /^Observe[A-Za-z]*\d*$/i.test(k.slice(0, i))
        && isAdjustLikeNodeId(k.slice(i + 2), nodeLabels);
    });
    const hasAdjFire = [...expanded.edgeKeys].some(k => {
      const i = k.indexOf('->');
      return i > 0 && isAdjustLikeNodeId(k.slice(0, i), nodeLabels)
        && /^(Fire|Launch|Tune|QuickFire)\d*$/i.test(k.slice(i + 2));
    });
    if (!hasObsAdj || !hasAdjFire) {
      warnings.push({
        check: 'route-feedback-loop',
        loc,
        detail: 'Observe on spine but missing Observe→Adjust or Adjust→Fire in expanded highlight',
      });
    }
  }

  const allEdgeKeys = new Set(edges.map(e => e.key));
  let neverLit = 0;
  for (const key of allEdgeKeys) {
    if (!expanded.edgeKeys.has(key)) neverLit += 1;
  }
  if (neverLit > allEdgeKeys.size * 0.5) {
    const soft = FIXTURE_WARN_SOFTEN.has(chapterId);
    warnings.push({
      check: 'route-never-lit-edges',
      loc,
      detail: `${neverLit}/${allEdgeKeys.size} mermaid edges not highlighted for this route`
        + (soft ? ' [known fixture fan-out; not a yangben defect]' : ''),
      soft,
    });
  }

  for (const pair of route.highlightEdges || []) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const key = `${pair[0]}->${pair[1]}`;
    if (edgeKeySet.has(key)) continue;
    const path = shortestPathEdgeKeys(pair[0], pair[1], edges);
    if (!path.length) {
      warnings.push({
        check: 'phantom-spine-unresolved',
        loc,
        detail: `highlightEdges shortcut ${key} has no mermaid path`,
      });
    }
  }

  return { failures, warnings };
}

function run() {
  const chapters = loadChapters();
  if (!chapters.length) {
    console.error('strategy-route-highlight-audit: no chapters found');
    process.exit(1);
  }

  let totalRoutes = 0;
  const allFailures = [];
  const allWarnings = [];

  for (const { id, chapter, source } of chapters) {
    for (const route of chapter.strategy.routes) {
      totalRoutes += 1;
      const { failures, warnings } = auditRoute({ chapterId: id, source, route, chapter });
      allFailures.push(...failures);
      allWarnings.push(...warnings);
    }
  }

  for (const w of allWarnings) {
    console.warn(`WARN [${w.check}] ${w.loc}: ${w.detail}`);
  }

  if (allFailures.length) {
    for (const f of allFailures) {
      console.error(`FAIL [${f.check}] ${f.loc}: ${f.detail}`);
    }
    console.error(`strategy-route-highlight-audit: ${allFailures.length} failure(s) across ${totalRoutes} routes`);
    process.exit(1);
  }

  const warnNote = allWarnings.length ? `, ${allWarnings.length} warning(s)` : '';
  console.log(`strategy-route-highlight-audit: OK (${totalRoutes} routes${warnNote})`);
}

module.exports = { run };
