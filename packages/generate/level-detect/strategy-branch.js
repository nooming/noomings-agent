const { MAX_LEVELS, truncateSlotName, defaultSlotName, extractBracketBlock, LEVEL_SWITCH_FUNCS, CURRENT_VAR_RE } = require('./parse-utils');

function extractFunctionBody(allText, funcName) {
  const re = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`, 'm');
  const m = re.exec(allText);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  return extractBracketBlock(allText, start);
}

function collectBranchLevels(allText) {
  const bodies = [];
  for (const fn of LEVEL_SWITCH_FUNCS) {
    const body = extractFunctionBody(allText, fn);
    if (body) bodies.push(body);
  }
  if (!bodies.length) bodies.push(allText);

  const byNum = new Map();
  const combined = bodies.join('\n');

  const eqRe = /\b(?:current\w*(?:Level|Chapter|Stage)|levelIndex|chapterIndex|stageIndex)\s*===\s*(\d+)/gi;
  let m;
  while ((m = eqRe.exec(combined)) !== null) {
    const num = Number(m[1]);
    if (num >= 1) byNum.set(num, byNum.get(num) || null);
  }

  const caseRe = /\bcase\s+(\d+)\s*:/g;
  while ((m = caseRe.exec(combined)) !== null) {
    const num = Number(m[1]);
    if (num >= 1) byNum.set(num, byNum.get(num) || null);
  }

  const progressRe = /\bcurrent\w*(?:Level|Chapter|Stage)\s*<\s*\w*(?:Levels|levels|Chapters|chapters|Stages|stages)\.length/gi;
  if (progressRe.test(combined) && byNum.size === 0) {
    const lenMatch = combined.match(/\w*(?:Levels|levels)\.length/gi);
    if (lenMatch) {
      byNum.set(1, null);
      byNum.set(2, null);
    }
  }

  const subtitleRe = /(?:levelSubtitle|subtitle|chapterTitle|stageTitle|challengeLevel)[^.]*\.textContent\s*=\s*['"]([^'"]+)['"]/g;
  while ((m = subtitleRe.exec(combined)) !== null) {
    const label = m[1].trim();
    const numM = label.match(/(?:关卡|�?\s*(\d+)/);
    if (numM) {
      const num = Number(numM[1]);
      if (num >= 1) byNum.set(num, label);
    }
  }

  const levelLabelRe = /['"](?:关卡|�?\s*(\d+)\s*[�?][^'"]*['"]/g;
  while ((m = levelLabelRe.exec(combined)) !== null) {
    const num = Number(m[1]);
    const fullM = combined.slice(m.index, m.index + 120).match(/['"]([^'"]+)['"]/);
    if (num >= 1 && fullM) byNum.set(num, fullM[1].trim());
  }

  if (byNum.size < 2) return null;

  const nums = [...byNum.keys()].sort((a, b) => a - b);
  const levels = nums.slice(0, MAX_LEVELS).map((num, i) => {
    const label = byNum.get(num);
    const isFreeMode = label && /自由探索/.test(label);
    let slotName = label
      ? truncateSlotName(isFreeMode ? '自由探索' : label)
      : defaultSlotName(i);
    return {
      index: i,
      slotName,
      config: {},
      isFreeMode: !!isFreeMode,
      nameSource: 'branch',
      rawSnippet: label ? label.slice(0, 120) : `branch ${num}`,
    };
  });

  const confidence = levels.length >= 3 ? 0.75 : 0.6;
  return { levels, levelCount: levels.length, confidence };
}

function strategyBranchSwitch(allText) {
  if (!CURRENT_VAR_RE.test(allText)) return null;
  const collected = collectBranchLevels(allText);
  if (!collected || collected.levelCount < 2) return null;

  return {
    source: 'branchSwitch',
    confidence: collected.confidence,
    levelCount: collected.levelCount,
    levels: collected.levels,
    arrayName: null,
  };
}

module.exports = { strategyBranchSwitch };
