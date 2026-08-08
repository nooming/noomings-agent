# 导师建议（张睿老师）

本目录存放与项目方向相关的微信截图与说明，供写论文与迭代 Agent 时对照。

## 截图索引

| 文件 | 主题 |
|------|------|
| `Snipaste_2026-06-30_22-33-31.png` | **设计轨**：Agent 同时生成探究脚本与事理图谱；先知识点 → 调节变量 / 混淆变量 → 再定图谱；垂域 LLM（RL）与事理图谱路线不同 |
| `Snipaste_2026-06-30_22-33-39.png` | **产物边界**：Agent 产出物理模型 + 事理图，非完整游戏 UI；脚本可喂大模型再生成程序；无关变量勿标在滑条上 |
| `Snipaste_2026-06-30_22-33-51.png` | **论文数据**：每款游戏 + 事理图谱分析学生行为；按图谱设定要上报的操作数据 |

## 与代码的对应

- 设计轨 / 分析轨双模式：Agent A 页面「设计图谱 / 分析源码」
- `inquiryScript` + `physicsModel` + `gameSpec` + `telemetrySpec`：见 [探究脚本与论文对齐计划](../../.cursor/plans/探究脚本与论文对齐.plan.md)
- 游戏 HTML 样本：`data/games/preset/`（电容纪元）、`data/games/legacy/`（历史样本）

## 过程性评价（教师半页）

- [过程性评价 · 教师半页说明](./process-assessment-teacher-note.md)：路径摘要 / 变量表 / strengths·gaps 怎么读；附录可选映射到观点·证据·论证（UI 不用 CER 品牌）。

## 演示反馈（2026）

张睿老师在看过演示视频后表示：**现有功能方向认可**；优化重点是先 **确定公式、混淆变量、输出变量（物理因变量）**，**暂不考虑 UI 美观**。

### Parse 四块 vs 论文三要素（已定稿 2026-07）

| 老师/论文口径 | Parse 输出字段 | 说明 |
|--------------|----------------|------|
| 公式 | `inquiryScript.knowledgePoints[].formulas` | 多公式时拆多个 KP（`multi-kp`） |
| 混淆变量 | `inquiryScript.confoundingVariables` | `has-confounding` 样本必填 |
| 输出变量 | `inquiryScript.outputVariables` | 因变量/可观测，非按钮 |
| 调节量（方法节补充） | `inquiryScript.adjustmentVariables` | 与 traceMap 对齐；**Parse 必填**，不并入论文「三要素」正文 |

**论文写法：** 正文写三要素；方法节一句说明「学生操控量（调节变量）由 Parse 与 traceMap 显式列出，供游戏埋点与过程评价」。

代码对应：

- `inquiryScript.knowledgePoints[].formulas` — 公式
- `inquiryScript.adjustmentVariables` — 调节变量（操控量）
- `inquiryScript.confoundingVariables` — 混淆变量
- `inquiryScript.outputVariables` — 输出变量（因变量，与调节变量区分）
- `physicsModel.independentVariables` — enrich 合成的 AV id 列表（非独立物理量，是调节量 id）
- `physicsModel` — enrich 自动合成的四块摘要（论文可称三要素+调节量）
- LLM prompt 包与 gameSpec 已注明 UI 可极简
