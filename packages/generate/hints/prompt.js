function buildStrategyPromptHints(hints) {

  if (!hints) return '';

  const lines = ['## 策略全景（strategy）生成要求（均须从上传源码归纳，勿套用固定物理模板）'];

  if ((hints.variableKindSummary?.sliderCount ?? 0) >= 1
    || (hints.variableKindSummary?.discreteCount ?? 0) >= 1) {
    lines.push(
      '- 变量分类：range 滑条=连续调参变量；checkbox/radio/select/toggle=离散环境/模式变量。离散变量作 strategy Env 分叉，勿与滑条并列穷举调参组合。',
    );
    if ((hints.sliderControlIds || []).length >= 2) {
      lines.push(
        '- 单变量优策略：若仅调一个滑条即可达标，该途径为主推；同时调两个及以上滑条为次优/误区（routes.warn）',
        '- 变量不等价：各 AV 须写 monotonicity 与 notes/affects；strategy 按「单变量·{label}」拆分支，routes.score 按 priorityRank 分档（禁止全相同）',
      );
    }
  }

  if (hints.hasGameplayModeSwitch && !hints.hasConditionalParamProfile) {
    lines.push(
      '- 源码含玩法模式切换（按钮/变量）：勿在 strategy 中建 Env/关态参数无效分叉；本图 focus 当前关卡/模式，勿虚构关/开态',
    );
  }

  if (hints.modeToggleCount >= 1 && !hints.hasGameplayModeSwitch) {

    lines.push(

      `- 源码含 ${hints.modeToggleCount} 处模式开关信号：顶层决策用源码开关文案建 {…}:::stratCond 分叉；各分支 1 个分水岭说明方框 :::stratCore，勿写死学科名词。`,

    );

  }

  if (hints.tunableInputCount >= 3) {

    lines.push(

      `- 源码含多处可调参数：为不同宏策略各设 1 条 route（勿穷举滑条组合）；文案来自控件 label/变量名。`,

    );

  }

  if (hints.hasCoupledControls && hints.modeToggleCount >= 1) {

    lines.push(

      '- 【硬约束】源码含模式开关且参数耦合：traceMap 中模式开关与参数滑条均 role=operation；禁止因「理想状态下某参数无关」将滑条标为 irrelevant 或建 I* 节点',
    );

    lines.push(

      '- strategy.mermaid 须先建环境/模式判定分叉（:::stratCond）；无该模式分支内误调某参数 → :::stratInvalid 迷思环并回到该分支入口；有该模式分支内该参数须出现在有效调参路径（流程方框可不标 :::，勿把每条调参都标 stratCore）',
    );

    lines.push(

      '- 禁止对同一控件同时标 I* irrelevant 与 stratInvalid 迷思环',
    );

    lines.push(

      '- :::stratRetry 仅用于偏离再试调整（橙色）；:::stratInvalid 仅用于该模式下误操作（红色），勿把普通 retry 标红',
    );

    if (hints.hasConditionalParamProfile) {
      lines.push(
        '- 【条件参数剖面】源码含模式开关与多参数：strategy 用 Env{源码开关文案}:::stratCond 分叉；|关/否| 分水岭 :::stratCore 写「该参数在关态下无效/无关」（勿写 UI 模式名）；|开/是| 分水岭写「该参数升级为有效变量」；关分支内对误调该参数 → {是否调整?}:::stratCond →|是| :::stratInvalid 迷思环回流分水岭；→ StrategySelect{选择策略?}:::stratCond + |途径| 边；禁止把「关态误调」迷思挂在开分支',
      );
      lines.push(
        '- DT 首层为环境/模式 decision（与 strategy Env 一致）；KG 环境约束节点须在「条件参数」约束之前可达；mapping 含环境与该参数行',
      );
    }

  } else if (hints.hasCoupledControls) {

    lines.push(

      '- 参数与开关在同一逻辑块出现：不同开关状态下分别说明参数是否影响过关；某状态下无效的调参可用 :::stratInvalid 迷思环并回到有效节点，勿未经源码依据标 irrelevant',
    );

  }

  const nRoutes = hints.minStrategyRoutes ?? 2;

  lines.push(

    `- routes 至少 ${nRoutes} 条：至少两条语义不同的宏策略（名称来自源码，勿套用固定学科范例）；复杂度 sourceComplexity=${hints.sourceComplexity || 'minimal'}。`,

  );

  lines.push(

    '- 除主路径外，若源码存在「某模式下无效操作」，鼓励 stratInvalid 迷思环（回到有效 play）',
  );

  lines.push('- 必须出现至少 1 个观察反馈闭环：测试/观察 -> 判断 -> 调整 -> 再测；边标签用源码或学生观察语（如偏近/偏远/未命中/不足等）；Adjust→Fire→Observe 等多跳闭环亦有效');
  if (hints.actionObserveLoop) {
    lines.push(
      '- 【硬约束】源码含调参+操作+观察：strategy 须含 Observe→Adjust→Fire 三角环；DT 判定失败→retry 应回到调参/操作（O1），勿仅串联相邻 constraint gate',
    );
    lines.push(
      '- DT/KG 主链须建模操作后的结果判定（进洞/出界/飞出边界/命中/挡板/碰撞/达标），「参数在范围内?」「滑条在范围内?」不得作为唯一 constraint 或数量上超过结果判定 constraint',
    );
  }

  if (hints.hasScoringTargetWin || hints.levelContext?.config?.ballCount != null) {
    lines.push(
      '- 【过关语义】过关 result 须描述目标球/计分球进洞（remaining===0 && isScoringBall），禁止写「白球进洞过关」除非源码明确以此判定',
    );
    if (hints.levelContext?.config?.ballCount != null) {
      lines.push(
        `- R1.desc 须与本关 ballCount=${hints.levelContext.config.ballCount} 一致（全部目标球进洞）。`,
      );
    }
    lines.push(
      '- 宏策略名称须来自本关 puzzle（levelContext 配置字段如 ballCount、pocketIndices、hasObstacle 等），勿仅按全局滑条组合枚举调参策略',
    );
  }

  if ((hints.optionalUiToggleIds || []).length) {
    lines.push(
      `- 源码含可选 UI 开关（${hints.optionalUiToggleIds.slice(0, 6).join(', ')}）：不得升为 play constraint，除非过关 win 逻辑直接引用。`,
    );
  }
  lines.push('- strategy 边序：每条宏策略先写 Start→分叉→Adjust↔Fire↔Observe 环→Win，再写 Retry/Invalid 支路');
  lines.push('- routes.highlightNodes 含 Observe 时，须同时写入对应 Adjust* 与 CheckGoal→Continue*→Fire 反馈边到 highlightEdges（或依赖 enrich 补全，但生成时应尽量写全）');
  if (hints.levelContext?.focusMode === 'challenge') {
    lines.push('- 【闯关硬约束】strategy 禁止多套编号平行 FireN→ObserveN→CheckGoalN→WinN；共用单一观察-判定-过关环，宏策略差异仅在 StrategySelect/Env 与 tune 链');
    lines.push('- 每条 route 的 highlightNodes 须含：入口++ 操作(Fire/Launch) + 观察 + 至少一条 Adjust* + 判定 + 过关；highlightEdges 须含 Observe→Adjust*→Fire 闭环边');
  }
  lines.push('- routes highlightNodes 含 ObserveN 时，若 Mermaid 有 ObserveN -->|否| RetryN，预览器会自动高亮 ObserveN->RetryN（同编号）；仍建议生成时写入 RetryN 到 highlightEdges');
  lines.push('- highlightEdges 须为 Mermaid 真实边或可被 shortestPath 展开为 spine；勿写不存在 A->B 直连；捷径路径上的中间节点（如 loop 桥接 TestD、PrepA、CheckB）须写入 highlightNodes，否则 restricted pairwise 后预览不亮');
  lines.push('- 误区/关态 Invalid 途径（含 ModeOff→:::stratInvalid、warn 描述无效操作）不进 highlightNodes 与 Win/stratResult，mapsTo 可不写 R1');
  lines.push('- 多关卡源码推荐 const levels = [{ name, locked, defaults, ...}] 配置数组，便于识别关数与参数；select/分支模式亦可识别为 metadata 较少');

  lines.push('- 禁止把 strategy 写成唯一线性滑条链；模式分叉后用 StrategySelect{…}:::stratCond 或等价决策，以 |途径| 边引出宏策略，禁止分水岭节点三叉直连多个策略方框');
  lines.push('- 每条宏策略须独立子链（StrategySelect |途径| 进入该策略入口→Adjust↔Fire↔Observe 环）；禁止同一 Fire/Observe 节点同时连向多条 |途径| 分支（避免宽扇出布局）');
  lines.push('- 若 inquiryScript.confoundingVariables 非空：StrategySelect 须有虚线旁路 |试探混淆·{label}| → :::stratInvalid 拧混淆 → 观察无增益 → 回到主策略；routes 增加 kind=confoundProbe（score≤0.15，无 priorityRank），禁止把 CV 写成「单变量·」高优主路径');

  if (hints.hasConditionalParamProfile) {
    lines.push('- 禁止套用与源码无关的固定调参链；关态分支的 DT desc 须注明条件无效参数「仅 UI 范围/不影响过关判定」');
  }

  lines.push('- 决策边优先 A -->|是| B / A -->|否| B；兼容 A -- 标签 --> B');

  lines.push('- strategy：Start([…]):::stratStart；每个 {决策} :::stratCond；仅分水岭 :::stratCore（每关 2–3 个）；调参/发射/策略说明方框勿加 :::（默认灰）；过关/命中 :::stratResult（禁止 Win[过关]:::stratCore）；决策节点应作为主干');

  lines.push('- :::stratRetry=偏出再试（少量）；:::stratInvalid=红色迷思环（仅条件无效操作）');

  lines.push('- strategy.mermaid 标签含 ()[] 须写 须写 Node["标签"] 或 Node{"标签"}，勿用未加引号的方括号文案');

  lines.push('- routes[].mapsTo 须引用本关 KG 已有 id；新增 play 叙事时同步扩展 KG');
  lines.push('- 闯关 operation 收敛 mapsTo 只引用现有 O1/O2/C*/R1；勿引用已合并或删除的多操作 id');
  lines.push('- 每条宏策略（含 irrelevant）须有一条 routes.warn 误区提示；≥2 条主策略时不得空 warn');
  lines.push('- Observe 出边至少一条 label 含观察语（偏近/偏远/未命中/未进洞/出界/碰撞/偏转等）');
  lines.push('- coupled 模式下 :::stratInvalid 须挂在模式/环境控制无效分支（关/否），勿挂在开态有效分支');

  return lines.join('\n');

}



function formatGameHintsForPrompt(hints) {

  if (!hints) return '';

  const lines = [

    '## 游戏常量（从源码抽取，desc/DT 数值须与源码一致）',

    JSON.stringify(hints, null, 2),

    '从源码识别：控件、过关条件、重试与提示；勿套用上传文件中未出现的范例数值、学科叙事或过关文案',
    'winSync.title 与 DT result 节点须与源码中的胜利/过关语义一致',
    'DT 并列退出：多种独立退出（失败/出界/超时 vs 过关）用同级 decision 序列；失败类 decision（名含失败/出界/边界/超时/未命中）→ 是→retry、否→继续；过关 decision → 是→result、否→retry；禁止把失败类 decision 嵌套在过关 decision else 分支 下',
    '多目标/多球关：单球进洞、碰撞等过程检查用 step/junction 续链（否→继续），仅末级「全部达标/过关」decision 的否分支→retry',
    '变量分类：range 滑条=连续调参；checkbox/radio/select=离散环境/模式变量，strategy 中勿混为同一调参链',
  ];

  if ((hints.variableKindSummary?.sliderCount ?? hints.sliderControlIds?.length ?? 0) >= 2) {
    lines.push(
      '单变量优策略：至少 1 条主 route 体现单变量/单调调参；同时调多个滑条作次优 route 并写 warn',
    );
  }

  if (hints.projectTitle) lines.push(`项目名（参考）${hints.projectTitle}`);

  if (hints.modeToggleCount >= 1) {

    lines.push(`源码含模式开关（约 ${hints.modeToggleCount} 处信号）：strategy 须按源码文案建模分叉。`);

  }

  if (hints.tunableInputCount >= 3 && (hints.modeToggleCount ?? 0) < 1) {
    lines.push(
      `源码含多个 range 滑条（约 ${hints.tunableInputCount} 处）：traceMap.controls 须覆盖各滑条 id（如 ${(hints.sliderControlIds || []).slice(0, 6).join(', ') || 'input-*'}），均 role=operation 映射 O1；traceMap 的 kgId 必须在 kg.nodes 里真实存在的节点 id。`,
    );
    if (!hints.hasIrrelevant) {
      lines.push(
        '源码无无关控件信号：勿添加 I* irrelevant 节点，勿把 gameCanvas/hud-*/菜单/画布写进 traceMap',
      );
    }
  }

  if (hints.hasCoupledControls && hints.modeToggleCount >= 1) {

    lines.push(

      '源码中开关与参数耦合：条件无效操作用 strategy :::stratInvalid，勿把条件无效参数写入 KG irrelevant；模式开关与参数控件一并 traceMap.role=operation',
    );

  } else if (hints.hasCoupledControls) {

    lines.push('源码中开关与参数读取耦合：分状态说明参数作用，无效调参→stratInvalid 而非默认 irrelevant');

  }

  if (hints.hasIrrelevant) {

    lines.push('源码另含明确无关控件信号：可为其实添加 group=irrelevant 的 I* 孤立节点（无出边）');

  }

  if (hints.winTitle) lines.push(`过关文案参考（来自源码）：「${hints.winTitle}」`);

  if (hints.levelContext) {
    const siblings = (hints.levelContext.siblingSlotNames || []).filter(Boolean);
    const at = hints.levelContext.activeToggles;
    lines.push(
      '## 本关范围（仅生成本关图谱，勿写其他关卡）',
      hints.levelContext.summary || '',
      `- kg.title、dt.sub、strategy 文案须明确为${hints.levelContext.slotName}」，勿默认写第 1 关或其它关卡。`,
      '- 多关：kg.title / dt.sub 须体现本关 slotName；「第 3 关」与「第3关」空格/编号写法等价',
      '- 约束、锁定参数、默认参数与过关判定须与本关 config 一致；teach 层可引用全游戏机制但 play 层须对标本关',
    );
    if (at && !at.airResistance && !at.planetSelect) {
      lines.push('- 【本关硬约束】本关源码中空气阻力开关与星球选择均不可用/已禁用：禁止用 Env{空气阻力} 与 stratInvalid 迷思环；strategy 直接以 Start→StrategySelect 或调参流程开始');
    }
    if (at?.airResistance) {
      lines.push('- 【本关硬约束】本关空气阻力 checkbox 可用：strategy 用 Env{空气阻力…}:::stratCond 分叉，关态误调阻力参数→:::stratInvalid 回流；DT 首层 decision 用 Env 对齐');
    }
    if (at?.planetSelect || hints.levelContext.envSelectMode) {
      lines.push('- 【本关硬约束】本关星球 select 可见：strategy/DT 首层用「选择星球」类 Env 分叉（:::stratCond）；勿套用空气阻力 checkbox 迷思环，除非源码同时启用 airCheckbox');
    }
    if (siblings.length) {
      lines.push(`- strategy.mermaid 与 routes 不得出现其它关卡名：${siblings.join('')}。`);
    }
    if (hints.levelContext.focusMode === 'challenge') {
      lines.push('- 本关为闯关子关：勿建「自由模式/教程模式」顶层宏策略分叉（teach 层可泛述全游戏机制）');
      lines.push('- 【硬约束】闯关子关：禁止把 HUD 只读标签逐一枚举 I*（进球数/关卡序号/模式文案等）；无关控件勿标且须对应源码 toggle id（如 toggleGuideBtn、toggleChargeBtn）');
      lines.push('- 【硬约束】调参/瞄准+击球宜合并为 1 个 O*（O1 调参、O2 击球）；鼠标预览/虚线瞄准勿单独建 O*');
    }
    const bc = hints.levelContext.config?.ballCount;
    if (bc != null) {
      lines.push(`- 【硬约束】R1 须写「${bc} 颗目标球全部进洞」；禁止写白球进洞过关。`);
    }
    if (hints.levelContext.config?.hasObstacle) {
      lines.push('- 【硬约束】本关 hasObstacle：KG/DT 须含障碍物碰撞或绕障 constraint');
    }
    const cfg = hints.levelContext.config || {};
    if (cfg.ballCount != null || cfg.hasObstacle || cfg.pocketIndices) {
      lines.push(
        `- 本关考察焦点：ballCount=${cfg.ballCount ?? '?'}，hasObstacle=${!!cfg.hasObstacle}，pocketIndices=${Array.isArray(cfg.pocketIndices) ? cfg.pocketIndices.length : '?'}。`,
      );
    }
    if (Array.isArray(hints.levelContext.config?.pocketIndices)) {
      lines.push(
        `- 本关 pocketIndices.length=${hints.levelContext.config.pocketIndices.length}；play 层须体现目标/达标几何，而非仅参数范围 gate。`,
      );
    }
  }

  if (hints.hasScoringTargetWin && !hints.levelContext) {
    lines.push('- 源码过关以计分球/目标球进洞为准：R1 勿写白球进洞过关');
  }

  if (hints.hasScoringTargetWin || hints.actionObserveLoop) {
    lines.push(
      '- DT decision 优先：进洞? / 出界? / 飞出边界? / 命中? / 碰撞? / 达标?；滑条「在范围内?」「参数在范围内?」仅作 operation 前置，不得作为 DT/KG 主链全部或多个 constraint gate',
    );
  }

  lines.push(buildStrategyPromptHints(hints));

  return lines.filter(Boolean).join('\n');

}

module.exports = { buildStrategyPromptHints, formatGameHintsForPrompt };
