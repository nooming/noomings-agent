/** 组装喂外部 LLM 生成游戏 HTML 的 prompt 包 */

const fs = require('fs');
const path = require('path');
const { renderTelemetryMarkdown } = require('../telemetry-spec');

const PATTERNS_PATH = path.join(__dirname, 'shiguang-patterns.md');

function loadShiguangPatterns() {
  try {
    if (fs.existsSync(PATTERNS_PATH)) {
      return fs.readFileSync(PATTERNS_PATH, 'utf8').slice(0, 3500);
    }
  } catch {
    /* ignore */
  }
  return '';
}

const SHIGUANG_PATTERNS = loadShiguangPatterns();

const HTMLGEN_SYSTEM = `你是物理教育互动课件的前端开发者。根据给定的 gameSpec、inquiryScript、事理图谱摘要与 telemetrySpec，生成**单文件 HTML**（内联 CSS/JS，无外部依赖）。

要求：
- 控件 id 必须与 gameSpec.controls[].id / traceMapExpected 完全一致
- 调节变量用 range 或明确 UI；混淆变量按 confoundingUi.uiStrategy（teach_only 仅教案区说明，勿做成主滑条）
- 物理公式与过关判定对齐 gameSpec.constraints 与 winCondition
- 含 Observe 反馈：测试/发射后可看到结果提示，支持 retry 式再调
- 预留注释 <!-- trace-adapter-hook --> 供后期埋点（含 emit/snapshot/win/explore_success 模板，与 heat-conduction 样本一致）
- 竞赛通关 UI：emit('snapshot', { controls, winOk: true, hintKey }) 与 emit('win', { winOk: true })（仅 challenge）
- 探究达成（命中/对照里程碑）：emit('explore_success', { winOk: true, hintKey, … })；禁止用 win 冒充竞赛结果
- 页面顶部显示操作提示：「调节参数后点击发射/测试」
- 布局：canvas 主仿真区（id=simCanvas 或 gameSpec.layout.canvasId）+ 控件侧栏/下方（controlsPanel）；range 滑条与数值显示双向同步
- gameSpec.needsContinuousSim 为 true 时：须 requestAnimationFrame 驱动连续动画，update(dt)/draw() 分离，dt=Math.min(50, now-last)；实时显示 gameSpec.dataReadouts 中的物理量；禁止调参即过关（须可见轨迹/读数变化）
- 力学/抛体/碰撞/振子/圆周/动量类：须用 requestAnimationFrame 驱动连续动画，禁止仅静态 canvas 重绘
- 须提供发射/测试按钮与复位按钮
- 不要编造 gameSpec 未列出的控件 id
- 中文界面
${SHIGUANG_PATTERNS ? `\n## 结构范例（拾光离线参照摘要）\n${SHIGUANG_PATTERNS}` : ''}`;

const HTML_REPAIR_SYSTEM = `你是物理教育互动 HTML 修复助手。根据校验错误列表修复游戏 HTML，保持原有功能与控件 id 不变。
只输出完整 HTML 文档，不要 markdown 代码块。必须保留 <!-- trace-adapter-hook --> 且仅一处。`;

function summarizeChapterForPrompt(chapter) {
  const nodes = (chapter.kg?.nodes || []).slice(0, 16);
  const playChain = nodes
    .filter(n => n.layer === 'play')
    .map(n => `${n.id}(${n.group})`)
    .join(' → ');
  return {
    title: chapter.kg?.title,
    playChain: playChain || 'P1→O1→C*→R1',
    strategyRoutes: (chapter.strategy?.routes || []).map(r => r.label).slice(0, 6),
  };
}

function buildLlmPromptBundle(chapter) {
  const gameSpec = chapter.gameSpec || {};
  const script = chapter.inquiryScript || {};
  const telemetry = chapter.telemetrySpec || {};
  const summary = summarizeChapterForPrompt(chapter);

  const userParts = [
    '## 任务',
    '根据以下规格生成完整可运行的单文件 HTML 互动探究小游戏。',
    '',
    '## inquiryScript（探究脚本）',
    '```json',
    JSON.stringify({
      summary: script.summary,
      knowledgePoints: script.knowledgePoints,
      adjustmentVariables: script.adjustmentVariables,
      confoundingVariables: script.confoundingVariables,
      narrative: script.narrative,
    }, null, 2),
    '```',
    '',
    '## gameSpec（游戏生成规格）',
    '```json',
    JSON.stringify(gameSpec, null, 2),
    '```',
    '',
    '## 事理图谱摘要',
    `- 标题：${summary.title || '—'}`,
    `- Play 链：${summary.playChain}`,
    `- 策略途径：${(summary.strategyRoutes || []).join('；') || '—'}`,
    gameSpec.needsContinuousSim ? '- **连续仿真**：须 RAF + 实时读数 + 可见运动轨迹' : '',
    '',
    renderTelemetryMarkdown(telemetry),
    '',
    '## 输出',
    '只输出完整 HTML 文档，不要 markdown 代码块包裹。',
  ].filter(Boolean);

  const user = userParts.join('\n');

  const markdown = [
    '# LLM Prompt 包 · 生成游戏 HTML',
    '',
    '## System',
    '',
    HTMLGEN_SYSTEM,
    '',
    '## User',
    '',
    user,
  ].join('\n');

  return {
    system: HTMLGEN_SYSTEM,
    user,
    markdown,
    meta: {
      title: gameSpec.title || summary.title,
      controlCount: (gameSpec.controls || []).length,
      eventCount: (telemetry.events || []).length,
      needsContinuousSim: !!gameSpec.needsContinuousSim,
    },
  };
}

function buildHtmlRepairPrompt(html, validation) {
  const user = [
    '## 校验错误（必须全部修复）',
    ...(validation.errors || []).map(e => `- ${e}`),
    ...(validation.warnings || []).map(w => `- [warning] ${w}`),
    '',
    '## 当前 HTML',
    html,
    '',
    '## 输出',
    '只输出修复后的完整 HTML。',
  ].join('\n');
  return { system: HTML_REPAIR_SYSTEM, user };
}

module.exports = {
  buildLlmPromptBundle,
  buildHtmlRepairPrompt,
  HTMLGEN_SYSTEM,
  HTML_REPAIR_SYSTEM,
};
