/**
 * Platform smoke (no LLM): health → student-join → catalog → ingest → teacher traces list.
 *   AGENT_BASE=http://localhost:3001 node tests/scripts/platform-smoke.js
 */
const http = require('http');
const { URL } = require('url');

const BASE = process.env.AGENT_BASE || 'http://localhost:3001';
const TEACHER_CODE = process.env.TEACHER_ACCESS_CODE || process.env.PLATFORM_TEACHER_PASS || 'teach2609';
const CLASS_CODE = process.env.CLASS_ACCESS_CODE || process.env.PLATFORM_CLASS_CODE || 'wuli2609';

function req(method, urlPath, { body, token, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const payload = body != null ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
    };
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function main() {
  const steps = [];
  const health = await req('GET', '/api/health');
  if (health.status !== 200 || !health.json?.ok) throw new Error('health failed');
  steps.push('health');

  const badJoin = await req('POST', '/api/platform/student-join', {
    body: {
      classCode: 'wrong-class-code-xxx',
      studentId: 'smoke-student-001',
      studentName: '冒烟同学',
    },
  });
  if (badJoin.status === 200 && badJoin.json?.ok) {
    throw new Error('student-join should reject wrong class code');
  }
  steps.push('student-join-reject');

  const join = await req('POST', '/api/platform/student-join', {
    body: {
      classCode: CLASS_CODE,
      studentId: 'smoke-student-001',
      studentName: '冒烟同学',
    },
  });
  if (join.status !== 200 || !join.json?.ok || !join.json?.studentSession) {
    throw new Error(`student-join failed: ${join.status} ${join.raw}`);
  }
  const studentSession = join.json.studentSession;
  const classCode = join.json.classCode || CLASS_CODE;
  steps.push('student-join');

  const catalog = await req('GET', '/api/platform/catalog');
  if (catalog.status !== 200 || !Array.isArray(catalog.json?.items)) {
    throw new Error('catalog failed');
  }
  const item = catalog.json.items.find((i) => !(i.sampleTags || []).includes('observe-only'))
    || catalog.json.items[0];
  if (!item) throw new Error('catalog empty (no student-visible items)');
  steps.push(`catalog n=${catalog.json.items.length} pick=${item.id}`);

  const sessionId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ingest = await req('POST', '/api/trace/ingest', {
    body: {
      sessionId,
      studentId: 'smoke-student-001',
      studentLabel: '冒烟同学',
      classCode,
      studentSession,
      catalogId: item.id,
      graphId: item.graphId,
      events: [
        { type: 'puzzle_open', t: Date.now(), payload: {} },
        { type: 'phase_change', t: Date.now() + 1, payload: { mode: 'explore' } },
        { type: 'tuning', t: Date.now() + 2, payload: { control: 'smoke', value: 1 } },
        { type: 'explore_success', t: Date.now() + 3, payload: { winOk: true, hintKey: 'smoke' } },
      ],
    },
  });
  if (ingest.status !== 200 || !ingest.json?.ok) {
    throw new Error(`ingest failed: ${ingest.status} ${ingest.raw}`);
  }
  steps.push(`ingest ${sessionId}`);

  const concurrent = await Promise.all([
    req('POST', '/api/trace/ingest', {
      body: {
        sessionId,
        studentId: 'smoke-student-001',
        studentLabel: '冒烟同学',
        classCode,
        studentSession,
        catalogId: item.id,
        graphId: item.graphId,
        events: [{ type: 'tuning', t: Date.now() + 10, payload: { control: 'a', value: 2 } }],
      },
    }),
    req('POST', '/api/trace/ingest', {
      body: {
        sessionId,
        studentId: 'smoke-student-001',
        studentLabel: '冒烟同学',
        classCode,
        studentSession,
        catalogId: item.id,
        graphId: item.graphId,
        events: [{ type: 'tuning', t: Date.now() + 11, payload: { control: 'b', value: 3 } }],
      },
    }),
  ]);
  if (concurrent.some((r) => r.status !== 200 || !r.json?.ok)) {
    throw new Error('concurrent ingest failed');
  }
  steps.push('concurrent-ingest');

  let token = '';
  if (TEACHER_CODE) {
    const login = await req('POST', '/api/platform/teacher-login', { body: { code: TEACHER_CODE } });
    if (login.status !== 200 || !login.json?.token) {
      throw new Error(`teacher-login failed: ${login.status} ${login.raw}`);
    }
    token = login.json.token;
    steps.push('teacher-login');

    const classCfg = await req('GET', '/api/platform/class-config', { token });
    if (classCfg.status !== 200 || !classCfg.json?.ok || !classCfg.json?.classCode) {
      throw new Error(`class-config failed: ${classCfg.status} ${classCfg.raw}`);
    }
    steps.push('class-config');
  }

  const list = await req(
    'GET',
    `/api/platform/traces?catalogId=${encodeURIComponent(item.id)}&classCode=${encodeURIComponent(classCode)}`,
    { token },
  );
  if (list.status === 401 && !TEACHER_CODE) {
    steps.push('traces-skipped-no-teacher-code');
  } else if (list.status !== 200 || !Array.isArray(list.json?.items)) {
    throw new Error(`traces list failed: ${list.status} ${list.raw}`);
  } else {
    const hit = list.json.items.some((s) => s.sessionId === sessionId);
    if (!hit) throw new Error('ingested session not in teacher list');
    const withClass = list.json.items.find((s) => s.sessionId === sessionId);
    if (withClass && withClass.classCode && withClass.classCode !== classCode) {
      throw new Error('ingested session classCode mismatch');
    }
    steps.push('teacher-traces');
  }

  console.log(JSON.stringify({ ok: true, steps }, null, 2));
}

main().catch((e) => {
  console.error('platform-smoke FAIL', e.message || e);
  process.exit(1);
});
