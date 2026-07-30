/** 从游戏源码抽取通用常量，供 prompt 与 quality 校验（无游戏 id/物理域特化） */


const { inferSliderControlIds } = require('./controls');

const STANDALONE_LABEL = '网页游戏';

const IRRELEVANT_RE = /irrelevant|无关|不影响过关|group:\s*['"]?irrelevant|irrelevant_touch|set_irrelevant/i;



function inferProjectTitle(sources, allText) {

  for (const s of sources || []) {

    const m = (s.content || '').match(/<title[^>]*>([^<]+)<\/title>/i);

    if (m && m[1].trim()) return m[1].trim().replace(/\s+/g, ' ').slice(0, 48);

  }

  const h1 = allText.match(/<h1[^>]*>([^<]+)<\/h1>/i);

  if (h1 && h1[1].trim()) return h1[1].trim().slice(0, 48);

  const pathHint = (sources || []).map(s => s.path).join(' ');

  const folder = pathHint.match(/games\/([^/]+)/i);

  if (folder) return folder[1];

  return null;

}



function inferWinTitle(allText) {
  const wt = allText.match(/winTitle\s*[=:]\s*['"]([^'"]+)['"]/i);
  if (wt?.[1]?.trim()) return wt[1].trim().slice(0, 32);

  if (/['"`]过关[了]?['"`]/.test(allText)) return '过关';

  const patterns = [
    /winSync[^}]*title[^'"]*['"]([^'"]+)['"]/i,
    /victory[^'"]*['"]([^'"]+)['"]/i,
    /complete[^'"]*['"]([^'"]+)['"]/i,
  ];

  for (const re of patterns) {
    const m = allText.match(re);
    if (m?.[1]?.trim()) return m[1].trim().slice(0, 32);
  }

  return null;
}



function estimateMinConstraints(allText) {

  let n = 0;

  const signals = [

    /hintKey/g,

    /group:\s*['"]constraint['"]/g,

    /group\s*===\s*['"]constraint['"]/g,

    /\bC\d\b/g,

    /\bK\d\b/g,

    /checkWin|isWin|winOk|validatePuzzle/g,

  ];

  for (const re of signals) {

    const m = allText.match(re);

    if (m) n += m.length;

  }

  if (n >= 6) return 3;

  if (n >= 3) return 2;

  return 1;

}



function collectHintKeys(allText) {

  const found = new Set();

  const re = /hintKey\s*[=:]\s*['"]([^'"]+)['"]/g;

  let m;

  while ((m = re.exec(allText)) !== null) {

    if (m[1] && m[1] !== 'ok') found.add(m[1]);

  }

  return [...found];

}



/** 模式开关：checkbox / radio / .checked / toggle（与具体学科无关） */

function countModeToggles(allText) {

  const htmlCheckbox = (allText.match(/type\s*=\s*['"]checkbox['"]/gi) || []).length;

  const htmlRadio = (allText.match(/type\s*=\s*['"]radio['"]/gi) || []).length;

  let n = htmlCheckbox + htmlRadio;

  if (n === 0) {

    const fallback = [

      /\.checked\b/g,

      /\btoggle\s*\(/gi,

      /\bsetMode\s*\(/gi,

    ];

    for (const re of fallback) {

      const m = allText.match(re);

      if (m) n += m.length;

    }

  }

  return Math.min(n, 8);

}



/** 可调参数：range/input 监听、反复读 .value（与具体物理量名称无关） */

function countTunableInputs(allText) {

  const patterns = [

    /type\s*=\s*['"]range['"]/gi,

    /addEventListener\s*\(\s*['"]input['"]/gi,

    /addEventListener\s*\(\s*['"]change['"]/gi,

    /getElementById\([^)]+\)\.value/gi,

    /<input\b/gi,

  ];

  let n = 0;

  for (const re of patterns) {

    const m = allText.match(re);

    if (m) n += m.length;

  }

  return Math.min(n, 12);

}



/** 开关状态与参数读取出现在同一逻辑块（任意课件均可出现） */

function detectCoupledControls(allText) {
  const idx = allText.search(/\.checked\b|type\s*=\s*['"]checkbox['"]/i);
  if (idx < 0) return false;
  const win = allText.slice(Math.max(0, idx - 700), idx + 700);
  const hasToggle = /\.checked|checkbox/i.test(win);
  const hasParamRead = /getElementById|querySelector|\.value|type\s*=\s*['"]range['"]/i.test(win);
  const multiReads = (allText.match(/getElementById/gi) || []).length >= 2;
  return hasToggle && hasParamRead && multiReads;
}

/** 玩法模式切换：按钮/变量，非 checkbox 参数耦合 */
function detectGameplayModeSwitch(allText) {
  const hasModeVar = /\bcurrent\w*Mode\b/i.test(allText);
  const hasModeToggle = /mode-toggle|switch\w*(Free|Challenge|Tutorial|Mode)Btn/i.test(allText);
  const hasModeLabels = /(自由|闯关|教程).{0,24}模式/i.test(allText);
  if (!(hasModeVar || hasModeToggle || hasModeLabels)) return false;
  return !detectCoupledControls(allText);
}

/** 模式开关 + 多滑条：启用条件参数剖面（某参数在关态下无效、开态下有效） */
function detectConditionalParamProfile(allText) {
  if (!detectCoupledControls(allText)) return false;
  if (detectGameplayModeSwitch(allText)) return false;
  if (inferSliderControlIds(allText).length < 2) return false;
  const idx = allText.search(/\.checked\b|type\s*=\s*['"]checkbox['"]/i);
  if (idx < 0) return false;
  const win = allText.slice(Math.max(0, idx - 400), idx + 400);
  return /getElementById[^)]+\)\.value|\.value/.test(win);
}

function inferSourceComplexity(modeToggleCount, tunableInputCount, hasCoupledControls) {

  if (modeToggleCount >= 1 && (tunableInputCount >= 4 || hasCoupledControls)) return 'rich';

  if (modeToggleCount >= 1 || tunableInputCount >= 3) return 'moderate';

  return 'minimal';

}



function inferMinStrategyRoutes({ modeToggleCount, hasCoupledControls, sourceComplexity, levelContext }) {

  let n = 2;

  const effectiveModeToggles = levelContext?.focusMode ? 0 : modeToggleCount;

  if (effectiveModeToggles >= 1) n += 1;

  if (hasCoupledControls) n += 1;

  if (sourceComplexity === 'rich' && hasCoupledControls) n += 1;

  return Math.min(n, 5);

}



function inferFocusMode(level, baseHints) {
  if (level?.isFreeMode) return 'free';
  if (level?.index != null && baseHints?.hasMultipleLevels && !level.isFreeMode) {
    const src = baseHints.detectionSource || '';
    if (/configArray|branchSwitch|selectOptions/i.test(src)) return 'challenge';
  }
  return null;
}

module.exports = {
  STANDALONE_LABEL,
  IRRELEVANT_RE,
  inferProjectTitle,
  inferWinTitle,
  estimateMinConstraints,
  collectHintKeys,
  countModeToggles,
  countTunableInputs,
  detectCoupledControls,
  detectGameplayModeSwitch,
  detectConditionalParamProfile,
  inferSourceComplexity,
  inferMinStrategyRoutes,
  inferFocusMode,
};
