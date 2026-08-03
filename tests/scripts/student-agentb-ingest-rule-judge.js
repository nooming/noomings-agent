/**
 * 注入合成轨迹 → 本地 rule judge（不走 LLM judge-session，避免卡住）
 *   node tests/scripts/student-agentb-ingest-rule-judge.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { evaluateTraceRules } = require('../../packages/judge/evaluate-rules');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = getPackagesRoot();
const BASE = process.env.AGENT_BASE || 'http://localhost:3001';

// reuse synth helpers by requiring sibling patterns inline (minimal)
function listPackageIds() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(id => id !== 'reports'
      && fs.existsSync(path.join(ROOT, id, 'game.html'))
      && fs.existsSync(path.join(ROOT, id, 'chapter.json')))
    .sort();
}

function loadChapter(id) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, id, 'chapter.json'), 'utf8'));
}

function avList(c) { return c?.inquiryScript?.adjustmentVariables || []; }
function cvList(c) { return (c?.inquiryScript?.confoundingVariables || []).filter(x => x.controlId); }
function opControls(c) {
  const avs = avList(c).map(a => a.controlId).filter(Boolean);
  if (avs.length) return avs;
  const controls = c?.traceMap?.controls || {};
  return Object.entries(controls).filter(([, m]) => m?.role === 'operation').map(([id]) => id);
}
function fireCtrl(c) {
  const controls = c?.traceMap?.controls || {};
  return Object.keys(controls).find(id => /fire|launch|test|btn-fire|release|start|run/i.test(id)) || 'btn-fire';
}
function primaryAv(c) {
  const avs = [...avList(c)].sort((a, b) => (a.priorityRank || 99) - (b.priorityRank || 99));
  return avs[0]?.controlId || opControls(c)[0] || 'slider-a';
}
function secondaryAv(c) {
  const avs = [...avList(c)].sort((a, b) => (a.priorityRank || 99) - (b.priorityRank || 99));
  return avs[1]?.controlId || opControls(c)[1] || null;
}
function ev(ts, type, payload) { return { ts, ch: 0, type, payload }; }
function trial(events, ts, tunings, fireId, winOk) {
  let t = ts;
  for (const [control, value] of tunings) events.push(ev(t++, 'tuning', { control, value }));
  events.push(ev(t++, 'action', { control: fireId }));
  events.push(ev(t++, 'snapshot', { winOk: !!winOk, hintKey: winOk ? 'ok' : 'retry' }));
  if (winOk) events.push(ev(t++, 'win', { winOk: true }));
  return t;
}
function withPhases(build) {
  const events = [ev(1, 'puzzle_open', {}), ev(2, 'phase_change', { phase: 'explore' })];
  let ts = 10;
  events.push(ev(ts++, 'tuning', { control: 'explore-noise', value: 1 }));
  events.push(ev(ts++, 'phase_change', { phase: 'challenge' }));
  build(events, ts);
  return events;
}
function synthS1(c) {
  const p = primaryAv(c); const f = fireCtrl(c);
  return withPhases((e, ts) => {
    let t = ts;
    for (let i = 0; i < 3; i++) t = trial(e, t, [[p, 10 + i]], f, false);
    trial(e, t, [[p, 14]], f, true);
  });
}
function synthS2(c) {
  const a = primaryAv(c); const b = secondaryAv(c) || a; const f = fireCtrl(c);
  return withPhases((e, ts) => {
    let t = ts;
    for (let i = 0; i < 4; i++) t = trial(e, t, [[a, 10 + i], [b, 20 + i]], f, i === 3);
  });
}
function synthS3(c) {
  const cvs = cvList(c);
  if (!cvs.length) return null;
  const p = primaryAv(c); const cv = cvs[0].controlId; const f = fireCtrl(c);
  return withPhases((e, ts) => {
    let t = ts;
    for (let i = 0; i < 4; i++) t = trial(e, t, [[cv, i + 1], [p, 10 + (i % 2)]], f, false);
  });
}
function synthS4(c) {
  const p = primaryAv(c); const f = fireCtrl(c);
  return withPhases((e, ts) => {
    let t = ts;
    for (let i = 0; i < 2; i++) t = trial(e, t, [[p, 10 + i]], f, false);
  });
}

function httpJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(raw || 'null') }); }
        catch (e) { resolve({ status: res.statusCode, raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const ids = listPackageIds();
  const rows = [];
  for (const id of ids) {
    const chapter = loadChapter(id);
    const catalogId = `demo-${id}`;
    const cases = [
      ['S1', synthS1(chapter)],
      ['S2', synthS2(chapter)],
      ['S3', synthS3(chapter)],
      ['S4', synthS4(chapter)],
    ];
    const out = { id, sessions: {} };
    for (const [kind, events] of cases) {
      if (!events) {
        out.sessions[kind] = { skipped: true };
        continue;
      }
      const ingest = await httpJson('POST', '/api/trace/ingest', {
        catalogId,
        graphId: id,
        studentLabel: `playtest-${kind}`,
        studentId: `pt-${id}-${kind}`,
        events,
        ch: 0,
        game: catalogId,
      });
      const judge = evaluateTraceRules({ ch: 0, trace: { events }, chapter });
      out.sessions[kind] = {
        ingestOk: !!ingest.json?.ok,
        sessionId: ingest.json?.sessionId,
        eventCount: ingest.json?.eventCount,
        verdict: judge.verdict,
        mode: 'rule',
        singleVariableRate: judge.inquiryPath?.metrics?.singleVariableRate ?? null,
        strategyRouteGuess: judge.inquiryPath?.strategyRouteGuess ?? null,
        strengths: judge.strengths || [],
        gaps: judge.gaps || [],
      };
    }
    rows.push(out);
    console.log(id, Object.fromEntries(Object.entries(out.sessions).map(([k, v]) => [k, v.skipped ? 'skip' : `${v.verdict}/sv=${v.singleVariableRate}`])));
  }

  const outDir = path.join(ROOT, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), note: 'ingest via API + local rule judge (no LLM)', rows };
  const p = path.join(outDir, 'student-agentb-ingest-rule-judge.json');
  fs.writeFileSync(p, JSON.stringify(report, null, 2), 'utf8');
  console.log('Wrote', p);
}

main().catch(e => { console.error(e); process.exit(1); });
