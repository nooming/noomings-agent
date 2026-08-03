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

  // Post-merge dual mode: both Explore + Challenge stay lit (not only one side)
  const DUAL_MODE_MERMAID = [
    'graph TD',
    'Start --> ModeSelect{选择模式?}',
    'ModeSelect -->|探究| ExploreMode[探究模式：自由调参]',
    'ModeSelect -->|竞赛| ChallengeMode[竞赛模式：限次]',
    'ExploreMode --> StrategySelect{选择?}',
    'ChallengeMode --> StrategySelect',
    'StrategySelect -->|单变量·电流| Route_main',
    'StrategySelect -->|多参盲调| Trap',
    'Route_main --> Adjust --> Fire --> Observe',
    'Trap --> Fire',
    'Observe -->|达标| Win',
  ].join('\n');
  const singleVar = {
    id: 'main',
    label: '单变量·电流',
    highlightNodes: ['Start', 'ModeSelect', 'ExploreMode', 'StrategySelect', 'Route_main', 'Adjust', 'Fire', 'Observe', 'Win'],
    highlightEdges: [
      ['Start', 'ModeSelect'],
      ['ModeSelect', 'ExploreMode'],
      ['ExploreMode', 'StrategySelect'],
      ['StrategySelect', 'Route_main'],
      ['Route_main', 'Adjust'],
      ['Adjust', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Win'],
    ],
  };
  const dualExp = expandRouteHighlight(singleVar, DUAL_MODE_MERMAID, {});
  assert(dualExp.highlightNodes.includes('ExploreMode'), 'dual keeps ExploreMode');
  assert(dualExp.highlightNodes.includes('ChallengeMode'), 'dual keeps ChallengeMode sibling');
  assert(dualExp.edgeKeys.has('ModeSelect->ExploreMode'), 'dual ModeSelect→ExploreMode');
  assert(dualExp.edgeKeys.has('ModeSelect->ChallengeMode'), 'dual ModeSelect→ChallengeMode');
  assert(!dualExp.highlightNodes.includes('Trap'), 'dual does not light Trap sibling');

  const envOnly = {
    id: 'env_explore',
    label: '探究模式',
    kind: 'env',
    highlightNodes: ['Start', 'ModeSelect', 'ExploreMode'],
    highlightEdges: [['Start', 'ModeSelect'], ['ModeSelect', 'ExploreMode']],
  };
  const envExp = expandRouteHighlight(envOnly, DUAL_MODE_MERMAID, {});
  assert(envExp.highlightNodes.includes('ExploreMode'), 'env-only keeps ExploreMode');
  assert(!envExp.highlightNodes.includes('ChallengeMode'), 'env-only does not force ChallengeMode');

  console.log('strategy-sparse-highlight-seed-check: ok');
}

module.exports = { run };
