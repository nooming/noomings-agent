/**
 * 能力总分 v3：画像 A–G（固定权重 / 门闩 / 多关 R / Pe 占 25 / 归因 / 幸运一发）
 */
const { assert } = require('../../../lib/assert');
const {
  computeAbilityScore,
  detectMultiLevelProgress,
  ABILITY_SCORE_VERSION,
  ATTRIBUTION_BONUS,
  LUCKY_ONESHOT_E,
  LUCKY_ONESHOT_TOTAL_CAP,
  mapProcessBand,
  fixedWeightedSum,
  ABILITY_SCORE_WEIGHTS,
} = require('../../../../packages/judge/ability-score');

const CHAPTER = {
  inquiryScript: {
    adjustmentVariables: [
      { controlId: 's-a', label: 'A', priorityRank: 1 },
      { controlId: 's-b', label: 'B', priorityRank: 2 },
    ],
    confoundingVariables: [
      { controlId: 's-mass', label: '质量' },
    ],
  },
  traceMap: {
    controls: {
      's-a': { role: 'operation' },
      's-b': { role: 'operation' },
      's-mass': { role: 'irrelevant' },
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
function snap(ts, extra) {
  return { ts, type: 'snapshot', payload: { winOk: false, hintKey: 'retry', ...(extra || {}) }, ch: 0 };
}
function phase(ts, p) {
  return { ts, type: 'phase_change', payload: { phase: p }, ch: 0 };
}
function win(ts, payload) {
  return { ts, type: 'win', payload: payload || { winOk: true }, ch: 0 };
}

/** A: 探究单变量清楚 → 竞赛单参 1 试次过关 */
function personaA() {
  const events = [phase(1, 'explore')];
  let t = 10;
  for (let i = 0; i < 4; i++) {
    events.push(tune(t++, 's-a', 10 + i));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  events.push(phase(t++, 'challenge'));
  events.push(tune(t++, 's-a', 40));
  events.push(fire(t++));
  events.push(snap(t++, { winOk: true, attribution: 's-a', evidenceSummary: '主调 s-a' }));
  events.push(win(t++));
  return events;
}

/** B: 探究靠观察少操作 → 竞赛单参 1 次过 */
function personaB() {
  const events = [phase(1, 'explore')];
  let t = 10;
  events.push(tune(t++, 's-a', 12));
  events.push(phase(t++, 'challenge'));
  events.push(tune(t++, 's-a', 40));
  events.push(fire(t++));
  events.push(snap(t++, { winOk: true }));
  events.push(win(t++));
  return events;
}

/** C: 竞赛 1 试次但同试次多参碰中 */
function personaC() {
  const events = [phase(1, 'explore')];
  let t = 10;
  for (let i = 0; i < 3; i++) {
    events.push(tune(t++, 's-a', 10 + i));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  events.push(phase(t++, 'challenge'));
  events.push(tune(t++, 's-a', 40));
  events.push(tune(t++, 's-b', 20));
  events.push(fire(t++));
  events.push(snap(t++, { winOk: true }));
  events.push(win(t++));
  return events;
}

/** D: 单变量多试次才过关 */
function personaD() {
  const events = [phase(1, 'explore')];
  let t = 10;
  for (let i = 0; i < 3; i++) {
    events.push(tune(t++, 's-a', 10 + i));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  events.push(phase(t++, 'challenge'));
  for (let i = 0; i < 5; i++) {
    events.push(tune(t++, 's-a', 30 + i));
    events.push(fire(t++));
    events.push(snap(t++, i === 4 ? { winOk: true } : {}));
  }
  events.push(win(t++));
  return events;
}

/** E: 机会用尽未过 + thrash */
function personaE() {
  const events = [phase(1, 'explore')];
  let t = 10;
  for (const ctrl of ['s-a', 's-b', 's-a', 's-b', 's-a', 's-b']) {
    events.push(tune(t++, ctrl, t));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  events.push(phase(t++, 'challenge'));
  for (const ctrl of ['s-a', 's-b', 's-a', 's-b']) {
    events.push(tune(t++, ctrl, t));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  return events;
}

/** F: 只探究未进竞赛 */
function personaF() {
  const events = [phase(1, 'explore')];
  let t = 10;
  for (let i = 0; i < 4; i++) {
    events.push(tune(t++, 's-a', 10 + i));
    events.push(fire(t++));
    events.push(snap(t++));
  }
  return events;
}

/** G: 大炮通 3/4 */
function personaG() {
  const events = [phase(1, 'challenge')];
  let t = 10;
  for (let lv = 0; lv < 3; lv++) {
    events.push(tune(t++, 's-a', 20 + lv));
    events.push(fire(t++));
    events.push(snap(t++, { winOk: true, interim: true }));
    events.push(win(t++, { winOk: true, interim: true, final: false }));
  }
  return events;
}

function run() {
  assert(ABILITY_SCORE_VERSION === 3, `version const is 3, got ${ABILITY_SCORE_VERSION}`);

  // A: skilled one-shot
  const a = computeAbilityScore({
    events: personaA(),
    chapter: CHAPTER,
    verdict: 'pass',
    judged: true,
  });
  assert(a.version === ABILITY_SCORE_VERSION, 'version');
  assert(a.total != null && a.total >= 80, `A high total, got ${a.total}`);
  assert(a.parts.efficiency.processGate === true, 'A processGate');
  assert(a.parts.efficiency.raw >= 90, `A E high, got ${a.parts.efficiency.raw}`);
  assert(a.parts.attribution.aligned === true, 'A attribution aligned');
  assert(a.parts.attribution.contrib === ATTRIBUTION_BONUS, 'A attribution +5');
  assert(a.parts.exploreProcess.contrib > 0, 'A Pe contrib > 0');
  assert(a.parts.exploreProcess.contrib <= 25, `A Pe contrib ≤25, got ${a.parts.exploreProcess.contrib}`);
  assert(a.parts.result.contrib <= 30, `A R contrib ≤30, got ${a.parts.result.contrib}`);
  assert(a.bands.process === '清楚' || a.bands.process === '部分清楚', `A process band ${a.bands.process}`);

  // B: observe-then-transfer one-shot
  const b = computeAbilityScore({
    events: personaB(),
    chapter: CHAPTER,
    verdict: 'pass',
    judged: true,
  });
  assert(b.total != null && b.total >= 55, `B mid-high total, got ${b.total}`);
  assert(b.parts.efficiency.raw >= 85, `B E high, got ${b.parts.efficiency.raw}`);
  assert(b.parts.challengeProcess.raw != null, 'B has Pc');
  assert(b.parts.result.contrib <= 30, `B R contrib ≤30, got ${b.parts.result.contrib}`);

  // C: lucky multi-param one-shot → lower E/Pc than A/D（v2 更严）
  const c = computeAbilityScore({
    events: personaC(),
    chapter: CHAPTER,
    verdict: 'pass',
    judged: true,
  });
  assert(c.parts.result.raw === 100, 'C R=100');
  assert(c.parts.efficiency.processGate === false, 'C gate false');
  assert(c.parts.efficiency.raw <= LUCKY_ONESHOT_E, `C E ≤${LUCKY_ONESHOT_E}, got ${c.parts.efficiency.raw}`);
  assert(c.parts.challengeProcess.raw != null && c.parts.challengeProcess.raw <= 55, `C Pc capped, got ${c.parts.challengeProcess.raw}`);
  assert(c.total < a.total, `C (${c.total}) < A (${a.total})`);
  assert(c.total <= LUCKY_ONESHOT_TOTAL_CAP, `C total capped ≤${LUCKY_ONESHOT_TOTAL_CAP}, got ${c.total}`);
  assert(c.total < b.total, `lucky C (${c.total}) < skilled-ish B (${b.total})`);

  // D: multi-trial single-var → still can beat C
  const d = computeAbilityScore({
    events: personaD(),
    chapter: CHAPTER,
    verdict: 'pass',
    judged: true,
  });
  assert(d.parts.result.raw === 100, 'D R=100');
  assert(d.parts.efficiency.processGate === true, 'D gate');
  assert(d.parts.efficiency.raw < 100 && d.parts.efficiency.raw >= 55, `D E mid, got ${d.parts.efficiency.raw}`);
  assert(d.total > c.total, `D (${d.total}) > C (${c.total})`);

  // E: judged learning / thrash without attempts_exhausted → 未完成（非终局，不计未达标）
  const e = computeAbilityScore({
    events: personaE(),
    chapter: CHAPTER,
    verdict: 'learning',
    judged: true,
  });
  assert(e.parts.result.raw == null, `E R pending, got ${e.parts.result.raw}`);
  assert(e.bands.result === '未完成', `E result band 未完成, got ${e.bands.result}`);
  assert(e.total == null, `E total null (incomplete), got ${e.total}`);
  assert(e.pending === true, 'E pending');

  // E2: attempts exhausted without win → 未达标终局
  const e2Events = [
    ...personaE(),
    { type: 'attempts_exhausted', payload: { attempts: 0, mode: 'challenge' } },
  ];
  const e2 = computeAbilityScore({
    events: e2Events,
    chapter: CHAPTER,
    verdict: 'learning',
    judged: true,
  });
  assert(e2.parts.result.raw === 20, `E2 R=20, got ${e2.parts.result.raw}`);
  assert(e2.bands.result === '未达标', `E2 result 未达标, got ${e2.bands.result}`);
  assert(e2.total != null && e2.total <= 55, `E2 low total, got ${e2.total}`);
  assert(e2.bands.process === '尚不清晰' || e2.bands.process === '部分清楚', `E2 band ${e2.bands.process}`);

  // F: explore only → 固定权重预览，不伪高分
  const f = computeAbilityScore({
    events: personaF(),
    chapter: CHAPTER,
    verdict: 'in_progress',
    judged: false,
  });
  assert(f.parts.challengeProcess.raw == null, 'F Pc null');
  assert(f.parts.exploreProcess.raw != null, 'F Pe present');
  assert(f.parts.exploreProcess.contrib <= 25, `F Pe contrib ≤25, got ${f.parts.exploreProcess.contrib}`);
  assert(f.total == null, `F total null (incomplete), got ${f.total}`);
  assert(f.pending === true, 'F pending');
  assert(f.parts.exploreProcess.raw != null, 'F Pe preview still available');

  // G: multi-level 3/4 · 仅竞赛无探究
  const gProg = detectMultiLevelProgress(personaG(), { packageId: 'projectile-cannon' });
  assert(gProg && gProg.levelsCleared === 3 && gProg.levelsTotal === 4, `G progress ${JSON.stringify(gProg)}`);
  const g = computeAbilityScore({
    events: personaG(),
    chapter: CHAPTER,
    packageId: 'projectile-cannon',
    judged: false,
  });
  assert(g.parts.result.raw === 75, `G R=75, got ${g.parts.result.raw}`);
  assert(g.parts.result.progress?.levelsCleared === 3, 'G levelsCleared');
  assert(g.parts.exploreProcess.raw == null, 'G Pe null (challenge-only)');
  assert(g.parts.exploreProcess.contrib === 0, `G Pe contrib 0, got ${g.parts.exploreProcess.contrib}`);
  assert(g.parts.result.contrib <= 30, `G R contrib ≤30 (no renorm), got ${g.parts.result.contrib}`);
  // 75 * 0.30 = 22.5
  assert(g.parts.result.contrib === 22.5, `G R contrib=22.5, got ${g.parts.result.contrib}`);

  // Fixed-weight unit: missing Pe does not inflate others
  const fw = fixedWeightedSum(
    { R: 100, Pe: null, Pc: 80, E: 50 },
    ABILITY_SCORE_WEIGHTS,
  );
  assert(fw != null, 'fixedWeightedSum returns');
  const expectedFw = 0.30 * 100 + 0.25 * 80 + 0.20 * 50; // 30+20+10=60
  assert(Math.abs(fw - expectedFw) < 1e-9, `fixed sum ${fw} == ${expectedFw}`);

  // Attribution: no event → 0
  const noAttr = computeAbilityScore({
    events: personaD(),
    chapter: CHAPTER,
    verdict: 'pass',
    judged: true,
  });
  assert(noAttr.parts.attribution.contrib === 0, 'no attribution bonus');

  // Free fortress finals should not inflate past 4
  const freeish = [
    win(1, { interim: true }),
    win(2, { interim: true }),
    win(3, { interim: true }),
    win(4, { final: true }),
    win(5, { final: true }),
    win(6, { final: true }),
  ];
  const prog = detectMultiLevelProgress(freeish, { packageId: 'projectile-cannon' });
  assert(prog.levelsCleared === 4, `free fortress not counted extra, got ${prog.levelsCleared}`);

  // Legacy cannon wins without interim/final → count win events (not 0/N)
  const legacyWins = [
    phase(1, 'challenge'),
    win(2, { winOk: true }),
    win(3, { winOk: true }),
    snap(4, { winOk: true, hintKey: 'cannon_fort_hit' }),
    win(5, { winOk: true }),
  ];
  const legacyProg = detectMultiLevelProgress(legacyWins, { packageId: 'projectile-cannon' });
  assert(legacyProg.levelsCleared === 3 && legacyProg.levelsTotal === 4,
    `legacy multi-level R count, got ${JSON.stringify(legacyProg)}`);
  const legacyScore = computeAbilityScore({
    events: legacyWins,
    chapter: CHAPTER,
    packageId: 'projectile-cannon',
    judged: true,
    verdict: 'pass',
  });
  assert(legacyScore.parts.result.raw === 75, `legacy R=75, got ${legacyScore.parts.result.raw}`);
  assert(legacyScore.parts.result.contrib <= 30, `legacy R contrib ≤30, got ${legacyScore.parts.result.contrib}`);
  assert(legacyScore.parts.exploreProcess.contrib === 0, 'legacy Pe +0');

  // levelsCleared payload wins over win count
  const payloadProg = detectMultiLevelProgress(
    [win(1, { winOk: true, levelsCleared: 2 }), win(2, { winOk: true, levelsCleared: 2 })],
    { packageId: 'projectile-cannon' },
  );
  assert(payloadProg.levelsCleared === 2, `levelsCleared payload, got ${payloadProg.levelsCleared}`);

  // Pe null：explore ops but 0 effective trials → Pe null，contrib 0，不抬 R
  const peNullEvents = [
    phase(1, 'explore'),
    tune(2, 's-a', 1), // ops present but typically <1 effective trial
    phase(3, 'challenge'),
    tune(4, 's-a', 40),
    fire(5),
    snap(6, { winOk: true }),
    win(7),
  ];
  const peNullScore = computeAbilityScore({
    events: peNullEvents,
    chapter: CHAPTER,
    verdict: 'pass',
    judged: true,
  });
  assert(peNullScore.parts.exploreProcess.raw == null, `Pe null when exploreTrials=0, got ${peNullScore.parts.exploreProcess.raw}`);
  assert(peNullScore.parts.exploreProcess.contrib === 0, `Pe contrib 0, got ${peNullScore.parts.exploreProcess.contrib}`);
  assert(peNullScore.parts.result.contrib <= 30, `Pe-null R contrib ≤30, got ${peNullScore.parts.result.contrib}`);
  assert(peNullScore.parts.challengeProcess.raw != null, 'Pc still scored');
  assert(peNullScore.total != null, 'total still present with Pe=0 block');
  // process band should not be forced to 尚不清晰 solely by Pe=0
  assert(
    peNullScore.bands.process !== '尚不清晰' || peNullScore.parts.efficiency.processGate === false,
    `Pe-null should not alone force 尚不清晰; band=${peNullScore.bands.process}`,
  );
  // Pe-null + 竞赛一发：即使 Pc 高也不标「清楚」
  if (peNullScore.parts.efficiency.challengeTrials === 1 && peNullScore.parts.efficiency.processGate) {
    assert(
      peNullScore.bands.process === '部分清楚' || peNullScore.bands.process === '尚不清晰',
      `Pe-null one-shot must not be 清楚, got ${peNullScore.bands.process}`,
    );
  }
  assert(
    mapProcessBand({
      pe: { raw: null, effectiveTrials: 0 },
      pc: { raw: 90, effectiveTrials: 1, cvOver: false, trap: false },
      processGate: true,
      total: 80,
      pending: false,
    }) === '部分清楚',
    'Pe-null + Pc high + trials=1 → 部分清楚',
  );
  assert(
    mapProcessBand({
      pe: { raw: null, effectiveTrials: 0 },
      pc: { raw: 90, effectiveTrials: 2, cvOver: false, trap: false },
      processGate: true,
      total: 80,
      pending: false,
    }) === '清楚',
    'Pe-null + Pc high + trials≥2 → 清楚',
  );

  // 无 phase_change：整局不算探究加分
  const noPhase = computeAbilityScore({
    events: [
      tune(1, 's-a', 10),
      fire(2),
      snap(3),
      tune(4, 's-a', 40),
      fire(5),
      snap(6, { winOk: true }),
      win(7),
    ],
    chapter: CHAPTER,
    verdict: 'pass',
    judged: true,
  });
  assert(noPhase.parts.exploreProcess.raw == null, 'no-phase Pe null');
  assert(noPhase.parts.exploreProcess.contrib === 0, 'no-phase Pe +0/25');
  assert(noPhase.parts.challengeProcess.raw == null, 'no-phase Pc null');
  assert(noPhase.parts.result.contrib <= 30, `no-phase R ≤30, got ${noPhase.parts.result.contrib}`);

  // Multi-level: no wins → R=0 even if verdict pass
  const noWinCannon = computeAbilityScore({
    events: [phase(1, 'challenge'), tune(2, 's-a', 1), fire(3)],
    chapter: CHAPTER,
    packageId: 'projectile-cannon',
    verdict: 'pass',
    judged: true,
  });
  assert(noWinCannon.parts.result.raw === 0, `no-win cannon R=0, got ${noWinCannon.parts.result.raw}`);
  assert(noWinCannon.parts.result.progress?.levelsCleared === 0, 'no-win cleared=0');

  // Full-eval style complete win payload → 4/4
  const fullClear = detectMultiLevelProgress(
    [win(1, { winOk: true, final: true, levelsCleared: 4, levelsTotal: 4 })],
    { packageId: 'projectile-cannon' },
  );
  assert(fullClear.levelsCleared === 4, `full-eval levelsCleared=4, got ${fullClear.levelsCleared}`);

  console.log('ability-score-check: ok', {
    version: ABILITY_SCORE_VERSION,
    A: a.total,
    B: b.total,
    C: c.total,
    D: d.total,
    E: e.total,
    F: f.total,
    G: g.total,
    bands: { A: a.bands.process, C: c.bands.process, E: e.bands.process },
    peNull: {
      Rcontrib: peNullScore.parts.result.contrib,
      Pecontrib: peNullScore.parts.exploreProcess.contrib,
      total: peNullScore.total,
    },
  });
}

module.exports = { run };
