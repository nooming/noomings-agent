/**
 * ?????????????tuning / snapshot / irrelevant_touch �?
 */

function filterEventsForChapter(trace, ch) {
  const events = trace?.events || [];
  if (!events.length) return [];
  if (events.some(e => typeof e.ch === 'number')) {
    return events.filter(e => e.ch === ch);
  }
  if (typeof trace.ch === 'number') return trace.ch === ch ? events : [];
  return events;
}

function getLegacyTypeMap(chapter) {
  return { ...(chapter?.traceMap?.legacyTypes || {}) };
}

function normalizeOneEvent(e, legacyMap) {
  const rule = legacyMap[e.type];
  if (rule) {
    if (rule.canonical === 'tuning') {
      return {
        ...e,
        type: 'tuning',
        payload: {
          control: rule.control,
          value: e.payload?.value,
          ...e.payload,
        },
      };
    }
    if (rule.canonical === 'irrelevant_touch') {
      return {
        ...e,
        type: 'irrelevant_touch',
        payload: {
          control: rule.control || e.payload?.control,
          ...e.payload,
        },
      };
    }
  }
  if (e.type?.startsWith('set_') && e.type !== 'set_irrelevant') {
    const control = e.type.slice(4);
    return {
      ...e,
      type: 'tuning',
      payload: { control, value: e.payload?.value, ...e.payload },
    };
  }
  return e;
}

/**
 * @param {object} trace
 * @param {object} [chapter]
 */
function normalizeTraceEvents(trace, chapter) {
  const events = trace?.events || [];
  const legacyMap = getLegacyTypeMap(chapter);
  let legacyAliasesApplied = 0;
  const out = events.map(e => {
    const before = e.type;
    const norm = normalizeOneEvent(e, legacyMap);
    if (norm.type !== before) legacyAliasesApplied += 1;
    return norm;
  });
  return { events: out, meta: { legacyAliasesApplied } };
}

/**
 * ?? control �?{ kgId, role }
 */
function buildControlRegistry(chapter) {
  const nodes = chapter?.kg?.nodes || [];
  const opNodes = nodes.filter(n => n.group === 'operation');
  const defaultOpId = opNodes[0]?.id || 'O1';
  const controls = { ...(chapter?.traceMap?.controls || {}) };

  return { controls, defaultOpId, opIds: opNodes.map(n => n.id) };
}

function roleForControl(chapter, control) {
  if (!control) return 'operation';
  const reg = buildControlRegistry(chapter);
  return reg.controls[control]?.role || 'operation';
}

function kgIdForControl(chapter, control) {
  const reg = buildControlRegistry(chapter);
  return reg.controls[control]?.kgId || reg.defaultOpId;
}

function isTuningEvent(e) {
  return e?.type === 'tuning';
}

function isIrrelevantEvent(e, chapter) {
  if (e?.type === 'irrelevant_touch') return true;
  if (e?.type === 'tuning') {
    return roleForControl(chapter, e.payload?.control) === 'irrelevant';
  }
  return false;
}

function isOperationTuning(e, chapter) {
  return isTuningEvent(e) && roleForControl(chapter, e.payload?.control) === 'operation';
}

function snapshotPayloadFromEvent(e) {
  if (e?.type === 'snapshot') return e.payload;
  if (e?.type === 'win') return e.payload?.snapshot || e.payload;
  if (e?.type === 'outcome') return e.payload?.snapshot || null;
  return null;
}

function filterEventsByChallengePhase(events) {
  const list = events || [];
  if (!list.some(e => e.type === 'phase_change')) return list;
  let inChallenge = false;
  const out = [];
  for (const e of list) {
    if (e.type === 'phase_change') {
      inChallenge = e.payload?.phase === 'challenge';
      out.push(e);
      continue;
    }
    if (inChallenge) out.push(e);
  }
  return out;
}

/**
 * ????????????? phase ????? phase_change ???? challenge ? tuning/action?
 */
function normalizeTraceForChapter(trace, chapter, ch, opts = {}) {
  const chapterFiltered = filterEventsForChapter(trace, ch);
  const phaseFilter = opts.phaseFilter !== false;
  const events = phaseFilter
    ? filterEventsByChallengePhase(chapterFiltered)
    : chapterFiltered;
  return normalizeTraceEvents({ events }, chapter);
}

module.exports = {
  filterEventsForChapter,
  filterEventsByChallengePhase,
  getLegacyTypeMap,
  normalizeTraceEvents,
  normalizeTraceForChapter,
  buildControlRegistry,
  roleForControl,
  kgIdForControl,
  isTuningEvent,
  isIrrelevantEvent,
  isOperationTuning,
  snapshotPayloadFromEvent,
};
