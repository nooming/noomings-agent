/**
 * Post-enrich repairs for coupled mode / env alignment (generic, no game ids).
 */
const { validateDtEnvAlignment } = require('../graph/dt-kg-coupling');
const { normalizeDtBranchPolarity } = require('./dt-branch-normalize');
const { parseStrategyMermaidEdges } = require('../../shared/strategy-mermaid-parse.js');

function strategyHasEnv(mermaid) {
  return /\bEnv\b|环境|阻力|模式|星球|planet/i.test(String(mermaid || ''));
}

function extractEnvDecisionLabel(mermaid) {
  const mm = String(mermaid || '');
  const m = mm.match(/\bEnv\{([^}]+)\}/);
  if (m) return m[1].trim();
  const startEnv = mm.match(/Start[^\n]*\n[^\n]*Env\{([^}]+)\}/);
  if (startEnv) return startEnv[1].trim();
  if (/空气阻力|air/i.test(mm)) return '空气阻力开启?';
  if (/星球|planet/i.test(mm)) return '选择星球?';
  return '环境/模式设定?';
}

function findOffModeCoreNode(mermaid) {
  const mm = String(mermaid || '');
  const offMatch = mm.match(/Env[^\n]*\n[^\n]*\|(?:否|关|off)[^\n]*\n[^\n]*(\w+)\[([^\]]+)\](:::stratCore)?/i);
  if (offMatch) return { id: offMatch[1], label: offMatch[2] };
  const modeOff = mm.match(/(\w+)\[([^\]"]*(?:关态|无效|无阻力|理想)[^\]"]*)\](:::stratCore)?/i);
  if (modeOff) return { id: modeOff[1], label: modeOff[2] };
  return { id: 'ModeOff', label: '关态分支入口' };
}

/** True when core id is already a connected / defined hub (not inventable orphan). */
function offModeCoreExistsInMermaid(mermaid, coreId) {
  const mm = String(mermaid || '');
  const id = String(coreId || '');
  if (!id) return false;
  if (new RegExp(`\\b${id}\\s*[\\[\\{\\(]`).test(mm)) return true;
  const edges = parseStrategyMermaidEdges(mm);
  return edges.some(e => e.from === id || e.to === id);
}

function chapterHasConfoundingVariables(chapter) {
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  return cvs.some(c => c && (c.label || c.controlId));
}

function injectStratInvalidLoop(chapter, gameHints) {
  const mm = String(chapter?.strategy?.mermaid || '');
  if (/:::stratInvalid/i.test(mm)) return chapter;
  if (!strategyHasEnv(mm)) return chapter;

  const core = findOffModeCoreNode(mm);
  // Never invent an unreachable ModeOff island — that duplicates 试探混淆 CV bypass
  if (!offModeCoreExistsInMermaid(mm, core.id)) return chapter;
  // Permanent CV teaching is owned by strategy-confound-visual-repair (试探混淆旁路)
  if (chapterHasConfoundingVariables(chapter)) return chapter;

  const invalidLabel = gameHints?.levelContext?.activeToggles?.airResistance
    ? '关态误调无效参数'
    : '条件下误操作';
  const invalidId = 'InvalidMisconception';
  const checkId = 'CheckMisconception';
  const extra = [
    `${core.id} --> ${checkId}{是否误调无效参数?}:::stratCond`,
    `${checkId} -->|是| ${invalidId}[${invalidLabel}]:::stratInvalid`,
    `${invalidId} --> ${core.id}`,
  ].join('\n');

  return {
    ...chapter,
    strategy: {
      ...chapter.strategy,
      mermaid: `${mm.trim()}\n${extra}`,
    },
  };
}

function alignDtWithStrategyEnv(chapter, gameHints) {
  const mm = String(chapter?.strategy?.mermaid || '');
  if (!strategyHasEnv(mm) || !chapter?.dt?.tree) return chapter;

  const coupledMode = gameHints?.hasCoupledControls && (gameHints?.modeToggleCount ?? 0) >= 1;
  const envSelectOnly = !!(gameHints?.levelContext?.envSelectMode || gameHints?.levelContext?.activeToggles?.planetSelect);
  if (!coupledMode && !envSelectOnly) return chapter;

  const existingErrors = validateDtEnvAlignment(chapter, true);
  if (!existingErrors.length) return chapter;

  const tree = JSON.parse(JSON.stringify(chapter.dt.tree));
  const first = tree.children?.[0];
  if (first?.t === 'decision' && /模式|环境|开关|阻力|星球|mode|planet/i.test(`${first.n || ''}${first.d || ''}`)) {
    return chapter;
  }

  const envLabel = extractEnvDecisionLabel(mm);
  const envName = envLabel.endsWith('?') ? envLabel : `${envLabel}?`;
  const prevChildren = tree.children || [];
  tree.children = [{
    n: envName.replace(/\?$/, ''),
    t: 'decision',
    d: envName,
    children: [
      { _e: '否', n: '非目标环境', t: 'step', d: '切换至本关有效环境设定', children: [] },
      { _e: '是', n: '进入关卡流程', t: 'step', d: '环境设定与本关一致', children: prevChildren },
    ],
  }];

  let mapping = String(chapter.mapping || '');
  if (!/模式|环境|阻力|星球|planet/i.test(mapping)) {
    const envKgId = (chapter.kg?.nodes || []).find(n =>
      n.group === 'constraint' && /模式|环境|阻力|星球|planet/i.test(`${n.label || ''}${n.desc || ''}`),
    )?.id || 'C0';
    mapping += `\n| ${envName.replace(/\?$/, '')} | ${envKgId} | constraint | env/mode gate |`;
  }

  return {
    ...chapter,
    dt: { ...chapter.dt, tree: normalizeDtBranchPolarity(tree) },
    mapping,
  };
}

function repairCoupledChapter(chapter, gameHints) {
  if (!chapter || typeof chapter !== 'object') return chapter;
  let ch = chapter;
  ch = injectStratInvalidLoop(ch, gameHints);
  ch = alignDtWithStrategyEnv(ch, gameHints);
  if (ch.dt?.tree) {
    ch = {
      ...ch,
      dt: { ...ch.dt, tree: normalizeDtBranchPolarity(ch.dt.tree) },
    };
  }
  return ch;
}

module.exports = {
  strategyHasEnv,
  extractEnvDecisionLabel,
  injectStratInvalidLoop,
  alignDtWithStrategyEnv,
  repairCoupledChapter,
};
