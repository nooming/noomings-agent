/**
 * 未终局：分档 + preview 门闩 + 能力分/评语 preview 标记
 */
const { assert } = require('../../../lib/assert');
const {
  classifyIncompleteKind,
  shouldRunIncompletePreview,
  applyIncompletePreviewAbilityScore,
  applyIncompletePreviewJudgeResult,
  effectiveFireTrials,
  INCOMPLETE_KIND,
} = require('../../../../packages/judge/incomplete-session');
const { loadChapterForGraph } = require('../../../../packages/platform/catalog');
const { computeAbilityScore } = require('../../../../packages/judge/ability-score');

const CHAPTER = {
  traceMap: {
    controls: {
      's-a': { role: 'operation', kgId: 'O1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
  },
  inquiryScript: {
    adjustmentVariables: [{ controlId: 's-a', label: 'A', role: 'primary' }],
  },
  strategy: { routes: [{ id: 'main', label: '单变量·A', score: 1 }] },
};

function touchSession() {
  return {
    events: [
      { ts: 1, type: 'puzzle_open', payload: {}, ch: 0 },
      { ts: 2, type: 'phase_change', payload: { phase: 'explore' }, ch: 0 },
    ],
    eventCount: 2,
    currentPhase: 'explore',
  };
}

function richEvents() {
  const events = [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }];
  for (let i = 0; i < 4; i++) {
    events.push({ ts: 10 + i, type: 'tuning', payload: { control: 's-a', value: i }, ch: 0 });
    events.push({ ts: 11 + i, type: 'action', payload: { control: 'btn-fire' }, ch: 0 });
  }
  return events;
}

function richEventsExplorePhase() {
  return [
    { ts: 1, type: 'puzzle_open', payload: {}, ch: 0 },
    { ts: 2, type: 'phase_change', payload: { phase: 'explore' }, ch: 0 },
    ...richEvents().slice(1),
  ];
}

function run() {
  assert(classifyIncompleteKind(touchSession(), CHAPTER) === INCOMPLETE_KIND.TOUCH_ONLY, 'touch_only');
  assert(!shouldRunIncompletePreview(touchSession(), CHAPTER), 'skip preview touch');

  const rich = { events: richEvents(), eventCount: richEvents().length };
  assert(effectiveFireTrials(rich.events, CHAPTER) >= 1, 'effective trials');
  assert(shouldRunIncompletePreview(rich, CHAPTER), 'preview when trials');
  assert(classifyIncompleteKind(rich, CHAPTER) === INCOMPLETE_KIND.RICH_UNJUDGED, 'rich kind');

  const exploreOnly = {
    events: [
      { ts: 1, type: 'puzzle_open', payload: {}, ch: 0 },
      { ts: 2, type: 'phase_change', payload: { phase: 'explore' }, ch: 0 },
      { ts: 3, type: 'tuning', payload: { control: 's-a', value: 1 }, ch: 0 },
      { ts: 4, type: 'action', payload: { control: 'btn-fire' }, ch: 0 },
      { ts: 5, type: 'snapshot', payload: { winOk: false }, ch: 0 },
    ],
    eventCount: 5,
    currentPhase: 'explore',
  };
  assert(classifyIncompleteKind(exploreOnly, CHAPTER) === INCOMPLETE_KIND.EXPLORE_DROPOUT, 'explore_dropout');

  const ramp = loadChapterForGraph('ramp-rolling-collision');
  if (ramp) {
    const ev = richEvents();
    assert(shouldRunIncompletePreview({ events: ev, eventCount: ev.length }, ramp), 'ramp chapter preview ok');
  }

  const judged = applyIncompletePreviewJudgeResult({ mode: 'rule', verdict: 'pass', strengths: ['x'] });
  assert(judged.judgePreview && judged.verdict === 'in_progress', 'preview judge downgrade');

  const ability = applyIncompletePreviewAbilityScore({ total: 77, bands: { result: '达标' } });
  assert(ability.total == null && ability.bands.result === '未完成', 'preview ability');
  assert(ability.previewTotal === 77 && ability.previewNote, 'previewTotal from total');

  const scored = computeAbilityScore({
    events: richEventsExplorePhase(),
    chapter: CHAPTER,
    verdict: 'in_progress',
    judged: true,
    terminalOutcome: 'incomplete',
  });
  assert(scored.total == null && Number.isFinite(scored.previewTotal), 'incomplete shadow score');
  const gated = applyIncompletePreviewAbilityScore(scored);
  assert(gated.total == null && Number.isFinite(gated.previewTotal), 'preview gate keeps previewTotal');

  console.log('judge-incomplete-preview-check: ok');
}

module.exports = { run };
