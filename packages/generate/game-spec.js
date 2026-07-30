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

  const confoundingUi = (normalizedScript.confoundingVariables || []).map(c => ({
    controlId: c.controlId || null,
    label: c.label,
    reason: c.reason || '不影响核心结论',
    uiStrategy: c.controlId ? 'teach_only' : 'narrative_only',
  }));

  const constraints = nodes
    .filter(n => n.group === 'constraint' && n.layer === 'play')
    .map(n => ({ kgId: n.id, label: n.label, desc: n.desc }));

  const resultNode = nodes.find(n => n.id === 'R1' || (n.group === 'result' && n.layer === 'play'));

  const uiRequirements = [
    '每个 range 控件须有数值显示（滑条与数字双向同步）',
    'canvas 主仿真区 + 控件侧栏/下方布局（#simCanvas + #controlsPanel 或等效）',
    '发射/测试按钮 + 复位按钮',
    'Observe 区显示测试/发射结果，支持 retry',
  ];
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
      '单文件 HTML，内联 CSS/JS，无外部依赖',
      '每个 adjustment control 须有唯一 id，与 traceMapExpected 一致',
      '混淆变量仅 teach 区文案或只读展示，勿与调节滑条同等强调',
      '含发射/测试按钮时 id 与 gameSpec.controls 中 type=button 一致',
      '过关时显示 winSync.title 或等效文案',
      '页面顶部一行提示：「调节参数后点击发射/测试」',
      '过关 UI 显示时必须 emit snapshot(winOk,hintKey) 与 emit win',
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
  MOTION_TOPIC_RE,
};
