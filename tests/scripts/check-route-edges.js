const fs = require('fs');
const path = require('path');
const {
  parseStrategyMermaidEdges,
  buildRouteHighlightEdgeKeys,
  edgeKeyFromMermaidSvgId,
  edgeKeyFromMermaidClassName,
} = require('../../packages/shared/strategy-mermaid-parse.js');

function checkChapter(filePath) {
  const ch = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const body = ch.strategy.mermaid;
  const parsed = parseStrategyMermaidEdges(body);
  const parsedKeys = new Set(parsed.map(e => e.key));
  console.log('\n===', path.basename(filePath), '===');
  console.log('parsed edges:', parsed.length);

  for (const route of ch.strategy.routes || []) {
    const keys = buildRouteHighlightEdgeKeys(route, body);
    const missing = (route.highlightEdges || []).filter(([a, b]) => !parsedKeys.has(`${a}->${b}`));
    const notInKeys = (route.highlightEdges || []).filter(([a, b]) => !keys.has(`${a}->${b}`));
    if (missing.length || notInKeys.length) {
      console.log('route', route.id, route.label);
      if (missing.length) console.log('  missing in mermaid parse:', missing.map(p => p.join('->')).join(', '));
      if (notInKeys.length) console.log('  not in highlight keys:', notInKeys.map(p => p.join('->')).join(', '));
    }
  }
}

checkChapter(path.join(__dirname, '../fixtures/coupled-mode-aligned-chapter.json'));
checkChapter(path.join(__dirname, '../../output/斜抛运动物理挑战-20260529-211332/chapter.json'));

// SVG id patterns from mermaid 10 source
const samples = [
  'L-Start-Env-0',
  'flowchart-L-Start-Env-0',
  'edgeLabel-L_Start_Env_0',
  'edge-label-Start-Env',
];
console.log('\n=== svg id parse ===');
samples.forEach(id => console.log(id, '->', edgeKeyFromMermaidSvgId(id)));
console.log('class LS-Start LE-Env ->', edgeKeyFromMermaidClassName('edgePath LS-Start LE-Env flowchart-link'));
