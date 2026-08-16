/**
 * 全量 runtime packages → Agent B rule judge（S1–S4 合成轨迹）
 *
 *   node tests/scripts/student-agentb-full-eval.js
 *   node tests/scripts/student-agentb-full-eval.js --ingest   # 同时 POST 轨迹并 judge-session
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { evaluateTraceRules } = require('../../packages/judge/evaluate-rules');
const {
  scoreTraceStrategy,
  MODE,
} = require('../../packages/judge/strategy-segment-score');
const { getPackagesRoot, getReportsRoot } = require('../../packages/shared/data-paths');

const ROOT = getPackagesRoot();
const DO_INGEST = process.argv.includes('--ingest');
const BASE = process.env.AGENT_BASE || 'http://localhost:3001';
const TEACHER_CODE = process.env.TEACHER_ACCESS_CODE || 'test-class-2026';

function listPackageIds() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(id => {
      if (id === 'reports') return false;
      return (
        fs.existsSync(path.join(ROOT, id, 'game.html')) &&
        fs.existsSync(path.join(ROOT, id, 'chapter.json'))
      );
    })
    .sort();
}

function loadChapter(id) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, id, 'chapter.json'), 'utf8'));
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
  return Object.entries(controls)
    .filter(([, m]) => m?.role === 'operation')
    .map(([cid]) => cid);
}

function fireCtrl(chapter) {
  const controls = chapter?.traceMap?.controls || {};
  const hit = Object.keys(controls).find(id => /fire|launch|test|btn-fire|release|start|run/i.test(id));
  return hit || 'btn-fire';
}

function primaryAv(chapter) {
  const avs = [...avList(chapter)].sort(
    (a, b) => (a.priorityRank || 99) - (b.priorityRank || 99)
  );
  return avs[0]?.controlId || opControls(chapter)[0] || 'slider-a';
}

function secondaryAv(chapter) {
  const avs = [...avList(chapter)].sort(
    (a, b) => (a.priorityRank || 99) - (b.priorityRank || 99)
  );
  return avs[1]?.controlId || opControls(chapter)[1] || null;
}

function ev(ts, type, payload) {
  return { ts, ch: 0, type, payload };
}

function isMultiLevelPkg(pkgId) {
  return /projectile-cannon|cannon/i.test(String(pkgId || ''));
}

function trial(events, ts, tunings, fireId, winOk, opts = {}) {
  let t = ts;
  for (const [control, value] of tunings) {
    events.push(ev(t++, 'tuning', { control, value }));
  }
  events.push(ev(t++, 'action', { control: fireId }));
  const snapPayload = { winOk: !!winOk, hintKey: winOk ? 'ok' : 'retry' };
  const winPayload = { winOk: true };
  // 多关整包过关夹具：带 final + levelsCleared，避免 legacy 单 win 只记 1/4
  if (winOk && opts.multiLevelComplete) {
    const n = Number(opts.levelsTotal) > 0 ? Math.round(Number(opts.levelsTotal)) : 4;
    Object.assign(snapPayload, {
      final: true,
      interim: false,
      levelsCleared: n,
      levelsTotal: n,
      level: n,
    });
    Object.assign(winPayload, {
      final: true,
      interim: false,
      levelsCleared: n,
      levelsTotal: n,
      level: n,
    });
  }
  events.push(ev(t++, 'snapshot', snapPayload));
  if (winOk) events.push(ev(t++, 'win', winPayload));
  return t;
}

function withPhases(build) {
  const events = [
    ev(1, 'puzzle_open', {}),
    ev(2, 'phase_change', { phase: 'explore' }),
  ];
  let ts = 10;
  // explore noise (should be ignored after challenge cut)
  events.push(ev(ts++, 'tuning', { control: 'explore-noise', value: 1 }));
  events.push(ev(ts++, 'action', { control: 'btn-fire' }));
  events.push(ev(ts++, 'phase_change', { phase: 'challenge' }));
  ts = build(events, ts);
  return events;
}

/** S1: 纯高优单变量 + 最后一发 win */
function synthS1(chapter, pkgId) {
  const primary = primaryAv(chapter);
  const fireId = fireCtrl(chapter);
  const multiDone = isMultiLevelPkg(pkgId);
  const events = withPhases((evs, ts) => {
    let t = ts;
    for (let i = 0; i < 3; i++) t = trial(evs, t, [[primary, 10 + i]], fireId, false);
    t = trial(evs, t, [[primary, 14]], fireId, true, {
      multiLevelComplete: multiDone,
      levelsTotal: 4,
    });
    return t;
  });
  return { kind: 'S1_pure_high_av_win', events, hasCv: false };
}

/** S2: 多参盲调陷阱（可带 win 以测 trap 倾向） */
function synthS2(chapter, pkgId) {
  const a = primaryAv(chapter);
  const b = secondaryAv(chapter) || a;
  const fireId = fireCtrl(chapter);
  const multiDone = isMultiLevelPkg(pkgId);
  const events = withPhases((evs, ts) => {
    let t = ts;
    for (let i = 0; i < 4; i++) {
      t = trial(evs, t, [[a, 10 + i], [b, 20 + i]], fireId, i === 3, {
        multiLevelComplete: multiDone && i === 3,
        levelsTotal: 4,
      });
    }
    return t;
  });
  return { kind: 'S2_multi_param_trap', events, hasCv: false };
}

/** S3: 重度拧 CV（若无 CV 则 skip） */
function synthS3(chapter) {
  const cvs = cvList(chapter);
  if (!cvs.length) return { kind: 'S3_cv_heavy', events: null, skipped: true, reason: 'no_cv_control' };
  const primary = primaryAv(chapter);
  const cv = cvs[0].controlId;
  const fireId = fireCtrl(chapter);
  const events = withPhases((evs, ts) => {
    let t = ts;
    for (let i = 0; i < 4; i++) {
      t = trial(evs, t, [[cv, i + 1], [primary, 10 + (i % 2)]], fireId, false);
    }
    return t;
  });
  return { kind: 'S3_cv_heavy', events, hasCv: true };
}

/** S4: 未完成（无 win） */
function synthS4(chapter) {
  const primary = primaryAv(chapter);
  const fireId = fireCtrl(chapter);
  const events = withPhases((evs, ts) => {
    let t = ts;
    for (let i = 0; i < 2; i++) t = trial(evs, t, [[primary, 10 + i]], fireId, false);
    return t;
  });
  return { kind: 'S4_incomplete', events, hasCv: false };
}

const SYNTHS = [synthS1, synthS2, synthS3, synthS4];

function expectAccept(kind, judge, seg, chapter) {
  const rate = judge?.inquiryPath?.metrics?.singleVariableRate;
  const route = judge?.inquiryPath?.strategyRouteGuess;
  const verdict = judge?.verdict;
  const strengths = (judge?.strengths || []).join(' ');
  const failures = [];
  const notes = [];

  switch (kind) {
    case 'S1_pure_high_av_win': {
      // win → 不应长期 in_progress；应为 pass
      if (verdict !== 'pass') failures.push(`S1 expect pass, got ${verdict}`);
      if (rate != null && rate < 0.7) notes.push(`S1 svRate low=${rate}`);
      break;
    }
    case 'S2_multi_param_trap': {
      if (rate != null && rate >= 0.7) failures.push(`S2 expect low svRate, got ${rate}`);
      if (route === 'main' && (rate == null || rate >= 0.7)) {
        failures.push(`S2 trap-leaning fail: route=${route} svRate=${rate}`);
      }
      // win 时可能 pass，但不应被表扬为清晰单变量
      if (/单参|控制变量途径|坚持单参/.test(strengths) && (rate == null || rate < 0.5)) {
        failures.push('S2 praised as single-var despite multi-param');
      }
      break;
    }
    case 'S3_cv_heavy': {
      if (/符合控制变量途径|坚持单参调节|主推途径|主推控制变量/.test(strengths)) {
        failures.push('S3 praised as primary AV success');
      }
      if (rate != null && rate >= 0.7) {
        failures.push(`S3 svRate too high like S1: ${rate}`);
      }
      if (judge?.inquiryPath?.metrics?.cvHeavy !== true && (judge?.gaps || []).every(g => !/无关|旁路/.test(g))) {
        failures.push('S3 should mark cvHeavy or gap on bypass');
      }
      // CV 重度不应被当成清晰单变量高分
      if (seg?.score != null && seg.score >= 0.95 && (seg.breakdown?.cvOver || 0) > 0) {
        failures.push(`S3 strategyScore too high with cvOver=${seg.breakdown.cvOver}`);
      }
      break;
    }
    case 'S4_incomplete': {
      if (verdict === 'pass') failures.push('S4 must not pass');
      break;
    }
    default:
      break;
  }

  // explore noise must not dominate if phase_change works — primary should not be explore-noise
  if (seg?.primaryStrategy && /explore-noise/.test(String(seg.primaryStrategy))) {
    failures.push('explore noise dominated primaryStrategy');
  }

  return { ok: failures.length === 0, failures, notes, rate, route, verdict };
}

function evalCase(chapter, synthFn, pkgId) {
  const synth = synthFn(chapter, pkgId);
  if (synth.skipped || !synth.events) {
    return {
      kind: synth.kind,
      skipped: true,
      reason: synth.reason,
      acceptOk: null,
    };
  }
  const judge = evaluateTraceRules({ ch: 0, trace: { events: synth.events }, chapter });
  const seg = scoreTraceStrategy(synth.events, chapter, { mode: 'compete', constants: MODE.compete });
  const accept = expectAccept(synth.kind, judge, seg, chapter);
  return {
    kind: synth.kind,
    skipped: false,
    verdict: judge.verdict,
    mode: judge.mode || 'rule',
    singleVariableRate: accept.rate,
    strategyRouteGuess: accept.route,
    strategyScore: seg.score,
    primaryStrategy: seg.primaryStrategy,
    strengths: judge.strengths || [],
    gaps: judge.gaps || [],
    acceptOk: accept.ok,
    failures: accept.failures,
    notes: accept.notes,
    eventCount: synth.events.length,
  };
}

function httpJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null });
          } catch (e) {
            resolve({ status: res.statusCode, raw, error: e.message });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function teacherToken() {
  const r = await httpJson('POST', '/api/platform/teacher-login', { code: TEACHER_CODE });
  return r.json?.token || r.json?.accessToken || null;
}

async function ingestAndJudge(pkgId, caseRow, chapter, token) {
  if (caseRow.skipped) return null;
  const synth = SYNTHS.find(fn => fn(chapter, pkgId).kind === caseRow.kind);
  const built = synth(chapter, pkgId);
  if (!built.events) return null;
  const catalogId = `demo-${pkgId}`;
  const ingest = await httpJson('POST', '/api/trace/ingest', {
    catalogId,
    graphId: pkgId,
    studentLabel: `full-eval-${caseRow.kind}`,
    studentId: `fe-${pkgId}-${caseRow.kind}`,
    events: built.events,
    ch: 0,
    game: catalogId,
  });
  if (!ingest.json?.ok) {
    return { ingestOk: false, ingest };
  }
  const sessionId = ingest.json.sessionId;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const judged = await httpJson(
    'POST',
    '/api/platform/judge-session',
    { sessionId, graphId: pkgId, ch: 0 },
    headers
  );
  return {
    ingestOk: true,
    sessionId,
    eventCount: ingest.json.eventCount,
    judgeStatus: judged.status,
    judgeOk: !!judged.json?.ok,
    verdict: judged.json?.verdict,
    singleVariableRate: judged.json?.inquiryPath?.metrics?.singleVariableRate,
    strategyRouteGuess: judged.json?.inquiryPath?.strategyRouteGuess,
    mode: judged.json?.mode,
  };
}

function metaOf(chapter) {
  const avs = avList(chapter);
  const cvs = cvList(chapter);
  return {
    title: chapter.kg?.title || '',
    avCount: avs.length,
    cvCount: cvs.length,
    avs: avs.map(a => `${a.priorityRank || '?'}:${a.label || a.controlId}`),
    cvs: cvs.map(c => c.label || c.controlId),
    primary: primaryAv(chapter),
    secondary: secondaryAv(chapter),
    fire: fireCtrl(chapter),
  };
}

async function main() {
  const ids = listPackageIds();
  let token = null;
  if (DO_INGEST) {
    try {
      token = await teacherToken();
    } catch (e) {
      console.warn('teacher login failed:', e.message);
    }
  }

  const rows = [];
  for (const id of ids) {
    let chapter;
    try {
      chapter = loadChapter(id);
    } catch (e) {
      rows.push({ id, error: e.message });
      continue;
    }
    const meta = metaOf(chapter);
    const cases = SYNTHS.map(fn => evalCase(chapter, fn, id));
    let api = null;
    if (DO_INGEST) {
      api = {};
      for (const c of cases) {
        try {
          api[c.kind] = await ingestAndJudge(id, c, chapter, token);
        } catch (e) {
          api[c.kind] = { error: e.message };
        }
      }
    }
    const scored = cases.filter(c => !c.skipped);
    const acceptPass = scored.filter(c => c.acceptOk).length;
    rows.push({
      id,
      meta,
      cases,
      acceptPass,
      acceptTotal: scored.length,
      api,
    });
  }

  const acceptCells = rows.reduce((n, r) => n + (r.acceptTotal || 0), 0);
  const acceptOk = rows.reduce((n, r) => n + (r.acceptPass || 0), 0);
  const s3Skipped = rows.reduce(
    (n, r) => n + (r.cases?.filter(c => c.kind === 'S3_cv_heavy' && c.skipped).length || 0),
    0
  );

  const failures = [];
  for (const r of rows) {
    for (const c of r.cases || []) {
      if (c.skipped) continue;
      if (!c.acceptOk) {
        failures.push({
          id: r.id,
          kind: c.kind,
          failures: c.failures,
          verdict: c.verdict,
          svRate: c.singleVariableRate,
          route: c.strategyRouteGuess,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'rule (no LLM API key required)',
    packages: ids.length,
    acceptOk,
    acceptCells,
    acceptRate: acceptCells ? acceptOk / acceptCells : 0,
    s3Skipped,
    ingestEnabled: DO_INGEST,
    failures,
    rows,
  };

  const outDir = getReportsRoot();
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'student-agentb-full-eval.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const md = [];
  md.push('# 全量学生试玩 + Agent B 虚拟评判报告（Phase V）');
  md.push('');
  md.push(`生成时间：${report.generatedAt}`);
  md.push(`模式：${report.mode}`);
  md.push(`包数：${ids.length}`);
  md.push(`验收通过：${acceptOk}/${acceptCells}（${(report.acceptRate * 100).toFixed(0)}%）`);
  md.push(`S3 跳过（无 CV controlId）：${s3Skipped}`);
  md.push('');
  md.push('## 覆盖矩阵（虚拟）');
  md.push('');
  md.push('| 包 | AV | CV | S1 | S2 | S3 | S4 | 验收 |');
  md.push('|----|----|----|----|----|----|----|------|');
  for (const r of rows) {
    if (r.error) {
      md.push(`| ${r.id} | — | — | ERR | ERR | ERR | ERR | ${r.error} |`);
      continue;
    }
    const cell = kind => {
      const c = r.cases.find(x => x.kind.startsWith(kind));
      if (!c) return '—';
      if (c.skipped) return 'skip';
      const mark = c.acceptOk ? '✓' : '✗';
      return `${mark} ${c.verdict} sv=${c.singleVariableRate ?? '—'}`;
    };
    md.push(
      `| ${r.id} | ${r.meta.avCount} | ${r.meta.cvCount} | ${cell('S1')} | ${cell('S2')} | ${cell('S3')} | ${cell('S4')} | ${r.acceptPass}/${r.acceptTotal} |`
    );
  }
  md.push('');
  md.push('## 失败明细');
  md.push('');
  if (!failures.length) {
    md.push('（无）');
  } else {
    for (const f of failures) {
      md.push(`- **${f.id} / ${f.kind}**: ${f.failures.join('; ')} (verdict=${f.verdict}, sv=${f.svRate}, route=${f.route})`);
    }
  }
  md.push('');
  md.push('## Agent B 验收口径');
  md.push('');
  md.push('- S1 win → 应为 pass，不应长期 in_progress');
  md.push('- S2 → 低 singleVariableRate / trap 倾向');
  md.push('- S3 → 不得表扬为 primary AV 成功');
  md.push('- S4 → 不得 pass');
  md.push('- explore 噪声在 phase_change 后不得主导');

  const mdPath = path.join(outDir, 'student-agentb-full-eval.md');
  fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

  console.log(`Packages ${ids.length}; accept ${acceptOk}/${acceptCells}; S3 skip ${s3Skipped}`);
  console.log('Wrote', jsonPath);
  console.log('Wrote', mdPath);
  if (failures.length) {
    console.log('Failures:', failures.length);
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${f.id} ${f.kind}: ${f.failures.join('; ')}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
