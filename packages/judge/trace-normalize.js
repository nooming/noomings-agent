/**
 * 轨迹事件归一化：legacyTypes / set_* → tuning / irrelevant_touch
 * 注意：win / snapshot 等规范类型不可被 legacyTypes 改写成 tuning。
 */

/** 已是规范语义的事件类型：禁止被 legacyTypes 重映射（否则 win→tuning 会丢通关） */
const IMMUTABLE_EVENT_TYPES = new Set([
  'win',
  'snapshot',
  'phase_change',
  'puzzle_open',
  'outcome',
  'win_attempt',
  'action',
  'irrelevant_touch',
]);

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
  if (!e?.type || IMMUTABLE_EVENT_TYPES.has(e.type)) return e;

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
 * 探究段事件：有 phase_change 时仅保留 phase===explore 期间的事件（含 phase_change 标记）。
 * 无 phase_change 时回退为全量（与 challenge 过滤对称）。
 */
function filterEventsByExplorePhase(events) {
  const list = events || [];
  if (!list.some(e => e.type === 'phase_change')) return list;
  let inExplore = false;
  const out = [];
  for (const e of list) {
    if (e.type === 'phase_change') {
      inExplore = e.payload?.phase === 'explore';
      out.push(e);
      continue;
    }
    if (inExplore) out.push(e);
  }
  return out;
}

function isTuningOrFireEvent(e) {
  return e?.type === 'tuning' || e?.type === 'action';
}

/**
 * 路径类型浮层 / strategy-path-summary 评分范围（对齐 Agent B：策略与 switchKind 看竞赛段）。
 * - 有 phase_change 且竞赛段存在 tuning/fire → 仅竞赛段，mode=compete
 * - 无竞赛操作（探究段即过关）或无 phase_change → 全量回退，mode 默认 explore
 * @param {object[]} events
 * @param {{ phaseScope?: string, mode?: string }} [opts]
 * @returns {{ events: object[], mode: 'compete'|'explore', scoredPhase: 'challenge'|'full'|'explore' }}
 */
function resolveStrategyPathScoreScope(events, opts = {}) {
  const list = Array.isArray(events) ? events : [];
  const phaseScope = String(opts.phaseScope || '').trim();
  const preferMode = opts.mode === 'compete' ? 'compete' : 'explore';

  if (phaseScope === 'full') {
    return { events: list, mode: preferMode, scoredPhase: 'full' };
  }

  const hasPhaseChange = list.some(e => e.type === 'phase_change');

  if (phaseScope === 'explore') {
    // 仅在真实存在 phase_change 且探究段有调参/发射时标 scoredPhase=explore；
    // 无分段时回退 full，避免双标签误把全会话当成「探究段」。
    const explore = filterEventsByExplorePhase(list);
    if (hasPhaseChange && explore.some(isTuningOrFireEvent)) {
      return { events: explore, mode: 'explore', scoredPhase: 'explore' };
    }
    return { events: list, mode: 'explore', scoredPhase: 'full' };
  }

  // phaseScope 为空 / challenge / 其它：有竞赛操作则评竞赛段，否则全量回退
  if (hasPhaseChange) {
    const challenge = filterEventsByChallengePhase(list);
    if (challenge.some(isTuningOrFireEvent)) {
      return { events: challenge, mode: 'compete', scoredPhase: 'challenge' };
    }
    // 竞赛段无调参/发射（探究段即过关等）→ 全量回退
    return { events: list, mode: 'explore', scoredPhase: 'full' };
  }

  // 无 phase_change：无法按段过滤，评全量（mode 可跟客户端/会话提示）
  return { events: list, mode: preferMode, scoredPhase: 'full' };
}

/**
 * @param {object} trace
 * @param {object} [chapter]
 * @param {number} ch
 * @param {object} [opts]
 * @param {boolean|'challenge'|'explore'} [opts.phaseFilter=true]
 *   true/'challenge' → 竞赛段；'explore' → 探究段；false → 本章全量事件
 */
function normalizeTraceForChapter(trace, chapter, ch, opts = {}) {
  const chapterFiltered = filterEventsForChapter(trace, ch);
  const pf = opts.phaseFilter;
  let events = chapterFiltered;
  if (pf === false) {
    events = chapterFiltered;
  } else if (pf === 'explore') {
    events = filterEventsByExplorePhase(chapterFiltered);
  } else {
    // true | 'challenge' | undefined
    events = filterEventsByChallengePhase(chapterFiltered);
  }
  return normalizeTraceEvents({ events }, chapter);
}

module.exports = {
  filterEventsForChapter,
  filterEventsByChallengePhase,
  filterEventsByExplorePhase,
  resolveStrategyPathScoreScope,
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
  IMMUTABLE_EVENT_TYPES,
};
