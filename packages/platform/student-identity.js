/**
 * 学生身份校验（学号 / 姓名）— 供 join 页与 ingest 共用规则语义。
 * 务实黑名单：拦截明显脏标签，不追求穷尽。
 */

const NAME_BLACKLIST = [
  '李四', '王五', '小明', '小红', '张三丰',
  'playtest', 'full-eval', 'full_eval', 'test', 'testing',
  '全检', '全量试玩', '试玩', '匿名', '匿名学生',
  'student', 'admin', 'null', 'undefined',
];

/** 学号：4–32 位，字母数字下划线短横（常见校园学号） */
function normalizeStudentId(raw) {
  return String(raw || '').trim();
}

function normalizeStudentName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function isDateLikeId(id) {
  // 纯数字且像 YYYYMMDD / YYMMDD
  if (!/^\d{6}$|^\d{8}$/.test(id)) return false;
  if (id.length === 8) {
    const y = Number(id.slice(0, 4));
    const m = Number(id.slice(4, 6));
    const d = Number(id.slice(6, 8));
    return y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }
  const m = Number(id.slice(2, 4));
  const d = Number(id.slice(4, 6));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function validateStudentId(raw) {
  const id = normalizeStudentId(raw);
  if (!id) return { ok: false, error: 'student_id_required', message: '请填写学号' };
  if (id.length < 4 || id.length > 32) {
    return { ok: false, error: 'student_id_invalid', message: '学号长度需为 4–32 位' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    return { ok: false, error: 'student_id_invalid', message: '学号仅允许字母、数字、下划线与短横线' };
  }
  // 纯 6 位且像 YYMMDD 的「日期串」占位；8 位学号常见（入学年+序号），不拦
  if (/^\d{6}$/.test(id) && isDateLikeId(id)) {
    return { ok: false, error: 'student_id_invalid', message: '学号不能是日期串，请使用学校学号' };
  }
  const lower = id.toLowerCase();
  if (NAME_BLACKLIST.some((b) => lower === String(b).toLowerCase())) {
    return { ok: false, error: 'student_id_blocked', message: '该学号不可用，请使用真实学号' };
  }
  return { ok: true, studentId: id };
}

function validateStudentName(raw, { required = true } = {}) {
  const name = normalizeStudentName(raw);
  if (!name) {
    if (required) return { ok: false, error: 'student_name_required', message: '请填写姓名' };
    return { ok: true, studentName: '' };
  }
  if (name.length < 2 || name.length > 32) {
    return { ok: false, error: 'student_name_invalid', message: '姓名长度需为 2–32 字' };
  }
  if (/^\d+$/.test(name)) {
    return { ok: false, error: 'student_name_invalid', message: '姓名不能为纯数字' };
  }
  if (isDateLikeId(name.replace(/[^\d]/g, '')) && /^\d{6,8}$/.test(name)) {
    return { ok: false, error: 'student_name_invalid', message: '姓名不能是日期串' };
  }
  const lower = name.toLowerCase();
  if (NAME_BLACKLIST.some((b) => lower === String(b).toLowerCase() || lower.includes(String(b).toLowerCase()))) {
    return { ok: false, error: 'student_name_blocked', message: '请填写真实姓名（勿用占位昵称）' };
  }
  return { ok: true, studentName: name };
}

module.exports = {
  NAME_BLACKLIST,
  normalizeStudentId,
  normalizeStudentName,
  validateStudentId,
  validateStudentName,
};
