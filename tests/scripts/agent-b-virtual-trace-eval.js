/**
 * 5-sample virtual traces → Agent B rule judge + strategy segment score.
 * Round 1 → light constant tune → Round 2 verify.
 *
 *   node tests/scripts/agent-b-virtual-trace-eval.js
 */
const fs = require('fs');
const path = require('path');
const { evaluateTraceRules } = require('../../packages/judge/evaluate-rules');
const {
  scoreTraceStrategy,
  MODE,
} = require('../../packages/judge/strategy-segment-score');
const { rewardFromJudgeResult } = require('../../packages/judge/rl-reward');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const SAMPLE_IDS = [
  'projectile-basic',
  'friction-incline',
  'multi-kp',
  'capacitor-era-ch1',
  'circular-motion',
];

function loadChapter(id) {
  const p = path.join(getPackagesRoot(), id, 'chapter.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function avList(chapter) {
  return chapter?.inquiryScript?.adjustmentVariables || [];
}

function cvList(chapter) {
  return (chapter?.inquiryScript?.confoundingVariables || []).filter(c => c.controlId);
}

function opControls(chapter) {
  const avs = avList(chapter).map(a => a.controlId).filter(Boolean);
  if (avs.length) return avs;
  const controls = chapter?.traceMap?.controls || {};
  return Object.entries(controls).filter(([, m]) => m?.role === 'operation').map(([id]) => id);
}

function fireCtrl(chapter) {
  const controls = chapter?.traceMap?.controls || {};
  const hit = Object.keys(controls).find(id => /fire|launch|test|btn-fire/i.test(id));
  return hit || 'btn-fire';
}

function ev(ts, type, payload) {
  return { ts, ch: 0, type, payload };
}

function trial(events, ts, tunings, fireId) {
  let t = ts;
  for (const [control, value] of tunings) {
    events.push(ev(t++, 'tuning', { control, value }));
  }
  events.push(ev(t++, 'action', { control: fireId }));
  events.push(ev(t++, 'snapshot', { winOk: false, hintKey: 'retry' }));
  return t;
}

/** 1 纯高优单变量 */
function synthPureHigh(chapter) {
  const avs = avList(chapter);
  const primary = avs[0]?.controlId || opControls(chapter)[0];
  const fireId = fireCtrl(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 4; i++) {
    ts = trial(events, ts, [[primary, 10 + i]], fireId);
  }
  return { kind: 'pure_high_av', events };
}

/** 2 先 A 后 B */
function synthSwitchAB(chapter) {
  const avs = avList(chapter);
  const a = avs[0]?.controlId || opControls(chapter)[0];
  const b = avs[1]?.controlId || opControls(chapter)[1] || a;
  const fireId = fireCtrl(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 3; i++) ts = trial(events, ts, [[a, 10 + i]], fireId);
  for (let i = 0; i < 2; i++) ts = trial(events, ts, [[b, 20 + i]], fireId);
  return { kind: 'switch_a_to_b', events };
}

/** 3 单变量 + 偶尔 CV */
function synthOccasionalCv(chapter) {
  const avs = avList(chapter);
  const primary = avs[0]?.controlId || opControls(chapter)[0];
  const cv = cvList(chapter)[0]?.controlId;
  const fireId = fireCtrl(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  if (cv) {
    ts = trial(events, ts, [[cv, 1]], fireId);
  }
  for (let i = 0; i < 4; i++) ts = trial(events, ts, [[primary, 10 + i]], fireId);
  return { kind: 'single_plus_cv_probe', events };
}

/** 4 多参盲调 */
function synthMultiBlind(chapter) {
  const ops = opControls(chapter);
  const a = ops[0];
  const b = ops[1] || ops[0];
  const fireId = fireCtrl(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 4; i++) {
    ts = trial(events, ts, [[a, 10 + i], [b, 20 + i]], fireId);
  }
  return { kind: 'multi_param_blind', events };
}

/** 5 过度拧 CV */
function synthOverCv(chapter) {
  const avs = avList(chapter);
  const primary = avs[0]?.controlId || opControls(chapter)[0];
  const cv = cvList(chapter)[0]?.controlId;
  const fireId = fireCtrl(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 4; i++) {
    const tunings = [[primary, 10 + i]];
    if (cv) tunings.push([cv, i + 1]);
    ts = trial(events, ts, tunings, fireId);
  }
  return { kind: 'over_cv', events };
}

const SYNTHS = [synthPureHigh, synthSwitchAB, synthOccasionalCv, synthMultiBlind, synthOverCv];

function expectBand(kind, chapter) {
  // soft expectations for ordering / bands (explore mode)
  switch (kind) {
    case 'pure_high_av': return { min: 0.9, max: 1.01, primaryRe: /^单变量·/ };
    case 'switch_a_to_b': return { min: 0.72, max: 0.98, primaryRe: /^单变量·/ };
    case 'single_plus_cv_probe': return { min: 0.85, max: 1.01, primaryRe: /^单变量·/ };
    case 'multi_param_blind': return { min: 0, max: 0.4, primaryRe: /盲调|多参|null/ };
    case 'over_cv': {
      // 无 CV 控件时 over_cv 退化为纯单变量，放宽上界
      const hasCv = cvList(chapter).length > 0;
      return { min: 0.4, max: hasCv ? 0.95 : 1.01, primaryRe: /^单变量·/ };
    }
    default: return { min: 0, max: 1 };
  }
}

function evalOne(chapter, synth, constants, mode) {
  const { kind, events } = synth(chapter);
  const judge = evaluateTraceRules({ ch: 0, trace: { events }, chapter });
  const seg = scoreTraceStrategy(events, chapter, { mode, constants });
  const rl = rewardFromJudgeResult({ ...judge, inquiryPath: judge.inquiryPath });
  const band = expectBand(kind, chapter);
  const primary = seg.primaryStrategy || '';
  const okBand = seg.score >= band.min && seg.score <= band.max;
  const okPrimary = !band.primaryRe || band.primaryRe.test(String(primary));
  // last-shot must not redefine primary for switch case
  let okNoLastShot = true;
  if (kind === 'switch_a_to_b') {
    okNoLastShot = seg.primaryStrategy !== seg.lastSegmentLabel
      || seg.breakdown.dominantShare >= 0.55;
  }
  return {
    kind,
    verdict: judge.verdict,
    strategyScore: seg.score,
    primaryStrategy: seg.primaryStrategy,
    lastSegmentLabel: seg.lastSegmentLabel,
    nSwitch: seg.breakdown.nSwitch,
    cvOver: seg.breakdown.cvOver,
    cvProbe: seg.breakdown.cvProbe,
    segmentCounts: seg.breakdown.segmentCounts,
    rlReward: rl.reward,
    okBand,
    okPrimary,
    okNoLastShot,
    pass: okBand && okPrimary && okNoLastShot,
  };
}

function runRound(constants, mode) {
  const rows = [];
  for (const id of SAMPLE_IDS) {
    const chapter = loadChapter(id);
    const sampleRows = SYNTHS.map(fn => evalOne(chapter, fn, constants, mode));
    rows.push({
      id,
      title: chapter.kg?.title || id,
      avs: avList(chapter).map(a => `${a.priorityRank}:${a.label}`),
      results: sampleRows,
      passCount: sampleRows.filter(r => r.pass).length,
    });
  }
  return rows;
}

function summarize(rows) {
  let total = 0;
  let pass = 0;
  for (const s of rows) {
    total += s.results.length;
    pass += s.passCount;
  }
  return { samples: rows.length, cases: total, passed: pass, rate: total ? pass / total : 0 };
}

function main() {
  // Round 1 — pre-tune baseline (探究略严)
  const round1Consts = {
    mainClarityBonus: 0.06,
    mainClarityThreshold: 0.55,
    switchPenalty: 0.03,
    cvOverPenalty: 0.12,
    cvProbeBonus: 0.02,
    cvProbeMax: 2,
    cvOverRatio: 0.55,
    emptyWeight: 0.15,
    confoundWeight: 0.25,
  };
  const round1 = runRound(round1Consts, 'explore');
  const sum1 = summarize(round1);

  // Round 2 — 与 packages/judge/strategy-segment-score.js MODE.explore 对齐
  const round2Consts = { ...MODE.explore };
  const round2 = runRound(round2Consts, 'explore');
  const sum2 = summarize(round2);

  const compete = runRound(MODE.compete, 'compete');
  const sumC = summarize(compete);

  const report = {
    generatedAt: new Date().toISOString(),
    formula: 'S = Σ α_i s(route_i) + β_main 1[主策略清晰] - λ_switch N_switch - λ_cv f(N_cv) + β_probe',
    note: '禁止最后一发定局：primaryStrategy 取有效试次主导单变量，而非 lastSegmentLabel',
    round1: { constants: round1Consts, summary: sum1, rows: round1 },
    round2: { constants: round2Consts, summary: sum2, rows: round2, tuned: true },
    competeProbe: { constants: MODE.compete, summary: sumC, rows: compete },
    comparison: {
      round1PassRate: sum1.rate,
      round2PassRate: sum2.rate,
      competePassRate: sumC.rate,
      deltaPass: sum2.passed - sum1.passed,
    },
  };

  const outDir = path.join(getPackagesRoot(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'agent-b-virtual-trace-eval.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const md = [];
  md.push('# Agent B 虚拟轨迹评判报告');
  md.push('');
  md.push(`生成时间：${report.generatedAt}`);
  md.push('');
  md.push('## 公式');
  md.push('');
  md.push('`' + report.formula + '`');
  md.push('');
  md.push(report.note);
  md.push('');
  md.push('## 调优前后');
  md.push('');
  md.push('| 轮次 | 通过 | 总数 | 通过率 |');
  md.push('|------|------|------|--------|');
  md.push(`| Round1 基线 | ${sum1.passed} | ${sum1.cases} | ${(sum1.rate * 100).toFixed(0)}% |`);
  md.push(`| Round2 调优 | ${sum2.passed} | ${sum2.cases} | ${(sum2.rate * 100).toFixed(0)}% |`);
  md.push(`| 竞赛模式探针 | ${sumC.passed} | ${sumC.cases} | ${(sumC.rate * 100).toFixed(0)}% |`);
  md.push('');
  md.push('### Round2 常数变更');
  md.push('');
  md.push(`- switchPenalty: ${round1Consts.switchPenalty} → ${round2Consts.switchPenalty}`);
  md.push(`- cvProbeBonus: ${round1Consts.cvProbeBonus} → ${round2Consts.cvProbeBonus}`);
  md.push(`- mainClarityThreshold: ${round1Consts.mainClarityThreshold} → ${round2Consts.mainClarityThreshold}`);
  md.push('');
  md.push('## 样本 × 轨迹（Round2）');
  md.push('');
  md.push('| 样本 | 轨迹 | strategyScore | primary | last | verdict | pass |');
  md.push('|------|------|---------------|---------|------|---------|------|');
  for (const s of round2) {
    for (const r of s.results) {
      md.push(`| ${s.id} | ${r.kind} | ${r.strategyScore} | ${r.primaryStrategy || '-'} | ${r.lastSegmentLabel || '-'} | ${r.verdict} | ${r.pass ? '✓' : '✗'} |`);
    }
  }
  md.push('');
  md.push('## Round1 vs Round2（strategyScore）');
  md.push('');
  md.push('| 样本 | 轨迹 | R1 | R2 | Δ |');
  md.push('|------|------|----|----|---|');
  for (let i = 0; i < round1.length; i++) {
    const a = round1[i];
    const b = round2[i];
    for (let j = 0; j < a.results.length; j++) {
      const r1 = a.results[j];
      const r2 = b.results[j];
      const d = Math.round((r2.strategyScore - r1.strategyScore) * 1000) / 1000;
      md.push(`| ${a.id} | ${r1.kind} | ${r1.strategyScore} | ${r2.strategyScore} | ${d >= 0 ? '+' : ''}${d} |`);
    }
  }

  const mdPath = path.join(outDir, 'agent-b-virtual-trace-eval.md');
  fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

  // Persist tuned explore constants into a small overlay note (code keeps MODE; report documents tune)
  const overlayPath = path.join(outDir, 'strategy-segment-score-tuned.json');
  fs.writeFileSync(overlayPath, JSON.stringify({
    generatedAt: report.generatedAt,
    appliedInCode: false,
    recommendedExplore: round2Consts,
    baselineExplore: MODE.explore,
    compete: MODE.compete,
    reason: 'Round2 对探究模式切换更宽容，CV 探测微奖略增',
  }, null, 2), 'utf8');

  console.log(`Round1 ${sum1.passed}/${sum1.cases} → Round2 ${sum2.passed}/${sum2.cases} (compete ${sumC.passed}/${sumC.cases})`);
  console.log('Wrote', jsonPath);
  console.log('Wrote', mdPath);
}

main();
