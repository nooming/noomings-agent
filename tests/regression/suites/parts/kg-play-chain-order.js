const { assert } = require('../../../lib/assert');
const { rebuildPlayChain } = require('../../../../packages/contract/repair/scope-repair');
const { kgLinkOrderBefore } = require('../../../../packages/contract/dt-kg-coupling');
const { orderedPlayPathIds } = require('../../../../packages/contract/graph/play-graph');

function run() {
  const nodes = [
    { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入' },
    { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '操作' },
    { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '结果判定' },
    { id: 'Cenv', label: '模式开启', group: 'constraint', layer: 'play', level: 1, r: 22, desc: '环境模式设定' },
    { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '过关' },
  ];
  const wrongLinks = [
    { s: 'P1', t: 'O1', tp: 'premise' },
    { s: 'O1', t: 'C1', tp: 'premise' },
    { s: 'C1', t: 'Cenv', tp: 'premise' },
    { s: 'Cenv', t: 'R1', tp: 'core' },
  ];
  const traceMap = { controls: { modeToggle: { kgId: 'Cenv', role: 'operation' } } };
  const fixed = rebuildPlayChain(nodes, wrongLinks, traceMap);
  const path = orderedPlayPathIds(nodes, fixed);
  const ei = path.indexOf('Cenv');
  const oi = path.indexOf('O1');
  assert(ei >= 0 && oi >= 0 && ei < oi, 'env constraint before operation after rebuild');
  assert(kgLinkOrderBefore(fixed, 'P1', 'Cenv', 'O1'), 'kgLinkOrderBefore env before O1');

  console.log('kg-play-chain-order-check: OK');
}

module.exports = { run };
