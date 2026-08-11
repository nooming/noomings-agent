/**
 * 一次性：写入约 30 名「模拟XX」同学的轨迹，供教师端人多 UI 压测。
 * 不覆盖现有真实学生文件；文件名 sess-mock-ui-{studentIndex}-{round}.json。
 *
 *   node tests/scripts/seed-mock-classroom-students.js
 *   node tests/scripts/seed-mock-classroom-students.js --clean   # 仅删除 mock 文件
 */
const fs = require('fs');
const path = require('path');
const { getTracesRoot } = require('../../packages/platform/paths');
const { listTraceStudents } = require('../../packages/platform/trace-store');

const STUDENT_COUNT = 30;
const CATALOGS = [
  { catalogId: 'demo-capacitor-confound-ui', graphId: 'capacitor-confound-ui' },
  { catalogId: 'demo-capacitor-era-ch1', graphId: 'capacitor-era-ch1' },
  { catalogId: 'demo-multi-kp', graphId: 'multi-kp' },
  { catalogId: 'demo-projectile-basic', graphId: 'projectile-basic' },
  { catalogId: 'demo-pendulum-clock', graphId: 'pendulum-clock' },
  { catalogId: 'demo-heat-conduction', graphId: 'heat-conduction' },
];

const OUTCOMES = ['pass', 'exhausted_fail', 'incomplete'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function mockFiles(root) {
  return fs.readdirSync(root).filter(f => /^sess-mock-ui-\d+-\d+\.json$/.test(f));
}

function cleanMock(root) {
  const files = mockFiles(root);
  for (const f of files) fs.unlinkSync(path.join(root, f));
  return files.length;
}

function buildEvents(outcome, seed) {
  const events = [
    { ts: 1, ch: 0, type: 'puzzle_open', payload: {} },
    { ts: 2, ch: 0, type: 'phase_change', payload: { phase: 'explore' } },
    { ts: 8, ch: 0, type: 'tuning', payload: { control: 'explore-noise', value: 1 + (seed % 3) } },
    { ts: 9, ch: 0, type: 'action', payload: { control: 'btn-fire' } },
    { ts: 10, ch: 0, type: 'phase_change', payload: { phase: 'challenge' } },
  ];
  let ts = 11;
  const trials = 2 + (seed % 4);
  for (let i = 0; i < trials; i++) {
    const val = 8 + i + (seed % 5);
    events.push({ ts: ts++, ch: 0, type: 'tuning', payload: { control: 's-distance', value: val } });
    events.push({ ts: ts++, ch: 0, type: 'action', payload: { control: 'testBtn' } });
    const winOk = outcome === 'pass' && i === trials - 1;
    events.push({
      ts: ts++,
      ch: 0,
      type: 'snapshot',
      payload: { winOk, hintKey: winOk ? 'ok' : 'retry' },
    });
  }
  if (outcome === 'pass') {
    events.push({ ts: ts++, ch: 0, type: 'win', payload: { winOk: true } });
  } else if (outcome === 'exhausted_fail') {
    events.push({ ts: ts++, ch: 0, type: 'attempts_exhausted', payload: {} });
  }
  return events;
}

function abilityScoreV3(outcome, seed) {
  if (outcome === 'incomplete') {
    return {
      version: 3,
      total: null,
      pending: true,
      weights: { R: 0.3, Pe: 0.25, Pc: 0.25, E: 0.2 },
      parts: {
        result: { raw: null, contrib: 0, note: '未完成', progress: 0.4 },
        exploreProcess: { raw: 40, contrib: 10, strategyScore: 0.4, primary: '探索·粗调', switchKind: 'stable' },
        challengeProcess: { raw: null, contrib: 0, strategyScore: null, primary: null, switchKind: null },
        efficiency: { raw: null, contrib: 0, processGate: false, challengeTrials: 0, exploreTrials: 1 },
        attribution: { raw: 0, contrib: 0, attribution: null, aligned: false, note: '无归因事件' },
      },
      bands: { process: '部分清楚', result: '未完成' },
      labelsShort: { pathExplore: '探究·试探', pathChallenge: null },
      computedAt: new Date().toISOString(),
    };
  }
  const pass = outcome === 'pass';
  const total = pass ? 55 + (seed % 40) : 20 + (seed % 25);
  const processBand = pass ? (total >= 75 ? '清楚' : '部分清楚') : (total >= 40 ? '部分清楚' : '模糊');
  return {
    version: 3,
    total,
    pending: false,
    weights: { R: 0.3, Pe: 0.25, Pc: 0.25, E: 0.2 },
    parts: {
      result: {
        raw: pass ? 100 : 20,
        contrib: pass ? 30 : 6,
        note: pass ? '过关' : '机会用尽',
        progress: pass ? 1 : 0.2,
      },
      exploreProcess: {
        raw: 50 + (seed % 40),
        contrib: 12.5 + (seed % 10) * 0.5,
        strategyScore: 0.5 + (seed % 5) * 0.1,
        primary: '探究·间距',
        switchKind: 'stable',
      },
      challengeProcess: {
        raw: pass ? 70 + (seed % 30) : 30 + (seed % 30),
        contrib: pass ? 18 : 8,
        strategyScore: pass ? 0.8 : 0.3,
        primary: '单变量·极板间距',
        switchKind: seed % 3 === 0 ? 'mixed' : 'stable',
        cvOver: seed % 5 === 0,
        trap: false,
      },
      efficiency: {
        raw: pass ? 60 + (seed % 35) : 25 + (seed % 30),
        contrib: pass ? 12 : 5,
        processGate: pass,
        challengeTrials: 2 + (seed % 4),
        exploreTrials: 1,
        gateReasons: { gateScore: pass, cvOk: true, singleTrialTrap: false },
      },
      attribution: {
        raw: seed % 2 === 0 ? 100 : 0,
        contrib: seed % 2 === 0 ? 5 : 0,
        attribution: seed % 2 === 0 ? 'distance' : null,
        aligned: seed % 2 === 0,
        note: seed % 2 === 0 ? '归因对齐' : '无归因事件',
      },
    },
    bands: {
      process: processBand,
      result: pass ? '达标' : '未达标',
    },
    labelsShort: {
      pathExplore: '探究·试探',
      pathChallenge: pass ? '竞赛·单变量' : '竞赛·发散',
    },
    computedAt: new Date().toISOString(),
  };
}

function judgeResult(outcome, label, seed) {
  const pass = outcome === 'pass';
  const verdict = pass ? 'pass' : (outcome === 'exhausted_fail' ? 'exhausted_fail' : 'incomplete');
  const summary = pass
    ? `${label} 在竞赛段以单变量调节完成过关（模拟数据）。`
    : outcome === 'exhausted_fail'
      ? `${label} 次数用尽仍未过关（模拟数据）。`
      : `${label} 会话未终局（模拟数据）。`;
  return {
    mode: 'rule',
    verdict,
    strengths: pass
      ? ['单变量控制较稳定', '试错节奏清楚']
      : ['有进入竞赛段'],
    gaps: pass
      ? ['覆盖维度偏少']
      : ['策略发散', '未形成可复现路径'],
    dtAlignment: [],
    inquiryPath: {
      eventCount: 12 + (seed % 8),
      chaptersTouched: [0],
      pathSteps: ['O1'],
      irrelevantTouches: [],
      misconceptionTouches: [],
      retryHints: pass ? ['retry', 'ok'] : ['retry'],
      strategyRouteGuess: pass ? 'main' : 'trap',
      metrics: {
        singleVariableRate: pass ? 0.9 : 0.4,
        primaryStrategy: pass ? '单变量·极板间距' : '多参混调',
        playMode: 'compete',
      },
    },
    teacherSummary: {
      level: pass ? 3 : 1,
      summary,
      strengths: pass ? ['单变量控制较稳定'] : ['有进入竞赛段'],
      gaps: pass ? ['覆盖维度偏少'] : ['策略发散'],
      suggestion: pass ? '可再切换面积参数验证。' : '建议固定单变量后逐步逼近目标。',
    },
    comment: summary,
    judgedAt: new Date().toISOString(),
  };
}

function buildSession({ studentIndex, round, totalRounds, nowBase }) {
  const label = `模拟${pad2(studentIndex)}`;
  const sessionId = `sess-mock-ui-${pad2(studentIndex)}-${round}`;
  const seed = studentIndex * 17 + round * 3;
  const cat = CATALOGS[(studentIndex + round) % CATALOGS.length];
  // 混合终局：约 40% pass / 30% exhausted / 30% incomplete
  const outcome = OUTCOMES[seed % 3 === 0 ? 0 : (seed % 3 === 1 ? 1 : 2)];
  // 约 2/3 已评判（含 abilityScore v3）；未评判的 incomplete 更像「刚离开」
  const withJudge = !(outcome === 'incomplete' && seed % 5 === 0);

  const startedMs = nowBase - (STUDENT_COUNT - studentIndex) * 3600_000 - round * 900_000;
  const startedAt = new Date(startedMs).toISOString();
  const updatedAt = new Date(startedMs + 120_000 + seed * 1000).toISOString();
  const events = buildEvents(outcome, seed);

  const row = {
    sessionId,
    catalogId: cat.catalogId,
    graphId: cat.graphId,
    studentLabel: label,
    studentId: null,
    taskCode: cat.catalogId,
    ch: 0,
    game: cat.catalogId,
    traceVersion: 1,
    startedAt,
    updatedAt,
    eventCount: events.length,
    events,
    currentPhase: outcome === 'incomplete' ? 'challenge' : 'challenge',
    sawPhaseChange: true,
    terminalOutcome: outcome,
  };

  if (withJudge) {
    row.judgeResult = judgeResult(outcome, label, seed);
    row.judgedAt = updatedAt;
    row.abilityScore = abilityScoreV3(outcome, seed);
    row.abilityScoreComputedAt = updatedAt;
  }

  // 多局学生里最后一局时间更新，便于列表排序靠前
  if (round === totalRounds) {
    row.updatedAt = new Date(nowBase - studentIndex * 60_000).toISOString();
    if (row.judgedAt) row.judgedAt = row.updatedAt;
  }

  return row;
}

function main() {
  const root = getTracesRoot();
  fs.mkdirSync(root, { recursive: true });

  if (process.argv.includes('--clean')) {
    const n = cleanMock(root);
    console.log(`cleaned ${n} mock files under ${root}`);
    return;
  }

  // 幂等：先清旧 mock，再写入
  const removed = cleanMock(root);
  if (removed) console.log(`removed previous mock files: ${removed}`);

  const nowBase = Date.now();
  let written = 0;
  const byOutcome = { pass: 0, exhausted_fail: 0, incomplete: 0 };
  let judged = 0;

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const rounds = 2 + ((i * 3) % 4); // 2..5
    for (let r = 1; r <= rounds; r++) {
      const row = buildSession({ studentIndex: i, round: r, totalRounds: rounds, nowBase });
      byOutcome[row.terminalOutcome] = (byOutcome[row.terminalOutcome] || 0) + 1;
      if (row.judgeResult) judged += 1;
      const file = path.join(root, `${row.sessionId}.json`);
      fs.writeFileSync(file, JSON.stringify(row, null, 2), 'utf8');
      written += 1;
    }
  }

  const students = listTraceStudents({ limit: 100 });
  const mockStudents = students.filter(s => /^模拟\d+$/.test(s.studentLabel || s.studentKey));
  console.log(JSON.stringify({
    tracesRoot: root,
    studentsSeeded: STUDENT_COUNT,
    sessionsWritten: written,
    byOutcome,
    judgedSessions: judged,
    listTraceStudentsTotal: students.length,
    mockStudentsVisible: mockStudents.length,
    sampleLabels: mockStudents.slice(0, 5).map(s => s.studentLabel),
  }, null, 2));
}

main();
