/** 多关 scope 校验：禁止 strategy 串关或枚举未参与玩法模式（通用，无游戏 id 硬编码） */

function chapterCorpus(chapter) {
  return [
    JSON.stringify(chapter?.kg?.nodes || []),
    JSON.stringify(chapter?.dt?.tree || {}),
    chapter?.mapping,
    chapter?.strategy?.mermaid,
  ].filter(Boolean).join('\n');
}

function parseBallCountFromText(text) {
  const t = String(text || '');
  const patterns = [
    /(\d+)\s*颗?\s*目标球/,
    /全部\s*(\d+)\s*颗/,
    /(\d+)\s*个?\s*球.*进洞/,
    /(\d+)\s*颗?\s*球/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1] != null) return Number(m[1]);
  }
  return null;
}

function validateChapterScope(chapter, hints) {
  const errors = [];
  const warnings = [];
  const checklist = { chapterScope: true };
  const lc = hints?.levelContext;
  if (!lc) return { errors, warnings, checklist };

  const slotName = String(lc.slotName || '').trim();
  const kgTitle = String(chapter?.kg?.title || '');
  const dtSub = String(chapter?.dt?.sub || '');
  const slotInMeta = !slotName || kgTitle.includes(slotName) || dtSub.includes(slotName);
  checklist.chapterScopeTitle = slotInMeta;
  if (!slotInMeta) {
    errors.push(`quality: scope: kg.title or dt.sub should reference level slotName "${slotName}"`);
    checklist.chapterScope = false;
  }

  const strategyText = [
    chapter?.strategy?.mermaid,
    chapter?.strategy?.title,
    chapter?.strategy?.sub,
    ...(chapter?.strategy?.routes || []).map(r => r.label),
  ].filter(Boolean).join('\n');

  let siblingLeak = false;
  for (const sibling of lc.siblingSlotNames || []) {
    const s = String(sibling || '').trim();
    if (s && strategyText.includes(s)) {
      siblingLeak = true;
      errors.push(`quality: scope: strategy mentions sibling level "${s}"`);
      checklist.chapterScope = false;
    }
  }
  checklist.chapterScopeSiblings = !siblingLeak;

  const focusModeLeak = lc.focusMode === 'challenge'
    && /自由模式|教程模式|free\s*mode|tutorial\s*mode/i.test(strategyText);
  checklist.chapterScopeFocusMode = !focusModeLeak;
  if (focusModeLeak) {
    warnings.push(
      'quality: scope: challenge-level strategy should not top-level fork into free/tutorial play modes',
    );
  }

  const r1 = (chapter?.kg?.nodes || []).find(n => n.group === 'result' && n.layer === 'play')
    || (chapter?.kg?.nodes || []).find(n => n.id === 'R1');
  const r1Text = `${r1?.label || ''} ${r1?.desc || ''}`;
  const config = lc.config || {};
  const expectsScoringWin = hints?.hasScoringTargetWin || config.ballCount != null;

  checklist.chapterScopeWinSemantics = true;
  if (
    expectsScoringWin
    && /(?:白球进洞|白球.*过关|主目标(?:球)?.*(?:达标|过关)|仅.*主目标)/.test(r1Text)
    && !/计分球|scoring|全部.*球|所有.*目标|target ball/i.test(r1Text)
  ) {
    errors.push('quality: scope: win should describe scoring/target balls pocketed, not white ball or primary-target-only');
    checklist.chapterScopeWinSemantics = false;
    checklist.chapterScope = false;
  }

  checklist.chapterScopeBallCount = true;
  if (config.ballCount != null && r1) {
    const mentioned = parseBallCountFromText(r1Text);
    if (mentioned != null && mentioned !== config.ballCount) {
      errors.push(
        `quality: scope: R1 ball count ${mentioned} does not match level config ballCount=${config.ballCount}`,
      );
      checklist.chapterScopeBallCount = false;
      checklist.chapterScope = false;
    }
  }

  checklist.chapterScopeObstacle = true;
  if (config.hasObstacle) {
    const corpus = chapterCorpus(chapter);
    if (!/障碍|碰撞|obstacle|绕障|rect/i.test(corpus)) {
      errors.push('quality: scope: level hasObstacle but KG/DT lacks obstacle/collision constraint');
      checklist.chapterScopeObstacle = false;
      checklist.chapterScope = false;
    }
  }

  return { errors, warnings, checklist };
}

module.exports = { validateChapterScope, parseBallCountFromText };
