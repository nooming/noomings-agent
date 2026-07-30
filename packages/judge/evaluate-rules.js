/**
 * 规则评判（无 LLM），�?Agent B API �?generate/trace-synth 冒烟共用�? */
const { summarizeTrace } = require('./dt-align');
const { ruleJudge } = require('./judge');

function evaluateTraceRules({ ch, trace, chapter, graph }) {
  const summary = summarizeTrace(trace, ch ?? 0, chapter);
  const body = { ch, trace, chapter, graph: graph || { mapping: chapter?.mapping } };
  return ruleJudge(summary, body.chapter);
}

module.exports = { evaluateTraceRules, ruleJudge };
