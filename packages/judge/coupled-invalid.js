/**
 * 模式开关 + 条件无效调参（stratInvalid）与永久无关控件（I*）的区分
 */

const { snapshotPayloadFromEvent } = require('./trace-normalize');

const MODE_CONTROL_RE = /modeToggle|mode|toggle|switch|feature|开关|模式/i;
const TRAP_ROUTE_RE = /迷思|无效|误区|trap|误调|param/i;

function chapterUsesCoupledInvalidModel(chapter) {
  const mm = String(chapter?.strategy?.mermaid || '');
  return /:::stratInvalid/i.test(mm) && /:::stratCond/i.test(mm);
}

function findModeControlIds(chapter) {
  const controls = chapter?.traceMap?.controls || {};
  return Object.keys(controls).filter(id => MODE_CONTROL_RE.test(id));
}

function findOperationControlIds(chapter) {
  const controls = chapter?.traceMap?.controls || {};
  return Object.keys(controls).filter(id => controls[id]?.role === 'operation');
}

function findConditionalParamControls(chapter, modeControl) {
  const ops = findOperationControlIds(chapter).filter(id => id !== modeControl);
  if (chapter?.traceMap?.controls?.paramB) return ['paramB'];
  const mm = String(chapter?.strategy?.mermaid || '');
  if (/paramB|CheckParamB|条件无效参数/.test(mm)) {
    const named = ops.filter(id => /paramB|param_b/i.test(id));
    if (named.length) return named;
  }
  const candidates = ops.filter(id => !MODE_CONTROL_RE.test(id));
  return candidates.length ? [candidates[0]] : [];
}

/** @returns {{ modeControl: string, invalidWhenModeOff: string[] } | null} */
function getConditionalInvalidSpec(chapter) {
  if (!chapterUsesCoupledInvalidModel(chapter)) return null;
  const modeIds = findModeControlIds(chapter);
  if (!modeIds.length) return null;
  const modeControl = modeIds[0];
  const invalidWhenModeOff = findConditionalParamControls(chapter, modeControl);
  if (!invalidWhenModeOff.length) return null;
  return { modeControl, invalidWhenModeOff };
}

function inferModeEnabledAt(events, index, spec) {
  if (!spec) return null;
  let enabled = null;
  for (let i = 0; i < index; i++) {
    const e = events[i];
    const snap = snapshotPayloadFromEvent(e);
    if (snap?.mode && typeof snap.mode.modeOn === 'boolean') {
      enabled = snap.mode.modeOn;
    }
    if (e.type === 'tuning' && e.payload?.control === spec.modeControl) {
      enabled = !!e.payload?.value;
    }
  }
  return enabled;
}

/**
 * @param {object[]} events normalized
 * @param {object} chapter
 */
function analyzeCoupledTouches(events, chapter) {
  const spec = getConditionalInvalidSpec(chapter);
  const misconceptionControls = [];
  const permanentIrrelevant = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'irrelevant_touch') {
      permanentIrrelevant.push(e.payload?.control || 'irrelevant');
      continue;
    }
    if (e.type !== 'tuning') continue;
    const control = e.payload?.control;
    const role = chapter?.traceMap?.controls?.[control]?.role;
    if (role === 'irrelevant') {
      permanentIrrelevant.push(control);
      continue;
    }
    if (!spec || !control) continue;
    if (!spec.invalidWhenModeOff.includes(control)) continue;
    const modeOn = inferModeEnabledAt(events, i, spec);
    if (modeOn === false) {
      misconceptionControls.push(control);
    }
  }

  return {
    spec,
    misconceptionControls: [...new Set(misconceptionControls)],
    permanentIrrelevantControls: [...new Set(permanentIrrelevant)],
  };
}

function isTrapRoute(route) {
  if (!route) return false;
  if (route.id === 'trap' || route.warn === 'irrelevant') return true;
  return TRAP_ROUTE_RE.test(route.label || '') || TRAP_ROUTE_RE.test(route.id || '');
}

module.exports = {
  chapterUsesCoupledInvalidModel,
  getConditionalInvalidSpec,
  analyzeCoupledTouches,
  isTrapRoute,
  findModeControlIds,
};
