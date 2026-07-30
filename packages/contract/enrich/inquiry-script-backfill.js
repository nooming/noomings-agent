/** 从 KG / traceMap / teach 层回填 inquiryScript（分析轨 enrich 用） */

const { isCleanFormula } = require('../repair/inquiry-script-sanitize');

function extractFormulas(text) {
  const s = String(text || '');
  const out = [];
  const re = /C\s*=\s*[^。\n<]+|E\s*=\s*[^。\n<]+|[α-ωΑ-Ω][^。\n<]{0,40}=[^。\n<]+/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const f = m[0].trim();
    if (isCleanFormula(f) && !out.includes(f)) out.push(f);
  }
  return out.slice(0, 4);
}

function stripNodePrefix(label) {
  return String(label || '').replace(/^[A-Z]\d+\s+/, '').trim();
}

function buildConfoundingFromChapter(chapter, gameHints, controls) {
  const out = [];
  const seen = new Set();
  const opIds = new Set(
    Object.entries(controls || {})
      .filter(([, v]) => v?.role === 'operation')
      .map(([id]) => id),
  );

  for (const [controlId, v] of Object.entries(controls || {})) {
    if (v?.role !== 'irrelevant') continue;
    if (seen.has(controlId)) continue;
    seen.add(controlId);
    const node = (chapter.kg?.nodes || []).find(n => n.id === v.kgId);
    out.push({
      id: `CV${out.length + 1}`,
      controlId,
      label: stripNodePrefix(node?.label) || controlId,
      reason: node?.desc || '与过关判定无关',
      mapsToKg: v.kgId || null,
    });
  }

  for (const id of gameHints?.optionalUiToggleIds || []) {
    if (opIds.has(id) || seen.has(id)) continue;
    if (controls?.[id]) continue;
    seen.add(id);
    out.push({
      id: `CV${out.length + 1}`,
      controlId: id,
      label: id,
      reason: '源码标记为无关或演示用变量',
      mapsToKg: null,
    });
  }

  return out.slice(0, 6);
}

function buildInquiryFlow(knowledgePoints, adjustmentVariables, confoundingVariables, existingFlow) {
  if (Array.isArray(existingFlow) && existingFlow.length >= 2) return existingFlow;
  const flow = [];
  if (knowledgePoints[0]?.id) flow.push(knowledgePoints[0].id);
  for (const av of adjustmentVariables.slice(0, 4)) {
    if (av?.id) flow.push(av.id);
  }
  if (confoundingVariables[0]?.id) flow.push(confoundingVariables[0].id);
  return flow.length >= 2 ? flow : ['KP1', 'AV1'];
}

function buildDefaultNarrative(knowledgePoints, adjustmentVariables, confoundingVariables) {
  const steps = [];
  if (knowledgePoints.length) {
    steps.push({
      order: 1,
      title: '明确知识点',
      body: `回顾：${knowledgePoints.map(k => k.label).join('；')}`,
      mapsToKg: knowledgePoints.flatMap(k => k.mapsToKg || []).slice(0, 4),
    });
  }
  if (adjustmentVariables.length) {
    steps.push({
      order: steps.length + 1,
      title: '识别调节变量',
      body: `可调节：${adjustmentVariables.map(a => a.label || a.controlId).join('、')}；建议控制变量法，每次只改一项。`,
      mapsToKg: adjustmentVariables.map(a => a.mapsToKg).filter(Boolean),
    });
  }
  if (confoundingVariables.length) {
    steps.push({
      order: steps.length + 1,
      title: '识别混淆变量',
      body: `混淆项：${confoundingVariables.map(c => `${c.label}（${c.reason || '不影响结论'}）`).join('；')}`,
      mapsToKg: confoundingVariables.map(c => c.mapsToKg).filter(Boolean),
    });
  }
  steps.push({
    order: steps.length + 1,
    title: '观察—调整—再测',
    body: '操作后观察结果，未达标则微调调节变量并重复，直至满足约束过关。',
    mapsToKg: adjustmentVariables[0]?.mapsToKg ? [adjustmentVariables[0].mapsToKg] : ['O1'],
  });
  return {
    intro: knowledgePoints.length
      ? `本关探究：${knowledgePoints.map(k => k.label).slice(0, 3).join('、')}`
      : '互动探究关卡',
    steps,
  };
}

function backfillInquiryScript(chapter, gameHints) {
  if (!chapter || typeof chapter !== 'object') return chapter;

  const existing = chapter.inquiryScript;
  const nodes = chapter.kg?.nodes || [];
  const teach = nodes.filter(n => n.layer === 'teach' && (n.group === 'core' || n.group === 'method'));
  const controls = chapter.traceMap?.controls || {};

  const knowledgePoints = (existing?.knowledgePoints?.length
    ? existing.knowledgePoints
    : teach.map((n, i) => ({
      id: `KP${i + 1}`,
      label: stripNodePrefix(n.label) || n.id,
      mapsToKg: [n.id],
      formulas: extractFormulas(n.desc),
    }))).filter(kp => kp.label);

  const adjustmentVariables = existing?.adjustmentVariables?.length
    ? existing.adjustmentVariables
    : Object.entries(controls)
      .filter(([, v]) => v?.role === 'operation')
      .map(([controlId, v], i) => {
        const kgNode = nodes.find(n => n.id === v.kgId);
        return {
          id: `AV${i + 1}`,
          controlId,
          label: stripNodePrefix(kgNode?.label) || controlId,
          mapsToKg: v.kgId || 'O1',
          role: i === 0 ? 'primary' : 'secondary',
        };
      });

  const confoundingVariables = existing?.confoundingVariables?.length
    ? existing.confoundingVariables
    : buildConfoundingFromChapter(chapter, gameHints, controls);

  const inquiryFlow = buildInquiryFlow(
    knowledgePoints,
    adjustmentVariables,
    confoundingVariables,
    existing?.inquiryFlow,
  );

  const summary = existing?.summary
    || chapter.kg?.title
    || gameHints?.projectTitle
    || '';

  const narrative = existing?.narrative
    || buildDefaultNarrative(knowledgePoints, adjustmentVariables, confoundingVariables);

  return {
    ...chapter,
    inquiryScript: {
      summary,
      knowledgePoints,
      adjustmentVariables,
      confoundingVariables,
      inquiryFlow,
      narrative,
    },
  };
}

module.exports = {
  backfillInquiryScript,
  buildDefaultNarrative,
  buildInquiryFlow,
};
