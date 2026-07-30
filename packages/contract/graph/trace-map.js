const {
  inferSliderControlIds,
  inferActionTriggerControlIds,
  isTraceUiControlId,
  isTraceMapExcludedControlId,
} = require('../../generate/hints');

function hasTraceMapControls(chapter) {
  const controls = chapter?.traceMap?.controls;
  return controls && typeof controls === 'object' && Object.keys(controls).length > 0;
}

function defaultOperationKgId(chapter) {
  const op = (chapter.kg?.nodes || []).find(n => n.group === 'operation' && n.layer === 'play');
  return op?.id || 'O1';
}

function pickOperationControlIds(gameHints, sources) {
  const seen = new Set();
  const ids = [];
  const push = id => {
    if (!id || isTraceMapExcludedControlId(id) || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  (gameHints?.sliderControlIds || []).forEach(push);
  (gameHints?.actionTriggerControlIds || []).forEach(push);

  if (ids.length) return ids;

  const allText = (sources || []).map(s => s.content || '').join('\n');
  if (allText) {
    inferSliderControlIds(allText).forEach(push);
    inferActionTriggerControlIds(allText).forEach(push);
  }
  return ids;
}

function hasSourceControlSignals(gameHints, sources) {
  if ((gameHints?.sliderControlIds || []).length) return true;
  if ((gameHints?.actionTriggerControlIds || []).length) return true;
  if ((gameHints?.tunableInputCount ?? 0) >= 1) return true;
  const allText = (sources || []).map(s => s.content || '').join('\n');
  return allText ? inferSliderControlIds(allText).length > 0 : false;
}

/**
 * 删除 kgId 不存在、HUD 误标 irrelevant 的条目；合并滑条→O* �?KG 中已�?I*�?
 */
function sanitizeTraceMapControls(chapter, gameHints, sources) {
  const nodes = chapter.kg?.nodes || [];
  const validKgIds = new Set(nodes.map(n => n.id));
  const operationKgId = defaultOperationKgId(chapter);
  const existing = chapter.traceMap?.controls;
  const mapped = {};

  if (existing && typeof existing === 'object') {
    Object.entries(existing).forEach(([ctrl, spec]) => {
      if (isTraceMapExcludedControlId(ctrl)) return;
      if (!spec?.kgId || !validKgIds.has(spec.kgId)) return;
      if (spec.role === 'irrelevant' && isTraceUiControlId(ctrl)) return;
      if (!['operation', 'irrelevant'].includes(spec.role)) return;
      mapped[ctrl] = { kgId: spec.kgId, role: spec.role };
    });
  }

  const opIds = pickOperationControlIds(gameHints, sources);
  opIds.forEach(id => {
    if (!mapped[id]) {
      mapped[id] = { kgId: operationKgId, role: 'operation' };
    }
  });

  nodes.filter(n => n.group === 'irrelevant').forEach(n => {
    const hasIrr = Object.values(mapped).some(s => s.kgId === n.id && s.role === 'irrelevant');
    if (!hasIrr && !mapped[n.id]) {
      mapped[n.id] = { kgId: n.id, role: 'irrelevant' };
    }
  });

  if (!Object.keys(mapped).length) {
    if (hasSourceControlSignals(gameHints, sources) && opIds.length) {
      opIds.forEach(id => {
        mapped[id] = { kgId: operationKgId, role: 'operation' };
      });
    } else {
      return chapter;
    }
  }

  return {
    ...chapter,
    traceMap: {
      ...(chapter.traceMap || {}),
      controls: mapped,
      legacyTypes: chapter.traceMap?.legacyTypes,
    },
  };
}

function ensureCoupledTraceMap(chapter, gameHints) {
  if (hasTraceMapControls(chapter)) return chapter;
  const coupled = gameHints?.hasCoupledControls && (gameHints?.modeToggleCount ?? 0) >= 1;
  if (!coupled) return chapter;
  const ids = gameHints?.inferredControlIds || [];
  if (!ids.length) return chapter;
  const mapped = {};
  ids.forEach(id => {
    mapped[id] = { kgId: defaultOperationKgId(chapter), role: 'operation' };
  });
  return { ...chapter, traceMap: { ...(chapter.traceMap || {}), controls: mapped } };
}

/**
 * 通用课件：清洗非�?traceMap 并补全滑条映射（即使 LLM 已输�?controls）�?
 */
function ensureGenericTraceMap(chapter, gameHints, sources) {
  return sanitizeTraceMapControls(chapter, gameHints, sources);
}

function ensureTraceMap(chapter, gameHints, sources) {
  let ch = ensureCoupledTraceMap(chapter, gameHints);
  ch = ensureGenericTraceMap(ch, gameHints, sources);
  return ch;
}

module.exports = {
  ensureCoupledTraceMap,
  ensureGenericTraceMap,
  ensureTraceMap,
  sanitizeTraceMapControls,
  hasTraceMapControls,
};
