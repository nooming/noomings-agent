const { assert } = require('../../../lib/assert');
const {
  parseJudgeJson,
  verdictFromLevel,
  buildLlmJudgeResult,
} = require('../../../../packages/judge/judge');

function judgeParseCheck() {
  const jsonText = '```json\n{"level":2,"summary":"探索中，只调初速度","strengths":["单变量意识强"],"gaps":["未探索角度"],"suggestion":"引导同时调节角度"}\n```';
  const parsed = parseJudgeJson(jsonText);
  assert(parsed && parsed.level === 2, 'parse fenced json');
  assert(parsed.summary.includes('初速度'), 'summary parsed');
  assert(parsed.strengths.length === 1, 'strengths parsed');

  const bare = '{"level":3,"summary":"接近收敛","strengths":[],"gaps":[],"suggestion":""}';
  assert(parseJudgeJson(bare)?.level === 3, 'parse bare json');
  assert(parseJudgeJson('not json') === null, 'invalid returns null');

  const summary = {
    align: { dtPath: [] },
    lastSnapshot: { winOk: false },
    inquiryPath: null,
  };
  assert(verdictFromLevel(4, summary) === 'pass', 'level 4 pass');
  assert(verdictFromLevel(3, summary) === 'in_progress', 'level 3 in_progress');
  assert(verdictFromLevel(2, summary) === 'learning', 'level 2 learning');
  assert(verdictFromLevel(2, { align: { dtPath: ['R1'] }, lastSnapshot: {} }) === 'pass', 'R1 overrides');

  const llm = buildLlmJudgeResult(jsonText, summary);
  assert(llm.mode === 'llm', 'llm result mode');
  assert(llm.teacherSummary?.summary, 'teacherSummary populated');
  assert(llm.comment.length <= 200, 'comment concise');

  const legacy = buildLlmJudgeResult('这是一段没有 JSON 的长评语'.repeat(20), summary);
  assert(legacy.comment.length <= 200, 'legacy truncated');

  console.log('judge-parse-check: OK');
}

module.exports = { run: judgeParseCheck };
