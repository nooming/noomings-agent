const { MAX_LEVELS, truncateSlotName, defaultSlotName, inferUiLevelTotal } = require('./parse-utils');

function strategyUiTotal(allText) {
  const total = inferUiLevelTotal(allText);
  if (!total || total < 2) return null;

  const hasExplicitTotal = /本模式共\s*\d+\s*关|共\s*\d+\s*�?.test(allText);
  const levels = Array.from({ length: Math.min(total, MAX_LEVELS) }, (_, i) => ({
    index: i,
    slotName: defaultSlotName(i),
    config: {},
    isFreeMode: false,
    nameSource: 'default',
    rawSnippet: `uiTotal ${i + 1}/${total}`,
  }));

  return {
    source: 'uiTotal',
    confidence: hasExplicitTotal ? 0.55 : 0.5,
    levelCount: levels.length,
    levels,
    arrayName: null,
    uiLevelTotal: total,
  };
}

module.exports = { strategyUiTotal };
