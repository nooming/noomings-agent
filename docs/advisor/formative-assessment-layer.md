# 评判层 · 形成性出口（三出口分流）

面向教师与教研：同一轨迹 **三种读法**，共用 `judgeResult` / `abilityScore`，不新增 v4 加权维。

| 出口 | 字段 | 用途 |
|------|------|------|
| **A 本局诊断（默认）** | `formativeAssessment`：主错因、子技能三态、对照/双模/归因/CV 诊断、固定建议 | 找错因、干预、编排 |
| **B 过程结构** | `abilityScore.parts`、过程档、六维雷达 | 轨迹结构读数 |
| **C 综合分摘要** | `abilityScore.total`（v4） | 终局排序摘要；与 A 并列，不替代诊断 |

实现：`packages/judge/formative-bundle.js`。

## 版本戳

`judgeResult.schemaVersions` 汇总各模块版本；再评判后以最新版覆盖。

## LLM 评判

LLM 仅润色 `summary/strengths/gaps/comment`；`verdict`、`teacherSummary.level`、`formativeAssessment` 以 **规则评判** 为准（`mergeLlmJudgeWithRuleStable`）。

## 证据不足

`diagnostics.evidenceSufficiency`：`ok` / `partial` / `insufficient`。缺 `phase_change`、traceMap 缺失等 → 部分结论标 **未评估**，与「做得差」区分。

## 教师端

- 会话详情：**本局诊断** 区块在 **本局能力** 之上。
- 时间轴行：`主·{短标签}` 徽章（需重新规则评判后才有）。

## 相关

- [过程检测对照表](./process-detectors.md)
- [过程性评价 · 教师半页说明](./process-assessment-teacher-note.md)
