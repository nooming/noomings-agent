const { inferUiLevelTotal } = require('./parse-utils');
const { strategyConfigArray } = require('./strategy-config-array');
const { strategySelectOptions } = require('./strategy-select');
const { strategyBranchSwitch } = require('./strategy-branch');
const { strategyUiTotal } = require('./strategy-ui-total');
const { strategyChapterRegistry } = require('./strategy-chapter-registry');

function detectLevelCandidates(allText) {
  const candidates = [];
  const config = strategyConfigArray(allText);
  if (config) candidates.push(config);
  const registry = strategyChapterRegistry(allText);
  if (registry) candidates.push(registry);
  const select = strategySelectOptions(allText);
  if (select) candidates.push(select);
  const branch = strategyBranchSwitch(allText);
  if (branch) candidates.push(branch);
  const ui = strategyUiTotal(allText);
  if (ui) candidates.push(ui);
  return candidates;
}

function pickPrimaryCandidate(candidates) {
  const order = ['configArray', 'chapterRegistry', 'selectOptions', 'branchSwitch', 'uiTotal'];
  for (const src of order) {
    const c = candidates.find(x => x.source === src);
    if (c && c.levelCount >= 2) return c;
  }
  return candidates.find(c => c.levelCount >= 2) || null;
}

function enrichSlotNames(baseLevels, nameLevels, nameSource) {
  if (!nameLevels?.length) return baseLevels;
  const shortNameSources = new Set(['select', 'config', 'comment']);
  return baseLevels.map((lvl, i) => {
    const alt = nameLevels[i];
    if (!alt?.slotName) return lvl;

    if (nameSource === 'branch') {
      if (shortNameSources.has(lvl.nameSource) && lvl.slotName) {
        return { ...lvl, slotDescription: alt.slotName };
      }
      if (lvl.nameSource === 'default' || lvl.nameSource === 'branch' || !lvl.slotName) {
        return {
          ...lvl,
          slotName: alt.slotName,
          slotDescription: alt.slotName,
          nameSource: alt.nameSource || nameSource,
        };
      }
      return { ...lvl, slotDescription: alt.slotName };
    }

    if (lvl.nameSource === 'config' && lvl.slotName && !lvl.slotName.startsWith('第')) {
      return lvl;
    }
    if (lvl.nameSource === 'comment') return lvl;
    if (alt.slotName.startsWith('第') && !lvl.slotName.startsWith('第')) {
      return { ...lvl, slotName: alt.slotName, nameSource: alt.nameSource || nameSource };
    }
    if (nameSource === 'select' || (lvl.slotName.startsWith('第') && !alt.slotName.startsWith('第'))) {
      return { ...lvl, slotName: alt.slotName, nameSource: alt.nameSource || nameSource };
    }
    return lvl;
  });
}

function mergeLevelCandidates(candidates, allText) {
  const empty = {
    hasMultipleLevels: false,
    levelCount: 0,
    levels: [],
    uiLevelTotal: inferUiLevelTotal(allText),
    arrayName: null,
    detectionSource: null,
    detectionWarnings: [],
  };
  if (!candidates.length) return empty;

  const usable = candidates.filter(c => c.levelCount >= 2);
  if (!usable.length) return empty;

  const warnings = [];
  const counts = [...new Set(usable.map(c => c.levelCount))];
  if (counts.length > 1) {
    warnings.push(`count_mismatch: ${usable.map(c => `${c.source}=${c.levelCount}`).join(', ')}`);
  }

  let primary = pickPrimaryCandidate(usable);

  const branchOnlyTwo = usable.find(c => c.source === 'branchSwitch' && c.levelCount === 2);
  if (primary?.source === 'branchSwitch' && primary.levelCount === 2 && branchOnlyTwo) {
    const corroborated = usable.some(c =>
      c.source !== 'branchSwitch' && c.levelCount === 2,
    );
    if (!corroborated && !usable.some(c => c.confidence >= 0.75 && c.source !== 'branchSwitch')) {
      return empty;
    }
  }

  if (primary?.source === 'uiTotal' && primary.confidence < 0.6) {
    const stronger = usable.find(c => c.confidence >= 0.6);
    if (stronger) primary = stronger;
    else {
      const uiCand = usable.find(c => c.source === 'uiTotal');
      const arrayLengthSignal = /\w*(?:Levels|levels|Chapters|chapters|Stages|stages)\.length/.test(allText);
      const corroborated = uiCand && (
        usable.some(c => c.source !== 'uiTotal' && c.levelCount === uiCand.levelCount)
        || (arrayLengthSignal && uiCand.confidence >= 0.55)
      );
      if (!corroborated) return empty;
    }
  }

  let levels = primary.levels.map((l, i) => ({ ...l, index: i }));
  let arrayName = primary.arrayName || null;
  const sources = [primary.source];

  const selectCand = usable.find(c => c.source === 'selectOptions');
  if (selectCand && primary.source === 'configArray') {
    levels = enrichSlotNames(levels, selectCand.levels, 'select');
    sources.push('selectOptions');
  }

  const branchCand = usable.find(c => c.source === 'branchSwitch');
  if (branchCand) {
    if (primary.source === 'configArray' || primary.source === 'selectOptions') {
      levels = enrichSlotNames(levels, branchCand.levels, 'branch');
      if (!sources.includes('branchSwitch')) sources.push('branchSwitch');
    } else if (primary.source === 'branchSwitch' && selectCand) {
      levels = enrichSlotNames(levels, selectCand.levels, 'select');
      primary = selectCand;
      levels = selectCand.levels.map((l, i) => ({ ...l, index: i }));
      sources.unshift('selectOptions');
    }
  }

  if (primary.source === 'selectOptions' && branchCand && !sources.includes('branchSwitch')) {
    levels = enrichSlotNames(levels, branchCand.levels, 'branch');
    sources.push('branchSwitch');
  }

  const uiTotal = inferUiLevelTotal(allText)
    || usable.find(c => c.uiLevelTotal)?.uiLevelTotal
    || null;

  if (uiTotal && uiTotal < levels.length) {
    const regular = levels.filter(l => !l.isFreeMode);
    const free = levels.filter(l => l.isFreeMode);
    if (regular.length > uiTotal) {
      levels = [...regular.slice(0, uiTotal), ...free].map((l, i) => ({ ...l, index: i }));
    }
  }

  levels = levels.map((l, i) => ({
    ...l,
    index: i,
    slotName: l.isFreeMode && l.slotName.startsWith('第')
      ? '自由探索'
      : l.slotName,
  }));

  const levelCount = levels.length;
  return {
    hasMultipleLevels: levelCount >= 2,
    levelCount,
    levels,
    uiLevelTotal: uiTotal,
    arrayName,
    detectionSource: [...new Set(sources)].join('+'),
    detectionWarnings: warnings.length ? warnings : undefined,
  };
}

module.exports = { detectLevelCandidates, mergeLevelCandidates, pickPrimaryCandidate, enrichSlotNames };