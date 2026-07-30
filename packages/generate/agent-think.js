const { buildCodeContext } = require('../shared/context-loader');
const { chatCompletion, parseJsonFromLlm } = require('../shared/llm');

const THINK_SYSTEM = `你是互动教学课件的事理图谱生成助手。根据规则骨架与源码片段，补全控件分类与宏策略建议。
只输出 JSON，结构：
{
  "controls": { "<控件id>": { "role": "operation|irrelevant|mode_switch", "variableKind": "slider|discrete_switch|discrete_select|action", "mapsTo": "O1|I1|...", "reason": "简短理由" } },
  "variableStrategyPatch": { "preferredRoute": "单变量法", "recommendedRoutes": ["单变量法","控制变量法"], "suboptimalRoutes": ["多滑条盲调"], "answer": "single|control_variable_primary|multi_tune" }
}
规则：
- controls 的 key 须来自骨架 evidence 或源码中出现的 id，勿编造
- range 滑条 variableKind=slider；checkbox/toggle variableKind=discrete_switch；select/radio variableKind=discrete_select；发射按钮 variableKind=action
- 永久无关控件 role=irrelevant；条件无效参数 role=operation（勿标 irrelevant）
- 模式开关 role=mode_switch 或 operation
- 多滑条课：preferredRoute 应为单变量法或单调调参；suboptimalRoutes 含多滑条盲调
- reason 须引用源码依据（1 句）`;

function uniqueControlIds(gameHints) {
  const seen = new Set();
  const ids = [];
  const push = id => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  (gameHints.sliderControlIds || []).forEach(push);
  (gameHints.discreteControlIds || []).forEach(push);
  (gameHints.actionTriggerControlIds || []).forEach(push);
  (gameHints.inferredControlIds || []).forEach(push);
  (gameHints.optionalUiToggleIds || []).forEach(push);
  return ids;
}

function sliderCount(gameHints) {
  return gameHints.variableKindSummary?.sliderCount
    ?? (gameHints.sliderControlIds || []).length;
}

function buildScanControlsStep(gameHints) {
  const evidence = uniqueControlIds(gameHints);
  const sliders = (gameHints.sliderControlIds || []).length;
  const discrete = (gameHints.discreteControlIds || []).length;
  const actions = (gameHints.actionTriggerControlIds || []).length;
  const parts = [];
  if (sliders) parts.push(`${sliders} 个 range 滑条`);
  if (discrete) parts.push(`${discrete} 个离散控件`);
  if (actions) parts.push(`${actions} 个操作触发控件`);
  if (!sliders && !discrete && !actions && evidence.length) parts.push(`${evidence.length} 个推断控件`);
  return {
    id: 'scan_controls',
    question: '源码有哪些可调/可点控件？',
    answer: parts.length ? parts.join(' + ') : '未检测到明确控件（须从源码手动识别）',
    evidence: evidence.slice(0, 16),
  };
}

function buildVariableKindsStep(gameHints) {
  const sliders = gameHints.sliderControlIds || [];
  const discrete = gameHints.discreteControlIds || [];
  const parts = [];
  if (sliders.length) parts.push(`${sliders.length} 滑条`);
  if (discrete.length) parts.push(`${discrete.length} 离散`);
  return {
    id: 'variable_kinds',
    question: '变量如何分类？',
    answer: parts.length ? parts.join(' + ') : '未分类',
    sliderIds: sliders.slice(0, 12),
    discreteIds: discrete.slice(0, 12),
    conclusion: discrete.length
      ? '滑条=连续调参；离散=环境/模式分叉，勿与滑条并列穷举组合'
      : '均为滑条连续调参；strategy 勿把 HUD 当变量',
  };
}

function buildIrrelevantVarsStep(gameHints) {
  const optional = gameHints.optionalUiToggleIds || [];
  if (gameHints.hasIrrelevant) {
    return {
      id: 'irrelevant_vars',
      question: '是否存在永久无关变量/控件？',
      answer: 'yes',
      conclusion: optional.length
        ? `可为 ${optional.slice(0, 4).join('、')} 等建 I* irrelevant（须有源码无关信号）`
        : '源码含无关控件信号：可为 decoy 建 I* 孤立节点',
    };
  }
  return {
    id: 'irrelevant_vars',
    question: '是否存在永久无关变量/控件？',
    answer: 'no',
    conclusion: '勿建 I*；HUD/画布/gameCanvas/hud-* 勿进 traceMap',
  };
}

function buildConditionalInvalidStep(gameHints) {
  const coupled = !!gameHints.hasCoupledControls;
  const condProfile = !!gameHints.hasConditionalParamProfile;
  if (condProfile) {
    return {
      id: 'conditional_invalid',
      question: '是否存在模式下才无效的条件参数？',
      answer: 'yes',
      conclusion: '条件无效参数用 :::stratInvalid 迷思环，勿标 group=irrelevant 的 I*',
    };
  }
  if (coupled && (gameHints.modeToggleCount ?? 0) >= 1) {
    return {
      id: 'conditional_invalid',
      question: '是否存在模式下才无效的条件参数？',
      answer: 'maybe',
      conclusion: '开关与参数耦合：分状态说明参数作用；无效调参用 stratInvalid',
    };
  }
  return {
    id: 'conditional_invalid',
    question: '是否存在模式下才无效的条件参数？',
    answer: 'no',
    conclusion: '无模式耦合：勿虚构 stratInvalid 或条件无效叙事',
  };
}

function inferVariableStrategy(gameHints) {
  const n = sliderCount(gameHints);
  const rich = gameHints.sourceComplexity === 'rich';
  if (n <= 1) {
    return {
      answer: 'single',
      preferredRoute: '单变量试探',
      recommendedRoutes: ['单变量试探', '观察反馈法'],
      suboptimalRoutes: [],
    };
  }
  const preferredRoute = '单变量法';
  const suboptimalRoutes = ['多滑条盲调'];
  const recommendedRoutes = [preferredRoute, '控制变量法'];
  if (rich || n >= 4) {
    recommendedRoutes.push('补偿法');
  }
  if ((gameHints.modeToggleCount ?? 0) >= 1) {
    recommendedRoutes.push('分模式策略');
  }
  return {
    answer: n <= 3 && !rich ? 'control_variable_primary' : 'multi_tune',
    preferredRoute,
    recommendedRoutes: [...new Set(recommendedRoutes)].slice(0, 4),
    suboptimalRoutes,
  };
}

function buildVariableStrategyStep(gameHints) {
  const strat = inferVariableStrategy(gameHints);
  const minRoutes = gameHints.minStrategyRoutes ?? 2;
  return {
    id: 'variable_strategy',
    question: '应优先单变量还是多变量宏策略？',
    answer: strat.answer,
    preferredRoute: strat.preferredRoute,
    recommendedRoutes: strat.recommendedRoutes,
    suboptimalRoutes: strat.suboptimalRoutes,
    conclusion: nSliders(gameHints) >= 2
      ? `主推 ${strat.preferredRoute}；若仅调一个滑条即可达标则该途径最优；同时调两个及以上滑条为次优（routes.warn）；至少 ${minRoutes} 条语义不同宏策略`
      : `至少 ${minRoutes} 条语义不同宏策略；须 StrategySelect 或 |途径| 分叉`,
  };
}

function nSliders(gameHints) {
  return sliderCount(gameHints);
}

function buildFeedbackLoopStep(gameHints) {
  if (gameHints.actionObserveLoop) {
    return {
      id: 'feedback_loop',
      question: '是否需要观察-调整-再测闭环？',
      answer: 'yes',
      conclusion: 'strategy 须 Observe→Adjust→Fire 环；DT retry 回到 O1 调参',
    };
  }
  return {
    id: 'feedback_loop',
    question: '是否需要观察-调整-再测闭环？',
    answer: 'no',
    conclusion: '仍建议至少 1 条观察反馈边或 Observe 节点（若源码含测试结果反馈）',
  };
}

function buildOutcomeGatesStep(gameHints) {
  const needs = gameHints.actionObserveLoop
    || gameHints.hasScoringTargetWin
    || gameHints.levelContext?.config?.ballCount != null;
  if (!needs) return null;
  return {
    id: 'outcome_gates',
    question: '过关判定应优先结果 gate 还是参数范围 gate？',
    answer: 'outcome_first',
    conclusion: 'KG/DT 主链须含进洞/出界/命中/碰撞等 outcome constraint；param-range gate 不得占多数',
  };
}

function inferVariableKindForId(id, gameHints) {
  if ((gameHints.actionTriggerControlIds || []).includes(id)) return 'action';
  if ((gameHints.sliderControlIds || []).includes(id)) return 'slider';
  if ((gameHints.discreteControlIds || []).includes(id)) {
    if (/select|planet|radio/i.test(id)) return 'discrete_select';
    return 'discrete_switch';
  }
  if (/^input-/i.test(id)) return 'slider';
  if (/select|planet|radio/i.test(id)) return 'discrete_select';
  if (/toggle|switch|checkbox|charge|guide|mode/i.test(id)) return 'discrete_switch';
  return undefined;
}

function buildInitialControls(gameHints) {
  const controls = {};
  (gameHints.sliderControlIds || []).forEach(id => {
    controls[id] = {
      role: 'operation',
      variableKind: 'slider',
      mapsTo: 'O1',
      reason: '规则推断：可调滑条',
    };
  });
  (gameHints.discreteControlIds || []).forEach(id => {
    const kind = inferVariableKindForId(id, gameHints);
    controls[id] = {
      role: 'mode_switch',
      variableKind: kind === 'discrete_select' ? 'discrete_select' : 'discrete_switch',
      mapsTo: 'O1',
      reason: '规则推断：离散环境/模式变量',
    };
  });
  (gameHints.actionTriggerControlIds || []).forEach(id => {
    controls[id] = {
      role: 'operation',
      variableKind: 'action',
      mapsTo: 'O1',
      reason: '规则推断：操作触发',
    };
  });
  if (gameHints.hasIrrelevant) {
    (gameHints.optionalUiToggleIds || []).forEach((id, i) => {
      if (controls[id]) return;
      controls[id] = {
        role: 'irrelevant',
        variableKind: inferVariableKindForId(id, gameHints) || 'discrete_switch',
        mapsTo: `I${i + 1}`,
        reason: '规则推断：可选 UI 开关候选',
      };
    });
  }
  return controls;
}

function buildAgentThinkSkeleton(gameHints) {
  const steps = [
    buildScanControlsStep(gameHints),
    buildVariableKindsStep(gameHints),
    buildIrrelevantVarsStep(gameHints),
    buildConditionalInvalidStep(gameHints),
    buildVariableStrategyStep(gameHints),
    buildFeedbackLoopStep(gameHints),
  ];
  const outcome = buildOutcomeGatesStep(gameHints);
  if (outcome) steps.push(outcome);

  return {
    version: 1,
    steps,
    controls: buildInitialControls(gameHints),
    source: 'rule',
  };
}

function mergeAgentThink(skeleton, patch, source) {
  const merged = {
    version: skeleton.version,
    steps: skeleton.steps.map(s => ({ ...s })),
    controls: { ...skeleton.controls },
    source,
  };

  if (patch?.controls && typeof patch.controls === 'object') {
    for (const [id, entry] of Object.entries(patch.controls)) {
      if (!entry || typeof entry !== 'object') continue;
      merged.controls[id] = {
        ...(merged.controls[id] || {}),
        ...entry,
      };
    }
  }

  const varPatch = patch?.variableStrategyPatch;
  if (varPatch) {
    const step = merged.steps.find(s => s.id === 'variable_strategy');
    if (step) {
      if (varPatch.preferredRoute) step.preferredRoute = varPatch.preferredRoute;
      if (Array.isArray(varPatch.recommendedRoutes) && varPatch.recommendedRoutes.length) {
        step.recommendedRoutes = varPatch.recommendedRoutes;
      }
      if (Array.isArray(varPatch.suboptimalRoutes) && varPatch.suboptimalRoutes.length) {
        step.suboptimalRoutes = varPatch.suboptimalRoutes;
      }
      if (varPatch.answer) step.answer = varPatch.answer;
    }
  }

  return merged;
}

async function enrichAgentThinkWithLlm(skeleton, sources, opts = {}) {
  if (!opts.apiKey) {
    return { ...skeleton, source: 'rule_only' };
  }

  const ch = opts.ch ?? opts.gameHints?.levelContext?.index ?? null;
  const code = buildCodeContext(sources, ch, 'generic');
  const codeSnippet = code.slice(0, 3000);
  const userPrompt = [
    '## 规则骨架',
    JSON.stringify({ steps: skeleton.steps, controls: skeleton.controls }, null, 2),
    '## 源码片段',
    codeSnippet,
    '请补全 controls 各条的 reason 与 variableKind，必要时修正 role/mapsTo；variableStrategyPatch 须含 preferredRoute（单变量法优先）与 suboptimalRoutes（多滑条盲调）。',
  ].join('\n');

  const llmOpts = {
    max_tokens: 1200,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  };

  try {
    const t0 = Date.now();
    const text = await chatCompletion(opts.apiKey, opts.apiUrl, [
      { role: 'system', content: THINK_SYSTEM },
      { role: 'user', content: userPrompt },
    ], llmOpts);
    if (opts.timings) {
      opts.timings.llmMs += Date.now() - t0;
      opts.timings.llmCalls += 1;
    }
    const patch = parseJsonFromLlm(text);
    return mergeAgentThink(skeleton, patch, 'hybrid');
  } catch (_) {
    return { ...skeleton, source: 'rule_only' };
  }
}

function formatAgentThinkForPrompt(agentThink) {
  if (!agentThink?.steps?.length) return '';

  const lines = ['## 智能体思维树（生成前预分析，须遵循）'];
  agentThink.steps.forEach((step, i) => {
    const parts = [step.answer];
    if (step.id === 'variable_kinds' && (step.sliderIds?.length || step.discreteIds?.length)) {
      if (step.sliderIds?.length) parts.push(`滑条:${step.sliderIds.slice(0, 6).join(',')}`);
      if (step.discreteIds?.length) parts.push(`离散:${step.discreteIds.slice(0, 6).join(',')}`);
    }
    if (step.id === 'variable_strategy' && step.preferredRoute) {
      parts.push(`主推:${step.preferredRoute}`);
    }
    if (step.suboptimalRoutes?.length) {
      parts.push(`次优:${step.suboptimalRoutes.join('、')}（routes.warn）`);
    }
    if (step.recommendedRoutes?.length) {
      parts.push(`推荐宏策略：${step.recommendedRoutes.join('、')}`);
    }
    if (step.conclusion) parts.push(step.conclusion);
    lines.push(`${i + 1}. [${step.id}] ${parts.join(' → ')}`);
  });

  const ctrlEntries = Object.entries(agentThink.controls || {});
  if (ctrlEntries.length) {
    lines.push(
      '控件分类：' + ctrlEntries.slice(0, 12).map(([id, c]) => {
        const kind = c.variableKind || '-';
        const role = c.role || 'operation';
        const maps = c.mapsTo || '-';
        const reason = c.reason ? `（${String(c.reason).slice(0, 28)}）` : '';
        return `${id}→${kind}/${role}/${maps}${reason}`;
      }).join('；'),
    );
  }

  return lines.join('\n');
}

module.exports = {
  buildAgentThinkSkeleton,
  enrichAgentThinkWithLlm,
  formatAgentThinkForPrompt,
  mergeAgentThink,
  inferVariableStrategy,
  buildVariableKindsStep,
};
