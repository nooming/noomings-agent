const { assert } = require('../../../lib/assert');
const { buildDesignGameHints, buildDesignStubSource } = require('../../../../packages/generate/design-pipeline');

function run() {
  const draft = {
    summary: '探究平抛命中',
    title: '斜抛挑战',
    knowledgePoints: [{ id: 'KP1', label: '平抛运动', formulas: ['x=v0t'] }],
    adjustmentVariables: [
      { id: 'AV1', controlId: 's-angle', label: '角度', type: 'range', role: 'primary' },
      { id: 'AV2', controlId: 'btn-fire', label: '发射', type: 'button', role: 'secondary' },
    ],
    confoundingVariables: [{ id: 'CV1', controlId: null, label: '空气阻力', reason: '理想模型忽略' }],
    inquiryFlow: ['KP1', 'AV1'],
  };

  const hints = buildDesignGameHints(draft, { title: '斜抛' });
  assert(hints.designMode === true, 'designMode');
  assert(hints.sliderControlIds.includes('s-angle'), 'slider ids');
  assert(hints.actionTriggerControlIds.includes('btn-fire'), 'action ids');

  const stub = buildDesignStubSource('平抛运动知识点', draft);
  assert(stub[0].content.includes('平抛运动知识点'), 'stub content');
  assert(stub[0].content.includes('s-angle'), 'stub has control');

  console.log('design-pipeline-unit: OK');
}

module.exports = { run };
