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
    const numM = label.match(/(?:关卡|第)\s*(\d+)/);
    if (numM) {
      const num = Number(numM[1]);
      if (num >= 1) byNum.set(num, label);
    }
  }

  const levelLabelRe = /['"](?:关卡|第)\s*(\d+)\s*[：:][^'"]*['"]/g;
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

function strategyUiTotal(allText) {
  const total = inferUiLevelTotal(allText);
  if (!total || total < 2) return null;

  const hasExplicitTotal = /本模式共\s*\d+\s*关|共\s*\d+\s*关/.test(allText);
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

function detectLevelCandidates(allText) {
  const candidates = [];
  const config = strategyConfigArray(allText);
  if (config) candidates.push(config);
  const select = strategySelectOptions(allText);
  if (select) candidates.push(select);
  const branch = strategyBranchSwitch(allText);
  if (branch) candidates.push(branch);
  const ui = strategyUiTotal(allText);
  if (ui) candidates.push(ui);
  return candidates;
}

function pickPrimaryCandidate(candidates) {
  const order = ['configArray', 'selectOptions', 'branchSwitch', 'uiTotal'];
  for (const src of order) {
    const c = candidates.find(x => x.source === src);
    if (c && c.levelCount >= 2) return c;
  }
  return candidates.find(c => c.levelCount >= 2) || null;
}

function enrichSlotNames(baseLevels, nameLevels, nameSource) {
  if (!nameLevels?.length) return baseLevels;
  return baseLevels.map((lvl, i) => {
    const alt = nameLevels[i];
    if (!alt?.slotName) return lvl;
    if (lvl.nameSource === 'config' && lvl.slotName && !lvl.slotName.startsWith('第 ')) {
      return lvl;
    }
    if (lvl.nameSource === 'comment') return lvl;
    if (alt.slotName.startsWith('第 ') && !lvl.slotName.startsWith('第 ')) {
      return { ...lvl, slotName: alt.slotName, nameSource: alt.nameSource || nameSource };
    }
    if (nameSource === 'select' || (lvl.slotName.startsWith('第 ') && !alt.slotName.startsWith('第 '))) {
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
    slotName: l.isFreeMode && l.slotName.startsWith('第 ')
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

function detectLevels(allText) {
  if (!allText || typeof allText !== 'string') {
    return {
      hasMultipleLevels: false,
      levelCount: 0,
      levels: [],
      uiLevelTotal: null,
      arrayName: null,
      detectionSource: null,
    };
  }
  const candidates = detectLevelCandidates(allText);
  return mergeLevelCandidates(candidates, allText);
}

function formatLevelContextForPrompt(level) {
  if (!level) return '';
  const lines = [
    `关卡名称：${level.slotName}`,
    `关卡序号：${level.index + 1}`,
  ];
  if (level.isFreeMode) lines.push('模式：自由探索（无固定过关目标或目标可拖动）');
  const c = level.config || {};
  if (c.targetX != null) lines.push(`目标区域 targetX=${c.targetX}`);
  if (c.targetY != null) lines.push(`目标区域 targetY=${c.targetY}`);
  if (c.targetH != null) lines.push(`目标高度 targetH=${c.targetH}`);
  if (c.ballCount != null) lines.push(`ballCount=${c.ballCount}`);
  if (c.hasObstacle) lines.push('hasObstacle=true');
  if (Array.isArray(c.pocketIndices) && c.pocketIndices.length) {
    lines.push(`pocketIndices=${JSON.stringify(c.pocketIndices)}`);
  }
  if (c.locked?.length) lines.push(`锁定不可调参数：${c.locked.join('、')}`);
  if (c.defaults && Object.keys(c.defaults).length) {
    lines.push(`默认参数：${JSON.stringify(c.defaults)}`);
  }
  return lines.join('\n');
}

module.exports = {
  detectLevels,
  detectLevelCandidates,
  mergeLevelCandidates,
  formatLevelContextForPrompt,
  MAX_LEVELS,
};
