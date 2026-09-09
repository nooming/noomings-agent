/**
 * Minimal unit checks for classroom code + student session tokens.
 *   node tests/scripts/class-access-unit.js
 */
const assert = require('assert');
const {
  matchClassCode,
  deriveStudentSession,
  verifyStudentSession,
  DEV_DEFAULT_CLASS_CODE,
  getClassAccessCode,
} = require('../../packages/platform/class-access');

function run() {
  const code = getClassAccessCode();
  assert.ok(code, 'class code should resolve in non-prod');
  assert.strictEqual(matchClassCode('').ok, false);
  assert.strictEqual(matchClassCode('definitely-wrong-code-xyz').ok, false);
  assert.strictEqual(matchClassCode(code).ok, true);

  const sid = '20260199';
  const token = deriveStudentSession(sid, code, Date.now());
  assert.ok(verifyStudentSession(token, sid, code).ok, 'valid session');
  assert.ok(!verifyStudentSession(token, 'other-id', code).ok, 'wrong student');
  assert.ok(!verifyStudentSession(token, sid, 'other-class').ok, 'wrong class');
  assert.ok(!verifyStudentSession('0.deadbeef', sid, code).ok, 'bad sig');

  if (!process.env.CLASS_ACCESS_CODE && !process.env.PLATFORM_CLASS_CODE) {
    assert.strictEqual(code, DEV_DEFAULT_CLASS_CODE);
  }

  console.log(JSON.stringify({ ok: true, classCode: code, checks: 6 }));
}

run();
