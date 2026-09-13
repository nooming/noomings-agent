/** 组装喂外部 LLM 生成游戏 HTML 的 prompt 包 */

const fs = require('fs');
const path = require('path');
const { renderTelemetryMarkdown } = require('../telemetry-spec');

const PATTERNS_PATH = path.join(__dirname, 'shiguang-patterns.md');

function loadShiguangPatterns() {
  try {
    if (fs.existsSync(PATTERNS_PATH)) {
      // Craft-gold shell notes are denser than the old 拾光 stub; keep enough for CV/feedback.
      return fs.readFileSync(PATTERNS_PATH, 'utf8').slice(0, 5500);
    }
  } catch {
    /* ignore */
  }
  return '';
}

const SHIGUANG_PATTERNS = loadShiguangPatterns();

const HTMLGEN_SYSTEM = `你是物理教育互动课件的前端开发者。根据给定的 gameSpec、inquiryScript、事理图谱摘要与 telemetrySpec，生成**单文件 HTML**（内联 CSS/JS，无外部依赖）。

要求：
- 控件 id 必须与 gameSpec.controls[].id / traceMapExpected 完全一致（含 role=confounding 的 CV 滑条）
- 调节变量用 range 或明确 UI
- 混淆变量（CV）按 confoundingUi.uiStrategy：
  · interactive_mid（默认，有 controlId）：做成可拖滑条，**插入 AV 中间，禁止垫在面板最底部**；旋钮文案只写物理量名，**禁止**「不影响/仅视觉/旁路/混淆」剧透
  · teach_only / narrative_only：仅教案区说明（无控件或纯叙事）
- 物理公式与过关判定对齐 gameSpec.constraints 与 winCondition；CV 可改观感，但不得驱动过关判定
- Observe / 竞赛测后反馈（对齐课堂金标）：
  · 测前目标读数显示「待测」，禁止拖动滑条时直播竞赛答案量
  · 测后提示须含实测值，并用「偏低 / 偏高 / 已落入」三态（或等价相对提示）
  · 支持 retry 式再调
- 通关 overlay（craft-win）：
  · 展示本局证据摘要（主调 AV 次数等；勿把 CV 计入主调）
  · 归因 MCQ：选项为各主 AV +「多参一起 / 还不确定」；**CV 不得作为正确选项**（可作干扰项，但选后揭示其旁路无效）
  · 选归因后才揭示 #craftCv 旁路说明，并解锁关闭/再玩
  · emit snapshot 可带 attribution 字段
- Intro Template A（#craft-intro，探究优先）：
  · 结构：h2 关名·主题 + 1 段现象钩子 + p.craft-intro-meta + button#craftIntroBtn「开始探究」
  · **禁止** intro 内 ".formula" / 方程块；有用公式移到 craft-win 揭示区或图谱
  · meta 口径：探究≠竞赛；目标本局锁定；未命中扣次数（可微调节奏）；勿剧透 CV 滑条
- 视觉壳：内联 craft token（--craft-bg:#0e1418; --craft-panel:#162028; --craft-accent 可换色; --craft-text; --craft-muted; --craft-radius:12px）及 craft-shell 关键规则。生成物为单文件，勿依赖 ../_shared 外链。包目录演示链 craft-tokens.css + craft-shell.css + CraftTelemetry / CraftFeedback；契约：data/runtime/packages/_shared/README.md
- 侧栏 IA（课堂标准，勿再用裸 .mode-row）：**.bench-hd**（title + subtitle ‖ #modeSelect）→ **.side-goal-box**（.side-goal-cap「当前目标」+ #sideGoal）→ 滑条 → 操作 → observe。舞台紧凑 **.craft-mode-pill**（探究模式 / 竞赛模式 | 剩余机会 N；隐藏计时器），放置避开关卡专属 HUD。通关标题「过关 · 本局对照」
- 双模：#modeSelect 含 explore / challenge；切换时 phase_change；同步 .craft-mode-pill[data-mode]
- 预留注释 <!-- trace-adapter-hook --> 供后期埋点（含 emit/snapshot/win/explore_success）
- 竞赛通关 UI：emit('snapshot', { controls, winOk: true, hintKey }) 与 emit('win', { winOk: true })（仅 challenge）
- 探究达成：emit('explore_success', { winOk: true, hintKey, … })；禁止用 win 冒充竞赛结果
- 页面顶部显示操作提示：「调节参数后点击发射/测试」
- 布局：canvas 主仿真区（id=simCanvas 或 gameSpec.layout.canvasId）+ 控件侧栏/下方（controlsPanel）；range 滑条与数值显示双向同步
- gameSpec.needsContinuousSim 为 true 时：须 requestAnimationFrame 驱动连续动画，update(dt)/draw() 分离，dt=Math.min(50, now-last)；实时显示 gameSpec.dataReadouts 中的物理量；禁止调参即过关（须可见轨迹/读数变化）
- 力学/抛体/碰撞/振子/圆周/动量类：须用 requestAnimationFrame 驱动连续动画，禁止仅静态 canvas 重绘
- 须提供发射/测试按钮与复位按钮
- 不要编造 gameSpec 未列出的控件 id；不要硬编码某一关的特殊物理（如滑轮 α 公式）——只复用通用壳与反馈模式
- 中文界面
${SHIGUANG_PATTERNS ? `\n## 结构范例（课堂壳 + 拾光布局摘要）\n${SHIGUANG_PATTERNS}` : ''}`;

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
