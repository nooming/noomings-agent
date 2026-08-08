/** CLI: node tests/demos/batch-judge-eval.js [--id <id>] [--dry-run] */
const fs = require('fs');
const path = require('path');
const { evaluateTraceRules } = require('../../packages/judge/evaluate-rules');
const {
  synthFromDtOutline,
  synthTrapTrace,
  synthSingleVarMain,
} = require('../../packages/generate/trace-synth');
const { loadChapter } = require('../lib/fixture-loader');
const { loadAllSamples } = require('../lib/html-samples-manifest');
const {
  getPackagesRoot,
  getJudgeFixturesPath,
  loadChapterForSample,
} = require('../../packages/shared/data-paths');

const FIXTURES = getJudgeFixturesPath();
const REPORTS = path.join(getPackagesRoot(), 'reports');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function loadManifestSamples() {
  const data = loadAllSamples();
  const filterId = argValue('--id');
  let samples = data.samples || [];
  if (filterId) samples = samples.filter(s => s.id === filterId);
  return samples;
}

function resolveFixtureChapter(fx) {
  if (fx.chapter) return fx.chapter.chapter || fx.chapter;
  const ref = fx.chapterRef;
  if (!ref) return null;
  if (ref.packageId) return loadChapterForSample(ref.packageId);
  if (ref.bundle && ref.key) {
    const entry = loadChapter(ref.bundle, ref.key);
    return entry.chapter || entry;
  }
  return null;
}

function synthTraces(chapter) {
  const tagged = { ...chapter, _ch: 0 };
  return {
    goodTrace: synthFromDtOutline(tagged),
    trapTrace: synthTrapTrace(tagged),
    singleVarMain: synthSingleVarMain(tagged),
  };
}

function judgeTrace(chapter, trace) {
  return evaluateTraceRules({
    ch: 0,
    trace: { events: trace.events },
    chapter,
    graph: { mapping: chapter.mapping },
  });
}

function matchVerdict(actual, expected, traceKey) {
  if (traceKey === 'trapTrace' && expected === 'in_progress') {
    return actual === 'in_progress' || actual === 'learning';
  }
  return actual === expected;
}

function evalSample(sample, chapter) {
  if (!chapter) {
    return { id: sample.id, skipped: true, reason: 'no chapter', matchRate: 0, cases: [] };
  }
  const expect = sample.judgeExpect || {};
  const traces = synthTraces(chapter);
  const cases = [];
  for (const [key, trace] of Object.entries(traces)) {
    if (trace.skipped) {
      cases.push({ key, skipped: true });
      continue;
    }
    const result = judgeTrace(chapter, trace);
    const expected = expect[key];
    const ok = expected ? matchVerdict(result.verdict, expected, key) : null;
    cases.push({
      key,
      expected,
      actual: result.verdict,
      ok,
    });
  }
  const scored = cases.filter(c => c.ok != null);
  const matchRate = scored.length ? scored.filter(c => c.ok).length / scored.length : 0;
  return { id: sample.id, skipped: false, matchRate, cases };
}

function evalFixtures() {
  const data = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  return (data.fixtures || []).map(fx => {
    const sample = { id: fx.id, judgeExpect: fx.judgeExpect };
    return evalSample(sample, resolveFixtureChapter(fx));
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeReports(rows) {
  ensureDir(REPORTS);
  const scored = rows.filter(r => !r.skipped);
  const totalCases = scored.reduce((n, r) => n + r.cases.filter(c => c.ok != null).length, 0);
  const okCases = scored.reduce((n, r) => n + r.cases.filter(c => c.ok).length, 0);
  const summary = {
    generatedAt: new Date().toISOString(),
    samples: rows.length,
    scored: scored.length,
    verdictMatchRate: totalCases ? okCases / totalCases : 0,
    rows,
  };
  fs.writeFileSync(path.join(REPORTS, 'agent-b-report.json'), JSON.stringify(summary, null, 2), 'utf8');

  const md = [
    '# Agent B 评判验证报告',
    '',
    `生成时间：${summary.generatedAt}`,
    '',
    `| 指标 | 值 |`,
    `|------|-----|`,
    `| 样本数 | ${summary.samples} |`,
    `| 可评判 | ${summary.scored} |`,
    `| verdict 一致率 | ${(summary.verdictMatchRate * 100).toFixed(0)}% |`,
    '',
    '| id | good | trap | singleVar | 一致率 |',
    '|----|------|------|-----------|--------|',
    ...rows.map(r => {
      const fmt = k => {
        const c = r.cases?.find(x => x.key === k);
        if (!c || c.skipped) return '—';
        return c.ok ? '✓' : `✗(${c.actual})`;
      };
      return `| ${r.id} | ${fmt('goodTrace')} | ${fmt('trapTrace')} | ${fmt('singleVarMain')} | ${r.skipped ? '—' : `${(r.matchRate * 100).toFixed(0)}%`} |`;
    }),
  ].join('\n');
  fs.writeFileSync(path.join(REPORTS, 'agent-b-report.md'), md, 'utf8');
  console.log(`Reports: ${REPORTS}/agent-b-report.{json,md}`);
}

function main() {
  const useFixturesOnly = process.argv.includes('--fixtures-only');
  let rows;
  if (useFixturesOnly) {
    rows = evalFixtures();
  } else {
    const samples = loadManifestSamples();
    rows = samples.map(s => evalSample(s, loadChapterForSample(s.id)));
    const fixtureRows = evalFixtures();
    rows = [...fixtureRows, ...rows.filter(r => !fixtureRows.some(f => f.id === r.id))];
  }

  console.log(`batch-judge-eval: ${rows.length} sample(s)`);
  for (const r of rows) {
    if (r.skipped) {
      console.log(`  ${r.id}: SKIP (${r.reason})`);
    } else {
      const ok = r.cases.filter(c => c.ok).length;
      const total = r.cases.filter(c => c.ok != null).length;
      console.log(`  ${r.id}: ${ok}/${total} verdict match (${(r.matchRate * 100).toFixed(0)}%)`);
    }
  }

  writeReports(rows);
  const allOk = rows.filter(r => !r.skipped).every(r => r.matchRate >= 1);
  if (!allOk && rows.some(r => !r.skipped)) process.exit(1);
}

main();
