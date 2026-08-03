/**
 * 全量 runtime 包 × 策略换向合成轨迹 → switchKind 分布
 *
 *   node tests/scripts/strategy-switch-full-dist.js
 *
 * 输出：
 *   data/runtime/packages/reports/strategy-switch-full-dist.json
 *   data/runtime/packages/reports/strategy-switch-full-dist.md
 */
const fs = require('fs');
const path = require('path');
const { scoreTraceStrategy } = require('../../packages/judge/strategy-segment-score');
const { evaluateTraceRules } = require('../../packages/judge/evaluate-rules');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const {
  listRuntimePackages,
  usableAvs,
  fireId,
  synthStable,
  synthRedirect,
  synthConverge,
  synthThrash,
  EXPECTED_KIND,
} = require('../regression/suites/parts/strategy-switch-awareness');

function loadChapter(id) {
  const p = path.join(getPackagesRoot(), id, 'chapter.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function cvList(chapter) {
  return (chapter?.inquiryScript?.confoundingVariables || []).filter(c => c && c.controlId);
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

/** 单 AV + CV：1–2 发拧 CV 后稳定主 AV（可选 converge 探针） */
function synthConvergeWithCv(chapter) {
  const avs = usableAvs(chapter);
  const cvs = cvList(chapter);
  const a = avs[0]?.controlId;
  const cv = cvs[0]?.controlId;
  if (!a || !cv) return null;
  const fid = fireId(chapter);
  const events = [ev(1, 'puzzle_open', {})];
  let ts = 10;
  for (let i = 0; i < 2; i++) {
    ts = trial(events, ts, [[a, 10 + i], [cv, 1 + i]], fid, false);
  }
  for (let i = 0; i < 4; i++) ts = trial(events, ts, [[a, 30 + i]], fid, i === 3);
  return { pattern: 'S_converge_cv', events };
}

function bump(map, key, n = 1) {
  map[key] = (map[key] || 0) + n;
}

function evalSynth(chapter, synth, mode = 'explore') {
  const seg = scoreTraceStrategy(synth.events, chapter, { mode });
  const kind = seg.switchKind || seg.breakdown?.switchKind || 'unknown';
  let metricsOk = false;
  let judgeErr = null;
  try {
    const judged = evaluateTraceRules({
      ch: 0,
      chapter,
      trace: { events: synth.events },
    });
    const m = judged?.inquiryPath?.metrics || {};
    metricsOk = m.switchKind === kind
      && judged?.inquiryPath?.strategySegmentScore?.switchKind === kind;
  } catch (err) {
    judgeErr = err.message;
  }
  const expected = EXPECTED_KIND[synth.pattern] || null;
  return {
    pattern: synth.pattern,
    switchKind: kind,
    expected,
    kindMatch: expected ? kind === expected : null,
    score: seg.score,
    nSwitch: seg.breakdown?.nSwitch ?? null,
    nBlockSwitch: seg.breakdown?.nBlockSwitch ?? null,
    primaryStrategy: seg.primaryStrategy || null,
    metricsOk,
    judgeErr,
  };
}

function patternsFor(chapter) {
  const avs = usableAvs(chapter);
  const out = [];
  if (avs.length >= 2) {
    out.push(synthStable(chapter));
    out.push(synthRedirect(chapter));
    out.push(synthConverge(chapter));
    out.push(synthThrash(chapter));
  } else if (avs.length === 1) {
    out.push(synthStable(chapter));
    const cvConv = synthConvergeWithCv(chapter);
    if (cvConv) out.push(cvConv);
  }
  return out;
}

function main() {
  const packages = listRuntimePackages();
  const byPackage = [];
  const overall = {};
  const byPatternOverall = {};
  const outliers = [];
  let multi = 0;
  let single = 0;
  let zero = 0;

  for (const pkgId of packages) {
    const chapter = loadChapter(pkgId);
    const avs = usableAvs(chapter);
    const cvs = cvList(chapter);
    const avCount = avs.length;
    if (avCount >= 2) multi += 1;
    else if (avCount === 1) single += 1;
    else zero += 1;

    const synths = patternsFor(chapter);
    const results = synths.map(s => evalSynth(chapter, s));
    const kindHist = {};
    for (const r of results) {
      bump(kindHist, r.switchKind);
      bump(overall, r.switchKind);
      if (!byPatternOverall[r.pattern]) byPatternOverall[r.pattern] = {};
      bump(byPatternOverall[r.pattern], r.switchKind);
      if (r.kindMatch === false) {
        outliers.push({
          packageId: pkgId,
          pattern: r.pattern,
          switchKind: r.switchKind,
          expected: r.expected,
          score: r.score,
          reason: 'kind_mismatch',
        });
      }
      if (r.metricsOk === false) {
        outliers.push({
          packageId: pkgId,
          pattern: r.pattern,
          switchKind: r.switchKind,
          reason: 'metrics_not_wired',
          judgeErr: r.judgeErr,
        });
      }
    }

    // redirect > thrash（同长度多 AV 才有）
    const redir = results.find(r => r.pattern === 'S_redirect');
    const thrash = results.find(r => r.pattern === 'S_thrash');
    let redirectGtThrash = null;
    if (redir && thrash) {
      redirectGtThrash = redir.score > thrash.score;
      if (!redirectGtThrash) {
        outliers.push({
          packageId: pkgId,
          pattern: 'S_redirect/S_thrash',
          switchKind: `${redir.switchKind}/${thrash.switchKind}`,
          score: `${redir.score}/${thrash.score}`,
          reason: 'redirect_not_gt_thrash',
        });
      }
    }

    byPackage.push({
      packageId: pkgId,
      title: chapter.kg?.title || chapter.title || pkgId,
      avCount,
      cvCount: cvs.length,
      fireId: fireId(chapter),
      avLabels: avs.map(a => a.label),
      patterns: results,
      switchKindHist: kindHist,
      redirectGtThrash,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      packages: packages.length,
      multiAv: multi,
      singleAv: single,
      zeroAv: zero,
      totalTraces: byPackage.reduce((n, p) => n + p.patterns.length, 0),
      overallSwitchKind: overall,
      byPattern: byPatternOverall,
      outlierCount: outliers.length,
    },
    outliers,
    packages: byPackage,
  };

  const outDir = path.join(getPackagesRoot(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'strategy-switch-full-dist.json');
  const mdPath = path.join(outDir, 'strategy-switch-full-dist.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const md = [];
  md.push('# Strategy switchKind 全量分布');
  md.push('');
  md.push(`生成时间：${report.generatedAt}`);
  md.push('');
  md.push('## 摘要');
  md.push('');
  md.push(`- 包数：${packages.length}（多 AV ${multi} / 单 AV ${single} / 零 AV ${zero}）`);
  md.push(`- 合成轨迹数：${report.summary.totalTraces}`);
  md.push(`- 异常数：${outliers.length}`);
  md.push('');
  md.push('### 总体 switchKind 直方图');
  md.push('');
  md.push('| switchKind | count |');
  md.push('|------------|------:|');
  for (const [k, v] of Object.entries(overall).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${k} | ${v} |`);
  }
  md.push('');
  md.push('### 按合成模式');
  md.push('');
  md.push('| pattern | switchKind 分布 |');
  md.push('|---------|-----------------|');
  for (const [pat, hist] of Object.entries(byPatternOverall)) {
    const parts = Object.entries(hist).map(([k, v]) => `${k}:${v}`).join(', ');
    md.push(`| ${pat} | ${parts} |`);
  }
  md.push('');
  md.push('## 分包');
  md.push('');
  md.push('| 包 | AV | 模式→kind | redirect>thrash |');
  md.push('|----|----|-----------|-----------------|');
  for (const p of byPackage) {
    const cells = p.patterns.map(r => `${r.pattern}→${r.switchKind}`).join('; ') || '(none)';
    const rgt = p.redirectGtThrash == null ? '—' : (p.redirectGtThrash ? '✓' : '✗');
    md.push(`| ${p.packageId} | ${p.avCount} | ${cells} | ${rgt} |`);
  }
  if (outliers.length) {
    md.push('');
    md.push('## 异常 / 离群');
    md.push('');
    md.push('| 包 | pattern | kind | reason |');
    md.push('|----|---------|------|--------|');
    for (const o of outliers) {
      md.push(`| ${o.packageId} | ${o.pattern} | ${o.switchKind || '-'} | ${o.reason} |`);
    }
  }
  md.push('');
  fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

  console.log(`packages=${packages.length} multi=${multi} single=${single} traces=${report.summary.totalTraces}`);
  console.log('overall switchKind:', JSON.stringify(overall));
  console.log('outliers:', outliers.length);
  console.log('Wrote', jsonPath);
  console.log('Wrote', mdPath);
}

main();
