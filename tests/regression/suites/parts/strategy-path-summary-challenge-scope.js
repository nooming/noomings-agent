/**
 * Path-summary scoring must use challenge segment when phase_change exists.
 * Explore AV thrash must not force switchKind=thrash if challenge is clean single-var.
 */
const { assert } = require('../../../lib/assert');
const {
  resolveStrategyPathScoreScope,
  filterEventsByChallengePhase,
} = require('../../../../packages/judge/trace-normalize');
const { scoreTraceStrategy } = require('../../../../packages/judge/strategy-segment-score');
const { formatSummary } = require('../../../../apps/web/ui/strategy-path-summary');

const CHAPTER = {
  inquiryScript: {
    adjustmentVariables: [
      { controlId: 's-a', label: 'A', priorityRank: 1 },
      { controlId: 's-b', label: 'B', priorityRank: 2 },
      { controlId: 's-c', label: 'C', priorityRank: 3 },
    ],
  },
  traceMap: {
    controls: {
      's-a': { role: 'operation' },
      's-b': { role: 'operation' },
      's-c': { role: 'operation' },
      'btn-fire': { role: 'action' },
    },
  },
  strategy: {
    routes: [
      { id: 'main', label: '单变量·A', score: 1.0, priorityRank: 1 },
      { id: 'main_s-b', label: '单变量·B', score: 0.85, priorityRank: 2 },
      { id: 'trap', label: '多参盲调', score: 0.2, tier: 'suboptimal' },
    ],
  },
};

function fire(ts) {
  return { ts, type: 'action', payload: { control: 'btn-fire' }, ch: 0 };
}
function tune(ts, control, value) {
  return { ts, type: 'tuning', payload: { control, value }, ch: 0 };
}
function snap(ts) {
  return { ts, type: 'snapshot', payload: { winOk: false, hintKey: 'retry' }, ch: 0 };
}
function phase(ts, p) {
  return { ts, type: 'phase_change', payload: { phase: p }, ch: 0 };
}

/** Explore: thrash every AV one-shot; challenge: stable single-var A only. */
function exploreThrashThenChallengeSingle() {
  const events = [phase(1, 'explore')];
  let t = 10;
  for (const ctrl of ['s-a', 's-b', 's-c', 's-a', 's-b', 's-c']) {
    events.push(tune(t++, ctrl, t));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  events.push(phase(t++, 'challenge'));
  for (let i = 0; i < 4; i++) {
    events.push(tune(t++, 's-a', 40 + i));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  events.push({ ts: t++, type: 'win', payload: {}, ch: 0 });
  return events;
}

function run() {
  const full = exploreThrashThenChallengeSingle();

  // Full-session score would see thrash; challenge scope must not.
  const fullScore = scoreTraceStrategy(full, CHAPTER, { mode: 'explore' });
  const fullKind = fullScore.switchKind || fullScore.breakdown?.switchKind;
  assert(fullKind === 'thrash', `sanity: full session is thrash, got ${fullKind}`);

  const scope = resolveStrategyPathScoreScope(full, {
    phaseScope: 'challenge',
    mode: 'compete',
  });
  assert(scope.scoredPhase === 'challenge', 'scoredPhase=challenge');
  assert(scope.mode === 'compete', 'mode=compete when challenge filter used');
  const filtered = filterEventsByChallengePhase(full);
  assert(scope.events.length === filtered.length, 'scope events === challenge filter');
  const challengeTunings = scope.events.filter(e => e.type === 'tuning');
  assert(
    challengeTunings.every(e => e.payload.control === 's-a'),
    'challenge scope drops explore AV thrash',
  );
  assert(challengeTunings.length === 4, 'four challenge single-var tunings');
  assert(
    !scope.events.some(e => e.type === 'tuning' && e.payload.control === 's-b'),
    'no explore s-b in scored events',
  );

  const challengeScore = scoreTraceStrategy(scope.events, CHAPTER, { mode: scope.mode });
  const kind = challengeScore.switchKind || challengeScore.breakdown?.switchKind;
  assert(
    kind === 'stable' || kind === 'focused_redirect',
    `challenge path switchKind should be stable|focused_redirect, got ${kind}`,
  );
  assert(kind !== 'thrash', 'challenge single-var must not be thrash');
  assert(/单变量/.test(challengeScore.primaryStrategy || ''), 'primary is single-var');

  // No phase_change → full fallback
  const noPhase = [tune(1, 's-a', 1), fire(2), snap(3)];
  const fullScope = resolveStrategyPathScoreScope(noPhase, { mode: 'explore' });
  assert(fullScope.scoredPhase === 'full', 'no phase_change → full');
  assert(fullScope.events.length === noPhase.length, 'full keeps all events');
  const exploreNoPhase = resolveStrategyPathScoreScope(noPhase, { phaseScope: 'explore' });
  assert(exploreNoPhase.scoredPhase === 'full', 'phaseScope=explore without phase_change → full (not fake explore)');

  // Dual scopes: explore thrash + challenge single-var
  const exploreScope = resolveStrategyPathScoreScope(full, { phaseScope: 'explore' });
  assert(exploreScope.scoredPhase === 'explore', 'phaseScope=explore with ops → explore');
  assert(
    exploreScope.events.filter(e => e.type === 'tuning').some(e => e.payload.control === 's-b'),
    'explore scope keeps explore tunings',
  );

  // phase_change but challenge empty of ops → full fallback
  const exploreWin = [
    phase(1, 'explore'),
    tune(2, 's-a', 1),
    fire(3),
    snap(4),
    phase(5, 'challenge'),
    { ts: 6, type: 'win', payload: {}, ch: 0 },
  ];
  const exploreOnlyScope = resolveStrategyPathScoreScope(exploreWin, { mode: 'compete' });
  assert(exploreOnlyScope.scoredPhase === 'full', 'empty challenge ops → full fallback');
  assert(exploreOnlyScope.mode === 'explore', 'fallback mode explore');

  const summary = formatSummary(challengeScore, {
    audience: 'student',
    showScore: false,
    scoredPhase: 'challenge',
  });
  assert(/竞赛段/.test(summary.advice || ''), 'challenge-scored advice framed');
  assert(!/探究扫参|探究段扫/.test(summary.advice || ''), 'no explore-sweep blame');

  console.log('strategy-path-summary-challenge-scope-check: ok', { kind, primary: challengeScore.primaryStrategy });
}

module.exports = { run };
