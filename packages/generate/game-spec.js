/** chapter + inquiryScript → 喂 LLM 生成 HTML 的结构化 gameSpec */

const MOTION_TOPIC_RE = /抛体|斜抛|平抛|碰撞|振子|圆周|动量|机械能|简谐|过山车|匀速|加速|阿特伍德/;

function inferControlType(controlId, gameHints) {
  if ((gameHints?.actionTriggerControlIds || []).includes(controlId)) return 'button';
  if ((gameHints?.discreteControlIds || []).includes(controlId)) return 'discrete';
  return 'range';
}

function isMotionTopic(text) {
  return MOTION_TOPIC_RE.test(String(text || ''));
}

function inferSimHints(chapter) {
  const topic = [
    chapter?.kg?.title,
    chapter?.kg?.sub,
    chapter?.inquiryScript?.summary,
    (chapter?.inquiryScript?.knowledgePoints || []).map(k => k.label).join(' '),
  ].join(' ');
  if (!isMotionTopic(topic)) return null;
  if (/抛体|斜抛|平抛/.test(topic)) {
    return { type: 'projectile2d', needsContinuousSim: true };
  }
  if (/碰撞|动量/.test(topic)) {
    return { type: 'collision', needsContinuousSim: true };
  }
  if (/振子|简谐|弹簧/.test(topic)) {
    return { type: 'oscillator', needsContinuousSim: true };
  }
  if (/圆周|过山车/.test(topic)) {
    return { type: 'circular', needsContinuousSim: true };
  }
  return { type: 'generic_motion', needsContinuousSim: true };
}

function normalizeAdjustmentVariable(av) {
  if (!av || !av.controlId) return av;
  const unit = av.suggestedRange?.unit || av.unit || '';
  return {
    ...av,
    symbol: av.symbol || av.label || av.controlId,
    unit: unit || undefined,
    suggestedRange: av.suggestedRange || (av.type === 'range' ? { min: 0, max: 100, step: 1, unit } : null),
  };
}

/** Gold classroom: CV slider interleaved among AVs — never last in the control stack. */
function buildCvDomOrderNote(adjustmentVariables, cv) {
  const cvLabel = cv.label || cv.controlId || 'CV';
  const avLabels = (adjustmentVariables || [])
    .filter(a => a && a.controlId && a.type !== 'button')
    .map(a => a.label || a.symbol || a.controlId);
  if (avLabels.length < 2) {
    return `将「${cvLabel}」插在调节滑条中间，CV 不在末位`;
  }
  const mid = Math.max(1, Math.floor(avLabels.length / 2));
  const before = avLabels.slice(0, mid).join(' → ');
  const after = avLabels.slice(mid).join(' → ');
  return `顺序：${before} → ${cvLabel}(CV) → ${after}，CV 不在末位`;
}

function buildDataReadouts(script, simHints) {
  const readouts = [];
  for (const av of script.adjustmentVariables || []) {
    if (av.type === 'button') continue;
    readouts.push({
      label: av.label || av.symbol,
      symbol: av.symbol || av.label,
      unit: av.suggestedRange?.unit || av.unit || '',
      source: `state.${av.controlId}`,
    });
  }
  for (const ov of script.outputVariables || []) {
    readouts.push({
      label: ov.label || ov.symbol,
      symbol: ov.symbol || ov.label,
      unit: ov.unit || '',
      source: ov.stateField || 'computed',
    });
  }
  if (simHints?.needsContinuousSim && readouts.length < 2) {
    readouts.push({ label: '实时速度', symbol: 'v', unit: 'm/s', source: 'state.v' });
    readouts.push({ label: '实时位移', symbol: 'x', unit: 'm', source: 'state.x' });
  }
  return readouts.slice(0, 6);
}

function buildGameSpec(chapter, gameHints) {
  const script = chapter?.inquiryScript || {};
  const normalizedScript = {
    ...script,
    adjustmentVariables: (script.adjustmentVariables || []).map(normalizeAdjustmentVariable),
  };
  const nodes = chapter.kg?.nodes || [];
  const controls = chapter.traceMap?.controls || {};
  const confoundingIds = new Set(
    (normalizedScript.confoundingVariables || []).map(c => c.controlId).filter(Boolean),
  );

  const simHints = gameHints?.needsContinuousSim
    ? { ...inferSimHints(chapter), needsContinuousSim: true }
    : inferSimHints(chapter);
  const needsContinuousSim = !!(gameHints?.needsContinuousSim || simHints?.needsContinuousSim);

  const specControls = [];
  const seen = new Set();

  for (const av of normalizedScript.adjustmentVariables || []) {
    if (!av.controlId || seen.has(av.controlId)) continue;
    seen.add(av.controlId);
    const tm = controls[av.controlId];
    specControls.push({
      id: av.controlId,
      type: av.type || inferControlType(av.controlId, gameHints),
      label: av.label || av.symbol || av.controlId,
      symbol: av.symbol || null,
      unit: av.suggestedRange?.unit || av.unit || null,
      mapsToKg: av.mapsToKg || tm?.kgId || 'O1',
      role: 'adjustment',
      suggestedRange: av.suggestedRange || null,
    });
  }

  for (const [controlId, tm] of Object.entries(controls)) {
    if (seen.has(controlId) || tm?.role !== 'operation') continue;
    seen.add(controlId);
    const kgNode = nodes.find(n => n.id === tm.kgId);
    specControls.push({
      id: controlId,
      type: inferControlType(controlId, gameHints),
      label: kgNode?.label || controlId,
      mapsToKg: tm.kgId,
      role: 'adjustment',
    });
  }

  const avsForOrder = normalizedScript.adjustmentVariables || [];
  const confoundingUi = (normalizedScript.confoundingVariables || []).map(c => {
    const hasControl = !!c.controlId;
    const strategy = c.uiStrategy
      || (hasControl ? 'interactive_mid' : 'narrative_only');
    const placement = hasControl ? (c.placement || 'interleaved_not_last') : 'none';
    return {
      controlId: c.controlId || null,
      label: c.label,
      reason: c.reason || '不影响核心结论',
      uiStrategy: strategy,
      // Gold classroom: mid-panel interactive CV; never pad to bottom; no spoiler copy on the knob.
      placement,
      spoilerLabels: false,
      visualOnly: c.visualOnly !== false,
      ...(hasControl
        ? { domOrderNote: c.domOrderNote || buildCvDomOrderNote(avsForOrder, c) }
        : {}),
    };
  });

  for (const c of normalizedScript.confoundingVariables || []) {
    if (!c.controlId || seen.has(c.controlId)) continue;
    seen.add(c.controlId);
    const tm = controls[c.controlId];
    specControls.push({
      id: c.controlId,
      type: c.type || 'range',
      label: c.label || c.controlId,
      symbol: c.symbol || null,
      unit: c.suggestedRange?.unit || c.unit || null,
      mapsToKg: c.mapsToKg || tm?.kgId || null,
      role: 'confounding',
      suggestedRange: c.suggestedRange || null,
      placement: 'interleaved_not_last',
      spoilerLabels: false,
    });
  }

  const constraints = nodes
    .filter(n => n.group === 'constraint' && n.layer === 'play')
    .map(n => ({ kgId: n.id, label: n.label, desc: n.desc }));

  const resultNode = nodes.find(n => n.id === 'R1' || (n.group === 'result' && n.layer === 'play'));
  const hasInteractiveCv = confoundingUi.some(c => c.uiStrategy === 'interactive_mid' && c.controlId);

  const uiRequirements = [
    '每个 range 控件须有数值显示（滑条与数字双向同步）',
    'canvas 主仿真区 + 控件侧栏/下方布局（#simCanvas + #controlsPanel 或等效）',
    '发射/测试按钮 + 复位按钮',
    'Observe 区显示测试/发射结果，支持 retry',
    '竞赛测后反馈：测前目标量显示「待测」（勿拖动中直播答案）；测后文案含实测值 + 偏低/偏高/已落入',
    '通关 overlay：本局证据 + 归因 MCQ（仅主 AV / mixed / unsure；CV 不得作为正确选项；可选作干扰项）+ 选后才揭示 CV 旁路说明',
      '视觉：内联 craft 色板（--craft-bg/#0e1418 --craft-panel/#162028 --craft-accent 可换色 --craft-text --craft-muted --craft-radius/12px）；包演示对齐 _shared/craft-shell.css（.bench-hd → .side-goal-box → sliders → actions → observe；舞台 .craft-mode-pill）',
  ];
  if (hasInteractiveCv) {
    uiRequirements.push('CV 滑条插入 AV 中间（勿垫底）；旋钮标签勿剧透「不影响/仅视觉/旁路」');
  }
  if (needsContinuousSim) {
    uiRequirements.push('运动类须实时显示 ≥2 个物理量读数');
    uiRequirements.push('须 RAF 驱动连续动画，dt 限幅 ≤50ms');
  }

  return {
    title: chapter.kg?.title || normalizedScript.summary || '互动探究',
    subtitle: chapter.kg?.sub || chapter.dt?.sub || '',
    winCondition: resultNode?.desc || chapter.winSync?.title || '满足全部约束后过关',
    knowledgeSummary: (normalizedScript.knowledgePoints || []).map(k => k.label).join('；'),
    controls: specControls,
    confoundingUi,
    confoundingMustNotBePrimarySlider: confoundingIds.size > 0,
    constraints,
    observeFeedbackLoop: !!(chapter.strategy?.mermaid || '').match(/Observe|观察/i),
    challengePostMeasureFeedback: {
      pendingLabel: '待测',
      missLow: '偏低',
      missHigh: '偏高',
      hitInBand: '已落入',
      // Domain variants OK: 偏慢/偏快、偏近/偏远 — keep relative post-measure meaning
      allowDomainVariants: ['偏慢', '偏快', '偏近', '偏远'],
      includeMeasuredValue: true,
    },
    winAttributionMcq: {
      required: true,
      includeAvOptions: true,
      includeMixedUnsure: true,
      cvAsCorrectOption: false,
      revealCvAfterChoice: true,
    },
    craftShell: {
      tokensInline: true,
      dualModeSelectId: 'modeSelect',
      preferCraftTelemetryHelpers: true,
      sharedContract: 'data/runtime/packages/_shared/README.md',
      tokensCss: 'data/runtime/packages/_shared/craft-tokens.css',
      shellCss: 'data/runtime/packages/_shared/craft-shell.css',
      tokenNames: ['--craft-bg', '--craft-panel', '--craft-accent', '--craft-text', '--craft-muted', '--craft-radius', '--craft-radius-sm'],
      /** Package demos: link tokens+shell; standalone generated HTML: inline equivalent rules. */
      requireSharedLinksOrInline: true,
      shellClasses: [
        'essence-app', 'essence-bench', 'essence-scroll', 'essence-ft',
        'bench-hd', 'bench-hd-text', 'bench-hd-title', 'bench-hd-sub',
        'side-goal-box', 'side-goal-cap',
        'craft-mode-pill',
        'slider-group', 'observe-box', 'craft-card', 'craft-intro-meta', 'craft-attr',
      ],
      /** Sidebar IA (classroom standard). Prefer .bench-hd over legacy .mode-row. */
      benchOrder: ['bench-hd', 'side-goal-box', 'sliders', 'actions', 'observe'],
      benchHeader: {
        className: 'bench-hd',
        titleClass: 'bench-hd-title',
        subtitleClass: 'bench-hd-sub',
        modeSelectInHeader: true,
        deprecateBareModeRow: true,
      },
      sideGoal: {
        wrapClass: 'side-goal-box',
        capClass: 'side-goal-cap',
        capText: '当前目标',
        goalId: 'sideGoal',
      },
      modePill: {
        className: 'craft-mode-pill',
        id: 'craftModePill',
        exploreText: '探究模式',
        challengeText: '竞赛模式 | 剩余机会 N',
        hideTimer: true,
        avoidCoveringUniqueHuds: true,
      },
      feedbackHelper: 'CraftFeedback',
      winTitle: '过关 · 本局对照',
      /** Template A: inquiry-first intro — title + hook + meta + 开始探究; no .formula on intro. */
      introTemplate: 'A',
      intro: {
        wrapId: 'craft-intro',
        cardClass: 'craft-card',
        metaClass: 'craft-intro-meta',
        buttonId: 'craftIntroBtn',
        buttonText: '开始探究',
        noFormula: true,
        structure: ['h2 title', 'p hook', 'p.craft-intro-meta', 'button#craftIntroBtn'],
      },
    },
    traceMapExpected: controls,
    simHints,
    needsContinuousSim,
    layout: { type: 'canvas-panel', canvasId: 'simCanvas', panelId: 'controlsPanel' },
    simLoop: needsContinuousSim
      ? { driver: 'raf', maxDtMs: 50, methods: ['update', 'draw'] }
      : { driver: 'optional_raf', maxDtMs: 50, methods: ['update', 'draw'] },
    dataReadouts: buildDataReadouts(normalizedScript, simHints),
    uiRequirements,
    htmlGuidelines: [
      '单文件 HTML，内联 CSS/JS，无外部依赖（生成物勿依赖 ../_shared；把 craft token 与 craft-shell 关键规则内联：.bench-hd / .side-goal-box / .craft-mode-pill；契约见 data/runtime/packages/_shared/README.md）',
      '包目录演示：链 ../_shared/craft-tokens.css + craft-shell.css；侧栏 IA 固定 .bench-hd（title+sub ‖ #modeSelect）→ .side-goal-box（当前目标）→ 滑条 → 操作；舞台 .craft-mode-pill（探究模式 / 竞赛模式 | 剩余机会 N），勿盖住关卡专属 HUD',
      '每个 adjustment / confounding control 须有唯一 id，与 traceMapExpected / gameSpec.controls 一致',
      'CV：有 controlId 时做 interactive_mid 滑条（插在 AV 之间、不垫底）；标签只写物理量名，禁止「不影响判定/仅视觉」剧透；测后/通关卡再揭示旁路',
      'teach_only / narrative_only 仅用于无控件或纯教案说明的 CV',
      '含发射/测试按钮时 id 与 gameSpec.controls 中 type=button 一致',
      '竞赛 Observe：测前「待测」→ 测后「实测 … · 偏低|偏高|已落入」（CraftFeedback 口径）',
      '通关 craft-win 标题「过关 · 本局对照」：证据摘要 + attribution MCQ（CV 非正确项）+ 选后揭示 #craftCv；须选归因才可关闭/再玩',
      'Intro Template A（#craft-intro）：h2 关名·主题 + 1 段现象钩子 + p.craft-intro-meta（探究≠竞赛/本局锁定/扣次数）+ button#craftIntroBtn「开始探究」；intro 禁止 .formula / 方程块（公式只放 craft-win 揭示或图谱）',
      '双模 #modeSelect：explore / challenge；phase_change 与 explore_success / win 口径分离；优先 CraftTelemetry.initDualModePhase()',
      '过关时显示 winSync.title 或等效文案',
      '页面顶部一行提示：「调节参数后点击发射/测试」',
      '竞赛通关必须 emit snapshot(winOk,hintKey) 与 emit win；探究达成用 explore_success，勿用 win；归因后可再 snapshot 含 attribution',
      needsContinuousSim
        ? '运动类须 requestAnimationFrame + update/draw 分离 + dt 限幅，禁止调参即过关'
        : '力学/抛体/碰撞/振子/圆周类须 requestAnimationFrame 或发射后≥1s 过渡动画',
    ],
  };
}

module.exports = {
  buildGameSpec,
  inferControlType,
  inferSimHints,
  isMotionTopic,
  buildCvDomOrderNote,
  MOTION_TOPIC_RE,
};
