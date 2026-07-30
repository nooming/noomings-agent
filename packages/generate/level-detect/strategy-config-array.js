const {
  MAX_LEVELS,
  ARRAY_NAMES,
  LEVEL_SWITCH_FUNCS,
  CURRENT_VAR_RE,
  findLevelArray,
  parseLevelObject,
  parseLevelStringLiteral,
  extractCommentSlotName,
  truncateSlotName,
  defaultSlotName,
  inferUiLevelTotal,
} = require('./parse-utils');

function hasConfigArrayUsageSignals(allText, arrayName) {
  const esc = arrayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${esc}\\s*\\[`, 'm').test(allText)) return true;
  if (new RegExp(`\\b${esc}\\.length\\b`).test(allText)) return true;
  if (/loadLevel\s*\(|loadChapter\s*\(|loadStage\s*\(/.test(allText)) return true;
  if (LEVEL_SWITCH_FUNCS.some(fn => new RegExp(`\\b${fn}\\s*\\(`).test(allText))) return true;
  if (CURRENT_VAR_RE.test(allText)) return true;
  if (new RegExp(`\\b${esc}\\s*\\[\\s*\\w+\\s*-\\s*1\\s*\\]`).test(allText)) return true;
  return false;
}

function strategyConfigArray(allText) {
  const found = findLevelArray(allText);
  if (!found) return null;

  const { arrayName, items, arrayInner } = found;
  const hasUsage = hasConfigArrayUsageSignals(allText, arrayName);
  if (!hasUsage && items.length < 2) return null;

  const levels = items.slice(0, MAX_LEVELS).map((item, i) => {
    if (item.type === 'object') {
      const commentSlot = extractCommentSlotName(arrayInner, item.start);
      return parseLevelObject(item.text, i, commentSlot);
    }
    return parseLevelStringLiteral(item.text, i);
  });

  const uiTotal = inferUiLevelTotal(allText);
  let confidence = hasUsage ? 0.9 : 0.7;
  if (uiTotal && uiTotal === levels.length) confidence = 0.9;
  const esc = arrayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${esc}\\.length\\b`).test(allText)) {
    confidence = Math.max(confidence, 0.85);
  }

  return {
    source: 'configArray',
    confidence,
    levelCount: levels.length,
    levels,
    arrayName,
  };
}

module.exports = { strategyConfigArray };
