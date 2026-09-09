/**
 * Classroom access code + short-lived student session tokens.
 * Separate from TEACHER_ACCESS_CODE (teacher workbench pass).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPlatformRoot } = require('./paths');

const DEV_DEFAULT_CLASS_CODE = 'wuli2609';
const STUDENT_SESSION_TTL_MS = Number(process.env.STUDENT_SESSION_TTL_MS) || (12 * 60 * 60 * 1000);
const HMAC_KEY = 'platform-student-session-v1';

function getClassConfigPath() {
  return path.join(getPlatformRoot(), 'class-config.json');
}

function isProductionRuntime() {
  const n = String(process.env.NODE_ENV || '').toLowerCase();
  if (n === 'production' || n === 'prod') return true;
  if (String(process.env.PLATFORM_REQUIRE_TEACHER_CODE || '').trim() === '1') return true;
  if (process.env.ZEABUR || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER) return true;
  return false;
}

function readFileClassCode() {
  const p = getClassConfigPath();
  if (!fs.existsSync(p)) return '';
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return String(raw.classCode || raw.CLASS_ACCESS_CODE || '').trim();
  } catch {
    return '';
  }
}

/**
 * Resolve configured classroom code.
 * Priority: CLASS_ACCESS_CODE / PLATFORM_CLASS_CODE env → class-config.json →
 * non-production default `wuli2609`.
 */
function getClassAccessCode() {
  const fromEnv = String(
    process.env.CLASS_ACCESS_CODE || process.env.PLATFORM_CLASS_CODE || '',
  ).trim();
  if (fromEnv) return fromEnv;
  const fromFile = readFileClassCode();
  if (fromFile) return fromFile;
  if (!isProductionRuntime()) return DEV_DEFAULT_CLASS_CODE;
  return '';
}

function getClassCodeSource() {
  if (String(process.env.CLASS_ACCESS_CODE || process.env.PLATFORM_CLASS_CODE || '').trim()) {
    return 'env';
  }
  if (readFileClassCode()) return 'file';
  if (!isProductionRuntime() && getClassAccessCode() === DEV_DEFAULT_CLASS_CODE) return 'dev-default';
  return 'none';
}

function setClassAccessCode(code) {
  const next = String(code || '').trim();
  if (!next || next.length < 4 || next.length > 64) {
    return { ok: false, error: 'class_code_invalid', message: '课堂码长度需为 4–64 位' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-]*$/.test(next)) {
    return {
      ok: false,
      error: 'class_code_invalid',
      message: '课堂码仅允许字母、数字、点、下划线与短横线',
    };
  }
  const p = getClassConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = {
    classCode: next,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { ok: true, classCode: next, source: 'file' };
}

function safeEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function matchClassCode(input) {
  const configured = getClassAccessCode();
  if (!configured) {
    return {
      ok: false,
      error: 'class_access_not_configured',
      message: '服务端未配置课堂码（CLASS_ACCESS_CODE）',
    };
  }
  const code = String(input || '').trim();
  if (!code) {
    return { ok: false, error: 'class_code_required', message: '请填写课堂码' };
  }
  if (!safeEqualStr(code, configured)) {
    return { ok: false, error: 'invalid_class_code', message: '课堂码不正确，请向教师确认后重试' };
  }
  return { ok: true, classCode: configured };
}

function deriveStudentSession(studentId, classCode, issuedAt = Date.now()) {
  const payload = `${String(studentId)}|${String(classCode)}|${issuedAt}`;
  const sig = crypto.createHmac('sha256', HMAC_KEY).update(payload).digest('hex');
  return `${issuedAt}.${sig}`;
}

function verifyStudentSession(token, studentId, classCode) {
  const raw = String(token || '');
  const dot = raw.indexOf('.');
  if (dot < 0) return { ok: false };
  const issuedAt = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(issuedAt) || !sig) return { ok: false };
  if (Date.now() - issuedAt > STUDENT_SESSION_TTL_MS) return { ok: false, expired: true };
  const expected = crypto.createHmac('sha256', HMAC_KEY)
    .update(`${String(studentId)}|${String(classCode)}|${issuedAt}`)
    .digest('hex');
  if (!safeEqualStr(sig, expected)) return { ok: false };
  return { ok: true, issuedAt };
}

module.exports = {
  DEV_DEFAULT_CLASS_CODE,
  STUDENT_SESSION_TTL_MS,
  getClassConfigPath,
  getClassAccessCode,
  getClassCodeSource,
  setClassAccessCode,
  matchClassCode,
  deriveStudentSession,
  verifyStudentSession,
  isProductionRuntime,
};
