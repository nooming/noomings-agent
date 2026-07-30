/**
 * Classify play constraint nodes as outcome vs param-range gates (generic regex only).
 */
const OUTCOME_GATE_RE = /进洞|出界|击中|碰撞|障碍|目标球|未进球|飞过边界|飞出边界|飞出|边界|命中|挡板|目标区域|达标|过环|停稳|减速带|落地|击穿|remaining|canvas|target/i;

const PARAM_GATE_LABEL_RE = /在范围\?|参数在范围|滑条在范围|方向锁定\?|强度在范围\?|参数在\?/i;

function isParamGateLabel(label) {
  const s = String(label || '').trim();
  if (!s) return false;
  if (PARAM_GATE_LABEL_RE.test(s)) return true;
  if (/在范围\?/.test(s)) return true;
  if (/参数.*在范围/.test(s)) return true;
  return /^(?:[\w\u4e00-\u9fff]+\s+)?在范围/.test(s) && /\?/.test(s);
}

function isOutcomeGateText(label, desc) {
  const labelText = String(label || '');
  const descText = String(desc || '');
  if (OUTCOME_GATE_RE.test(labelText)) return true;
  if (labelText && OUTCOME_GATE_RE.test(descText)) return true;
  return !labelText && OUTCOME_GATE_RE.test(descText);
}

function countConstraintGateTypes(constraints) {
  let paramGates = 0;
  let outcomeGates = 0;
  for (const c of constraints || []) {
    const label = String(c.label || '');
    const desc = String(c.desc || '');
    if (isParamGateLabel(label)) paramGates += 1;
    if (isOutcomeGateText(label, desc)) outcomeGates += 1;
  }
  return { paramGates, outcomeGates };
}

function normalizeSlotRef(text) {
  return String(text || '').replace(/\s+/g, '');
}

function slotRefContained(haystack, needle) {
  const h = normalizeSlotRef(haystack);
  const n = normalizeSlotRef(needle);
  if (!n) return true;
  return h.includes(n);
}

module.exports = {
  OUTCOME_GATE_RE,
  PARAM_GATE_LABEL_RE,
  isParamGateLabel,
  isOutcomeGateText,
  countConstraintGateTypes,
  normalizeSlotRef,
  slotRefContained,
};
