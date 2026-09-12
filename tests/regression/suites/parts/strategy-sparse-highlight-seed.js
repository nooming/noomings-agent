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

  // ProbeCV sparse: ModeSelect + StrategySelect lit, but Explore/Challenge omitted
  // (maxwell / gas / adiabatic confoundProbe gap — hub must not be an island)
  const PROBE_MERMAID = [
    'graph TD',
    'Start --> ModeSelect{选择模式?}',
    'ModeSelect -->|探究| Explore[探究对照 v_p 随 T·m]',
    'ModeSelect -->|竞赛| Challenge[限次打特征区间]',
    'Explore --> StrategySelect',
    'Challenge --> StrategySelect{选择调参策略?}',
    'StrategySelect -.->|试探·容器容积| ProbeCV',
    'StrategySelect -->|单变量·温度| TStrat',
    'ProbeCV --> ObserveCV{有无增益?}',
    'ObserveCV -->|无增益| BackFromCV[回到主策略]',
    'BackFromCV --> StrategySelect',
    'TStrat --> Tune --> Fire --> Observe',
  ].join('\n');
  const probeSparse = {
    id: 'confound_s_vol',
    label: '试探·容器容积',
    kind: 'confoundProbe',
    highlightNodes: ['Start', 'ModeSelect', 'StrategySelect', 'ProbeCV', 'ObserveCV', 'BackFromCV'],
    highlightEdges: [
      ['Start', 'ModeSelect'],
      ['StrategySelect', 'ProbeCV'],
      ['ProbeCV', 'ObserveCV'],
      ['ObserveCV', 'BackFromCV'],
      ['BackFromCV', 'StrategySelect'],
    ],
  };
  const probeExp = expandRouteHighlight(probeSparse, PROBE_MERMAID, {});
  assert(probeExp.highlightNodes.includes('Explore'), 'probe sparse lights Explore');
  assert(probeExp.highlightNodes.includes('Challenge'), 'probe sparse lights Challenge');
  assert(probeExp.edgeKeys.has('Start->ModeSelect'), 'probe sparse Start→ModeSelect');
  assert(probeExp.edgeKeys.has('ModeSelect->Explore'), 'probe sparse ModeSelect→Explore');
  assert(probeExp.edgeKeys.has('ModeSelect->Challenge'), 'probe sparse ModeSelect→Challenge');
  assert(probeExp.edgeKeys.has('Explore->StrategySelect'), 'probe sparse Explore→StrategySelect');
  assert(probeExp.edgeKeys.has('Challenge->StrategySelect'), 'probe sparse Challenge→StrategySelect');
  assert(!probeExp.highlightNodes.includes('TStrat'), 'probe sparse no TStrat bleed');

  // Bare Mode{模式?} hub (nezha / projectile) also dual-lights both fans
  const MODE_HUB_MERMAID = [
    'graph TD',
    'Start --> Mode{模式?}',
    'Mode -->|探究| Explore',
    'Mode -->|竞赛| Challenge',
    'Explore --> StrategySelect',
    'Challenge --> StrategySelect{选择调参策略?}',
    'StrategySelect -.->|试探·摩擦| ProbeCV',
    'ProbeCV --> ObserveCV --> BackFromCV --> StrategySelect',
  ].join('\n');
  const modeHubProbe = {
    id: 'confound_CV1',
    label: '试探·甲板摩擦系数',
    kind: 'confoundProbe',
    highlightNodes: ['Start', 'Mode', 'StrategySelect', 'ProbeCV', 'ObserveCV', 'BackFromCV'],
    highlightEdges: [
      ['Start', 'Mode'],
      ['StrategySelect', 'ProbeCV'],
      ['ProbeCV', 'ObserveCV'],
      ['ObserveCV', 'BackFromCV'],
      ['BackFromCV', 'StrategySelect'],
    ],
  };
  const modeHubExp = expandRouteHighlight(modeHubProbe, MODE_HUB_MERMAID, {});
  assert(modeHubExp.highlightNodes.includes('Explore'), 'Mode hub lights Explore');
  assert(modeHubExp.highlightNodes.includes('Challenge'), 'Mode hub lights Challenge');
  assert(modeHubExp.edgeKeys.has('Mode->Explore'), 'Mode→Explore');
  assert(modeHubExp.edgeKeys.has('Mode->Challenge'), 'Mode→Challenge');

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

  // Route labels with parenthetical notes must still match StrategySelect |edge| text
  // (regression: 「滑轮质量（改 I）」 vs 「滑轮质量·改I」 previously fell through to BFS
  // that walked Observe→StrategySelect and wrongly hit M1Strat).
  const PAREN_MERMAID = `
graph TD
Start --> ModeSelect
ModeSelect --> StrategySelect{选择?}
StrategySelect -->|单变量·左侧质量| M1Strat
StrategySelect -->|单变量·滑轮质量·改I| PulleyMStrat
StrategySelect -->|单变量·滑轮形状·盘环| ShapeStrat
StrategySelect -->|多参盲调| Trap
M1Strat --> Tune
PulleyMStrat --> Tune
ShapeStrat --> Tune
Trap --> Tune
Tune --> Fire
Fire --> Observe
Observe -->|未达标| StrategySelect
Observe -->|达标| Win
`;
  const pulleyRoute = {
    id: 'main_s-pulley-m',
    label: '单变量·滑轮质量（改 I）',
    highlightNodes: ['Start', 'ModeSelect', 'StrategySelect', 'PulleyMStrat', 'Tune', 'Fire', 'Observe', 'Win'],
    highlightEdges: [
      ['StrategySelect', 'PulleyMStrat'],
      ['PulleyMStrat', 'Tune'],
      ['Tune', 'Fire'],
      ['Fire', 'Observe'],
    ],
  };
  const pulleyExp = expandRouteHighlight(pulleyRoute, PAREN_MERMAID, {});
  assert(pulleyExp.highlightNodes.includes('PulleyMStrat'), 'paren label keeps PulleyMStrat');
  assert(!pulleyExp.highlightNodes.includes('M1Strat'), 'paren label does not bleed to M1Strat');
  assert(pulleyExp.edgeKeys.has('StrategySelect->PulleyMStrat'), 'paren label select edge');

  const shapeRoute = {
    id: 'main_s-shape',
    label: '单变量·滑轮形状（盘/环改 I）',
    highlightNodes: ['Start', 'StrategySelect', 'ShapeStrat', 'Tune', 'Fire', 'Observe', 'Win'],
    highlightEdges: [['StrategySelect', 'ShapeStrat'], ['ShapeStrat', 'Tune'], ['Tune', 'Fire']],
  };
  const shapeExp = expandRouteHighlight(shapeRoute, PAREN_MERMAID, {});
  assert(shapeExp.highlightNodes.includes('ShapeStrat'), 'shape paren keeps ShapeStrat');
  assert(!shapeExp.highlightNodes.includes('M1Strat'), 'shape paren no M1Strat bleed');

  console.log('strategy-sparse-highlight-seed-check: ok');
}

module.exports = { run };
