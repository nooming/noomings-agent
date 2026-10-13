/**
 * 学生级能力聚合（终局综合 + 未终局 preview 参考综合）。与 teacher.html 方案 B 对齐。
 */
'use strict';

const { isTerminalSession, deriveTerminalOutcome } = require('../judge/session-terminal');
const { isFiniteAbilityTotal } = require('./session-ability-score');

function sessionTaskKey(session) {
  return String(
    session?.catalogId
    || session?.graphId
    || session?.packageId
    || session?.taskCode
    || 'unknown',
  );
}

function sessionAbilityScore(session) {
  return session?.abilityScore || null;
}

function sessionFiniteAbilityTotal(session) {
  const a = sessionAbilityScore(session);
  if (!a || a.pending || !isFiniteAbilityTotal(a.total)) return null;
  return Number(a.total);
}

function sessionPreviewAbilityTotal(session) {
  const a = sessionAbilityScore(session);
  if (!a || !isFiniteAbilityTotal(a.previewTotal)) return null;
  return Math.round(Number(a.previewTotal));
}

function sortSessionsNewestFirst(sessions) {
  return (Array.isArray(sessions) ? sessions.slice() : []).sort((a, b) => {
    const ta = String(a?.updatedAt || a?.startedAt || '');
    const tb = String(b?.updatedAt || b?.startedAt || '');
    return tb.localeCompare(ta);
  });
}

function normalizeSessionForTerminal(session) {
  return {
    ...session,
    terminalOutcome: session?.terminalOutcome || session?.sessionOutcome || null,
    verdict: session?.verdict || session?.judgeResult?.verdict || null,
    judgeResult: session?.judgeResult || null,
    abilityScore: session?.abilityScore || null,
    attemptsExhausted: session?.attemptsExhausted,
    events: session?.events,
  };
}

function isTerminalSessionRow(session) {
  return isTerminalSession(normalizeSessionForTerminal(session));
}

function terminalSessionsOf(student) {
  return (Array.isArray(student?.sessions) ? student.sessions : []).filter(isTerminalSessionRow);
}

/** 每任务最近 1–2 局终局有限 total 均值 → 任务均分（四舍五入）。 */
function aggregateStudentAbilityByTask(student) {
  const sessions = terminalSessionsOf(student);
  const byTask = new Map();
  for (const s of sessions) {
    const key = sessionTaskKey(s);
    if (!byTask.has(key)) byTask.set(key, []);
    byTask.get(key).push(s);
  }
  const taskScores = [];
  const representativeSessions = [];
  for (const [taskKey, list] of byTask) {
    const scored = sortSessionsNewestFirst(list)
      .filter(s => sessionFiniteAbilityTotal(s) != null);
    if (!scored.length) continue;
    const reps = scored.slice(0, 2);
    const vals = reps.map(s => sessionFiniteAbilityTotal(s));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    taskScores.push({ taskKey, score: mean, sessions: reps });
    representativeSessions.push(...reps);
  }
  const composite = taskScores.length
    ? Math.round(taskScores.reduce((a, t) => a + t.score, 0) / taskScores.length)
    : null;
  return { taskScores, representativeSessions, composite };
}

/** 无终局综合分时：未终局 previewTotal 按任务同样规则聚合（仅展示）。 */
function aggregateStudentPreviewAbilityByTask(student) {
  const sessions = student?.sessions || [];
  const byTask = new Map();
  for (const s of sessions) {
    if (isTerminalSessionRow(s)) continue;
    if (sessionPreviewAbilityTotal(s) == null) continue;
    const key = sessionTaskKey(s);
    if (!byTask.has(key)) byTask.set(key, []);
    byTask.get(key).push(s);
  }
  const taskScores = [];
  for (const [, list] of byTask) {
    const scored = sortSessionsNewestFirst(list)
      .filter(s => sessionPreviewAbilityTotal(s) != null);
    if (!scored.length) continue;
    const reps = scored.slice(0, 2);
    const vals = reps.map(s => sessionPreviewAbilityTotal(s));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    taskScores.push({ score: mean, sessions: reps });
  }
  return taskScores.length
    ? Math.round(taskScores.reduce((a, t) => a + t.score, 0) / taskScores.length)
    : null;
}

module.exports = {
  sessionTaskKey,
  sessionFiniteAbilityTotal,
  sessionPreviewAbilityTotal,
  sortSessionsNewestFirst,
  isTerminalSessionRow,
  terminalSessionsOf,
  deriveTerminalOutcome,
  aggregateStudentAbilityByTask,
  aggregateStudentPreviewAbilityByTask,
};
