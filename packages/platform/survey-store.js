/**
 * Lightweight learning-experience survey store.
 * Files: data/runtime/platform/surveys/{classCode}/{studentId}.json
 *
 * Instrument learning-experience-v3 (vs v2):
 * - Adds aiAssistFeel, aiDisclosePlay (AI disclosure + attitudes; required Likert)
 * v2 retained Q1–Q7 wording; do not mix-analyze across instrument versions.
 * v2 vs v1: goalsClarity anchors, graphsHelp narrowed, difficulty bipolar.
 */
const fs = require('fs');
const path = require('path');
const { getPlatformRoot } = require('./paths');

const SURVEY_INSTRUMENT_ID = 'learning-experience-v3';
const LIKERT_KEYS = [
  'goalsClarity',
  'inquiryFeel',
  'graphsHelp',
  'engagement',
  'difficulty',
  'satisfaction',
  'continueWillingness',
  'aiAssistFeel',
  'aiDisclosePlay',
];
const OPEN_KEYS = ['helpfulOpen', 'suggestionOpen'];

function getSurveysRoot() {
  return path.join(getPlatformRoot(), 'surveys');
}

function sanitizeClassDir(classCode) {
  const raw = String(classCode || '').trim();
  if (!raw) return '_default';
  const safe = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return safe || '_default';
}

function sanitizeStudentFile(studentId) {
  const raw = String(studentId || '').trim();
  const safe = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return safe || '';
}

function surveyFilePath(classCode, studentId) {
  const dir = sanitizeClassDir(classCode);
  const file = sanitizeStudentFile(studentId);
  if (!file) return null;
  return path.join(getSurveysRoot(), dir, `${file}.json`);
}

function clampLikert(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 1 || i > 5) return null;
  return i;
}

function normalizeOpen(v, maxLen = 500) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.slice(0, maxLen);
}

function normalizeAnswers(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const answers = {};
  for (const key of LIKERT_KEYS) {
    const v = clampLikert(src[key]);
    if (v == null) {
      return { ok: false, error: 'answers_invalid', message: `请完成量表题：${key}` };
    }
    answers[key] = v;
  }
  for (const key of OPEN_KEYS) {
    answers[key] = normalizeOpen(src[key]);
  }
  return { ok: true, answers };
}

function findSurvey(classCode, studentId) {
  const p = surveyFilePath(classCode, studentId);
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function saveSurvey(record) {
  const p = surveyFilePath(record.classCode, record.studentId);
  if (!p) {
    return { ok: false, error: 'student_id_invalid', message: '学号无效' };
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = {
    instrumentId: SURVEY_INSTRUMENT_ID,
    classCode: record.classCode,
    studentId: record.studentId,
    studentName: record.studentName,
    studentSession: record.studentSession || '',
    submittedAt: record.submittedAt || new Date().toISOString(),
    answers: record.answers,
  };
  fs.writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { ok: true, record: payload, path: p };
}

function listSurveys({ classCode } = {}) {
  const root = getSurveysRoot();
  if (!fs.existsSync(root)) return [];
  const dirs = classCode
    ? [sanitizeClassDir(classCode)]
    : fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

  const out = [];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    let files;
    try {
      files = fs.readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of files) {
      if (!name.endsWith('.json')) continue;
      const fp = path.join(abs, name);
      try {
        const rec = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (classCode && String(rec.classCode || '') !== String(classCode)) continue;
        out.push(rec);
      } catch {
        /* skip corrupt */
      }
    }
  }
  out.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  return out;
}

module.exports = {
  SURVEY_INSTRUMENT_ID,
  LIKERT_KEYS,
  OPEN_KEYS,
  getSurveysRoot,
  normalizeAnswers,
  findSurvey,
  saveSurvey,
  listSurveys,
};
