/** One-off inspect mermaid SVG ids for strategy highlight debugging */
const fs = require('fs');
const path = require('path');
const mermaid = require('mermaid');
const {
  buildRouteHighlightEdgeKeys,
  edgeKeyFromMermaidSvgId,
  edgeKeyFromMermaidClassName,
  parseStrategyMermaidEdges,
} = require('../../packages/shared/strategy-mermaid-parse.js');

async function main() {
  const ch = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/coupled-mode-aligned-chapter.json'), 'utf8'));
  const body = ch.strategy.mermaid;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', flowchart: { htmlLabels: true } });
  const { svg } = await mermaid.render('test', body);

  const nodeIds = [...new Set([...svg.matchAll(/id="flowchart-([^"-]+)-/g)].map(m => m[1]))];
  console.log('nodes', nodeIds.length, nodeIds.slice(0, 12).join(', '));

  const edgePathMatches = [...svg.matchAll(/<g class="edgePath[^"]*"[^>]*>/g)];
  console.log('edgePath group tags', edgePathMatches.length);

  const lsLe = [...svg.matchAll(/class="([^"]*edgePath[^"]*)"/g)].slice(0, 8);
  lsLe.forEach(m => {
    const cls = m[1];
    const key = edgeKeyFromMermaidClassName(cls);
    console.log('class', cls.slice(0, 80), '->', key);
  });

  const idSamples = [...svg.matchAll(/\bid="([^"]+)"/g)]
    .map(m => m[1])
    .filter(id => /L-|L_|edge/i.test(id))
    .slice(0, 15);
  idSamples.forEach(id => console.log('id', id, '->', edgeKeyFromMermaidSvgId(id)));

  for (const route of ch.strategy.routes.slice(0, 3)) {
    const keys = buildRouteHighlightEdgeKeys(route, body);
    console.log('\nroute', route.id, 'nodes', route.highlightNodes.length, 'explicit edges', route.highlightEdges.length);
    console.log('  keys', [...keys].join(', '));
  }

  const parsed = parseStrategyMermaidEdges(body);
  const route = ch.strategy.routes[0];
  const nodes = new Set(route.highlightNodes);
  const inferred = parsed.filter(e => nodes.has(e.from) && nodes.has(e.to)).map(e => e.key);
  console.log('\nmain inferred if merged:', inferred.join(', '));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
