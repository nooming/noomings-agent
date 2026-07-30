# 专家金标（expert-graphs）

| 文件 | provenance | 说明 |
| --- | --- | --- |
| `projectile-basic.chapter.json` | hand-authored | 手写/整理：节点与 AV 可与 Agent 章有意不同 |
| `pendulum-clock.chapter.json` | hand-authored | 同上 |
| 其余 `*.chapter.json` | curated-from-package-chapter | `npm run seed-expert-graphs` 自 packages 固化 |

## 如何手写金标（最小流程）

1. 复制对应 `data/runtime/packages/{id}/chapter.json` 为起点，或从现有 hand-authored 改。
2. 只保留评测需要的：`kg.nodes`、`inquiryScript.adjustmentVariables/confoundingVariables`、`strategy.routes`（label + priorityRank + score）。
3. 设置 `_expertMeta.provenance = "hand-authored"`，并写清作者/日期/依据（教材或教研笔记）。
4. **禁止**把 curated 快照改标签后仍声称 hand-authored。
5. 跑 `npm run batch-expert-graph-eval`，只引用报告中 **hand-authored 分栏**。

学术主张：当前手写仅 2 条，样本过少，不可外推为「全量真人专家对齐」。
