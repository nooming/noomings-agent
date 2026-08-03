const fs = require('fs');
const path = require('path');
const { getTracesRoot } = require('./paths');
const {
  filterEventsByChallengePhase,
  filterEventsByExplorePhase,
} = require('../judge/trace-normalize');

function ensureTracesRoot() {
  fs.mkdirSync(getTracesRoot(), { recursive: true });
}

function makeSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sessionPath(sessionId) {
  return path.join(getTracesRoot(), `${sessionId}.json`);
}

function resolveControlMeta(chapter, controlId) {
  const id = String(controlId || '');
  if (!id) return { controlId: id, label: id, role: null };
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const av = avs.find(a => a.controlId === id);
  if (av) {
    return {
      controlId: id,
      label: av.label || id,
      role: 'adjustment',
      priorityRank: av.priorityRank != null ? Number(av.priorityRank) : null,
    };
  }
  const cv = cvs.find(c => c.controlId === id);
  if (cv) {
    return { controlId: id, label: cv.label || id, role: 'confounding', priorityRank: null };
  }
  const tm = chapter?.traceMap?.controls?.[id];
  if (tm) {
    return {
      controlId: id,
      label: tm.label || id,
      role: tm.role || null,
      priorityRank: null,
    };
  }
  return { controlId: id, label: id, role: null, priorityRank: null };
}

function buildVariableAdjustCounts(controlTuningCounts, chapter) {
  return Object.entries(controlTuningCounts || {})
    .map(([controlId, count]) => {
      const meta = resolveControlMeta(chapter, controlId);
      return {
        controlId,
        label: meta.label,
        role: meta.role,
        priorityRank: meta.priorityRank,
        adjustCount: count,
      };
    })
    .sort((a, b) => b.adjustCount - a.adjustCount || String(a.label).localeCompare(String(b.label), 'zh'));
}

function aggregateSessionMetrics(events, chapter) {
  const controlTuningCounts = {};
  const actionCounts = {};
  let currentPhase = 'explore';
  let sawPhaseChange = false;
  for (const e of events || []) {
    if (e.type === 'phase_change' && e.payload?.phase) {
      currentPhase = e.payload.phase;
      sawPhaseChange = true;
      continue;
    }
    if (e.type === 'tuning' && e.payload?.control) {
      const key = String(e.payload.control);
      controlTuningCounts[key] = (controlTuningCounts[key] || 0) + 1;
    }
    if (e.type === 'action') {
      const key = String(e.payload?.control || 'action');
      actionCounts[key] = (actionCounts[key] || 0) + 1;
    }
  }
  const variableAdjustCounts = buildVariableAdjustCounts(controlTuningCounts, chapter);
  return {
    controlTuningCounts,
    actionCounts,
    variableAdjustCounts,
    currentPhase,
    sawPhaseChange,
  };
}

/**
 * 按探究/竞赛段拆分变量调节次数；无 phase_change 时 phaseSplit=false，仅提供全会话。
 */
function buildPhaseVariableAdjustCounts(events, chapter) {
  const list = Array.isArray(events) ? events : [];
  const full = aggregateSessionMetrics(list, chapter);
  if (!full.sawPhaseChange) {
    return {
      phaseSplit: false,
      scopeNote: 'no_phase_change',
      explore: null,
      challenge: null,
      full: full.variableAdjustCounts,
    };
  }
  const explore = aggregateSessionMetrics(filterEventsByExplorePhase(list), chapter);
  const challenge = aggregateSessionMetrics(filterEventsByChallengePhase(list), chapter);
  return {
    phaseSplit: true,
    scopeNote: null,
    explore: explore.variableAdjustCounts,
    challenge: challenge.variableAdjustCounts,
    full: full.variableAdjustCounts,
  };
}

function enrichRecordMetrics(record, chapter) {
  const metrics = aggregateSessionMetrics(record.events || [], chapter || null);
  record.controlTuningCounts = metrics.controlTuningCounts;
  record.actionCounts = metrics.actionCounts;
  record.variableAdjustCounts = metrics.variableAdjustCounts;
  record.currentPhase = metrics.currentPhase;
  record.sawPhaseChange = metrics.sawPhaseChange;
  return record;
}

function ingestTrace(body) {
  ensureTracesRoot();
  const catalogId = String(body.catalogId || body.gameId || '').trim();
  const graphId = String(body.graphId || '').trim();
  const studentLabel = String(body.studentLabel || body.studentId || '匿名学生').trim();
  const studentId = String(body.studentId || body.studentNo || '').trim();
  const taskCode = String(body.taskCode || body.classCode || body.catalogId || '').trim();
  if (!catalogId && !graphId) {
    return { ok: false, error: 'catalogId_or_graphId_required' };
  }
  const events = Array.isArray(body.events) ? body.events : [];
  if (!events.length) {
    return { ok: false, error: 'events_required' };
  }

  let chapter = body.chapter || null;
  if (!chapter && graphId) {
    try {
      const { getPackageChapterPath } = require('../shared/data-paths');
      const pkgId = String(graphId).replace(/^html-samples-/, '');
      const p = getPackageChapterPath(pkgId);
      if (p && fs.existsSync(p)) chapter = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* optional */ }
  }

  let record;
  const existingId = body.sessionId ? String(body.sessionId) : null;
  if (existingId && fs.existsSync(sessionPath(existingId))) {
    record = JSON.parse(fs.readFileSync(sessionPath(existingId), 'utf8'));
    record.events.push(...events);
    record.updatedAt = new Date().toISOString();
    record.eventCount = record.events.length;
    if (studentId) record.studentId = studentId;
    if (taskCode) record.taskCode = taskCode;
    if (body.studentLabel) record.studentLabel = studentLabel;
  } else {
    const sessionId = existingId || makeSessionId();
    record = {
      sessionId,
      catalogId,
      graphId,
      studentLabel,
      studentId: studentId || null,
      taskCode: taskCode || catalogId || null,
      ch: body.ch ?? 0,
      game: body.game || catalogId,
      traceVersion: body.traceVersion || 1,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      eventCount: events.length,
      events,
    };
  }

  enrichRecordMetrics(record, chapter);

  fs.writeFileSync(sessionPath(record.sessionId), JSON.stringify(record, null, 2), 'utf8');
  return {
    ok: true,
    sessionId: record.sessionId,
    eventCount: record.events.length,
    controlTuningCounts: record.controlTuningCounts,
    variableAdjustCounts: record.variableAdjustCounts,
    currentPhase: record.currentPhase,
  };
}

function readFilteredTraceRows({ graphId, catalogId } = {}) {
  ensureTracesRoot();
  const files = fs.readdirSync(getTracesRoot()).filter(f => f.endsWith('.json'));
  const rows = [];
  for (const file of files) {
    try {
      const row = JSON.parse(fs.readFileSync(path.join(getTracesRoot(), file), 'utf8'));
      if (graphId && row.graphId !== graphId) continue;
      if (catalogId && row.catalogId !== catalogId) continue;
      rows.push({
        sessionId: row.sessionId,
        catalogId: row.catalogId,
        graphId: row.graphId,
        studentLabel: row.studentLabel || '匿名学生',
        studentId: row.studentId || null,
        taskCode: row.taskCode || row.catalogId || null,
        ch: row.ch,
        startedAt: row.startedAt,
        updatedAt: row.updatedAt,
        eventCount: row.eventCount || row.events?.length || 0,
        judged: !!row.judgeResult,
        judgeResult: row.judgeResult || null,
        variableAdjustCounts: row.variableAdjustCounts || null,
        strategyPathSummary: row.strategyPathSummary || null,
        currentPhase: row.currentPhase || null,
      });
    } catch { /* skip corrupt */ }
  }
  return rows;
}

function studentGroupKey(row) {
  if (row.studentId) return String(row.studentId).trim();
  const label = String(row.studentLabel || '匿名学生').trim() || '匿名学生';
  if (label !== '匿名学生') return label;
  return `匿名 · ${String(row.sessionId || '').slice(-6)}`;
}

function listTraces({ graphId, catalogId, limit = 50 } = {}) {
  const rows = readFilteredTraceRows({ graphId, catalogId });
  rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return rows.slice(0, limit).map(({ judgeResult, ...rest }) => rest);
}

function getTraceStats({ graphId, catalogId } = {}) {
  const rows = readFilteredTraceRows({ graphId, catalogId });
  const studentKeys = new Set(rows.map(studentGroupKey));
  let pendingJudge = 0;
  let totalEvents = 0;
  let lastActivityAt = null;
  const verdictSummary = { pass: 0, in_progress: 0, learning: 0, other: 0 };
  const judgedByStudent = new Map();

  for (const row of rows) {
    if (!row.judged) pendingJudge += 1;
    else {
      const v = row.judgeResult?.verdict || 'other';
      if (verdictSummary[v] != null) verdictSummary[v] += 1;
      else verdictSummary.other += 1;
      const key = studentGroupKey(row);
      const prev = judgedByStudent.get(key);
      if (!prev || (row.updatedAt || '') > (prev.updatedAt || '')) {
        judgedByStudent.set(key, {
          studentKey: key,
          studentLabel: row.studentLabel || '匿名学生',
          verdict: v,
          updatedAt: row.updatedAt,
          sessionId: row.sessionId,
        });
      }
    }
    totalEvents += row.eventCount || 0;
    if (row.updatedAt && (!lastActivityAt || row.updatedAt > lastActivityAt)) {
      lastActivityAt = row.updatedAt;
    }
  }
  const totalSessions = rows.length;
  const judgedStudents = [...judgedByStudent.values()]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return {
    uniqueStudents: studentKeys.size,
    totalSessions,
    pendingJudge,
    judgedCount: totalSessions - pendingJudge,
    totalEvents,
    avgEventsPerSession: totalSessions ? Math.round(totalEvents / totalSessions) : 0,
    lastActivityAt,
    verdictSummary,
    judgedStudents,
  };
}

function listTraceStudents({ graphId, catalogId, q, status, limit = 100 } = {}) {
  const rows = readFilteredTraceRows({ graphId, catalogId });
  const groups = new Map();
  for (const row of rows) {
    const key = studentGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        studentKey: key,
        studentLabel: row.studentLabel || '匿名学生',
        sessionCount: 0,
        pendingCount: 0,
        totalEvents: 0,
        lastUpdatedAt: null,
        latestVerdict: null,
        sessions: [],
      });
    }
    const g = groups.get(key);
    g.sessionCount += 1;
    if (!row.judged) g.pendingCount += 1;
    g.totalEvents += row.eventCount || 0;
    if (row.updatedAt && (!g.lastUpdatedAt || row.updatedAt > g.lastUpdatedAt)) {
      g.lastUpdatedAt = row.updatedAt;
    }
    const verdict = row.judgeResult?.verdict || null;
    if (row.judged && verdict && (!g.latestVerdict || (row.updatedAt || '') >= (g.lastUpdatedAt || ''))) {
      g.latestVerdict = verdict;
    }
    g.sessions.push({
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      updatedAt: row.updatedAt,
      eventCount: row.eventCount,
      judged: row.judged,
      verdict,
      ch: row.ch,
    });
  }

  let items = [...groups.values()];
  const query = String(q || '').trim().toLowerCase();
  if (query) {
    items = items.filter(i =>
      i.studentKey.toLowerCase().includes(query)
      || i.studentLabel.toLowerCase().includes(query),
    );
  }
  if (status === 'pending') items = items.filter(i => i.pendingCount > 0);
  if (status === 'judged') items = items.filter(i => i.pendingCount === 0 && i.sessionCount > 0);

  items.sort((a, b) => (b.lastUpdatedAt || '').localeCompare(a.lastUpdatedAt || ''));
  for (const item of items) {
    item.sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (!item.latestVerdict) {
      const judged = item.sessions.find(s => s.judged && s.verdict);
      item.latestVerdict = judged?.verdict || null;
    }
  }
  return items.slice(0, limit);
}

function summarizeSessionEvents(session, chapter) {
  const events = session?.events || [];
  const byType = {};
  const byControl = {};
  for (const e of events) {
    const type = e.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    const control = e.payload?.control;
    if (control) byControl[control] = (byControl[control] || 0) + 1;
  }
  const metrics = aggregateSessionMetrics(events, chapter);
  const variableAdjustCounts = metrics.variableAdjustCounts?.length
    ? metrics.variableAdjustCounts
    : buildVariableAdjustCounts(metrics.controlTuningCounts || byControl, chapter);
  const variableAdjustCountsByPhase = buildPhaseVariableAdjustCounts(events, chapter);
  const topControls = Object.entries(metrics.controlTuningCounts || byControl)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([control, count]) => {
      const meta = resolveControlMeta(chapter, control);
      return { control, label: meta.label, role: meta.role, count };
    });
  return {
    byType,
    topControls,
    total: events.length,
    controlTuningCounts: metrics.controlTuningCounts,
    variableAdjustCounts,
    variableAdjustCountsByPhase,
    actionCounts: metrics.actionCounts,
    currentPhase: metrics.currentPhase,
    sawPhaseChange: metrics.sawPhaseChange,
  };
}

function getStudentTraceSummary(studentLabel) {
  const label = String(studentLabel || '').trim();
  if (!label) return { ok: false, error: 'studentLabel_required' };
  const rows = readFilteredTraceRows({});
  const byCatalog = new Map();
  for (const row of rows) {
    if (row.studentLabel !== label) continue;
    const full = getTraceSession(row.sessionId);
    if (!full) continue;
    const key = full.catalogId || full.graphId || 'unknown';
    if (!byCatalog.has(key)) {
      byCatalog.set(key, {
        catalogId: full.catalogId,
        graphId: full.graphId,
        sessionCount: 0,
        controlTuningCounts: {},
        actionCounts: {},
        verdicts: [],
        strategyRouteGuesses: [],
        lastUpdatedAt: null,
      });
    }
    const g = byCatalog.get(key);
    g.sessionCount += 1;
    enrichRecordMetrics(full);
    for (const [ctrl, n] of Object.entries(full.controlTuningCounts || {})) {
      g.controlTuningCounts[ctrl] = (g.controlTuningCounts[ctrl] || 0) + n;
    }
    if (!g.variableAdjustCounts) g.variableAdjustCounts = {};
    for (const row of full.variableAdjustCounts || []) {
      const key = row.label || row.controlId;
      g.variableAdjustCounts[key] = (g.variableAdjustCounts[key] || 0) + (row.adjustCount || 0);
    }
    for (const [act, n] of Object.entries(full.actionCounts || {})) {
      g.actionCounts[act] = (g.actionCounts[act] || 0) + n;
    }
    if (full.judgeResult?.verdict) g.verdicts.push(full.judgeResult.verdict);
    if (full.judgeResult?.inquiryPath?.strategyRouteGuess) {
      g.strategyRouteGuesses.push(full.judgeResult.inquiryPath.strategyRouteGuess);
    }
    if (full.updatedAt && (!g.lastUpdatedAt || full.updatedAt > g.lastUpdatedAt)) {
      g.lastUpdatedAt = full.updatedAt;
    }
  }
  const games = [...byCatalog.values()].sort((a, b) =>
    (b.lastUpdatedAt || '').localeCompare(a.lastUpdatedAt || ''),
  );
  return {
    ok: true,
    studentLabel: label,
    gameCount: games.length,
    games,
  };
}

function getTraceSession(sessionId) {
  const file = sessionPath(sessionId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveTraceSession(record) {
  if (!record?.sessionId) return { ok: false, error: 'sessionId_required' };
  ensureTracesRoot();
  enrichRecordMetrics(record);
  record.updatedAt = record.updatedAt || new Date().toISOString();
  fs.writeFileSync(sessionPath(record.sessionId), JSON.stringify(record, null, 2), 'utf8');
  return { ok: true, sessionId: record.sessionId };
}

function saveJudgeResult(sessionId, judgeResult) {
  const record = getTraceSession(sessionId);
  if (!record) return { ok: false, error: 'session_not_found' };
  record.judgeResult = judgeResult;
  record.judgedAt = new Date().toISOString();
  fs.writeFileSync(sessionPath(sessionId), JSON.stringify(record, null, 2), 'utf8');
  return { ok: true, sessionId };
}

const SESSION_ID_RE = /^sess-[a-zA-Z0-9-]+$/;

function deleteTraceSessions(sessionIds) {
  ensureTracesRoot();
  const ids = [...new Set((sessionIds || []).map(id => String(id).trim()).filter(Boolean))];
  const deleted = [];
  const notFound = [];
  const invalid = [];
  for (const id of ids) {
    if (!SESSION_ID_RE.test(id)) {
      invalid.push(id);
      continue;
    }
    const file = sessionPath(id);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      deleted.push(id);
    } else {
      notFound.push(id);
    }
  }
  return { ok: true, count: deleted.length, deleted, notFound, invalid };
}

/**
 * Classroom one-pager: sessions × games with inquiry-style aggregates.
 */
function getClassroomBoard({ graphId, catalogId, taskCode } = {}) {
  ensureTracesRoot();
  const files = fs.readdirSync(getTracesRoot()).filter(f => f.endsWith('.json'));
  const sessions = [];
  const pathTypeDist = {};
  let cvProbeSessions = 0;
  let totalAvAdjusts = 0;
  let totalCvAdjusts = 0;
  let scored = 0;
  let scoreSum = 0;

  for (const file of files) {
    let row;
    try {
      row = JSON.parse(fs.readFileSync(path.join(getTracesRoot(), file), 'utf8'));
    } catch {
      continue;
    }
    if (graphId && row.graphId !== graphId) continue;
    if (catalogId && row.catalogId !== catalogId) continue;
    if (taskCode && String(row.taskCode || row.catalogId || '') !== String(taskCode)) continue;

    const vars = row.variableAdjustCounts || [];
    let avN = 0;
    let cvN = 0;
    for (const v of vars) {
      if (v.role === 'confounding' || v.role === 'irrelevant') cvN += v.adjustCount || 0;
      else avN += v.adjustCount || 0;
    }
    totalAvAdjusts += avN;
    totalCvAdjusts += cvN;
    const cvTendency = avN > 0 ? cvN / avN : (cvN > 0 ? 1 : 0);
    if (cvTendency >= 0.35 || cvN >= 3) cvProbeSessions += 1;

    const pathType = row.strategyPathSummary?.type || row.strategyPathSummary?.primary || '未评分';
    pathTypeDist[pathType] = (pathTypeDist[pathType] || 0) + 1;
    const score = row.strategyPathSummary?.score;
    if (score != null && Number.isFinite(Number(score))) {
      scored += 1;
      scoreSum += Number(score);
    }

    sessions.push({
      sessionId: row.sessionId,
      studentLabel: row.studentLabel || '匿名学生',
      studentId: row.studentId || null,
      taskCode: row.taskCode || row.catalogId || null,
      graphId: row.graphId,
      catalogId: row.catalogId,
      eventCount: row.eventCount || row.events?.length || 0,
      avAdjustCount: avN,
      cvAdjustCount: cvN,
      cvTendency: Math.round(cvTendency * 1000) / 1000,
      pathType,
      pathScore: score != null ? Number(score) : null,
      scoredPhase: row.strategyPathSummary?.scoredPhase || null,
      pathText: row.strategyPathSummary?.text || null,
      advice: row.strategyPathSummary?.advice || null,
      updatedAt: row.updatedAt,
      judged: !!row.judgeResult,
      verdict: row.judgeResult?.verdict || null,
    });
  }

  sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    filters: { graphId: graphId || null, catalogId: catalogId || null, taskCode: taskCode || null },
    summary: {
      sessionCount: sessions.length,
      uniqueStudents: new Set(sessions.map(s => s.studentId || s.studentLabel)).size,
      cvProbeSessions,
      avgAvAdjusts: sessions.length ? Math.round(totalAvAdjusts / sessions.length) : 0,
      avgCvAdjusts: sessions.length ? Math.round((totalCvAdjusts / sessions.length) * 10) / 10 : 0,
      meanPathScore: scored ? Math.round((scoreSum / scored) * 1000) / 1000 : null,
      pathTypeDist,
    },
    sessions,
  };
}

function exportClassroomCsv(board) {
  const header = [
    'sessionId', 'studentId', 'studentLabel', 'taskCode', 'graphId', 'catalogId',
    'eventCount', 'avAdjustCount', 'cvAdjustCount', 'cvTendency',
    'pathType', 'pathScore', 'judged', 'verdict', 'updatedAt',
  ];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  for (const s of board.sessions || []) {
    lines.push([
      s.sessionId, s.studentId, s.studentLabel, s.taskCode, s.graphId, s.catalogId,
      s.eventCount, s.avAdjustCount, s.cvAdjustCount, s.cvTendency,
      s.pathType, s.pathScore, s.judged, s.verdict, s.updatedAt,
    ].map(esc).join(','));
  }
  return lines.join('\n');
}

module.exports = {
  ingestTrace,
  listTraces,
  getTraceStats,
  listTraceStudents,
  summarizeSessionEvents,
  aggregateSessionMetrics,
  buildPhaseVariableAdjustCounts,
  enrichRecordMetrics,
  buildVariableAdjustCounts,
  resolveControlMeta,
  getTraceSession,
  saveTraceSession,
  saveJudgeResult,
  deleteTraceSessions,
  getStudentTraceSummary,
  getClassroomBoard,
  exportClassroomCsv,
};
