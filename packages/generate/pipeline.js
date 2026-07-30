const { buildCodeContext, normalizeSources } = require('../shared/context-loader');
const { chatCompletion, parseJsonFromLlm } = require('../shared/llm');
const {
  FIELD_DOCS,
  GENERIC_SHAPE_HINT,
  GENERIC_DT_TREE_EXAMPLE,
  UNIFIED_QUALITY_CHECKLIST,
  validateChapter,
  validateChapterQuality,
  applyStrategyMermaidSanitize,
} = require('../contract');
const { extractGameHints, formatGameHintsForPrompt, extractLevelSourceSnippet } = require('./hints');
const { formatAnalyzeParseForPrompt } = require('./analyze-three-step');
const {
  buildAgentThinkSkeleton,
  enrichAgentThinkWithLlm,
  formatAgentThinkForPrompt,
} = require('./agent-think');
const {
  buildStrategySelectPromptSection,
  buildStrategyRoutePlan,
  formatStrategyRoutePlanForPrompt,
} = require('./strategy-route-plan');
const { enrichChapterContract } = require('../contract/enrich');
const { hasTraceMapControls } = require('../contract/graph/trace-map');
const {
  needsDtSkeletonRepair,
  needsDtQualityRepair,
  buildDtSkeletonRepairPrompt,
  buildDtBranchRepairPrompt,
  patchDtSkeleton,
  normalizeDtChapter,
} = require('./dt-repair');

const SYSTEM = `你是互动 puzzle / 教学课件的事理图谱生成助手。根据上传的游戏或课件源代码，生成一个章节的 DT（决策树）与 KG（事理图谱）。
要求：
- DT-first：decision/retry/result 嵌套树；retry 分支不要写进 KG nodes
- KG 双轨：layer play（P1→O1→C1…Cn→R1）+ layer teach（S* 推导 + verify 边连回 O1）；layer=teach 的 S* 节点 group 必须为 core（推荐）或 method，禁止 group=teach
- 从源码识别控件、过关失败判定、重试逻辑；勿编造源码中未出现的数值、控件或过关文案
- 不要穷举所有控件组合；只建模约束判定链与典型 retry
- DT 中每个 play constraint（C*）须有对应 decision 层（是/否 + retry）；过关节点必须为 t:"result"
- DT 多种独立退出（失败/出界/超时 vs 过关）须用同级 decision 序列；禁止把失败的 decision 嵌套在过关类 decision 的 _e:"是" 下；失败类 decision 名含 失败/出界/边界/超时/未命中 → 是→retry、否→继续；过关 decision → 是→result、否→retry
- 多目标/多球关：单球进洞、碰撞等过程检查用 step/junction 续链；仅末级「全部达到/过关」decision 的否分支为 retry
- 若源码有模式开关：dt.tree 首层宜为环境/模式 decision（与 strategy 顶层分叉一致），再分状态支路；具体约束 id/文案均来自源码，勿硬编码 C4/C5 或固定物理叙事
- mapping 输出 markdown 表格（| DT 节点 | KG id | KG type | 备注 |），retry 标注 skip retry
- 若源码有与过关无关的 UI，添加 group: irrelevant 孤立 I* 节点（无出边）；有模式开关且某参数仅在某模式下无效时，用 strategy :::stratInvalid 迷思环，勿将该参数标为 irrelevant
- 公式/LaTeX 仅当源码含对应表达时使用；数值须与源码一致；formulas 禁止混入 HTML/脚本碎片
- inquiryScript.outputVariables / narrative / O1.label 必须来自本样本控件与现象，禁止套用其它游戏模板（如电容章出现「射程」）；禁止空洞「调参操作」
- 多 AV：每个 adjustmentVariable 写 priorityRank、monotonicity、affects/notes（为何不等价）；strategy.routes 按变量拆「单变量·{label}」+ trap，score/weight 按 priorityRank 分档
- narrative 用现象语言；完整公式放 teach(S*) / KP.formulas
- traceMap：controls 映射源码控件 id 到 KG（operation/irrelevant）；legacyTypes 仅当源码含 set_* 等旧事件
- strategy（L3 策略全景）：输出 mermaid 与 routes[]；复杂度与分叉须从上传源码的开关/控件/过关逻辑归纳，勿套用固定学科模板；routes[].mapsTo 须引用 KG 中已有 id；闯关关 mapsTo 只引用 O1/O2/C*/R1
- routes.warn：每条宏策略（非 irrelevant）一句误区提示；coupled 模式 :::stratInvalid 须挂在控制无效分支（关态/否）
- strategy.mermaid 每行一条边；首节点为 Start([开始…]):::stratStart（仅起点浅灰）；所有 {决策?} 菱形用 :::stratCond（浅蓝）；:::stratCore 仅用于模式分水岭说明方框（每图通常 2–4 个，文案写物理/机制含义勿写 UI 模式名），调参/测试/策略说明方框勿加 :::（默认灰）；过关/命中/胜利方框用 :::stratResult（绿），禁止 Win[过关]:::stratCore；:::stratRetry 仅偏出再试（少量橙色）；:::stratInvalid 仅条件下概念迷思；节点 class 紧挨 ]/}/)；禁止 A[文案] :::stratStart --> B；标签含 ()、:、| 时用 A["文案"] 或 A{"文案"}（物理量如 |B| 须加引号）；策略主干应体现“学生思维过程”而非控件顺序：先关键判定，再策略选择，再观察驱动调整，至少两条可行宏策略并含观察-判断-调整-再测闭环；每条宏策略先写 Start→分叉→Adjust↔Fire↔Observe 环→Win，再写 Retry/Invalid 支路
- 闯关子关：禁止为 HUD 只读标签逐一枚举 I*（进球数/关卡序号/模式文案等）；无关控件 ≤2 且须对应源码 toggle id；调节/瞄准+击球宜合并为 1 个 O*，鼠标预览勿单独 O*
- 闯关子关 strategy：禁止 Fire2/Observe2/Win2 多套平行副本；共用 Fire→Observe→CheckGoal→Win；routes 须声明 Observe→Adjust→Fire 反馈 highlightEdges
- kg.nodes 数量须达到 gameHints.minNodes；R1.desc 与各 constraint.desc 至少 8 字
- 只输出 JSON，符合 schema，不要 markdown 包裹
- 用户未提供的章节标题、教学目标须从源码与游戏机制自行推断；winSync.title 与 kg.title 不得留空`;

function userFieldProvided(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function buildUserContextSection({ title, hint, teachingObjectives, gameHints }) {
  const lines = ['## 用户输入与推断说明'];
  const levelSlot = gameHints?.levelContext?.slotName;
  const t = userFieldProvided(title) ? title.trim() : (levelSlot || '');
  const h = userFieldProvided(hint) ? hint.trim() : '';
  const to = userFieldProvided(teachingObjectives) ? teachingObjectives.trim() : '';

  if (t) {
    lines.push(`章节标题：${t}`);
  } else {
    const ref = gameHints?.projectTitle ? `（可参考项目名：${gameHints.projectTitle}）` : '';
    lines.push(
      `章节标题：未提供${ref}。请从源码（如 <title>、h1、关卡文案）推断合适中文标题，并写入 kg.title 与 winSync.title。`,
    );
  }

  if (levelSlot) {
    lines.push(
      `本关限定：仅生成「${levelSlot}」的 play/DT/strategy；数值与锁定参数须与本关配置一致，勿混入其它关卡目标。`,
    );
  }

  if (h) {
    lines.push(`补充说明：${h}`);
  } else {
    lines.push(
      '补充说明：未提供。请根据源码自主确定本 puzzle 过关链、重试与约束焦点，勿套用与源码无关的模板。',
    );
  }

  if (to) {
    lines.push('## 教学目标', to);
  } else {
    lines.push(
      '教学目标：未提供。请根据游戏机制与内容推断 1–3 条可教要点，在 teach 层 S* 节点与 verify 边中体现。',
    );
  }

  return lines.join('\n');
}

function buildInferredContext(body, gameHints, chapter) {
  return {
    titleProvided: userFieldProvided(body.title),
    hintProvided: userFieldProvided(body.hint),
    teachingObjectivesProvided: userFieldProvided(body.teachingObjectives),
    suggestedTitle: gameHints?.projectTitle || null,
    kgTitle: chapter?.kg?.title?.trim() || null,
  };
}

function buildQualityTargetsSection(gameHints) {
  if (!gameHints) return '';
  const minNodes = gameHints.minNodes ?? 8;
  const at = gameHints?.levelContext?.activeToggles;
  return [
    '\n## 质量硬性指标（须满足）',
    `- kg.nodes 数量 >= ${minNodes}（不足时增 teach/constraint 节点，须有源码依据）`,
    '- R1.desc 与各 play constraint.desc 长度 >= 8 字',
    '- strategy.mermaid 标签含括号/冒号/引号时用 Node["标签"] 形式',
    '- strategy 需体现认知过程：至少 2 条宏策略、至少 1 个观察反馈闭环、决策节点成为主干（避免唯一线性滑条链）',
    ...(at && !at.airResistance && !at.planetSelect
      ? ['- 本关无活动模式开关：勿建 Env/stratInvalid；coupled 质量项不适用']
      : []),
    ...(gameHints?.hasCoupledControls && (gameHints?.modeToggleCount ?? 0) >= 1
      ? ['- 模式耦合：strategy 顶层模式分叉 + 条件无效 stratInvalid；traceMap 勿把条件无效参数标 irrelevant']
      : []),
    ...(gameHints?.levelContext?.envSelectMode || at?.planetSelect
      ? ['- 本关星球/环境 select：DT 首层 decision 与 strategy Env 对齐；mapping 含环境行']
      : []),
    ...(gameHints?.actionObserveLoop
      ? ['- 调参+操作+观察：strategy 含 Observe→Adjust→Fire 环；DT retry 回到 O1 调参；KG play constraint 须含结果判定（出界/飞出边界/命中/碰撞等），param-range gate 不得多于 outcome gate']
      : []),
    ...(gameHints?.hasScoringTargetWin || gameHints?.levelContext?.config?.ballCount != null
      ? ['- 过关语义：R1 描述目标为计分球进洞，勿写白球进洞；DT/KG 主链须含进洞/出界/飞出边界/碰撞等 outcome constraint，param-range gate 不得占多数']
      : []),
    ...(gameHints?.hasConditionalParamProfile
      ? ['- 条件参数剖面：DT/KG 环境约束先于条件参数约束；关态分支注明参数无效；mapping 含环境与条件参数行；关态支条件参数用「仅 UI 范围?」或省略，勿与开态同名「在范围?」gate 命中']
      : []),
    ...((gameHints?.sliderControlIds || []).length >= 2
      ? [
        '- 控制变量优策略：StrategySelect 下 2 条宏途径（详述控制变量法 + 多滑条盲调 warn）',
        '- mapsTo[] 顺序须与 KG play 链一致（P1→环境约束→O1→结果约束→R1）',
      ]
      : []),
  ].join('\n');
}

function buildCognitiveRetryGuidance(checklist, warnings = [], opts = {}) {
  if (!checklist) return '';
  const condParam = !!(opts.conditionalParamProfile ?? opts.massEnvProfile);
  const lines = [];
  if (checklist.strategyMacroPaths === false) {
    lines.push('- 修复 strategyMacroPaths：首推单变量法/单调调参为主路径，控制变量法为对照；多滑条盲调作 warn 次优；不得只新增 Retry 节点');
  }
  if (checklist.strategyRouteIsolation === false) {
    lines.push('- 修复 strategyRouteIsolation：每条 |途径| 宏策略用独立 Adjust↔Fire↔Observe 子链；禁止 Fire/Observe 单节点扇出到多条宏策略的 CheckGoal/Observe 副本');
  }
  if (checklist.strategyFeedbackLoop === false) {
    lines.push('- 修复 strategyFeedbackLoop：加入「测试/观察结果 -> 判断 -> 调整 -> 再测」闭环，边标签体现偏近/偏远或未达标等观察语义');
  }
  if (checklist.dtFeedbackToOperation === false) {
    lines.push('- 修复 dtFeedbackToOperation：DT 判定失败 retry 应回到调参/操作（O1），勿仅串联相邻 constraint gate');
  }
  if (checklist.dtOutcomeOriented === false) {
    lines.push('- 修复 dtOutcomeOriented：增加进洞/出界/飞出边界/命中/碰撞等 constraint 与 DT decision；param-range gate（在范围?）不得多于 outcome gate');
  }
  if (checklist.optionalToggleNotConstraint === false) {
    lines.push('- 修复 optionalToggleNotConstraint：移除辅助线/电荷切换/模式按钮类 C* 节点，除非源码 win 逻辑引用');
  }
  if (checklist.strategyMentalBackbone === false) {
    lines.push('- 修复 strategyMentalBackbone：把关键判定做成 {决策}:::stratCond 主干，减少线性操作链');
  }
  if (condParam && (checklist.strategyMisconceptionLoop === false || checklist.strategyTeacherAlignment === false)) {
    lines.push('- 修复条件迷思：理想态分支内误调无效参数 → :::stratInvalid 回流分水岭；勿挂在有效态分支');
  }
  if (checklist.strategyTeacherAlignment === false) {
    lines.push('- 修复 strategyTeacherAlignment：StrategySelect 下 |途径| 宏策略边；分水岭写机制含义；观察边标签来自源码');
  }
  if (checklist.strategyMisconceptionLoop === false || checklist.coupledStratInvalid === false) {
    lines.push('- 修复 strategyMisconceptionLoop/coupledStratInvalid：关态/无效环境下误调参数 → :::stratInvalid 迷思环回流 ModeOff/分水岭；mermaid 须含 :::stratInvalid');
  }
  if (checklist.dtEnvAlignment === false) {
    lines.push('- 修复 dtEnvAlignment：dt.tree 首层为环境/模式 decision；mapping 含该 decision 与环境约束 KG 行');
  }
  if ((opts.errors || []).some(e => /decision.*[是 ]branch should be retry|decision.*[是 ]branch should lead/.test(String(e)))) {
    lines.push('- 修复 DT 分支_polarity：失败类 decision（出界/失败/超时）须 是→retry、否→继续；过关 decision 须 是→result、否→retry；多种独立退出用同级 decision 序列，勿嵌套在过关 decision 的「是」下');
  }
  if (condParam && (checklist.kgConditionalParamCoupling === false || checklist.kgMassEnvCoupling === false)) {
    lines.push('- 修复 kgConditionalParamCoupling：KG 环境约束先于条件参数约束；条件参数节点 desc 与 teach 写明关态下无效');
  }
  if (condParam && checklist.dtConditionalParamBranch === false) {
    lines.push('- 修复 dtConditionalParamBranch：关态支条件无效参数须为「仅 UI 范围?」或省略，勿与其他参数同名 gate 命中；开态支才用完整「在范围?」');
  }
  if (checklist.strategyControlVarRoutes === false || checklist.strategySingleVarRoutes === false) {
    lines.push('- 修复 strategyControlVarRoutes：补 StrategySelect{选择调参策略?}:::stratCond 与 |途径| 边（控制变量法 + 多滑条盲调）；trap 须 routes.warn');
    if (opts.gameHints) {
      lines.push(formatStrategyRoutePlanForPrompt(buildStrategyRoutePlan(opts.gameHints)));
    }
  }
  if (checklist.kgEnvBeforeOperation === false) {
    lines.push('- 修复 kgEnvBeforeOperation：KG play 链须 P1→环境约束 C*→O1→结果约束，环境节点不可排在 operation 之后');
  }
  if (checklist.dtHasOperationStep === false) {
    lines.push('- 修复 dtHasOperationStep：dt.tree 环境分支下须含与 mapping/Kg O* 对齐的 operation step，再进入 outcome decision');
  }
  if (checklist.strategyKgPathAligned === false) {
    lines.push('- 修复 strategyKgPathAligned：routes[].mapsTo 顺序须沿 KG play 链单调前进');
  }
  if (warnings.length) {
    lines.push(`- 软提示（不拦截）：${warnings.join('；')}`);
  }
  return lines.length ? `\n## 针对“思维过程”失败项的定向修复\n${lines.join('\n')}` : '';
}

const FULL_JSON_FIELDS = 'mapping, kg, dt, winSync, traceMap, strategy';

function needsTraceMapRepair(validation) {
  if (!validation?.errors?.length) return false;
  return validation.errors.some(e =>
    /traceMap missing|traceMap\.controls|invalid kgId/i.test(String(e)),
  );
}

function buildTraceMapRetryHint(validation, gameHints) {
  if (!needsTraceMapRepair(validation)) return '';
  const ids = (gameHints?.sliderControlIds || []).slice(0, 8).join(', ');
  const hasInvalidKg = (validation?.errors || []).some(e => /invalid kgId/i.test(String(e)));
  const extra = hasInvalidKg
    ? ' traceMap.controls 的 kgId 必须是 kg.nodes 中已存在的 id；勿用 gameCanvas/hud-*/target* 虚构 I1–I12；多滑条课仅需各 input-* 映 O1。'
    : '';
  return `\n结构必填：traceMap.controls 须映射各调参控件（如 ${ids || 'input-*'}），role=operation 映 O1；不得省略 traceMap 或 strategy。${extra}`;
}

function buildGeneratePrompt(opts) {
  const {
    sources, title, hint, teachingObjectives, gameHints,
    priorJson, errors, checklist, agentThink, analyzeParse,
  } = opts;
  const ch = gameHints?.levelContext?.index ?? opts.ch ?? null;
  const code = buildCodeContext(sources, ch, 'generic');
  const levelSnippet = gameHints?.levelContext
    ? extractLevelSourceSnippet(gameHints._sourceText || '', gameHints.levelContext)
    : '';
  const parts = [
    FIELD_DOCS,
    GENERIC_SHAPE_HINT,
    GENERIC_DT_TREE_EXAMPLE,
    UNIFIED_QUALITY_CHECKLIST,
    buildQualityTargetsSection(gameHints),
  ];
  const thinkSection = formatAgentThinkForPrompt(agentThink);
  const analyzeSection = formatAnalyzeParseForPrompt(analyzeParse || gameHints?.analyzeParse);
  const strategySelectSection = buildStrategySelectPromptSection(gameHints, analyzeParse || gameHints?.analyzeParse);
  parts.push(
    formatGameHintsForPrompt(gameHints),
    analyzeSection ? `\n${analyzeSection}` : '',
    thinkSection ? `\n${thinkSection}` : '',
    strategySelectSection ? `\n${strategySelectSection}` : '',
    buildUserContextSection({ title, hint, teachingObjectives, gameHints }),
    levelSnippet ? `\n${levelSnippet}` : '',
    code ? `\n## 待分析源码\n${code}` : '',
    opts.designInquirySection ? `\n${opts.designInquirySection}` : '',
  );
  if (priorJson && errors?.length) {
    parts.push(`\n## 上次校验/质量检查失败\nerrors:\n${errors.join('\n')}`);
    if (checklist) {
      const failed = Object.entries(checklist).filter(([, v]) => !v).map(([k]) => k);
      if (failed.length) parts.push(`checklist 未通过: ${failed.join(', ')}`);
    }
    parts.push(buildCognitiveRetryGuidance(checklist, opts.warnings || [], {
      conditionalParamProfile: !!gameHints?.hasConditionalParamProfile,
      errors: errors || [],
      gameHints,
    }));
    parts.push(buildTraceMapRetryHint({ errors: opts.errors }, gameHints));
    parts.push(`\n请修正并输出完整 JSON：\n${JSON.stringify(priorJson, null, 2).slice(0, 6000)}`);
  }
  parts.push(`\n输出单个 JSON 对象，必须包含 ${FULL_JSON_FIELDS}。`);
  return parts.join('\n');
}

function buildTeachRepairPrompt(chapter, gameHints, errors) {
  return [
    '仅补全 teach 教案层与 verify 边，保持 play 层节点、DT 树、winSync 不变',
    '若用户未提供教学目标，请根据已生成的 play 层与源码补全与之一致的 teach 内容',
    `输出完整 JSON（${FULL_JSON_FIELDS}）；不得删除已有 traceMap/strategy，缺则补全。`,
    formatGameHintsForPrompt(gameHints),
    `errors:\n${(errors || []).join('\n')}`,
    `\n当前 JSON：\n${JSON.stringify(chapter, null, 2).slice(0, 8000)}`,
  ].join('\n');
}

function needsTeachRepair(quality) {
  if (!quality?.checklist) return false;
  const c = quality.checklist;
  return c.playP1 && c.playO1 && c.playR1 && c.playConstraints
    && (!c.teachNodes || !c.verifyLinks);
}

const EXPAND_REPAIR_ERROR_RE = /too few nodes|desc too short/i;

function needsExpandRepair(quality) {
  if (!quality?.errors?.length) return false;
  return quality.errors.some(e => EXPAND_REPAIR_ERROR_RE.test(e));
}

function buildExpandRepairPrompt(chapter, gameHints, errors) {
  const minNodes = gameHints?.minNodes ?? 8;
  return [
    '仅补全质量缺口：保持 DT 树拓扑与已有 play 节点 id 不变。',
    `若 kg.nodes < ${minNodes}：增 1–2 个 teach 或 constraint 节点（须有源码依据），并更新 mapping/strategy.routes.mapsTo。`,
    '若 R1.desc 与各 C*.desc 拉长至至少 8 个汉字；勿删已有节点。',
    'strategy.mermaid 中标签含 ()、: 等须写成 Node["标签"]:::stratClass。',
    '输出完整 JSON（mapping, kg, dt, winSync, traceMap, strategy）。',
    formatGameHintsForPrompt(gameHints),
    `errors:\n${(errors || []).join('\n')}`,
    `\n当前 JSON：\n${JSON.stringify(chapter, null, 2).slice(0, 8000)}`,
  ].join('\n');
}

const SCOPE_REPAIR_ERROR_RE = /quality: scope:|chapterScope/i;
const STRATEGY_OBSERVE_RE = /strategyTeacherAlignment|observation edge label|Observe node with observation|need >=1 observation/i;
const KG_FOCUS_RE = /kgIrrelevantCap|kgNoDisplayHud|kgChallengeNoModeUi|kgOperationCap|kgPremiseSingleOp|P1 should not fan/i;

function needsScopeRepair(quality) {
  if (!quality?.errors?.length && !quality?.checklist) return false;
  if (quality.checklist?.chapterScope === false || quality.checklist?.chapterScopeWinSemantics === false) {
    return true;
  }
  return (quality.errors || []).some(e => SCOPE_REPAIR_ERROR_RE.test(String(e)));
}

function needsKgFocusRepair(quality) {
  if (quality?.checklist?.kgIrrelevantCap === false
    || quality?.checklist?.kgNoDisplayHudIrrelevant === false
    || quality?.checklist?.kgChallengeNoModeUi === false
    || quality?.checklist?.kgOperationCap === false
    || quality?.checklist?.kgPremiseSingleOp === false) {
    return true;
  }
  return (quality.errors || []).some(e => KG_FOCUS_RE.test(String(e)));
}

function buildKgFocusRepairPrompt(chapter, gameHints, errors) {
  const summary = gameHints?.levelContext?.summary || '';
  return [
    '仅修复 KG play 层焦点：删除多余 I*/O*，保留本关 puzzle 主链（调参、瞄准、击球、进洞/障碍判定）。',
    '- 闯关关：勿为 HUD/模式/进球计数建 I*；无关控件 ≤2 且须对应源码 toggle id。',
    '- 合并调参+瞄准+击球为 1 个 O*；删除鼠标预览类 O*。',
    '- play 链须 P1→O1→C*→R1，禁止 P1 扇出连多个 O*。',
    `- 本关考察焦点：${summary || '见 levelContext.summary'}`,
    '输出完整 JSON（mapping, kg, dt, winSync, traceMap, strategy）。',
    formatGameHintsForPrompt(gameHints),
    `errors:\n${(errors || []).join('\n')}`,
    `\n当前 JSON：\n${JSON.stringify(chapter, null, 2).slice(0, 8000)}`,
  ].join('\n');
}

function needsStrategyObserveRepair(quality) {
  if (quality?.checklist?.strategyTeacherAlignment === false) return true;
  return (quality.errors || []).some(e => STRATEGY_OBSERVE_RE.test(String(e)));
}

function buildScopeRepairPrompt(chapter, gameHints, errors) {
  return [
    '仅修复 scope / 过关语义 / 障碍约束：保持 teach 层与 traceMap 不变。',
    '- R1.desc 须描述计分目标球进洞（非白球作主目标），与 levelContext ballCount 一致。',
    '- 若 hasObstacle：KG/DT 须含碰撞或绕障 constraint 与 decision；mapping 补对应行。',
    '- kg.title / dt.sub 须引用本关 slotName，strategy 勿提 sibling 关卡名。',
    '输出完整 JSON（mapping, kg, dt, winSync, traceMap, strategy）。',
    formatGameHintsForPrompt(gameHints),
    `errors:\n${(errors || []).join('\n')}`,
    `\n当前 JSON：\n${JSON.stringify(chapter, null, 2).slice(0, 8000)}`,
  ].join('\n');
}

function buildStrategyObserveRepairPrompt(chapter, gameHints, errors) {
  return [
    '仅修复 strategy 观察反馈与教师对齐：保持 kg play 节点 id、DT 树拓扑、traceMap 不变。',
    '- 至少 1 条观察边标签（|偏近|/|偏远|/|未命中|/|不足|）或 Observe 节点含观察措辞。',
    '- DT decision「否」支须指向 retry；过关 decision「是」支指向 result。',
    '- 宏策略须含 Adjust↔Fire↔Observe 闭环，勿仅线性滑条链。',
    '输出完整 JSON（mapping, kg, dt, winSync, traceMap, strategy）。',
    formatGameHintsForPrompt(gameHints),
    `errors:\n${(errors || []).join('\n')}`,
    `\n当前 JSON：\n${JSON.stringify(chapter, null, 2).slice(0, 8000)}`,
  ].join('\n');
}

function isOnlyQualityFailure(validation, quality) {
  return !!validation?.ok && quality && !quality.ok;
}

async function timedLlmCall(timings, apiKey, apiUrl, messages, opts) {
  const t0 = Date.now();
  const text = await chatCompletion(apiKey, apiUrl, messages, opts);
  timings.llmMs += Date.now() - t0;
  timings.llmCalls += 1;
  return text;
}

function enrichWithTiming(timings, chapter, gameHints, sources) {
  const t0 = Date.now();
  const enriched = enrichChapterContract(chapter, gameHints, sources);
  timings.enrichMs += Date.now() - t0;
  return enriched;
}

async function generateGraph(body, opts = {}) {
  if (!opts.apiKey) {
    const err = new Error('DEEPSEEK_API_KEY required for graph generation');
    err.status = 503;
    throw err;
  }

  const sources = normalizeSources(body.sources || []);
  if (!sources.length) {
    const err = new Error('sources[] required');
    err.status = 400;
    throw err;
  }

  const gameHints = {
    ...(body.gameHints || extractGameHints(sources, body.ch)),
    analyzeParse: body.analyzeParse,
  };
  const timings = { llmMs: 0, llmCalls: 0, enrichMs: 0, thinkMs: 0 };
  const graphStart = Date.now();

  const thinkStart = Date.now();
  const thinkSkeleton = buildAgentThinkSkeleton(gameHints);
  const agentThink = await enrichAgentThinkWithLlm(thinkSkeleton, sources, {
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    ch: body.ch ?? gameHints?.levelContext?.index ?? null,
    gameHints,
    timings,
  });
  timings.thinkMs = Date.now() - thinkStart;

  let chapter = null;
  let validation = { ok: false, errors: ['not started'] };
  let quality = { ok: false, errors: [], score: 0, checklist: {} };
  let attempts = 0;
  const maxAttempts = 3;
  let teachRepairUsed = false;
  let dtRepairUsed = false;
  let dtQualityRepairUsed = false;
  let expandRepairUsed = false;
  let scopeRepairUsed = false;
  let kgFocusRepairUsed = false;
  let strategyObserveRepairUsed = false;

  while (attempts < maxAttempts) {
    attempts++;
    const allErrors = [...(validation.errors || []), ...(quality.errors || [])];
    const userPrompt = buildGeneratePrompt({
      sources,
      title: body.title,
      hint: body.hint,
      teachingObjectives: body.teachingObjectives,
      gameHints,
      agentThink,
      analyzeParse: body.analyzeParse,
      priorJson: chapter,
      errors: allErrors,
      checklist: quality.checklist,
      warnings: quality.warnings,
      designInquirySection: body.designInquirySection,
    });
    const text = await timedLlmCall(
      timings,
      opts.apiKey,
      opts.apiUrl,
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      { max_tokens: 8192, temperature: 0.2, response_format: { type: 'json_object' } },
    );
    chapter = enrichWithTiming(
      timings,
      applyStrategyMermaidSanitize(parseJsonFromLlm(text)),
      gameHints,
      sources,
    );
    validation = validateChapter(chapter);
    quality = validation.ok
      ? validateChapterQuality(chapter, gameHints)
      : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };

    if (validation.ok && quality.ok) break;

    if (!dtRepairUsed && needsDtSkeletonRepair(validation)) {
      dtRepairUsed = true;
      const repairPrompt = buildDtSkeletonRepairPrompt(chapter, gameHints, validation.errors);
      const repairText = await timedLlmCall(
        timings,
        opts.apiKey,
        opts.apiUrl,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: repairPrompt },
        ],
        { max_tokens: 8192, temperature: 0.15, response_format: { type: 'json_object' } },
      );
      chapter = enrichWithTiming(
        timings,
        applyStrategyMermaidSanitize(parseJsonFromLlm(repairText)),
        gameHints,
        sources,
      );
      validation = validateChapter(chapter);
      if (!validation.ok) {
        chapter = enrichWithTiming(timings, patchDtSkeleton(chapter), gameHints, sources);
        validation = validateChapter(chapter);
      }
      quality = validation.ok
        ? validateChapterQuality(chapter, gameHints)
        : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
      if (validation.ok && quality.ok) break;
    }

    if (!dtQualityRepairUsed && validation.ok && needsDtQualityRepair(quality)) {
      dtQualityRepairUsed = true;
      chapter = enrichWithTiming(timings, normalizeDtChapter(chapter), gameHints, sources);
      validation = validateChapter(chapter);
      quality = validation.ok
        ? validateChapterQuality(chapter, gameHints)
        : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
      if (validation.ok && quality.ok) break;

      if (needsDtQualityRepair(quality)) {
        const repairPrompt = buildDtBranchRepairPrompt(chapter, gameHints, quality.errors);
        const repairText = await timedLlmCall(
          timings,
          opts.apiKey,
          opts.apiUrl,
          [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: repairPrompt },
          ],
          { max_tokens: 8192, temperature: 0.15, response_format: { type: 'json_object' } },
        );
        chapter = enrichWithTiming(
          timings,
          applyStrategyMermaidSanitize(parseJsonFromLlm(repairText)),
          gameHints,
          sources,
        );
        validation = validateChapter(chapter);
        quality = validation.ok
          ? validateChapterQuality(chapter, gameHints)
          : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
        if (validation.ok && quality.ok) break;
      }
    }

    if (!teachRepairUsed && validation.ok && needsTeachRepair(quality)) {
      teachRepairUsed = true;
      const repairPrompt = buildTeachRepairPrompt(chapter, gameHints, quality.errors);
      const repairText = await timedLlmCall(
        timings,
        opts.apiKey,
        opts.apiUrl,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: repairPrompt },
        ],
        { max_tokens: 8192, temperature: 0.15, response_format: { type: 'json_object' } },
      );
      chapter = enrichWithTiming(
        timings,
        applyStrategyMermaidSanitize(parseJsonFromLlm(repairText)),
        gameHints,
        sources,
      );
      validation = validateChapter(chapter);
      quality = validation.ok
        ? validateChapterQuality(chapter, gameHints)
        : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
      if (validation.ok && quality.ok) break;
    }

    if (!expandRepairUsed && validation.ok && needsExpandRepair(quality)) {
      expandRepairUsed = true;
      const repairPrompt = buildExpandRepairPrompt(chapter, gameHints, quality.errors);
      const repairText = await timedLlmCall(
        timings,
        opts.apiKey,
        opts.apiUrl,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: repairPrompt },
        ],
        { max_tokens: 8192, temperature: 0.15, response_format: { type: 'json_object' } },
      );
      chapter = enrichWithTiming(
        timings,
        applyStrategyMermaidSanitize(parseJsonFromLlm(repairText)),
        gameHints,
        sources,
      );
      validation = validateChapter(chapter);
      quality = validation.ok
        ? validateChapterQuality(chapter, gameHints)
        : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
      if (validation.ok && quality.ok) break;
    }

    if (!scopeRepairUsed && validation.ok && needsScopeRepair(quality)) {
      scopeRepairUsed = true;
      const repairPrompt = buildScopeRepairPrompt(chapter, gameHints, quality.errors);
      const repairText = await timedLlmCall(
        timings,
        opts.apiKey,
        opts.apiUrl,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: repairPrompt },
        ],
        { max_tokens: 8192, temperature: 0.15, response_format: { type: 'json_object' } },
      );
      chapter = enrichWithTiming(
        timings,
        applyStrategyMermaidSanitize(parseJsonFromLlm(repairText)),
        gameHints,
        sources,
      );
      validation = validateChapter(chapter);
      quality = validation.ok
        ? validateChapterQuality(chapter, gameHints)
        : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
      if (validation.ok && quality.ok) break;
    }

    if (!kgFocusRepairUsed && validation.ok && needsKgFocusRepair(quality)) {
      kgFocusRepairUsed = true;
      const repairPrompt = buildKgFocusRepairPrompt(chapter, gameHints, quality.errors);
      const repairText = await timedLlmCall(
        timings,
        opts.apiKey,
        opts.apiUrl,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: repairPrompt },
        ],
        { max_tokens: 8192, temperature: 0.15, response_format: { type: 'json_object' } },
      );
      chapter = enrichWithTiming(
        timings,
        applyStrategyMermaidSanitize(parseJsonFromLlm(repairText)),
        gameHints,
        sources,
      );
      validation = validateChapter(chapter);
      quality = validation.ok
        ? validateChapterQuality(chapter, gameHints)
        : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
      if (validation.ok && quality.ok) break;
    }

    if (!strategyObserveRepairUsed && validation.ok && needsStrategyObserveRepair(quality)) {
      strategyObserveRepairUsed = true;
      const repairPrompt = buildStrategyObserveRepairPrompt(chapter, gameHints, quality.errors);
      const repairText = await timedLlmCall(
        timings,
        opts.apiKey,
        opts.apiUrl,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: repairPrompt },
        ],
        { max_tokens: 8192, temperature: 0.15, response_format: { type: 'json_object' } },
      );
      chapter = enrichWithTiming(
        timings,
        applyStrategyMermaidSanitize(parseJsonFromLlm(repairText)),
        gameHints,
        sources,
      );
      validation = validateChapter(chapter);
      quality = validation.ok
        ? validateChapterQuality(chapter, gameHints)
        : { ok: false, errors: [], warnings: [], score: 0, checklist: {} };
      if (validation.ok && quality.ok) break;
    }

    if (isOnlyQualityFailure(validation, quality) && attempts >= 2) break;
  }

  if (chapter && !hasTraceMapControls(chapter)) {
    validation = {
      ok: false,
      errors: [...new Set([...(validation.errors || []), 'traceMap missing or traceMap.controls empty after enrich'])],
    };
    quality = { ok: false, errors: validation.errors, warnings: [], score: 0, checklist: quality.checklist || {} };
  }

  return {
    chapter,
    validation,
    quality,
    gameHints,
    agentThink,
    analyzeParse: body.analyzeParse || null,
    attempts,
    teachRepairUsed,
    dtRepairUsed,
    dtQualityRepairUsed,
    expandRepairUsed,
    scopeRepairUsed,
    kgFocusRepairUsed,
    strategyObserveRepairUsed,
    mode: 'llm',
    inferredContext: buildInferredContext(body, gameHints, chapter),
    timings: {
      ...timings,
      totalMs: Date.now() - graphStart,
    },
  };
}

module.exports = {
  generateGraph,
  buildGeneratePrompt,
  buildUserContextSection,
  buildQualityTargetsSection,
  buildExpandRepairPrompt,
  needsExpandRepair,
  needsScopeRepair,
  needsKgFocusRepair,
  needsStrategyObserveRepair,
  SYSTEM,
};
