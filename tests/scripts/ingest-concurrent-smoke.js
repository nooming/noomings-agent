/**
 * Concurrent ingest regression: same sessionId must serialize without corruption.
 * Spawns a short-lived server if AGENT_BASE is unset.
 *
 *   node tests/scripts/ingest-concurrent-smoke.js
 */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const PORT = Number(process.env.AGENT_PORT_SMOKE) || 3017;

function req(base, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, base);
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const r = http.request({
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
    }, (res) => {
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
    r.write(payload);
    r.end();
  });
}

function waitHealth(base, ms = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(new URL('/api/health', base), (res) => {
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > ms) return reject(new Error('health timeout'));
        setTimeout(tick, 200);
      }).on('error', () => {
        if (Date.now() - start > ms) return reject(new Error('health timeout'));
        setTimeout(tick, 200);
      });
    };
    tick();
  });
}

async function runAgainst(base) {
  const sessionId = `conc-${Date.now()}`;
  const n = 12;
  const jobs = [];
  for (let i = 0; i < n; i += 1) {
    jobs.push(req(base, 'POST', '/api/trace/ingest', {
      sessionId,
      studentId: 'conc-student',
      studentLabel: '并发冒烟',
      catalogId: 'demo-projectile-basic',
      graphId: 'projectile-basic',
      events: [{ type: 'tuning', t: Date.now() + i, payload: { control: `c${i}`, value: i } }],
    }));
  }
  const results = await Promise.all(jobs);
  const bad = results.filter((r) => r.status !== 200 || !r.json?.ok);
  if (bad.length) {
    throw new Error(`ingest failures: ${bad.map((b) => b.status + ':' + b.raw).join(' | ')}`);
  }
  console.log(JSON.stringify({ ok: true, sessionId, parallel: n }, null, 2));
}

async function main() {
  if (process.env.AGENT_BASE) {
    await runAgainst(process.env.AGENT_BASE);
    return;
  }
  const child = spawn(process.execPath, [path.join(__dirname, '../../server.js')], {
    env: { ...process.env, AGENT_PORT: String(PORT), PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${PORT}`;
  try {
    await waitHealth(base);
    await runAgainst(base);
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error('ingest-concurrent-smoke FAIL', e.message || e);
  process.exit(1);
});
