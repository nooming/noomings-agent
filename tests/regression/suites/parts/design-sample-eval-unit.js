const { assert } = require('../../../lib/assert');
const { evaluateDesignSample, runParseChecks } = require('../../../lib/design-sample-eval');

function run() {
  const sample = {
    id: 'mock-projectile',
    expected: {
      formulasContain: ['v0', 'g'],
      adjustmentLabelsContain: ['角度'],
      outputLabelsContain: ['射程'],
      minAdjustmentVars: 1,
      minOutputVars: 1,
      confoundingMin: 0,
    },
  };

  const goodDraft = {
    knowledgePoints: [{ id: 'KP1', label: '平抛', formulas: ['x=v0t, y=½gt²'] }],
    adjustmentVariables: [{ id: 'AV1', controlId: 's-angle', label: '发射角度', symbol: 'θ' }],
    confoundingVariables: [],
    outputVariables: [{ id: 'OV1', label: '射程', symbol: 'R' }],
  };

  const good = runParseChecks(sample.expected, goodDraft);
  assert(good.pass, `good draft should pass: ${good.failures.join('; ')}`);
  assert(good.score === good.total, 'good draft full score');

  const badDraft = {
    knowledgePoints: [{ id: 'KP1', label: '平抛', formulas: [] }],
    adjustmentVariables: [],
    confoundingVariables: [{ id: 'CV1', controlId: 's-angle', label: '装饰' }],
    outputVariables: [],
  };

  const bad = runParseChecks(sample.expected, badDraft);
  assert(!bad.pass, 'bad draft should fail');
  assert(bad.failures.length >= 3, 'multiple failures expected');

  const fullResult = evaluateDesignSample(sample, { inquiryDraft: goodDraft }, { parseOnly: true });
  assert(fullResult.mode === 'parse', 'parseOnly mode');
  assert(fullResult.pass, 'parseOnly pass');

  const overlapDraft = {
    knowledgePoints: [{ id: 'KP1', formulas: ['F=ma'] }],
    adjustmentVariables: [{ id: 'AV1', controlId: 's-x', label: '力', symbol: 'F' }],
    confoundingVariables: [{ id: 'CV1', controlId: 's-x', label: '无关' }],
    outputVariables: [{ id: 'OV1', label: '加速度', symbol: 'a' }],
  };
  const overlap = runParseChecks({ confoundingMin: 1 }, overlapDraft);
  assert(!overlap.pass, 'controlId overlap should fail');

  console.log('design-sample-eval-unit: OK');
}

module.exports = { run };
