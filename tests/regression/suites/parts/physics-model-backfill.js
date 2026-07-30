const { assert } = require('../../../lib/assert');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { buildOutputVariables } = require('../../../../packages/contract/enrich/inquiry-script-backfill');
const { buildPhysicsModel } = require('../../../../packages/contract/enrich/physics-model');

function miniChapter() {
  return {
    mapping: '| DT | KG |',
    kg: {
      title: '斜抛探究',
      nodes: [
        { id: 'P1', label: 'P1', group: 'premise', layer: 'play', level: 0, r: 22, desc: '设定目标' },
        { id: 'O1', label: 'O1', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节角度速度' },
        { id: 'C1', label: 'C1', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '命中目标区域' },
        { id: 'R1', label: 'R1', group: 'result', layer: 'play', level: 3, r: 22, desc: '射程达标过关' },
        { id: 'S1', label: '平抛运动', group: 'core', layer: 'teach', level: 1, r: 22, desc: 'x=v0t, y=½gt²' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
      ],
    },
    dt: { tree: { n: '开始', t: 'root', children: [] } },
    winSync: { title: '过关' },
    strategy: { mermaid: 'graph TD\nStart([开始])', routes: [] },
    traceMap: {
      controls: {
        's-angle': { kgId: 'O1', role: 'operation' },
        's-speed': { kgId: 'O1', role: 'operation' },
      },
    },
  };
}

function run() {
  const hints = { tier: 'generic', minConstraints: 1, minNodes: 6, minTeachNodes: 1, minVerifyLinks: 1 };
  const enriched = enrichChapterContract(miniChapter(), hints, []);

  assert(enriched.inquiryScript?.outputVariables?.length >= 1, 'outputVariables backfill');
  assert(enriched.physicsModel?.dependentVariables?.length >= 1, 'physicsModel dependentVariables');
  assert(
    enriched.physicsModel?.formulas?.some(f => /x\s*=/.test(f) || /y\s*=/.test(f)),
    'physicsModel formulas from teach',
  );

  const kp = enriched.inquiryScript.knowledgePoints;
  const av = enriched.inquiryScript.adjustmentVariables;
  const ov = buildOutputVariables(miniChapter(), kp, av, null);
  assert(ov.length >= 1, 'buildOutputVariables direct');
  assert(!ov.some(o => o.controlId === 's-angle'), 'output not adjustment control');

  const model = buildPhysicsModel(enriched.inquiryScript);
  assert(model.independentVariables.includes('AV1'), 'model AV ids');
  assert(model.dependentVariables.includes('OV1'), 'model OV ids');

  console.log('physics-model-backfill: OK');
}

module.exports = { run };
