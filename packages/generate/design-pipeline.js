const { chatCompletion, parseJsonFromLlm } = require('../shared/llm');
const { enrichChapterContract } = require('../contract/enrich');
const { validateChapter, validateChapterQuality } = require('../contract');
const { inferSimHints, isMotionTopic } = require('./game-spec');
const { buildLlmPromptBundle } = require('./export/llm-prompt-bundle');
const pipelineMod = require('./pipeline');

const PARSE_SYSTEM = `你是物理教育探究设计助手。根据教师口语描述的知识点，识别调节变量与混淆变量。
只输出 JSON：
{
  "summary": "一句话探究目标",
  "knowledgePoints": [{ "id": "KP1", "label": "概念或公式名", "formulas": ["可选公式"], "mapsToKg": [] }],
  "adjustmentVariables": [{
    "id": "AV1", "controlId": "s-xxx", "label": "中文名", "symbol": "物理符号",
    "type": "range|button|discrete", "role": "primary|secondary",
    "suggestedRange": { "min", "max", "step", "unit" }
  }],
  "confoundingVariables": [{
    "id": "CV1", "controlId": "s-yyy或null", "label", "reason": "为何不影响结论"
  }],
  "inquiryFlow": ["KP1", "AV1", "CV1"],
  "hint": "过关判定简述",
  "title": "建议章节标题"
}
规则：
- 调节变量：学生应主动调节且影响过关/结论
- 混淆变量：看似相关但不影响核心判定；若有 controlId，勿与调节变量重复
- controlId 用英文 id（s-angle、btn-fire），便于 HTML 生成
- 至少 1 个 KP、1 个 AV；混淆变量可为空数组
- 调节变量须含 symbol（物理符号）与 suggestedRange.unit（单位）
- 勿编造与输入无关的物理量`;

function buildDesignStubSource(knowledgeText, draft) {
  const lines = [
    '## 设计规格（教师输入，无 HTML 源码）',
    '',
    '### 知识点（口语）',
    knowledgeText.trim(),
    '',
    '### 已识别调节变量',
    JSON.stringify(draft.adjustmentVariables || [], null, 2),
    '',
    '### 已识别混淆变量',
    JSON.stringify(draft.confoundingVariables || [], null, 2),
    '',
    '### 过关提示',
    draft.hint || draft.summary || '',
  ];
  return [{ path: 'design-spec.txt', content: lines.join('\n') }];
}

function buildDesignGameHints(inquiryDraft, body) {
  const av = inquiryDraft.adjustmentVariables || [];
  const sliders = av.filter(a => !a.type || a.type === 'range').map(a => a.controlId).filter(Boolean);
  const buttons = av.filter(a => a.type === 'button').map(a => a.controlId).filter(Boolean);
  const discrete = av.filter(a => a.type === 'discrete').map(a => a.controlId).filter(Boolean);
  const cv = inquiryDraft.confoundingVariables || [];
  const topicText = [
    inquiryDraft.title,
    inquiryDraft.summary,
    ...(inquiryDraft.knowledgePoints || []).map(k => k.label),
  ].join(' ');
  const needsContinuousSim = isMotionTopic(topicText)
    || !!inferSimHints({ inquiryScript: inquiryDraft })?.needsContinuousSim;

  return {
    tier: 'generic',
    designMode: true,
    needsContinuousSim,
    projectTitle: body.title || inquiryDraft.title || '设计实验',
    chLabel: '设计轨',
    sliderControlIds: sliders,
    discreteControlIds: discrete,
    actionTriggerControlIds: buttons,
    tunableInputCount: sliders.length + discrete.length,
    minNodes: 8,
    minConstraints: 1,
    minTeachNodes: 2,
    minVerifyLinks: 1,
    minStrategyRoutes: 2,
    hasIrrelevant: cv.length > 0,
    hasCoupledControls: false,
    actionObserveLoop: buttons.length > 0 || sliders.length >= 1,
    sourceComplexity: sliders.length >= 3 ? 'rich' : 'moderate',
    variableKindSummary: {
      sliderCount: sliders.length,
      discreteCount: discrete.length,
      actionCount: buttons.length,
    },
    _inquiryDraft: inquiryDraft,
  };
}

function formatInquiryForGraphPrompt(draft) {
  return [
    '## 已定稿探究脚本（图谱须严格一致，勿偏离）',
    `- 探究目标：${draft.summary || ''}`,
    `- 知识点：${(draft.knowledgePoints || []).map(k => k.label).join('；')}`,
    `- 调节变量：${(draft.adjustmentVariables || []).map(a => `${a.label}(${a.controlId})`).join('、')}`,
    `- 混淆变量：${(draft.confoundingVariables || []).map(c => c.label).join('、') || '无'}`,
    `- traceMap.controls 须覆盖全部调节变量 controlId，role=operation → O1/O*`,
    `- 混淆变量勿写入 traceMap.operation；可在 teach 层 S* 说明`,
    `- inquiryScript 字段须原样写入输出 JSON（可微调 mapsToKg 指向实际 S* id）`,
    '',
    '```json',
    JSON.stringify({
      summary: draft.summary,
      knowledgePoints: draft.knowledgePoints,
      adjustmentVariables: draft.adjustmentVariables,
      confoundingVariables: draft.confoundingVariables,
      inquiryFlow: draft.inquiryFlow,
    }, null, 2),
    '```',
  ].join('\n');
}

async function parseKnowledgeInput(knowledgeText, body, opts) {
  const userPrompt = [
    '## 教师输入的知识点（口语）',
    knowledgeText.trim(),
    body.hint ? `\n## 补充说明\n${body.hint.trim()}` : '',
    body.teachingObjectives ? `\n## 教学目标\n${body.teachingObjectives.trim()}` : '',
    body.title ? `\n## 建议标题\n${body.title.trim()}` : '',
  ].filter(Boolean).join('\n');

  const text = await chatCompletion(
    opts.apiKey,
    opts.apiUrl,
    [
      { role: 'system', content: PARSE_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    { max_tokens: 4096, temperature: 0.2, response_format: { type: 'json_object' } },
  );
  return parseJsonFromLlm(text);
}

async function generateDesignGraph(body, opts = {}) {
  if (!opts.apiKey) {
    const err = new Error('DEEPSEEK_API_KEY required for design-mode generation');
    err.status = 503;
    throw err;
  }

  const knowledgeText = String(body.knowledgePoints || body.knowledgeText || '').trim();
  if (!knowledgeText) {
    const err = new Error('knowledgePoints_required');
    err.status = 400;
    err.message = '设计模式请填写实验知识点。';
    throw err;
  }

  const parseStart = Date.now();
  const inquiryDraft = await parseKnowledgeInput(knowledgeText, body, opts);
  const parseMs = Date.now() - parseStart;

  const sources = buildDesignStubSource(knowledgeText, inquiryDraft);
  const gameHints = buildDesignGameHints(inquiryDraft, body);

  const genBody = {
    ...body,
    title: body.title || inquiryDraft.title,
    hint: body.hint || inquiryDraft.hint || inquiryDraft.summary,
    teachingObjectives: body.teachingObjectives
      || (inquiryDraft.knowledgePoints || []).map(k => k.label).join('；'),
    sources,
    gameHints,
    designInquirySection: formatInquiryForGraphPrompt(inquiryDraft),
  };

  const origBuildPrompt = pipelineMod.buildGeneratePrompt;
  pipelineMod.buildGeneratePrompt = function patchedBuild(optsIn) {
    const base = origBuildPrompt.call(pipelineMod, optsIn);
    return `${base}\n\n${genBody.designInquirySection || ''}`;
  };

  let gen;
  try {
    gen = await pipelineMod.generateGraph(genBody, opts);
  } finally {
    pipelineMod.buildGeneratePrompt = origBuildPrompt;
  }

  if (gen.chapter) {
    const mergedScript = {
      ...(gen.chapter.inquiryScript || {}),
      ...inquiryDraft,
      narrative: gen.chapter.inquiryScript?.narrative || inquiryDraft.narrative,
    };
    gen.chapter = enrichChapterContract(
      { ...gen.chapter, inquiryScript: mergedScript },
      gameHints,
      sources,
    );
    gen.promptBundle = buildLlmPromptBundle(gen.chapter);
  }

  gen.mode = 'design';
  gen.inquiryDraft = inquiryDraft;
  gen.timings = { ...(gen.timings || {}), parseMs };

  if (gen.chapter) {
    const validation = validateChapter(gen.chapter);
    const quality = validation.ok
      ? validateChapterQuality(gen.chapter, gameHints)
      : gen.quality;
    gen.validation = validation;
    gen.quality = quality;
  }

  return gen;
}

module.exports = {
  generateDesignGraph,
  parseKnowledgeInput,
  buildDesignGameHints,
  buildDesignStubSource,
  formatInquiryForGraphPrompt,
  PARSE_SYSTEM,
};
