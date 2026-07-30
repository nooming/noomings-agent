const { assert } = require('../../../lib/assert');
/** ?????generic fixtures ???????????ch ?? */
const fs = require('fs');
const path = require('path');
const { tracePathAlign } = require('../../../../packages/judge/trace-path-align');
const { normalizeTraceEvents, filterEventsForChapter } = require('../../../../packages/judge/trace-normalize');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { buildJudgeRequest } = require('../../../../packages/judge/game-trace');
const { judge } = require('../../../../packages/judge/judge');
const { parseStrategyMermaidEdges, buildRouteHighlightEdgeKeys } = require('../../../../packages/shared/strategy-mermaid-parse.js');

const { loadChapter, loadGenericBundle, loadTrace } = require('../../../lib/fixture-loader');

function load(name) {
  const map = {
    'generic-chapter.json': () => loadGenericBundle(),
    'coupled-chapter.json': () => loadChapter('judge', 'coupled'),
    'coupled-mode-aligned-chapter.json': () => loadChapter('judge', 'coupledAligned'),
    'parallel-exit-chapter.json': () => loadChapter('judge', 'parallelExit'),
    'multi-fork-route-chapter.json': () => loadChapter('strategy', 'multiFork'),
    'shared-hub-route-chapter.json': () => loadChapter('strategy', 'sharedHub'),
    'restricted-pairwise-chapter.json': () => loadChapter('strategy', 'restrictedPairwise'),
    'macro-fanout-chapter.json': () => loadChapter('strategy', 'macroFanout'),
    'phantom-continue-chapter.json': () => loadChapter('strategy', 'phantomContinue'),
    'multi-gate-retry-chapter.json': () => loadChapter('strategy', 'multiGateRetry'),
    'generic-good-trace.json': () => loadTrace('genericGood'),
    'generic-trap-trace.json': () => loadTrace('genericTrap'),
    'generic-bad-retry-trace.json': () => loadTrace('genericBadRetry'),
    'generic-legacy-trace.json': () => loadTrace('genericLegacy'),
    'generic-playthrough-filter.json': () => loadTrace('genericPlaythrough'),
    'coupled-mode-on-trace.json': () => loadTrace('coupledModeOn'),
    'coupled-mode-off-trap-trace.json': () => loadTrace('coupledModeOffTrap'),
  };
  const fn = map[name];
  if (!fn) throw new Error('unknown fixture: ' + name);
  return fn();
}

async function run() {
  const dashEdges = parseStrategyMermaidEdges('Hit -- ? --> Speed');
  assert(dashEdges.length === 1, 'dash-label edge count');
  assert(dashEdges[0].from === 'Hit' && dashEdges[0].to === 'Speed', 'dash-label endpoints');
  assert(dashEdges[0].label === '?', `dash-label text: ${dashEdges[0].label}`);
  const dashKeys = buildRouteHighlightEdgeKeys(
    { highlightNodes: ['Hit', 'Speed'], highlightEdges: [] },
    'Hit -- ? --> Speed',
  );
  assert(dashKeys.has('Hit->Speed'), 'dash-label inferred highlight key');

  const aligned = load('coupled-mode-aligned-chapter.json');
  const mainRoute = aligned.strategy.routes.find(r => r.id === 'main');
  const mainKeys = buildRouteHighlightEdgeKeys(mainRoute, aligned.strategy.mermaid);
  assert(mainKeys.has('Start->Env'), 'main route expands Start->Env');
  assert(mainKeys.has('StratA->TestA'), 'main route bridges via shortest path StratA->ObserveA');
  assert(mainKeys.has('TestA->ObserveA'), 'main route bridges TestA->ObserveA');
  assert(mainKeys.size >= 8, `main route should highlight connected path edges, got ${mainKeys.size}`);

  const trapRoute = aligned.strategy.routes.find(r => r.id === 'trap_mode_off_paramB');
  const trapKeys = buildRouteHighlightEdgeKeys(trapRoute, aligned.strategy.mermaid);
  assert(trapKeys.has('CheckB->InvalidOp'), 'trap route keeps explicit edge');
  assert(trapKeys.has('InvalidOp->ModeOff'), 'trap route keeps return edge');

  const bundle = load('generic-chapter.json');
  const chapter = enrichChapterContract(bundle.chapter);

  const legacy = load('generic-legacy-trace.json');
  const legacyTuning = {
    ...legacy,
    events: legacy.events.map(e => {
      if (e.type === 'set_legacy_a') {
        return { ...e, type: 'tuning', payload: { control: 'legacy_a', value: e.payload?.value } };
      }
      if (e.type === 'set_legacy_b') {
        return { ...e, type: 'tuning', payload: { control: 'legacy_b', value: e.payload?.value } };
      }
      return e;
    }),
  };

  const legacyAlign = tracePathAlign(legacy, chapter, 0);
  const tuningAlign = tracePathAlign(legacyTuning, chapter, 0);
  assert(
    legacyAlign.strategyRouteGuess === tuningAlign.strategyRouteGuess,
    `legacy normalize route mismatch: ${legacyAlign.strategyRouteGuess} vs ${tuningAlign.strategyRouteGuess}`,
  );
  assert(legacyAlign.pathSteps.includes('R1'), 'legacy path should reach R1');

  const norm = normalizeTraceEvents(legacy, chapter);
  assert(norm.events.some(e => e.type === 'tuning'), 'normalize should produce tuning');

  const goodAlign = tracePathAlign(load('generic-good-trace.json'), chapter, 0);
  assert(goodAlign.strategyRouteGuess === 'main', `good route: ${goodAlign.strategyRouteGuess}`);
  assert(goodAlign.pathSteps.includes('R1'), 'good path should include R1');

  const trapAlign = tracePathAlign(load('generic-trap-trace.json'), chapter, 0);
  assert(trapAlign.strategyRouteGuess === 'trap', `trap route: ${trapAlign.strategyRouteGuess}`);

  const play = load('generic-playthrough-filter.json');
  const filtered = filterEventsForChapter(play, 0);
  assert(filtered.every(e => e.ch === 0), 'playthrough filter should keep only ch0 events');
  assert(filtered.length < play.events.length, 'playthrough should drop ch1 events');

  const req = buildJudgeRequest({
    ch: 0,
    trace: load('generic-good-trace.json'),
    chapter,
  });
  const result = await judge(req, {});
  assert(result.inquiryPath || result.dtAlignment?.length, 'judge should return alignment');

  const coupledBundle = load('coupled-chapter.json');
  const coupledChapter = enrichChapterContract(coupledBundle.chapter);
  const modeOnAlign = tracePathAlign(load('coupled-mode-on-trace.json'), coupledChapter, 0);
  assert(modeOnAlign.misconceptionTouches?.length === 0, 'mode on + paramB should not be misconception');
  assert(modeOnAlign.irrelevantTouches?.length === 0, 'mode on should not count as permanent irrelevant');
  assert(modeOnAlign.strategyRouteGuess === 'main', `mode on route: ${modeOnAlign.strategyRouteGuess}`);

  const modeOffAlign = tracePathAlign(load('coupled-mode-off-trap-trace.json'), coupledChapter, 0);
  assert(modeOffAlign.misconceptionTouches?.includes('paramB'), 'mode off + paramB should be misconception');
  assert(modeOffAlign.strategyRouteGuess === 'trap_mode_off_paramB', `mode off trap route: ${modeOffAlign.strategyRouteGuess}`);

  const modeOnJudge = await judge(buildJudgeRequest({
    ch: 0,
    trace: load('coupled-mode-on-trace.json'),
    chapter: coupledChapter,
  }), {});
  assert(
    !(modeOnJudge.gaps || []).some(g => /永久无关|无关变量/.test(g)),
    'mode on + paramB judge should not penalize paramB as irrelevant',
  );

  console.log('trace-contract-check: OK');
  console.log('  legacy route:', legacyAlign.strategyRouteGuess);
  console.log('  good route:', goodAlign.strategyRouteGuess);
  console.log('  trap route:', trapAlign.strategyRouteGuess);
  console.log('  playthrough ch0 events:', filtered.length);
  console.log('  generic verdict:', result.verdict);
  console.log('  coupled mode on route:', modeOnAlign.strategyRouteGuess);
  console.log('  coupled mode off trap route:', modeOffAlign.strategyRouteGuess);
}

module.exports = { run };
