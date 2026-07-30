const { MAX_LEVELS, truncateSlotName, defaultSlotName, decodeHtmlEntities, CURRENT_VAR_RE } = require('./parse-utils');

function hasSelectUsageSignals(allText, selectId) {
  const idEsc = selectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`getElementById\\s*\\(\\s*['"]${idEsc}['"]`).test(allText)) return true;
  if (new RegExp(`['"]${idEsc}['"]`).test(allText) && /addEventListener\s*\(\s*['"]change['"]/.test(allText)) {
    return true;
  }
  if (/parseInt\s*\(\s*\w+\.value/.test(allText) && CURRENT_VAR_RE.test(allText)) return true;
  return CURRENT_VAR_RE.test(allText);
}

function findLevelSelectBlocks(allText) {
  const blocks = [];
  const selectRe = /<select\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  let m;
  while ((m = selectRe.exec(allText)) !== null) {
    const id = m[1];
    const inner = m[2];
    const priority = /^(levelSelect|chapterSelect|stageSelect)$/i.test(id) ? 2
      : /level|chapter|stage/i.test(id) ? 1 : 0;
    if (!priority) continue;
    blocks.push({ id, inner, priority });
  }
  blocks.sort((a, b) => b.priority - a.priority);
  return blocks;
}

function parseSelectOptions(inner) {
  const options = [];
  const optRe = /<option\b[^>]*\bvalue\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = optRe.exec(inner)) !== null) {
    const num = Number(m[1]);
    if (!Number.isFinite(num) || num < 1) continue;
    const label = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''));
    options.push({ num, label });
  }
  options.sort((a, b) => a.num - b.num);
  const seen = new Set();
  return options.filter(o => {
    if (seen.has(o.num)) return false;
    seen.add(o.num);
    return true;
  });
}

function strategySelectOptions(allText) {
  const blocks = findLevelSelectBlocks(allText);
  for (const { id, inner } of blocks) {
    const options = parseSelectOptions(inner);
    if (options.length < 2) continue;
    if (!hasSelectUsageSignals(allText, id)) continue;

    const levels = options.slice(0, MAX_LEVELS).map((opt, i) => {
      const isFreeMode = /自由探索/.test(opt.label);
      return {
        index: i,
        slotName: truncateSlotName(isFreeMode ? '自由探索' : (opt.label || defaultSlotName(i))),
        config: {},
        isFreeMode,
        nameSource: 'select',
        rawSnippet: `<option value="${opt.num}">${opt.label}</option>`.slice(0, 120),
      };
    });

    return {
      source: 'selectOptions',
      confidence: 0.85,
      levelCount: levels.length,
      levels,
      arrayName: null,
      selectId: id,
    };
  }
  return null;
}

module.exports = { strategySelectOptions };
