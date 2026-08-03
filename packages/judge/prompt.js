const { buildCodeContext } = require('../shared/context-loader');
const { summarizeTrace } = require('./dt-align');

function buildSystemPrompt(body) {
  const chapter = body.chapter;
  const title = chapter?.kg?.title || chapter?.winSync?.title || body.graph?.dtSummary || '本关 puzzle';
  const mapping = chapter?.mapping || body.graph?.mapping || '';
  return `你是互动教学课件 / puzzle 的过程逻辑评判助手。根据评判 JSON 中的事理图谱与决策树、源代码（若有）及操作轨迹，评价玩家的解题思路是否合理。

当前关卡：${title}

规则：
- 只评逻辑与操作顺序，禁止给出具体过关参数数值。
- 结合图谱中的约束节点、retry 与轨迹中的 hint/状态，判断试错是否合理、是否忽略提示所指问题。
- 永久无关控件（irrelevant / I*）与「当前模式下的无效调参」（misconceptionTouches / stratInvalid）须区分评语，勿把关态下仍有效的条件参数调节判为无关。
- 若轨迹显示操作了永久无关控件，应在评语中指出理解可能有偏差；misconceptionTouches 表示模式条件下误调参数（迷思环）。
- **竞赛模式（challenge）**：仅当轨迹含 phase_change 且进入 challenge 后，才评价控制变量策略与 singleVariableRate；探索段（explore）的乱调可忽略。
- 用户消息中含「探究路径对齐」摘要（pathSteps、strategyRouteGuess、metrics）；请对照 strategy.routes 的主路径/误区/教案途径给出过程性评价。
- **控制变量（main 途径）**：strategy.routes 中 id=main 表示「每次只改一项」，这是推荐策略，**优于**同时调节多个参数（trap=多参盲调）。
- metrics.singleVariableRate ≥ 0.8 且 strategyRouteGuess=main 时：只调节一个 operation 参数（如仅速度）是正确做法，**不得**将其列为 gaps 或判 level 1。
- **CV 重度（metrics.cvHeavy）**：竞赛段大量拧 irrelevant / 混淆控件时，**不得**表扬「符合控制变量途径 / 坚持单参」；应指出试探旁路/拧无关量，并引导回到单一有效参量。
- metrics.parameterCoverage < 1 且多次失败时：可在 suggestion 建议「固定已试参数、切换探索另一单参」，**禁止**建议同时调节两参数。
- 若 metrics/strategySegmentScore 含 strategySequence 与 switchKind：按换向类型叙述——focused_redirect=聚焦换向（先盯一个量再换方向，属合理）；explore_converge=探索收敛（早期混乱后收束到单变量）；thrash=散乱横跳（建议先聚焦）；stable=路径稳定。勿把「两个单变量之间的切换」说成多参盲调；陷阱仍是同一试次内同时拧多 AV。
- gaps 应优先描述多参混调、忽视观察反馈、无关控件等真实误区，而非「方法单一」「未试另一参数」。
- 禁止泄题数值；不要重复解释 metrics 字段名。
- **仅输出一个 JSON 对象**（不要 markdown、不要代码块、不要前后说明），格式如下：
{"level":2,"summary":"不超过80字总评","strengths":["不超过40字","可选第二条"],"gaps":["不超过40字","可选第二条"],"suggestion":"不超过80字教学建议"}
- level 为 1–3 整数：3=已过关且路径清晰；2=单变量规范探索中/接近收敛；1=探索中但有明显策略问题，1=多参盲调或明显误区。${mapping ? '\n\n图谱 mapping 摘要已包含在用户消息中。' : ''}`;
}

/**
 * @param {import('./types').JudgeRequest} body
 */
function buildUserPrompt(body) {
  const { ch, sources, trace, graph, chapter } = body;
  const tier = chapter ? 'chapter' : 'summary';
  const codeBlock = buildCodeContext(sources || [], ch, tier);
  const summary = summarizeTrace(trace || { events: [] }, ch, chapter);
  const graphPart = chapter?.mapping || graph?.mapping || graph?.dtSummary || '';
  const winPart = chapter?.winSync?.title ? `\n过关目标：${chapter.winSync.title}` : '';
  return [
    `章节索引：Ch${ch}`,
    winPart,
    graphPart ? `\n## 事理图谱 / DT\n${graphPart}` : '',
    codeBlock ? `\n## 源代码\n${codeBlock}` : '',
    `\n## 操作轨迹摘要\n${JSON.stringify(summary, null, 2)}`,
    summary.inquiryPath
      ? `\n## 探究路径对齐\n${JSON.stringify(summary.inquiryPath, null, 2)}`
      : '',
    chapter?.strategy?.routes?.length
      ? `\n## 策略途径（Master）\n${chapter.strategy.routes.map(r =>
        `- ${r.id}: ${r.label} → mapsTo [${(r.mapsTo || []).join(', ')}]${r.warn ? ` (${r.warn})` : ''}`,
      ).join('\n')}`
      : '',
  ].join('\n');
}

function getSystem(body) {
  return buildSystemPrompt(body);
}

module.exports = { buildSystemPrompt, getSystem, buildUserPrompt };
