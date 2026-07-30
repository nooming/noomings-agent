const { formatLevelContextForPrompt } = require('../level-detect');
const { inferSourceComplexity, inferMinStrategyRoutes, inferFocusMode } = require('./source-scan');

/**
 * Extract applyLevelUI block body for a 1-based level number (brace-aware).
 */
function extractApplyLevelUIBlock(allText, levelNumber) {
  const fnStart = allText.indexOf('function applyLevelUI');
  if (fnStart < 0) return null;

  let open = allText.indexOf('{', fnStart);
  if (open < 0) return null;
  let depth = 0;
  let fnEnd = open;
  for (let i = open; i < allText.length; i++) {
    if (allText[i] === '{') depth += 1;
    else if (allText[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        fnEnd = i;
        break;
      }
    }
  }
  const body = allText.slice(open + 1, fnEnd);

  if (levelNumber === 6) {
    const elseIdx = body.lastIndexOf('} else {');
    if (elseIdx >= 0) {
      const braceStart = body.indexOf('{', elseIdx);
      if (braceStart >= 0) return extractBracedSlice(body, braceStart + 1);
    }
  }

  const headRe = new RegExp(
    `(?:^|[\\s;])(?:if|else if)\\s*\\(\\s*currentLevel\\s*===\\s*${levelNumber}\\s*\\)\\s*\\{`,
    'm',
  );
  const m = body.match(headRe);
  if (!m) return null;
  const braceStart = body.indexOf('{', m.index);
  return extractBracedSlice(body, braceStart + 1);
}

function extractBracedSlice(text, contentStart) {
  let depth = 1;
  let i = contentStart;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') depth -= 1;
    i += 1;
  }
  return text.slice(contentStart, i - 1);
}

/**
 * Static scan of applyLevelUI / currentLevel branches for per-level control visibility.
 * @param {string} allText full source
 * @param {number} levelNumber 1-based level id (matches currentLevel === N in source)
 */
function inferLevelActiveToggles(allText, levelNumber) {
  const toggles = { airResistance: false, planetSelect: false };
  if (!allText || levelNumber == null) return toggles;

  const block = extractApplyLevelUIBlock(allText, levelNumber);
  if (!block) return toggles;

  if (/airCheckbox\.disabled\s*=\s*false/i.test(block)) toggles.airResistance = true;
  else if (/airCheckbox\.checked\s*=\s*true/i.test(block) && !/airCheckbox\.disabled\s*=\s*true/i.test(block)) {
    toggles.airResistance = true;
  }

  if (/planetRow\.style\.display\s*=\s*['"]flex['"]/i.test(block)) toggles.planetSelect = true;

  return toggles;
}

function extractChapterRegistrySnippet(allText, chapterIndex) {
  if (chapterIndex == null || !allText) return '';
  const marker = `/* ===== js/chapters/ch${chapterIndex}.js ===== */`;
  const start = allText.indexOf(marker);
  if (start < 0) return '';
  const after = allText.slice(start + marker.length);
  const next = after.search(/\n\/\* ===== js\/chapters\/ch\d+/);
  const chunk = (next >= 0 ? after.slice(0, next) : after).trim();
  return chunk.slice(0, 8000);
}

/** Per-level config snippet for scoped generation prompts. */
function extractLevelSourceSnippet(allText, level) {
  if (!level) return '';
  const parts = [];
  if (level.nameSource === 'chapterRegistry' && level.config?.chapterIndex != null && allText) {
    const raw = extractChapterRegistrySnippet(allText, level.config.chapterIndex);
    if (raw) {
      parts.push('## 本章源码片段（内联章节）', '```javascript', raw, '```');
    }
  }
  if (level.rawSnippet) {
    parts.push('## 本关配置片段（来自源码）', '```javascript', String(level.rawSnippet).trim(), '```');
  } else if (level.config && Object.keys(level.config).length) {
    parts.push(`## 本关解析配置\n\`\`\`json\n${JSON.stringify(level.config, null, 2)}\n\`\`\``);
  }
  const ctx = formatLevelContextForPrompt(level);
  if (ctx) parts.push(ctx);
  if (allText && level.index != null) {
    const n = level.index + 1;
    const blockRe = new RegExp(`current\\w*(?:Level|Chapter|Stage)\\s*===\\s*${n}[\\s\\S]{0,1200}`, 'm');
    const block = allText.match(blockRe);
    if (block && !level.rawSnippet) {
      parts.push('## 本关分支代码片段', '```javascript', block[0].slice(0, 900), '```');
    }
  }
  return parts.filter(Boolean).join('\n');
}

/** Narrow global hints to what is active on a specific level. */
function narrowHintsForLevel(baseHints, level, allText) {
  const levelNumber = level?.index != null ? level.index + 1 : null;
  const activeToggles = levelNumber != null && allText
    ? inferLevelActiveToggles(allText, levelNumber)
    : { airResistance: false, planetSelect: false };

  const hasParsedBlock = levelNumber != null && allText
    && new RegExp(`currentLevel\\s*===\\s*${levelNumber}\\b`).test(allText);

  let hasCoupledControls = baseHints.hasCoupledControls;
  let modeToggleCount = baseHints.modeToggleCount;
  let hasConditionalParamProfile = baseHints.hasConditionalParamProfile;
  let envSelectMode = false;

  if (hasParsedBlock) {
    if (activeToggles.airResistance) {
      hasCoupledControls = true;
      modeToggleCount = Math.max(modeToggleCount, 1);
    } else if (activeToggles.planetSelect) {
      hasCoupledControls = false;
      modeToggleCount = Math.max(1, modeToggleCount > 0 ? 1 : 1);
      envSelectMode = true;
      hasConditionalParamProfile = false;
    } else {
      hasCoupledControls = false;
      modeToggleCount = 0;
      hasConditionalParamProfile = false;
    }
  }

  const sourceComplexity = inferSourceComplexity(modeToggleCount, baseHints.tunableInputCount, hasCoupledControls);

  return {
    hasCoupledControls,
    modeToggleCount,
    hasConditionalParamProfile,
    envSelectMode,
    sourceComplexity,
    activeToggles,
  };
}

function buildLevelGameHints(baseHints, level) {
  if (!baseHints || !level) return baseHints;
  const siblingSlotNames = (baseHints.levels || [])
    .filter(l => l.index !== level.index)
    .map(l => l.slotName)
    .filter(Boolean);
  const focusMode = inferFocusMode(level, baseHints);
  const allText = baseHints._sourceText || '';
  const narrowed = narrowHintsForLevel(baseHints, level, allText);
  const levelContext = {
    index: level.index,
    slotName: level.slotName,
    slotDescription: level.slotDescription,
    isFreeMode: !!level.isFreeMode,
    config: level.config || {},
    rawSnippet: level.rawSnippet || null,
    summary: formatLevelContextForPrompt(level),
    siblingSlotNames,
    focusMode,
    activeToggles: narrowed.activeToggles,
    envSelectMode: narrowed.envSelectMode,
  };
  const minStrategyRoutes = inferMinStrategyRoutes({
    modeToggleCount: narrowed.modeToggleCount,
    tunableInputCount: baseHints.tunableInputCount,
    hasCoupledControls: narrowed.hasCoupledControls,
    sourceComplexity: narrowed.sourceComplexity,
    levelContext,
  });
  return {
    ...baseHints,
    chLabel: level.slotName,
    levelContext,
    minStrategyRoutes,
    hasCoupledControls: narrowed.hasCoupledControls,
    modeToggleCount: narrowed.modeToggleCount,
    hasConditionalParamProfile: narrowed.hasConditionalParamProfile,
    sourceComplexity: narrowed.sourceComplexity,
  };
}

module.exports = {
  extractApplyLevelUIBlock,
  extractBracedSlice,
  inferLevelActiveToggles,
  extractLevelSourceSnippet,
  narrowHintsForLevel,
  buildLevelGameHints,
};
