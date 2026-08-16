/**
 * Shared HTTP helpers + teacher auth for apps/server API modules.
 */
const crypto = require('crypto');
const { cors } = require('./static');

const IMPORT_ZIP_MAX_BYTES = 64 * 1024 * 1024;
/** Soft body cap for trace ingest (JSON). */
const INGEST_MAX_BYTES = 512 * 1024;
/** Soft quotas (per sliding window). */
const INGEST_STUDENT_LIMIT = 120;
const INGEST_IP_LIMIT = 300;
const INGEST_WINDOW_MS = 60 * 1000;

const TEACHER_TOKEN_TTL_MS = Number(process.env.TEACHER_TOKEN_TTL_MS) || (8 * 60 * 60 * 1000);
const TEACHER_LOGIN_MAX_FAILS = Number(process.env.TEACHER_LOGIN_MAX_FAILS) || 8;
const TEACHER_LOGIN_LOCK_MS = Number(process.env.TEACHER_LOGIN_LOCK_MS) || (15 * 60 * 1000);

/** @type {Map<string, { fails: number, lockedUntil: number }>} */
const loginFailState = new Map();
/** @type {Map<string, { count: number, resetAt: number }>} */
const ingestBuckets = new Map();

function isProductionRuntime() {
  const n = String(process.env.NODE_ENV || '').toLowerCase();
  if (n === 'production' || n === 'prod') return true;
  if (String(process.env.PLATFORM_REQUIRE_TEACHER_CODE || '').trim() === '1') return true;
  // Common PaaS signals
  if (process.env.ZEABUR || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER) return true;
  return false;
}

function getTeacherAccessCode() {
  return String(process.env.TEACHER_ACCESS_CODE || process.env.PLATFORM_TEACHER_PASS || '').trim();
}

/** Production without teacher code: refuse teacher/analytics routes. */
function assertTeacherCodeConfigured(res) {
  const code = getTeacherAccessCode();
  if (code) return true;
  if (!isProductionRuntime()) return true;
  cors(res);
  res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: false,
    error: 'teacher_access_not_configured',
    hint: 'Set TEACHER_ACCESS_CODE in production before serving teacher/analytics APIs',
  }));
  return false;
}

function deriveTeacherToken(code, issuedAt = Date.now()) {
  const payload = `${String(code)}|${issuedAt}`;
  const sig = crypto.createHmac('sha256', 'platform-teacher-v1').update(payload).digest('hex');
  return `${issuedAt}.${sig}`;
}

function verifyTeacherToken(token, code) {
  const raw = String(token || '');
  const dot = raw.indexOf('.');
  // Legacy tokens (pre-TTL): full HMAC of code only
  if (dot < 0) {
    const legacy = crypto.createHmac('sha256', 'platform-teacher-v1').update(String(code)).digest('hex');
    return safeEqualStr(raw, legacy) ? { ok: true, legacy: true } : { ok: false };
  }
  const issuedAt = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(issuedAt) || !sig) return { ok: false };
  if (Date.now() - issuedAt > TEACHER_TOKEN_TTL_MS) return { ok: false, expired: true };
  const expected = crypto.createHmac('sha256', 'platform-teacher-v1')
    .update(`${String(code)}|${issuedAt}`)
    .digest('hex');
  if (!safeEqualStr(sig, expected)) return { ok: false };
  return { ok: true, issuedAt };
}

function safeEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const m = String(header).match(/^Bearer\s+(\S+)/i);
  return m ? m[1].trim() : '';
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  if (xf) return String(xf).split(',')[0].trim();
  return String(req.socket?.remoteAddress || 'unknown');
}

function loginKey(req) {
  return clientIp(req);
}

function checkLoginAllowed(req) {
  const key = loginKey(req);
  const st = loginFailState.get(key);
  if (!st) return { ok: true };
  if (st.lockedUntil && Date.now() < st.lockedUntil) {
    return { ok: false, retryAfterMs: st.lockedUntil - Date.now() };
  }
  return { ok: true };
}

function recordLoginFailure(req) {
  const key = loginKey(req);
  const st = loginFailState.get(key) || { fails: 0, lockedUntil: 0 };
  st.fails += 1;
  if (st.fails >= TEACHER_LOGIN_MAX_FAILS) {
    st.lockedUntil = Date.now() + TEACHER_LOGIN_LOCK_MS;
    st.fails = 0;
  }
  loginFailState.set(key, st);
  return st;
}

function clearLoginFailures(req) {
  loginFailState.delete(loginKey(req));
}

/** When TEACHER_ACCESS_CODE is set (or production requires it), mutating/teacher routes need Bearer. */
function requireTeacherAuth(req, res) {
  if (!assertTeacherCodeConfigured(res)) return false;
  const code = getTeacherAccessCode();
  if (!code) return true; // local/dev without code: open
  const token = extractBearerToken(req);
  const ver = verifyTeacherToken(token, code);
  if (ver.ok) return true;
  cors(res);
  const status = ver.expired ? 401 : 401;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: false,
    error: ver.expired ? 'teacher_token_expired' : 'teacher_auth_required',
  }));
  return false;
}

async function handleTeacherLogin(req, res) {
  cors(res);
  if (!assertTeacherCodeConfigured(res)) return;
  const configured = getTeacherAccessCode();
  if (!configured) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'teacher_access_not_configured' }));
    return;
  }
  const gate = checkLoginAllowed(req);
  if (!gate.ok) {
    res.writeHead(429, {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(Math.ceil((gate.retryAfterMs || 0) / 1000)),
    });
    res.end(JSON.stringify({ ok: false, error: 'too_many_login_attempts' }));
    return;
  }
  try {
    const body = await readBody(req, 8 * 1024);
    const code = String(body.code || '').trim();
    if (!code || !safeEqualStr(code, configured)) {
      recordLoginFailure(req);
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'invalid_code' }));
      return;
    }
    clearLoginFailures(req);
    const issuedAt = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      token: deriveTeacherToken(configured, issuedAt),
      expiresInMs: TEACHER_TOKEN_TTL_MS,
      issuedAt,
    }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
  }
}

function readBody(req, limit = IMPORT_ZIP_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (limit && size > limit) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, limit = IMPORT_ZIP_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Minimal multipart file extractor (filename parts only). */
function parseMultipartFiles(buffer, contentType) {
  const m = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!m) throw new Error('multipart_boundary_missing');
  const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
  const files = [];
  let start = buffer.indexOf(boundary);
  while (start >= 0) {
    let p = start + boundary.length;
    if (buffer[p] === 0x2d && buffer[p + 1] === 0x2d) break;
    if (buffer[p] === 0x0d && buffer[p + 1] === 0x0a) p += 2;
    const next = buffer.indexOf(boundary, p);
    if (next < 0) break;
    let partEnd = next;
    if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
      partEnd -= 2;
    }
    const part = buffer.slice(p, partEnd);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd >= 0) {
      const headers = part.slice(0, headerEnd).toString('utf8');
      const body = part.slice(headerEnd + 4);
      const fileMatch = headers.match(/filename="([^"]*)"/i);
      if (fileMatch && fileMatch[1]) {
        const nameMatch = headers.match(/name="([^"]+)"/i);
        files.push({
          field: nameMatch ? nameMatch[1] : 'file',
          filename: fileMatch[1],
          data: body,
        });
      }
    }
    start = next;
  }
  return files;
}

function bumpBucket(key, limit) {
  const now = Date.now();
  let b = ingestBuckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + INGEST_WINDOW_MS };
  }
  b.count += 1;
  ingestBuckets.set(key, b);
  if (b.count > limit) {
    return { ok: false, retryAfterMs: Math.max(0, b.resetAt - now) };
  }
  return { ok: true };
}

/** Soft quota by studentId + IP for ingest. */
function checkIngestQuota(req, body) {
  const ip = clientIp(req);
  const studentId = String(body?.studentId || '').trim() || '_anon';
  const byStudent = bumpBucket(`s:${studentId}`, INGEST_STUDENT_LIMIT);
  if (!byStudent.ok) return { ok: false, error: 'ingest_student_rate_limited', ...byStudent };
  const byIp = bumpBucket(`ip:${ip}`, INGEST_IP_LIMIT);
  if (!byIp.ok) return { ok: false, error: 'ingest_ip_rate_limited', ...byIp };
  return { ok: true };
}

function json(res, status, payload) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

module.exports = {
  cors,
  json,
  getTeacherAccessCode,
  deriveTeacherToken,
  verifyTeacherToken,
  requireTeacherAuth,
  handleTeacherLogin,
  assertTeacherCodeConfigured,
  isProductionRuntime,
  readBody,
  readRawBody,
  parseMultipartFiles,
  checkIngestQuota,
  clientIp,
  IMPORT_ZIP_MAX_BYTES,
  INGEST_MAX_BYTES,
  TEACHER_TOKEN_TTL_MS,
};
