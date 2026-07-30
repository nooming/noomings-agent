/**
 * Simulate strategy route highlight against real Mermaid 10 SVG output.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { getRuntimeOutputRoot } = require('../../packages/shared/data-paths');
const {
  parseStrategyMermaidEdges,
  buildRouteHighlightEdgeKeys,
  edgeKeyFromMermaidSvgId,
  edgeKeyFromMermaidClassName,
} = require('../../packages/shared/strategy-mermaid-parse.js');

function edgeKeyFromSvgElement(el) {
  let cur = el;
  for (let i = 0; i < 6 && cur; i++) {
    const idKey = edgeKeyFromMermaidSvgId(cur.getAttribute?.('id') || '');
    if (idKey) return idKey;
    const cls = cur.getAttribute?.('class') || '';
    const clsKey = edgeKeyFromMermaidClassName(cls);
    if (clsKey) return clsKey;
    cur = cur.parentElement;
  }
  return null;
}

function getStrategyEdgePathGroups(svg) {
  const edgePaths = svg.querySelector('g.edgePaths');
  if (!edgePaths) return [];
  return Array.from(edgePaths.children);
}

function edgeKeyFromPathGroup(group) {
  if (!group) return null;
  const fromGroup = edgeKeyFromSvgElement(group);
  if (fromGroup) return fromGroup;
  const path = group.querySelector('path');
  return path ? edgeKeyFromSvgElement(path) : null;
}

function mermaidNodeIdFromSvgGroup(gEl) {
  const id = gEl.getAttribute('id') || '';
  const m = id.match(/flowchart-([A-Za-z][A-Za-z0-9_]*)-/i);
  return m ? m[1] : null;
}

function simulateHighlight(svg, route, mermaidBody) {
  const idSet = new Set(route.highlightNodes || []);
  const edgeKeys = buildRouteHighlightEdgeKeys(route, mermaidBody);
  const parsed = parseStrategyMermaidEdges(mermaidBody);

  const nodeReport = [];
  svg.querySelectorAll('g.node').forEach(gEl => {
    const nid = mermaidNodeIdFromSvgGroup(gEl);
    if (nid && idSet.has(nid)) nodeReport.push({ nid, hl: true });
    else if (nid && idSet.has(nid) === false && [...idSet].includes(nid)) nodeReport.push({ nid, hl: true });
  });

  const missingNodes = [...idSet].filter(nid => {
    const found = [...svg.querySelectorAll('g.node')].some(g => mermaidNodeIdFromSvgGroup(g) === nid);
    return !found;
  });

  const pathGroups = getStrategyEdgePathGroups(svg);
  const parsedByIndex = pathGroups.map((group, i) => ({
    key: edgeKeyFromPathGroup(group),
    fallbackKey: parsed[i]?.key || null,
  }));
  const hasResolvedGroupKey = parsedByIndex.some(x => !!x.key);

  const edgeReport = [];
  parsedByIndex.forEach((entry, i) => {
    const key = entry.key || (!hasResolvedGroupKey ? entry.fallbackKey : null);
    const expect = key && edgeKeys.has(key);
    if (key && edgeKeys.has(key) && !entry.key && entry.fallbackKey) {
      edgeReport.push({ i, key, resolved: 'fallback-only', expect });
    } else if (key && edgeKeys.has(key) && !entry.key) {
      edgeReport.push({ i, key, resolved: 'none', expect });
    } else if (edgeKeys.has(key) && entry.key) {
      edgeReport.push({ i, key, resolved: 'svg', expect });
    }
  });

  const expectedKeys = [...edgeKeys];
  const resolvedHlKeys = new Set(
    parsedByIndex
      .map((entry, i) => {
        const key = entry.key || (!hasResolvedGroupKey ? entry.fallbackKey : null);
        return key && edgeKeys.has(key) ? key : null;
      })
      .filter(Boolean),
  );
  const missingEdgeKeys = expectedKeys.filter(k => !resolvedHlKeys.has(k));

  return { missingNodes, missingEdgeKeys, hasResolvedGroupKey, pathGroupCount: pathGroups.length, parsedCount: parsed.length };
}

async function main() {
  const chapterPath = process.argv[2] || path.join(getRuntimeOutputRoot(), '斜抛运动物理挑战-20260529-211332/chapter.json');
  const ch = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const body = ch.strategy.mermaid;

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = dom.window.navigator;

  const mermaidMod = await import('mermaid');
  const mermaid = mermaidMod.default || mermaidMod;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', flowchart: { htmlLabels: true } });
  const { svg: svgStr } = await mermaid.render('test-diagram', body);
  const svgDom = new JSDOM(svgStr);
  const svg = svgDom.window.document.querySelector('svg');

  console.log('chapter:', path.basename(chapterPath));
  console.log('path groups:', getStrategyEdgePathGroups(svg).length);
  console.log('parsed edges:', parseStrategyMermaidEdges(body).length);

  for (const route of ch.strategy.routes) {
    const r = simulateHighlight(svg, route, body);
    console.log('\nroute:', route.id, route.label);
    if (r.missingNodes.length) console.log('  missing nodes in SVG:', r.missingNodes.join(', '));
    if (r.missingEdgeKeys.length) console.log('  edges in keys but NOT highlighted via pathGroups:', r.missingEdgeKeys.join(', '));
    if (!r.missingNodes.length && !r.missingEdgeKeys.length) console.log('  OK');
    else console.log('  hasResolvedGroupKey:', r.hasResolvedGroupKey, 'groups:', r.pathGroupCount, 'parsed:', r.parsedCount);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
