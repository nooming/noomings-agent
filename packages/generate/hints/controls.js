function inferControlIds(allText) {
  const seen = new Set();
  const ids = [];
  const re = /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;
  let m;
  while ((m = re.exec(allText)) !== null) {
    const id = m[1];
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.slice(0, 12);
}

const TRACE_UI_EXCLUDE_RE = /^(btn|hud|menu|canvas|msg|target|level|total|disp-|dir-in|dir-out|gameCanvas|coordTooltip|bottomHint|messageOverlay|instructionModal|menuOverlay)/i;

const TRACE_MAP_EXCLUDE_RE = /^(score|remaining|modeLabel|challengeLevel|gameOverlay|overlayTitle|overlayMsg|toast|tutorialHud|tutorialNextBtn|tutorialExitBtn|helpBtn|helpModal|closeHelpBtn|resetBtn|playAgainBtn)/i;

function isTraceUiControlId(id) {
  return TRACE_UI_EXCLUDE_RE.test(id) || /^btn[A-Z]/i.test(id);
}

/** traceMap 应排除的 HUD/模式/可选开关 id（通用 pattern） */
function isTraceMapExcludedControlId(id) {
  if (!id || isTraceUiControlId(id)) return true;
  if (TRACE_MAP_EXCLUDE_RE.test(id)) return true;
  if (/^switch\w*Btn$/i.test(id)) return true;
  if (/^toggle\w+Btn$/i.test(id)) return true;
  if (/Overlay|Modal|Hud|toast/i.test(id)) return true;
  return false;
}

/** 源码以「非白球/remaining」计分进洞过关（通用） */
function detectScoringTargetWin(allText) {
  const hasScoring = /isScoringBall|!ball\.isWhite|!b\.isWhite/.test(allText);
  const hasPocketWin = /inPocket|remaining\s*===\s*0|remaining\s*==\s*0|进洞|pocket/i.test(allText);
  return hasScoring && hasPocketWin;
}

/** 可选 UI 开关（通常非过关 gate） */
function inferOptionalUiToggleIds(allText) {
  const ids = new Set();
  const idRe = /id\s*=\s*['"]([^'"]+)['"]/gi;
  let m;
  while ((m = idRe.exec(allText)) !== null) {
    const id = m[1];
    if (/^toggleGuideBtn$/i.test(id) || /^toggleChargeBtn$/i.test(id)) ids.add(id);
    if (/^switch\w*Btn$/i.test(id)) ids.add(id);
  }
  return [...ids];
}

function isOptionalToggleWinCoupled(allText, toggleId) {
  if (!toggleId || !allText) return false;
  const winRegion = [
    ...(allText.match(/function\s+(?:checkWin|isWin|updateUI|gameLoop)[\s\S]{0,4000}/gi) || []),
    ...(allText.match(/remaining[\s\S]{0,2500}/gi) || []),
    ...(allText.match(/conditionMet[\s\S]{0,1500}/gi) || []),
  ].join('\n');
  const esc = toggleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(esc).test(winRegion);
}

function buildOptionalToggleWinCoupled(allText, toggleIds) {
  const map = {};
  for (const id of toggleIds || []) {
    map[id] = isOptionalToggleWinCoupled(allText, id);
  }
  return map;
}

/** range 滑条或 paramInputs 中的调参控件 id（通用课件） */
function inferSliderControlIds(allText) {
  const seen = new Set();
  const ids = [];

  const rangeRe = /<input[^>]*type\s*=\s*['"]range['"][^>]*id\s*=\s*['"]([^'"]+)['"]/gi;
  let m;
  while ((m = rangeRe.exec(allText)) !== null) {
    const id = m[1];
    if (id && !isTraceUiControlId(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  const rangeRe2 = /id\s*=\s*['"](input-[^'"]+)['"][^>]*type\s*=\s*['"]range['"]/gi;
  while ((m = rangeRe2.exec(allText)) !== null) {
    const id = m[1];
    if (id && !isTraceUiControlId(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  const paramArr = allText.match(/paramInputs\s*=\s*\[([^\]]+)\]/);
  if (paramArr) {
    const keys = paramArr[1].match(/['"]([^'"]+)['"]/g) || [];
    keys.forEach(k => {
      const key = k.replace(/['"]/g, '');
      const id = `input-${key}`;
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    });
  }

  for (const id of inferControlIds(allText)) {
    if (/^input-/i.test(id) && !isTraceUiControlId(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids.slice(0, 16);
}

/** checkbox / radio / select / toggle 等离散控件 id（非 range 滑条） */
function inferDiscreteControlIds(allText, sliderIds = []) {
  const sliderSet = new Set(sliderIds || []);
  const seen = new Set();
  const ids = [];
  const push = id => {
    if (!id || sliderSet.has(id) || isTraceUiControlId(id) || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  let m;
  const inputPatterns = [
    /<input[^>]*type\s*=\s*['"]checkbox['"][^>]*id\s*=\s*['"]([^'"]+)['"]/gi,
    /id\s*=\s*['"]([^'"]+)['"][^>]*type\s*=\s*['"]checkbox['"]/gi,
    /<input[^>]*type\s*=\s*['"]radio['"][^>]*id\s*=\s*['"]([^'"]+)['"]/gi,
    /id\s*=\s*['"]([^'"]+)['"][^>]*type\s*=\s*['"]radio['"]/gi,
  ];
  for (const re of inputPatterns) {
    while ((m = re.exec(allText)) !== null) push(m[1]);
  }

  const selectRe = /<select[^>]*id\s*=\s*['"]([^'"]+)['"]/gi;
  while ((m = selectRe.exec(allText)) !== null) push(m[1]);

  for (const id of inferOptionalUiToggleIds(allText)) push(id);

  const checkedRe = /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)[^.]{0,48}\.checked/gi;
  while ((m = checkedRe.exec(allText)) !== null) push(m[1]);

  const toggleBtnRe = /id\s*=\s*['"]((?:switch|toggle)\w*)['"]/gi;
  while ((m = toggleBtnRe.exec(allText)) !== null) push(m[1]);

  return ids.slice(0, 16);
}

const ACTION_TRIGGER_ID_RE = /(apply|fire|shoot|launch|force|hit|play)/i;
const MODE_SWITCH_ID_RE = /switch|mode|free|challenge|tutorial|toggleCharge|toggleGuide/i;

/** 发射/施力等操作触发控件 id（通用 pattern，非硬编码 id） */
function inferActionTriggerControlIds(allText) {
  const seen = new Set();
  const ids = [];
  const push = id => {
    if (!id || isTraceUiControlId(id) || MODE_SWITCH_ID_RE.test(id) || seen.has(id)) return;
    if (!ACTION_TRIGGER_ID_RE.test(id)) return;
    seen.add(id);
    ids.push(id);
  };

  const blockRe = /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)[^;]{0,240}addEventListener\s*\(\s*['"]click['"]/gi;
  let m;
  while ((m = blockRe.exec(allText)) !== null) push(m[1]);

  const idRe = /id\s*=\s*['"]([^'"]+)['"][^>]*type\s*=\s*['"]button['"]/gi;
  while ((m = idRe.exec(allText)) !== null) push(m[1]);

  return ids.slice(0, 8);
}

/** 调参 + 操作 + 观察反馈环信号（通用课件） */
function detectActionObserveLoop(allText) {
  const hasRange = /type\s*=\s*['"]range['"]/i.test(allText);
  const hasAction = inferActionTriggerControlIds(allText).length > 0
    || /addEventListener\s*\(\s*['"]click['"]/i.test(allText);
  const hasObserve = /观察|落点|偏近|偏远|未命中|未达标|hud-|score|result/i.test(allText);
  return hasRange && hasAction && hasObserve;
}

module.exports = {
  inferControlIds,
  inferSliderControlIds,
  inferDiscreteControlIds,
  inferActionTriggerControlIds,
  detectActionObserveLoop,
  isTraceUiControlId,
  isTraceMapExcludedControlId,
  detectScoringTargetWin,
  inferOptionalUiToggleIds,
  isOptionalToggleWinCoupled,
  buildOptionalToggleWinCoupled,
};
