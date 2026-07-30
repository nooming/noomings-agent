/**
 * 分析轨三步解析：物理模型 → 变量 → 单变量优先级
 * 在 generateGraph 之前运行，结果作为强约束注入 pipeline / enrich。
 */
const { isCleanFormula, sanitizeFormulaList } = require('../contract/repair/inquiry-script-sanitize');
const {
  detectSourceDomain,
  isLikelyConfoundingControl,
  inferLabelFromControlId,
} = require('./control-label');

const FORMULA_RE = /C\s*=\s*[^;\n<]{3,80}|E\s*=\s*[^;\n<]{3,60}|R\s*=\s*[^;\n<]+|v0[^;\n<]{0,60}|sin\s*\(\s*2\s*[θθ]|[α-ωΑ-Ω][^;\n<]{0,30}=[^;\n<]+/gi;
const RAF_RE = /requestAnimationFrame|setInterval\s*\(\s*(?:function|\(\)|[\w.]+\s*=>)/i;
const WIN_RE = /(?:function\s+\w*win|__emit\s*\(\s*['"]win|过关|命中目标|winOk|checkWin|levelComplete)/i;
const HTML_JUNK_RE = /<\/?[a-zA-Z!]|Error\s*\(|Failed to load|function\s*\(|lang\s*=|position\s*:/i;

function extractPhysicsSnippets(sourceText) {
  const text = String(sourceText || '');
  const lines = text.split('\n');
  const physicsLines = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 200 || HTML_JUNK_RE.test(t)) continue;
    if (/velocity|position|gravity|angle|speed|collision|射程|抛体|电容|击穿|sin|cos|Math\.|C\s*=|E\s*=|ε/.test(t)) {
      physicsLines.push(t.slice(0, 160));
    }
  }
  return physicsLines.slice(0, 24).join('\n');
}

function extractFormulasFromSource(sourceText, domain) {
  const formulas = [];
  const text = String(sourceText || '');
  // Prefer explicit craft / formula div first
  const craft = text.match(/id=["']craftWinFormula["'][^>]*>([^<]{4,100})</i)
    || text.match(/class=["']formula["'][^>]*>([^<]{4,100})</i);
  if (craft && isCleanFormula(craft[1].trim())) {
    formulas.push(craft[1].trim());
  }
  let m;
  const re = new RegExp(FORMULA_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const f = m[0].trim().slice(0, 120);
    if (!isCleanFormula(f)) continue;
    if (!formulas.includes(f)) formulas.push(f);
  }
  if (!formulas.length && domain === 'projectile' && /sin\s*\(\s*2/.test(text)) {
    formulas.push('R = (v0² · sin(2θ)) / g');
  }
  if (!formulas.length && domain === 'capacitor') {
    formulas.push('C = ε₀εᵣA / d', 'E = V/d（击穿：E > Ebd）');
  }
  return sanitizeFormulaList(formulas).slice(0, 6);
}

function extractPhysicsModelFromSource(sources, gameHints) {
  const allText = (sources || []).map(s => s.content || '').join('\n');
  const domain = detectSourceDomain(allText, gameHints);
  const formulas = extractFormulasFromSource(allText, domain);
  const constants = [];
  const gm = allText.match(/\bg\s*=\s*([\d.]+)\s*(?:;|\/\/|,|\n)/);
  if (gm && Number(gm[1]) > 0) {
    constants.push({ name: 'g', value: gm[1], unit: 'm/s²' });
  }
  const hasRaf = RAF_RE.test(allText);
  const hasWin = WIN_RE.test(allText);
  let winSummary = gameHints?.winTitle
    || (hasWin ? '命中/过关判定函数驱动 win 事件' : '根据约束节点与结果状态判定过关');
  if (domain === 'capacitor') {
    winSummary = '电容读数进入目标带且未击穿';
  }
  return {
    formulas,
    constants,
    updateLoopSummary: hasRaf
      ? '源码含 requestAnimationFrame / 定时更新循环，逐帧更新位置与碰撞判定'
      : '源码含离散或事件驱动状态更新',
    winConditionSummary: winSummary,
    snippets: extractPhysicsSnippets(allText).slice(0, 1200),
    domain,
  };
}

function buildOutputVariablesForDomain(domain, allText, physicsCore) {
  if (domain === 'capacitor') {
    return [
      { id: 'OV1', label: '电容读数', symbol: 'C', unit: 'pF', role: 'primary', source: 'observe' },
      { id: 'OV2', label: '是否击穿', symbol: 'E>Ebd', unit: '', role: 'secondary', source: 'constraint' },
    ];
  }
  if (domain === 'projectile') {
    const ovs = [];
    if (/射程|range|distance|命中|落点/.test(allText) || (physicsCore?.formulas || []).some(f => /R\s*=/.test(f))) {
      ovs.push({ id: 'OV1', label: '射程', symbol: 'R', unit: 'm', role: 'primary', source: 'formula' });
    }
    if (/高度|height|altitude/.test(allText)) {
      ovs.push({ id: `OV${ovs.length + 1}`, label: '最大高度', symbol: 'H', unit: 'm', role: 'secondary', source: 'formula' });
    }
    if (!ovs.length) ovs.push({ id: 'OV1', label: '落点结果', symbol: '', unit: '', role: 'primary', source: 'observe' });
    return ovs;
  }
  if (domain === 'energy') {
    return [{ id: 'OV1', label: '过环/停稳结果', symbol: '', unit: '', role: 'primary', source: 'observe' }];
  }
  return [{ id: 'OV1', label: '过关结果', symbol: '', unit: '', role: 'primary', source: 'observe' }];
}

function extractVariablesFromSource(sources, gameHints, physicsCore) {
  const sliderIds = gameHints?.sliderControlIds || [];
  const controls = gameHints?.inferredControlIds || sliderIds;
  const allText = (sources || []).map(s => s.content || '').join('\n');
  const domain = physicsCore?.domain || detectSourceDomain(allText, gameHints);
  const rawOpIds = sliderIds.length ? sliderIds : controls.filter(id => !/^btn/i.test(id)).slice(0, 6);

  // Include mat-grid style discrete AVs for capacitor
  const extraIds = [];
  if (domain === 'capacitor' && /id=["']mat-grid["']/.test(allText) && !rawOpIds.includes('mat-grid')) {
    extraIds.push('mat-grid');
  }

  const confoundingFromSliders = [];
  const opIds = [];
  for (const controlId of [...extraIds, ...rawOpIds]) {
    if (opIds.includes(controlId)) continue;
    if (isLikelyConfoundingControl(controlId, allText, domain)) {
      confoundingFromSliders.push({
        id: `CV${confoundingFromSliders.length + 1}`,
        controlId,
        label: inferLabelFromControlId(controlId, domain),
        reason: '混淆/装饰控件：不参与核心过关归因',
      });
    } else {
      opIds.push(controlId);
    }
  }

  const adjustmentVariables = opIds.map((controlId, i) => ({
    id: `AV${i + 1}`,
    controlId,
    label: inferLabelFromControlId(controlId, domain),
    type: /mat-grid|select|radio/.test(controlId) ? 'discrete' : 'range',
    role: i === 0 ? 'primary' : 'secondary',
    mapsToKg: 'O1',
  }));

  const confoundingVariables = [...confoundingFromSliders];
  for (const id of gameHints?.optionalUiToggleIds || []) {
    if (opIds.includes(id) || confoundingVariables.some(c => c.controlId === id)) continue;
    confoundingVariables.push({
      id: `CV${confoundingVariables.length + 1}`,
      controlId: id,
      label: inferLabelFromControlId(id, domain),
      reason: '源码标记为无关或演示用控件',
    });
  }
  if (gameHints?.hasIrrelevant && !confoundingVariables.length) {
    confoundingVariables.push({
      id: 'CV1',
      controlId: null,
      label: '无关控件',
      reason: '与过关判定无关的装饰或误导项',
    });
  }

  const outputVariables = buildOutputVariablesForDomain(domain, allText, physicsCore);
  const cleanFormulas = sanitizeFormulaList(physicsCore?.formulas || []);

  return {
    adjustmentVariables,
    confoundingVariables: confoundingVariables.slice(0, 6),
    outputVariables: outputVariables.slice(0, 4),
    knowledgePoints: cleanFormulas.length
      ? [{
        id: 'KP1',
        label: gameHints?.projectTitle || gameHints?.chLabel || '本关知识点',
        formulas: cleanFormulas.slice(0, 4),
        mapsToKg: ['S1'],
      }]
      : [],
    domain,
  };
}

function inferMonotonicity(av) {
  const blob = `${av.controlId || ''} ${av.label || ''}`.toLowerCase();
  if (/mat|介质|材料|κ/.test(blob) || av.type === 'discrete') return 'discrete';
  if (/angle|角度|θ|theta/.test(blob)) return 'non-monotone';
  if (/height|高度|h\b/.test(blob)) return 'monotone';
  if (/speed|velocity|速度|v0|v\b/.test(blob)) return 'monotone';
  if (/area|面积|dist|间距|a\b|d\b/.test(blob)) return 'monotone';
  return 'unknown';
}

function inferAffectsNotes(av, domain) {
  const blob = `${av.controlId || ''} ${av.label || ''}`.toLowerCase();
  if (domain === 'capacitor') {
    if (/mat|介质|材料/.test(blob)) {
      return { affects: ['C', 'Ebd'], notes: '离散介质：εᵣ 与击穿极限同时变，与 A/d 连续滑条不等价' };
    }
    if (/dist|间距/.test(blob)) {
      return { affects: ['C', 'E'], notes: 'd 双作用：抬高 C（∝1/d）同时改 E=V/d 击穿风险' };
    }
    if (/area|面积/.test(blob)) {
      return { affects: ['C'], notes: 'A 单调改 C，不直接改击穿场强' };
    }
  }
  if (domain === 'projectile') {
    if (/angle|角度/.test(blob)) {
      return { affects: ['R', 'H'], notes: 'θ 对射程非单调，与 v0/h 不等价' };
    }
    if (/speed|速度/.test(blob)) {
      return { affects: ['R', 'H'], notes: 'v0 优先单变量：单调抬高射程' };
    }
    if (/height|高度/.test(blob)) {
      return { affects: ['R', 'H'], notes: '发射高度单调影响落点，弱于 v0' };
    }
  }
  return { affects: [], notes: '' };
}

function inferAdjustmentPriority(inquiryPartial, gameHints) {
  const avs = inquiryPartial?.adjustmentVariables || [];
  const domain = inquiryPartial?.domain || 'generic';
  if (!avs.length) return { adjustmentVariables: [], notes: '无调节变量' };

  const scored = avs.map(av => {
    const monotonicity = inferMonotonicity(av);
    const { affects, notes } = inferAffectsNotes(av, domain);
    const blob = `${av.controlId || ''} ${av.label || ''}`.toLowerCase();
    let score = 0;
    if (monotonicity === 'monotone') score += 10;
    if (monotonicity === 'discrete') score += 12; // 介质优先于连续滑条（电容样本）
    if (/speed|velocity|速度|v0|mat|介质|材料/.test(blob)) score += 5;
    if (/dist|间距/.test(blob)) score += 4;
    if (/height|高度/.test(blob)) score += 3;
    if (/area|面积/.test(blob)) score += 2;
    if (/angle|角度|θ|theta/.test(blob)) score += 2;
    if (monotonicity === 'non-monotone') score += 1;
    if (/mass|质量|thickness|厚度|audio|volume|音量/.test(blob)) score -= 20;
    return { ...av, monotonicity, affects, notes, _score: score };
  });
  scored.sort((a, b) => b._score - a._score || String(a.id).localeCompare(b.id));

  const ranked = scored.map((av, i) => {
    const { _score, ...rest } = av;
    return {
      ...rest,
      priorityRank: i + 1,
      role: i === 0 ? 'primary' : 'secondary',
    };
  });

  return {
    adjustmentVariables: ranked,
    notes: ranked.map(a => {
      const why = a.notes ? `；${a.notes}` : '';
      return `${a.label}(rank=${a.priorityRank}, ${a.monotonicity}${why})`;
    }).join(' ｜ '),
  };
}

function formatAnalyzeParseForPrompt(analyzeParse) {
  if (!analyzeParse) return '';
  const lines = [
    '## 分析轨三步解析（须优先保留，backfill 仅补缺）',
    '### Step1 physicsModel.core',
    JSON.stringify(analyzeParse.physicsModel?.core || {}, null, 2),
    '### Step2 inquiryScript 变量',
    JSON.stringify({
      adjustmentVariables: analyzeParse.inquiryScript?.adjustmentVariables,
      confoundingVariables: analyzeParse.inquiryScript?.confoundingVariables,
      outputVariables: analyzeParse.inquiryScript?.outputVariables,
      knowledgePoints: analyzeParse.inquiryScript?.knowledgePoints,
    }, null, 2),
    '### Step3 priorityRank + 不等价说明 + strategy',
    '每个 adjustmentVariable 须有 priorityRank、monotonicity（monotone|non-monotone|discrete|unknown）、affects[]、notes（为何与其它 AV 不等价）。',
    '多 AV 时 strategy.routes 须含「单变量·{label}」每 AV 一路 + trap；各 route 按 priorityRank 赋不同 score/weight（高优更高，trap 最低）。',
    '禁止套用其它样本模板：outputVariables/formulas/叙事不得出现与本关无关的「射程/最大高度」或 HTML 碎片。',
    'inquiryScript.narrative 用现象语言（读数高低、是否击穿、落点偏近/偏远）；完整公式只写在 teach S* / KP.formulas。',
    'O1.label 须写真实控件名（如「调节介质/间距/面积」），禁止空洞「调参操作」。',
    '',
    '【标签硬约束】AV/CV label 必须用本关物理量中文名，禁止把电容用语（极板/介质）套到非电容关，禁止把斜抛用语（发射角度/发射高度）套到摩擦/单摆/光学等关；禁止直接写控件 DOM id。',
    '【斜抛 few-shot——仅当本关为斜抛/抛体时套用】AV：初速度(rank1) > 发射高度(rank2) > 发射角度(rank3)；质量为 CV 不得进 AV；routes 按 AV 拆单变量 + 多参盲调。',
    '【电容 few-shot——仅当本关为电容时套用】AV：介质材料 ≥ 极板间距 > 极板面积；厚度/音量为 CV 不得进 AV。',
    analyzeParse.priorityNotes || '',
  ];
  return lines.join('\n');
}

function mergeAnalyzeParseIntoChapter(chapter, analyzeParse) {
  if (!chapter || !analyzeParse) return chapter;
  let result = { ...chapter };

  if (analyzeParse.physicsModel?.core) {
    const coreFormulas = sanitizeFormulaList(analyzeParse.physicsModel.core.formulas || []);
    const topFormulas = sanitizeFormulaList(analyzeParse.physicsModel.formulas || coreFormulas);
    result.physicsModel = {
      ...(result.physicsModel || {}),
      ...(topFormulas.length ? { formulas: topFormulas } : {}),
      core: {
        ...(result.physicsModel?.core || {}),
        ...analyzeParse.physicsModel.core,
        formulas: coreFormulas.length
          ? coreFormulas
          : sanitizeFormulaList(result.physicsModel?.core?.formulas),
      },
    };
  }

  const script = analyzeParse.inquiryScript;
  if (script) {
    const existing = result.inquiryScript || {};
    const mergeKp = (incoming, prev) => {
      if (!incoming?.length) return prev;
      return incoming.map(kp => ({
        ...kp,
        formulas: sanitizeFormulaList(kp.formulas),
      }));
    };
    result.inquiryScript = {
      ...existing,
      ...script,
      adjustmentVariables: script.adjustmentVariables?.length
        ? script.adjustmentVariables
        : existing.adjustmentVariables,
      confoundingVariables: script.confoundingVariables?.length
        ? script.confoundingVariables
        : existing.confoundingVariables,
      outputVariables: script.outputVariables?.length
        ? script.outputVariables
        : existing.outputVariables,
      knowledgePoints: mergeKp(script.knowledgePoints, existing.knowledgePoints),
    };
  }
  return result;
}

/**
 * @param {{ sources: object[], gameHints?: object }} opts
 * @returns {{ steps: object[], analyzeParse: object, timings: object }}
 */
function runAnalyzeThreeStep(opts = {}) {
  const sources = opts.sources || [];
  const gameHints = opts.gameHints || {};
  const start = Date.now();
  const steps = [];

  const core = extractPhysicsModelFromSource(sources, gameHints);
  steps.push({
    id: 'physics_model',
    label: '剥离物理模型',
    status: 'done',
    summary: `${core.formulas.length} 条公式 · ${core.updateLoopSummary.slice(0, 24)}…`,
  });

  const inquiryPartial = extractVariablesFromSource(sources, gameHints, core);
  steps.push({
    id: 'variables',
    label: '确定变量',
    status: 'done',
    summary: `AV×${inquiryPartial.adjustmentVariables.length} CV×${inquiryPartial.confoundingVariables.length} OV×${inquiryPartial.outputVariables.length}`,
  });

  const priority = inferAdjustmentPriority(inquiryPartial, gameHints);
  steps.push({
    id: 'priority',
    label: '单变量优先级',
    status: 'done',
    summary: priority.notes || '—',
  });

  steps.push({
    id: 'graph',
    label: '生成事理图谱',
    status: 'pending',
    summary: '等待 LLM 生成 DT/KG/strategy',
  });

  const analyzeParse = {
    physicsModel: {
      core,
      formulas: core.formulas,
    },
    inquiryScript: {
      ...inquiryPartial,
      adjustmentVariables: priority.adjustmentVariables,
      summary: gameHints?.projectTitle || gameHints?.chLabel || '',
    },
    priorityNotes: priority.notes,
  };

  return {
    steps,
    analyzeParse,
    timings: { analyzeThreeStepMs: Date.now() - start },
  };
}

module.exports = {
  runAnalyzeThreeStep,
  extractPhysicsModelFromSource,
  extractVariablesFromSource,
  inferAdjustmentPriority,
  formatAnalyzeParseForPrompt,
  mergeAnalyzeParseIntoChapter,
  inferLabelFromControlId,
  inferMonotonicity,
  detectSourceDomain,
  buildOutputVariablesForDomain,
};
