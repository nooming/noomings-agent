/**
 * 策略路线种类：主路径 / 弱相关 / 旁路 / 陷阱 — 图谱与评判共用口径。
 */
const { isTrapRoute } = require('./coupled-invalid');

function isWeakProbeRoute(route) {
  if (!route) return false;
  return route.kind === 'weakProbe'
    || /^弱相关[·•.]/.test(String(route.label || ''));
}

function isConfoundProbeRoute(route) {
  if (!route) return false;
  if (isWeakProbeRoute(route)) return false;
  if (route.kind === 'confoundProbe' || route.warn === 'irrelevant') return true;
  return /试探(?:混淆)?[·•.]|旁路|confound|irrelevant/i.test(`${route.id || ''}${route.label || ''}`);
}

/**
 * 是否「主推单变量」路线 id（含 main、main_s-*；排除 weak/trap/confound）。
 */
function isMainLikeRouteGuess(routeId, routes = []) {
  if (routeId == null || routeId === '') return false;
  const id = String(routeId);
  const list = Array.isArray(routes) ? routes : [];
  const hit = list.find(r => r.id === id) || null;

  if (hit) {
    if (isWeakProbeRoute(hit) || isTrapRoute(hit) || isConfoundProbeRoute(hit)) return false;
    if (/^单变量·/.test(String(hit.label || ''))) return true;
    if (id === 'main' || /^main[_-]/i.test(id)) return true;
    return false;
  }

  if (id === 'main' || /^main[_-]/i.test(id)) return true;
  return false;
}

function adjustmentVarForControl(chapter, controlId) {
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  return avs.find(a => a.controlId === controlId) || null;
}

function routeForControl(chapter, controlId) {
  const av = adjustmentVarForControl(chapter, controlId);
  const routes = chapter?.strategy?.routes || [];
  if (!av) return null;

  const weak = av.role === 'secondary' || av.weak === true;
  const prefixes = weak ? ['弱相关·', '单变量·'] : ['单变量·', '弱相关·'];
  for (const prefix of prefixes) {
    const want = `${prefix}${av.label}`;
    const exact = routes.find(r => String(r.label || '').trim() === want);
    if (exact) return exact;
  }
  if (weak) {
    return routes.find(r => isWeakProbeRoute(r) && String(r.label || '').includes(av.label)) || null;
  }
  return routes.find(r =>
    /^单变量·/.test(String(r.label || ''))
    && String(r.label || '').includes(av.label),
  ) || null;
}

/**
 * 切段标签：与 strategy.routes.label 对齐（弱相关勿标成单变量·）。
 */
function segmentLabelForControl(chapter, controlId) {
  const route = routeForControl(chapter, controlId);
  if (route?.label) return String(route.label).trim();
  const av = adjustmentVarForControl(chapter, controlId);
  if (av?.label) {
    const weak = av.role === 'secondary' || av.weak === true;
    return `${weak ? '弱相关·' : '单变量·'}${av.label}`;
  }
  return `单变量·${controlId}`;
}

function isWeakSegmentLabel(label) {
  return /^弱相关·/.test(String(label || ''));
}

function isBypassSegmentLabel(label) {
  return label === '混淆触碰' || isWeakSegmentLabel(label);
}

function findRouteForSegmentLabel(routes, label) {
  if (!label || !routes?.length) return null;
  const exact = routes.find(r => String(r.label || '').trim() === label);
  if (exact) return exact;
  const stripped = String(label).replace(/^(单变量·|弱相关·)/, '').trim();
  if (!stripped) return null;
  return routes.find(r => String(r.label || '').includes(stripped)) || null;
}

function defaultScoreForSegmentLabel(label) {
  if (isWeakSegmentLabel(label)) return 0.5;
  if (/^单变量·/.test(String(label || ''))) return 0.75;
  return 0.75;
}

module.exports = {
  isWeakProbeRoute,
  isConfoundProbeRoute,
  isMainLikeRouteGuess,
  segmentLabelForControl,
  routeForControl,
  isWeakSegmentLabel,
  isBypassSegmentLabel,
  findRouteForSegmentLabel,
  defaultScoreForSegmentLabel,
};
