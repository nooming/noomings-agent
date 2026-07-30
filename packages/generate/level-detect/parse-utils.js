/** 从游戏源码静态识别多关卡/章节配置（多策略探测 + 融合，无游戏 id 硬编码） */

const MAX_LEVELS = 32;
const ARRAY_NAMES = [
  'levels', 'chapters', 'stages', 'STAGES',
  'levelConfigs', 'levelData', 'chapterList',
];

const ARRAY_SUFFIX_RE = /(?:const|let|var)\s+(\w*(?:Levels|levels|Chapters|chapters|Stages|stages))\s*=\s*\[/g;

const LEVEL_SWITCH_FUNCS = [
  'applyLevelUI', 'loadLevel', 'loadChapter', 'loadStage',
  'updateLevel', 'switchLevel', 'switchChapter', 'switchStage',
];

const CURRENT_VAR_RE = /\b(current\w*(?:Level|Chapter|Stage)|levelIndex|chapterIndex|stageIndex)\b/i;
function extractBracketBlock(text, openIdx) {
  if (text[openIdx] !== '[' && text[openIdx] !== '{') return null;
  const open = text[openIdx];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

function splitTopLevelObjects(arrayInner) {
  const items = [];
  let i = 0;
  while (i < arrayInner.length) {
    while (i < arrayInner.length && /[\s,]/.test(arrayInner[i])) i++;
    if (i >= arrayInner.length) break;
    const start = i;
    if (arrayInner[i] === '{') {
      const block = extractBracketBlock(arrayInner, i);
      if (!block) break;
      items.push({ type: 'object', text: block, start });
      i += block.length;
    } else if (arrayInner[i] === '"' || arrayInner[i] === "'") {
      const q = arrayInner[i];
      let j = i + 1;
      while (j < arrayInner.length && arrayInner[j] !== q) {
        if (arrayInner[j] === '\\') j++;
        j++;
      }
      if (j < arrayInner.length) {
        items.push({ type: 'string', text: arrayInner.slice(i, j + 1), start });
        i = j + 1;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  return items;
}

function isBlacklistedArrayName(name) {
  if (/Steps$/i.test(name)) return true;
  if (/tutorial/i.test(name) && /(Steps|Hud)/i.test(name)) return true;
  return false;
}

function isTutorialLikeItems(items) {
  const objects = items.filter(item => item.type === 'object');
  if (objects.length < 2) return false;
  let tutorialLike = 0;
  for (const { text } of objects) {
    if (/goal\s*:|conditionMet\s*:|autoNextEvent\s*:/.test(text)) tutorialLike++;
  }
  return tutorialLike >= Math.ceil(objects.length * 0.6);
}

function parseStringArray(fieldText) {
  const out = [];
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(fieldText)) !== null) out.push(m[1]);
  return out;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function truncateSlotName(name, max = 48) {
  const s = String(name || '').trim();
  return s.length <= max ? s : s.slice(0, max);
}

function defaultSlotName(index, isFreeMode = false) {
  return isFreeMode ? '自由探索' : `第 ${index + 1} 关`;
}

function extractCommentSlotName(arrayInner, objStart) {
  const before = arrayInner.slice(0, objStart);
  const lines = before.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const m = line.match(/\/\/\s*第\s*(\d+)\s*关[：:]\s*(.+)/);
    if (m) return truncateSlotName(`第 ${m[1]} 关：${m[2].trim()}`);
    if (line && !line.startsWith('//') && line !== ',') break;
  }
  return null;
}

function parseLevelObject(objStr, index, commentSlotName) {
  const isFreeMode = /isFreeMode\s*:\s*true\b/.test(objStr)
    || /自由探索/.test(objStr);
  const nameM = objStr.match(/(?:^|[,{]\s*)(?:name|title)\s*:\s*['"]([^'"]+)['"]/);
  const customName = nameM?.[1]?.trim() || null;

  const config = {};
  for (const key of ['targetX', 'targetY', 'targetH', 'targetW', 'timeLimit', 'scoreTarget', 'ballCount']) {
    const m = objStr.match(new RegExp(`${key}\\s*:\\s*([\\d.]+)`));
    if (m) config[key] = Number(m[1]);
  }
  if (/hasObstacle\s*:\s*true\b/.test(objStr)) config.hasObstacle = true;

  const pocketM = objStr.match(/pocketIndices\s*:\s*\[([^\]]*)\]/);
  if (pocketM) {
    const inner = pocketM[1];
    const quoted = parseStringArray(inner).map(v => Number(v)).filter(n => Number.isFinite(n));
    const bare = (inner.match(/\d+/g) || []).map(Number);
    config.pocketIndices = quoted.length ? quoted : bare;
  }

  const lockedM = objStr.match(/locked\s*:\s*\[([^\]]*)\]/);
  if (lockedM) config.locked = parseStringArray(lockedM[1]);

  const defaultsM = objStr.match(/defaults\s*:\s*(\{[^}]*\})/);
  if (defaultsM) {
    config.defaults = {};
    const pairRe = /(\w+)\s*:\s*([^,}\s]+|'[^']*'|"[^"]*")/g;
    let dm;
    while ((dm = pairRe.exec(defaultsM[1])) !== null) {
      let v = dm[2].trim();
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1);
      } else if (/^-?\d+(\.\d+)?$/.test(v)) {
        v = Number(v);
      }
      config.defaults[dm[1]] = v;
    }
  }

  let slotName;
  if (customName) {
    slotName = truncateSlotName(customName);
  } else if (commentSlotName) {
    slotName = commentSlotName;
  } else if (isFreeMode) {
    slotName = '自由探索';
  } else {
    slotName = defaultSlotName(index);
  }

  return {
    index,
    slotName,
    config,
    isFreeMode,
    nameSource: commentSlotName ? 'comment' : 'config',
    rawSnippet: objStr.slice(0, 280),
  };
}

function parseLevelStringLiteral(strLit, index) {
  const m = strLit.match(/^['"]([^'"]*)['"]$/);
  const label = m?.[1]?.trim() || defaultSlotName(index);
  const isFreeMode = /自由探索/.test(label);
  return {
    index,
    slotName: truncateSlotName(isFreeMode ? '自由探索' : label),
    config: {},
    isFreeMode,
    nameSource: 'config',
    rawSnippet: strLit.slice(0, 120),
  };
}

function parseArrayCandidate(allText, name, startBracketIdx) {
  const block = extractBracketBlock(allText, startBracketIdx);
  if (!block || block.length < 4) return null;
  const inner = block.slice(1, -1);
  const items = splitTopLevelObjects(inner);
  if (!items.length || isTutorialLikeItems(items)) return null;
  return { arrayName: name, items, arrayInner: inner };
}

function findLevelArray(allText) {
  const candidates = [];

  for (const name of ARRAY_NAMES) {
    const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[`, 'm');
    const m = re.exec(allText);
    if (!m) continue;
    const start = m.index + m[0].length - 1;
    const parsed = parseArrayCandidate(allText, name, start);
    if (parsed) candidates.push({ ...parsed, priority: 2 });
  }

  ARRAY_SUFFIX_RE.lastIndex = 0;
  let sm;
  while ((sm = ARRAY_SUFFIX_RE.exec(allText)) !== null) {
    const name = sm[1];
    if (isBlacklistedArrayName(name)) continue;
    if (ARRAY_NAMES.includes(name)) continue;
    const start = sm.index + sm[0].length - 1;
    const parsed = parseArrayCandidate(allText, name, start);
    if (parsed) candidates.push({ ...parsed, priority: 1 });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.items.length - a.items.length;
  });
  return candidates[0];
}

function inferUiLevelTotal(allText) {
  const patterns = [
    /关卡\s*\$\{[^}]+\}\s*\/\s*\$\{?\s*(\d+)\s*\}?/,
    /关卡\s*\$\{[^}]+\}\s*\/\s*(\d+)/,
    /关卡\s+\$\{[^}]+\}\s*\/\s*(\d+)/,
    /第\s*\$\{[^}]+\}\s*关\s*\/\s*\$\{?\s*(\d+)\s*\}?/,
    /Level\s*\$\{[^}]+\}\s*of\s*\$\{?\s*(\d+)\s*\}?/i,
    /\$\{[^}]*(?:Level|level|Chapter|chapter|Stage|stage)[^}]*\}\s*\/\s*(\d+)/,
    /关卡\s+(\d+)\s*\/\s*(\d+)/,
    /第\s*(\d+)\s*关\s*\/\s*(\d+)\s*关/,
    /(\d+)\s*\/\s*(\d+)\s*关/,
    /本模式共\s*(\d+)\s*关/,
    /共\s*(\d+)\s*关/,
  ];
  for (const re of patterns) {
    const m = allText.match(re);
    if (m) {
      const n = Number(m[m.length - 1]);
      if (Number.isFinite(n) && n >= 2) return n;
    }
  }
  return null;
}

module.exports = {
  MAX_LEVELS, ARRAY_NAMES, ARRAY_SUFFIX_RE, LEVEL_SWITCH_FUNCS, CURRENT_VAR_RE,
  extractBracketBlock, splitTopLevelObjects, isBlacklistedArrayName, isTutorialLikeItems,
  parseStringArray, decodeHtmlEntities, truncateSlotName, defaultSlotName, extractCommentSlotName,
  parseLevelObject, parseLevelStringLiteral, parseArrayCandidate, findLevelArray,
  inferUiLevelTotal,
};
