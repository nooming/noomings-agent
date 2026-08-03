/**
 * Strategy-switch awareness：扫描 runtime 全包
 * 多 AV（≥2 usable controlId）→ 四类合成轨迹：switchKind + redirect > thrash
 * 单 AV → 不失败，仅 stable 探针 + 跳过说明
 */
const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const {
  scoreTraceStrategy,
  LABEL,
} = require('../../../../packages/judge/strategy-segment-score');
const { evaluateTraceRules } = require('../../../../packages/judge/evaluate-rules');
const { getPackagesRoot } = require('../../../../packages/shared/data-paths');

/** 已知可文档化的例外：packageId → { pattern → allowedKinds[] } */
const KIND_EXCEPTIONS = {};

function listRuntimePackages() {
  const root = getPackagesRoot();
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'chapter.json')))
    .map(d => d.name)
    .sort();
}

function loadChapter(id) {
  const p = path.join(getPackagesRoot(), id, 'chapter.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function usableAvs(chapter) {
  return (chapter?.inquiryScript?.adjustmentVariables || []).filter(a => a && a.controlId);
}

function avPair(chapter) {
  const avs = usableAvs(chapter);
  const a = avs[0]?.controlId;
  const b = avs[1]?.controlId || avs.find(x => x.controlId && x.controlId !== a)?.controlId;
  assert(a && b, `${chapter?.id || 'chapter'} needs ≥2 AVs`);
  return { a, b, aLabel: `单变量·${avs[0].label}`, bLabel: `单变量·${avs[1].label}` };
}

function fireId(chapter) {
  const controls = chapter?.traceMap?.controls || {};
  const hit = Object.keys(controls).find(id =>
    /fire|launch|test|btn-fire|btn-test|start|run|measure/i.test(id),
  );
  if (hit) return hit;
  // 回退：role=action / 发射类 label
  const byRole = Object.entries(controls).find(([, m]) =>
    m?.role === 'action' || /发射|测试|开火|启动/i.test(m?.label || ''),
  );
  return byRole?.[0] || 'btn-fire';
}

function ev(ts, type, payload) {
  return { ts, ch: 0, type, payload };
}

function trial(events, ts, tunings, fid, winOk) {
  let t = ts;
  for (const [control, value] of tunings) {
    events.push(ev(t++, 'tuning', { control, value }));
  }
  events.push(ev(t++, 'action', { control: fid }));
  events.push(ev(t++, 'snapshot', { winOk: !!winOk, hintKey: winOk ? 'ok' : 'retry' }));
  if (winOk) events.push(ev(t++, 'win', { ok: true }));
  return t;
}

/** S_stable：仅主 AV 多发（单/多 AV 均可用） */
function synthStable(chapter) {
  const avs = usableAvs(chapter);
  const a = avs[0]?.controlId;
  assert(a, `${chapter?.id || 'chapter'} needs ≥1 AV for stable`);
  const fid = fireId(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 6; i++) ts = trial(events, ts, [[a, 10 + i]], fid, i === 5);
  return { pattern: 'S_stable', events };
}

/** S_redirect：3×A 再 3×B */
function synthRedirect(chapter) {
  const { a, b } = avPair(chapter);
  const fid = fireId(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 3; i++) ts = trial(events, ts, [[a, 10 + i]], fid, false);
  for (let i = 0; i < 3; i++) ts = trial(events, ts, [[b, 20 + i]], fid, i === 2);
  return { pattern: 'S_redirect', events };
}

/** S_converge：2×陷阱再 4×主 AV */
function synthConverge(chapter) {
  const { a, b } = avPair(chapter);
  const fid = fireId(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 2; i++) {
    ts = trial(events, ts, [[a, 10 + i], [b, 20 + i]], fid, false);
  }
  for (let i = 0; i < 4; i++) ts = trial(events, ts, [[a, 30 + i]], fid, i === 3);
  return { pattern: 'S_converge', events };
}

/** S_thrash：每发交替 A/B */
function synthThrash(chapter) {
  const { a, b } = avPair(chapter);
  const fid = fireId(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 6; i++) {
    const c = i % 2 === 0 ? a : b;
    ts = trial(events, ts, [[c, 10 + i]], fid, false);
  }
  return { pattern: 'S_thrash', events };
}

const EXPECTED_KIND = {
  S_stable: 'stable',
  S_redirect: 'focused_redirect',
  S_converge: 'explore_converge',
  S_thrash: 'thrash',
};

function assertKind(pkgId, pattern, kind) {
  const expected = EXPECTED_KIND[pattern];
  const allowed = KIND_EXCEPTIONS[pkgId]?.[pattern];
  if (allowed && allowed.includes(kind)) return;
  assert(kind === expected, `${pkgId}/${pattern} kind=${kind} expected=${expected}`);
}

function assertWired(pkgId, pattern, seg, events, chapter, kind) {
  assert(
    Array.isArray(seg.strategySequence) || Array.isArray(seg.breakdown?.strategySequence),
    `${pkgId}/${pattern} has sequence`,
  );
  const judged = evaluateTraceRules({
    ch: 0,
    chapter,
    trace: { events },
  });
  const m = judged?.inquiryPath?.metrics || {};
  assert(m.switchKind === kind, `${pkgId}/${pattern} metrics.switchKind=${m.switchKind}`);
  assert(m.nSwitch === seg.breakdown.nSwitch, `${pkgId}/${pattern} metrics.nSwitch`);
  assert(m.nBlockSwitch === seg.breakdown.nBlockSwitch, `${pkgId}/${pattern} metrics.nBlockSwitch`);
  assert(
    judged?.inquiryPath?.strategySegmentScore?.switchKind === kind,
    `${pkgId}/${pattern} strategySegmentScore.switchKind`,
  );
  return judged;
}

function runMultiAv(pkgId, chapter, rows, notes) {
  const synths = [
    synthStable(chapter),
    synthRedirect(chapter),
    synthConverge(chapter),
    synthThrash(chapter),
  ];
  const byPattern = {};

  for (const s of synths) {
    const seg = scoreTraceStrategy(s.events, chapter, { mode: 'explore' });
    const kind = seg.switchKind || seg.breakdown?.switchKind;
    assertKind(pkgId, s.pattern, kind);

    if (s.pattern === 'S_redirect' || s.pattern === 'S_thrash' || s.pattern === 'S_stable') {
      assert(seg.primaryStrategy !== LABEL.trap, `${pkgId}/${s.pattern} not trap`);
    }
    if (s.pattern === 'S_converge') {
      assert(seg.breakdown.segmentCounts[LABEL.trap] >= 2, `${pkgId} converge has early trap`);
      assert(/^单变量·/.test(seg.primaryStrategy || ''), `${pkgId} converge primary single-var`);
    }

    assertWired(pkgId, s.pattern, seg, s.events, chapter, kind);

    byPattern[s.pattern] = seg;
    rows.push({
      packageId: pkgId,
      pattern: s.pattern,
      switchKind: kind,
      score: seg.score,
      nSwitch: seg.breakdown.nSwitch,
      nBlockSwitch: seg.breakdown.nBlockSwitch,
      primary: seg.primaryStrategy,
    });
  }

  assert(
    byPattern.S_redirect.score > byPattern.S_thrash.score,
    `${pkgId}: redirect ${byPattern.S_redirect.score} > thrash ${byPattern.S_thrash.score}`,
  );
  assert(
    byPattern.S_stable.score >= byPattern.S_redirect.score,
    `${pkgId}: stable >= redirect`,
  );
  notes.push(`${pkgId}: multi-AV (${usableAvs(chapter).length}) ok`);
}

function runSingleAv(pkgId, chapter, rows, notes) {
  const avs = usableAvs(chapter);
  if (!avs.length) {
    notes.push(`${pkgId}: skip (0 usable AV)`);
    return;
  }
  const s = synthStable(chapter);
  const seg = scoreTraceStrategy(s.events, chapter, { mode: 'explore' });
  const kind = seg.switchKind || seg.breakdown?.switchKind;
  assertKind(pkgId, 'S_stable', kind);
  assertWired(pkgId, 'S_stable', seg, s.events, chapter, kind);
  rows.push({
    packageId: pkgId,
    pattern: s.pattern,
    switchKind: kind,
    score: seg.score,
    nSwitch: seg.breakdown.nSwitch,
    nBlockSwitch: seg.breakdown.nBlockSwitch,
    primary: seg.primaryStrategy,
  });
  notes.push(`${pkgId}: single-AV — only stable asserted (skipped redirect/converge/thrash)`);
}

function run() {
  const rows = [];
  const notes = [];
  const packages = listRuntimePackages();
  let multi = 0;
  let single = 0;

  for (const pkgId of packages) {
    const chapter = loadChapter(pkgId);
    const avs = usableAvs(chapter);
    if (avs.length >= 2) {
      multi += 1;
      runMultiAv(pkgId, chapter, rows, notes);
    } else {
      single += 1;
      runSingleAv(pkgId, chapter, rows, notes);
    }
  }

  console.log('strategy-switch-awareness rows:');
  for (const r of rows) {
    console.log(
      `  ${r.packageId}\t${r.pattern}\t${r.switchKind}\tscore=${r.score}\tnSwitch=${r.nSwitch}\tnBlock=${r.nBlockSwitch}\t${r.primary}`,
    );
  }
  console.log('strategy-switch-awareness notes:');
  for (const n of notes) console.log(`  ${n}`);
  console.log(
    `strategy-switch-awareness-check: ok (packages=${packages.length} multi=${multi} single=${single} rows=${rows.length})`,
  );
  return { rows, notes, packages, multi, single };
}

module.exports = {
  run,
  listRuntimePackages,
  usableAvs,
  fireId,
  synthStable,
  synthRedirect,
  synthConverge,
  synthThrash,
  EXPECTED_KIND,
};
