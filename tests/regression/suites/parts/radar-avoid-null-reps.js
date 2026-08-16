/**
 * 雷达按维避 null 代表局：与教师端 / PCA 脚本对齐的选取规则。
 * 覆盖 mag 场景：最近终局无探究（Pe/Er null），更早终局有 Pe → 探究维仍有值。
 */
const { assert } = require('../../../lib/assert');
const {
  pickRepSessionsForPart,
  meanPartByTaskAvoidNull,
  computeStudentRadarDims,
  ABILITY_SCORE_VERSION,
} = require('../../../../scripts/radar-pca-analysis');

function mkSession({
  id,
  catalogId = 'pkg-mag',
  updatedAt,
  exploreProcess = null,
  exploreResult = null,
  challengeResult = 80,
  challengeProcess = 70,
  efficiency = 60,
  total = 72,
  terminalOutcome = 'pass',
}) {
  return {
    id,
    catalogId,
    updatedAt,
    startedAt: updatedAt,
    terminalOutcome,
    verdict: terminalOutcome === 'pass' ? 'pass' : null,
    abilityScore: {
      version: ABILITY_SCORE_VERSION,
      pending: false,
      total,
      parts: {
        exploreProcess: { raw: exploreProcess },
        exploreResult: { raw: exploreResult },
        challengeResult: { raw: challengeResult },
        result: { raw: challengeResult },
        challengeProcess: { raw: challengeProcess },
        efficiency: { raw: efficiency },
      },
    },
  };
}

function run() {
  // Same task: newest challenge-only (Pe/Er null), older had explore Pe=55 Er=0
  const olderWithExplore = mkSession({
    id: 'sess-old',
    updatedAt: '2026-08-11T10:00:00.000Z',
    exploreProcess: 55,
    exploreResult: 0,
    total: 68,
  });
  const newestNoExplore = mkSession({
    id: 'sess-new',
    updatedAt: '2026-08-12T12:00:00.000Z',
    exploreProcess: null,
    exploreResult: null,
    challengeResult: 90,
    total: 75,
  });
  const student = {
    studentKey: 'mag-avoid-null',
    sessions: [newestNoExplore, olderWithExplore],
  };

  const peReps = pickRepSessionsForPart(student.sessions, 'exploreProcess', 2);
  assert(peReps.length === 1, `Pe reps should skip null newest, got ${peReps.length}`);
  assert(peReps[0].id === 'sess-old', `Pe rep should be older session, got ${peReps[0]?.id}`);

  const peMean = meanPartByTaskAvoidNull(student, 'exploreProcess');
  assert(peMean === 55, `Pe mean should be 55 from older, got ${peMean}`);

  const erMean = meanPartByTaskAvoidNull(student, 'exploreResult');
  assert(erMean === 0, `Er=0 (none) must count, got ${erMean}`);

  const radar = computeStudentRadarDims(student);
  assert(radar.dims.exploreProcess === 55, `radar Pe should be 55, got ${radar.dims.exploreProcess}`);
  assert(radar.dims.exploreResult === 0, `radar Er should be 0, got ${radar.dims.exploreResult}`);
  // Composite still uses newest 1–2 finite totals (both sessions) → (75+68)/2
  assert(radar.composite === 72, `composite mean of totals, got ${radar.composite}`);
  // Challenge: newest 1–2 non-null → (90+80)/2
  assert(radar.dims.challengeResult === 85, `challengeResult mean of 2 reps, got ${radar.dims.challengeResult}`);

  // Task with only null Pe → exploreProcess stays null
  const noExploreStudent = {
    studentKey: 'no-pe',
    sessions: [
      mkSession({
        id: 'a',
        catalogId: 'pkg-x',
        updatedAt: '2026-08-12T01:00:00.000Z',
        exploreProcess: null,
        exploreResult: null,
      }),
    ],
  };
  assert(
    meanPartByTaskAvoidNull(noExploreStudent, 'exploreProcess') == null,
    'all-null Pe task → null',
  );

  // Two tasks: one with Pe, one without → mean only over contributing task
  const twoTask = {
    studentKey: 'two-task',
    sessions: [
      mkSession({
        id: 't1-old',
        catalogId: 'task-a',
        updatedAt: '2026-08-10T00:00:00.000Z',
        exploreProcess: 40,
        exploreResult: 40,
      }),
      mkSession({
        id: 't1-new',
        catalogId: 'task-a',
        updatedAt: '2026-08-11T00:00:00.000Z',
        exploreProcess: null,
        exploreResult: null,
      }),
      mkSession({
        id: 't2',
        catalogId: 'task-b',
        updatedAt: '2026-08-12T00:00:00.000Z',
        exploreProcess: null,
        exploreResult: null,
        challengeResult: 50,
      }),
    ],
  };
  assert(
    meanPartByTaskAvoidNull(twoTask, 'exploreProcess') === 40,
    'cross-task Pe averages only tasks with non-null',
  );

  console.log('radar-avoid-null-reps: ok');
}

module.exports = { run };
