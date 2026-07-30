const { MAX_LEVELS, defaultSlotName } = require('./parse-utils');

function parseChNames(allText) {
  const m = allText.match(/(?:const|let|var)\s+CH_NAMES\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  const names = [];
  const re = /['"]([^'"]+)['"]/g;
  let hit;
  while ((hit = re.exec(m[1])) && names.length < MAX_LEVELS) {
    names.push(hit[1].trim());
  }
  return names.length >= 2 ? names : null;
}

function parseGameRegisterIndices(allText) {
  const indices = new Set();
  const re = /Game\.register\s*\(\s*(\d+)\s*,/g;
  let m;
  while ((m = re.exec(allText))) {
    indices.add(Number(m[1]));
    if (indices.size >= MAX_LEVELS) break;
  }
  if (indices.size < 2) return null;
  return [...indices].sort((a, b) => a - b);
}

function parseChapterScriptKeys(allText) {
  const m = allText.match(/(?:const|let|var)\s+CHAPTER_SCRIPTS\s*=\s*\{([\s\S]*?)\n\s*\};/);
  if (!m) return null;
  const keys = new Set();
  const re = /^\s*(\d+)\s*:/gm;
  let hit;
  while ((hit = re.exec(m[1]))) {
    keys.add(Number(hit[1]));
    if (keys.size >= MAX_LEVELS) break;
  }
  return keys.size >= 2 ? [...keys].sort((a, b) => a - b) : null;
}

function strategyChapterRegistry(allText) {
  if (!allText || typeof allText !== 'string') return null;

  const chNames = parseChNames(allText);
  const regIndices = parseGameRegisterIndices(allText);
  const scriptKeys = parseChapterScriptKeys(allText);

  const indices = regIndices || scriptKeys;
  if (!indices || indices.length < 2) return null;

  const hasRegistrySignals = /Game\.register\s*\(|CHAPTER_SCRIPTS|CH_NAMES/.test(allText);
  if (!hasRegistrySignals) return null;

  const levels = indices.slice(0, MAX_LEVELS).map((idx, i) => {
    const slotName = chNames?.[idx] || chNames?.[i] || defaultSlotName(i);
    return {
      index: i,
      slotName,
      slotDescription: slotName,
      nameSource: 'chapterRegistry',
      config: { chapterIndex: idx },
      isFreeMode: false,
    };
  });

  let confidence = 0.75;
  if (chNames && chNames.length === levels.length) confidence = 0.88;
  if (regIndices && scriptKeys && regIndices.length === scriptKeys.length) confidence = 0.9;

  return {
    source: 'chapterRegistry',
    levelCount: levels.length,
    levels,
    arrayName: 'CH_NAMES',
    uiLevelTotal: levels.length,
    confidence,
  };
}

module.exports = { strategyChapterRegistry, parseChNames, parseGameRegisterIndices };
