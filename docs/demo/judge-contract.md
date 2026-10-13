# 评判层产品契约（教师侧）

## 终局与综合分

- **终局** = 通关（pass）或竞赛次数用尽未通关（exhausted_fail）。
- **班级综合分**仅统计终局会话的有限 `abilityScore.total`（v4，按任务 1–2 局均值再任务均分）。
- **未终局**不计入综合分；可展示 `previewTotal`（虚线角标），与 `total` 分离。

## 未终局 preview

- 离开页/批量回填：事件量或有效 fire 达门槛 → 规则 **preview** 评判（非 LLM）。
- `judgeResult.judgePreview` / `mode: rule_preview`；能力分带 `preview: true`、`previewRevision`。
- **kind_only**（过程过少）：只写 `incompleteKind`，不跑 preview 评判；索引 `previewEligible: false`。

## 能力分 v4（固定权重）

- R / Er / Pe / Pc / E 缺维贡献 0，不 renorm。
- 竞赛结果 R 仅看竞赛段；探究 win 不顶替 R。
- 未终局 pending：`total = null`，影子分写入 `previewTotal`。

## 过程评语（judge）

- 规则为主；LLM 可选。存盘 `judgeSchemaVersion: 1`。
- strengths/gaps 最多 2 条；与能力分 **相关但不等同**。

## 写盘单轨

- 会话能力分应经 `packages/platform/session-ability-score`（`computeSessionAbilityScore` + `mergeAbilityScoreRecords`）。
- path-summary 教师 `dualPhase: true` 单次落盘；避免并行 explore/challenge 覆盖 ability。

## 索引

- `.traces-index.json` 中 `abilityScore` 为摘要（total / previewTotal / bands 等），全量 parts 在会话 JSON。
