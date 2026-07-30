/**
 * Sparse 单变量 route highlight: Start/Select/Win must expand to full Adjust→Fire→Observe spine.
 */
const { assert } = require('../../../lib/assert');
const {
  expandRouteHighlight,
  seedSingleVarRouteSpine,
  parseStrategyMermaidEdges,
  findStartNode,
} = require('../../../../packages/shared/strategy-mermaid-parse.js');

const MERMAID = `
graph TD
Start --> Env{模式}
Env --> ModeExplore
ModeExplore --> StrategySelect{选择?}
StrategySelect -->|单变量·倾角| AngleRoute
StrategySelect -->|单变量·摩擦| FrictionRoute
StrategySelect -->|多参盲调| TrapRoute
AngleRoute --> AdjustAngle
FrictionRoute --> AdjustFriction
TrapRoute --> AdjustMulti
AdjustAngle --> Fire
AdjustFriction --> Fire
AdjustMulti --> Fire
Fire --> Observe
Observe -->|达标| Win
Observe -->|否| Retry
Retry --> AdjustAngle
`;

function run() {
  const sparse = {
    id: 'main_s-friction',
    label: '单变量·摩擦',
    priorityRank: 2,
    score: 0.85,
    highlightNodes: ['Start', 'StrategySelect', 'Win'],
    highlightEdges: [],
  };
  const edges = parseStrategyMermaidEdges(MERMAID);
  const startId = findStartNode(MERMAID, edges);
  const seed = seedSingleVarRouteSpine(sparse, MERMAID, edges, startId);
  assert(seed.entry === 'FrictionRoute', `entry FrictionRoute got ${seed.entry}`);
  assert(seed.nodes.includes('AdjustFriction'), 'seed AdjustFriction');
  assert(seed.nodes.includes('Fire'), 'seed Fire');
  assert(seed.nodes.includes('Observe'), 'seed Observe');

  const expanded = expandRouteHighlight(sparse, MERMAID, {});
  const nodes = new Set(expanded.highlightNodes);
  for (const id of ['Start', 'StrategySelect', 'FrictionRoute', 'AdjustFriction', 'Fire', 'Observe', 'Win']) {
    assert(nodes.has(id), `expanded has ${id}`);
  }
  assert(!nodes.has('AngleRoute'), 'no AngleRoute sibling bleed');
  assert(!nodes.has('AdjustAngle'), 'no AdjustAngle sibling bleed');
  assert(!nodes.has('TrapRoute'), 'no TrapRoute');
  assert(expanded.edgeKeys.has('StrategySelect->FrictionRoute'), 'select edge');
  assert(expanded.edgeKeys.has('AdjustFriction->Fire'), 'adjust-fire edge');
  assert(expanded.edgeKeys.has('Fire->Observe'), 'fire-observe edge');

  const main = {
    id: 'main',
    label: '单变量·倾角',
    priorityRank: 1,
    score: 1,
    highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'AngleRoute', 'AdjustAngle', 'Fire', 'Observe', 'Win', 'FrictionRoute', 'AdjustFriction'],
    highlightEdges: [
      ['Start', 'Env'],
      ['Env', 'ModeExplore'],
      ['ModeExplore', 'StrategySelect'],
      ['StrategySelect', 'AngleRoute'],
      ['AngleRoute', 'AdjustAngle'],
      ['AdjustAngle', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Win'],
      ['StrategySelect', 'FrictionRoute'],
      ['FrictionRoute', 'AdjustFriction'],
      ['AdjustFriction', 'Fire'],
    ],
  };
  const mainExp = expandRouteHighlight(main, MERMAID, {});
  assert(mainExp.highlightNodes.includes('AngleRoute'), 'main keeps AngleRoute');
  assert(!mainExp.highlightNodes.includes('FrictionRoute'), 'main drops FrictionRoute bleed');
  assert(!mainExp.highlightNodes.includes('AdjustFriction'), 'main drops AdjustFriction bleed');

  console.log('strategy-sparse-highlight-seed-check: ok');
}

module.exports = { run };
