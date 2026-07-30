const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { loadChapter } = require('../../../lib/fixture-loader');
const { evaluateTraceRules } = require('../../../../packages/judge/evaluate-rules');
const {
  synthFromDtOutline,
  synthTrapTrace,
  synthSingleVarMain,
} = require('../../../../packages/generate/trace-synth');

const ROOT = path.join(__dirname, '../../..');
const FIXTURES = path.join(ROOT, 'data/datasets/html-samples/judge-fixtures.json');

function resolveChapter(fx) {
  if (fx.chapter) return fx.chapter.chapter || fx.chapter;
  if (fx.chapterRef) {
    const entry = loadChapter(fx.chapterRef.bundle, fx.chapterRef.key);
    return entry.chapter || entry;
  }
  return null;
}

function matchVerdict(actual, expected, traceKey) {
  if (traceKey === 'trapTrace' && expected === 'in_progress') {
    return actual === 'in_progress' || actual === 'learning';
  }
  return actual === expected;
}

function run() {
  const data = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  assert(data.fixtures?.length >= 3, 'judge-fixtures need >= 3 entries');

  for (const fx of data.fixtures) {
    const chapter = resolveChapter(fx);
    assert(chapter, `chapter resolved: ${fx.id}`);
    const tagged = { ...chapter, _ch: 0 };
    const expect = fx.judgeExpect;

    const good = synthFromDtOutline(tagged);
    assert(!good.skipped, `${fx.id} good trace not skipped`);
    const goodResult = evaluateTraceRules({
      ch: 0,
      trace: { events: good.events },
      chapter,
      graph: { mapping: chapter.mapping },
    });
    assert(
      matchVerdict(goodResult.verdict, expect.goodTrace, 'goodTrace'),
      `${fx.id} goodTrace: expected ${expect.goodTrace}, got ${goodResult.verdict}`,
    );

    const trap = synthTrapTrace(tagged);
    const trapResult = evaluateTraceRules({
      ch: 0,
      trace: { events: trap.events },
      chapter,
      graph: { mapping: chapter.mapping },
    });
    assert(
      matchVerdict(trapResult.verdict, expect.trapTrace, 'trapTrace'),
      `${fx.id} trapTrace: expected ${expect.trapTrace}, got ${trapResult.verdict}`,
    );

    const single = synthSingleVarMain(tagged);
    const singleResult = evaluateTraceRules({
      ch: 0,
      trace: { events: single.events },
      chapter,
      graph: { mapping: chapter.mapping },
    });
    assert(
      matchVerdict(singleResult.verdict, expect.singleVarMain, 'singleVarMain'),
      `${fx.id} singleVarMain: expected ${expect.singleVarMain}, got ${singleResult.verdict}`,
    );
  }

  console.log('batch-judge-fixtures-check: OK');
}

module.exports = { run };
