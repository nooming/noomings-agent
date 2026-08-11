# 评判后连带刷新本局路径摘要

生成时间：2026-08-11

## 问题
教师端点「规则评判 / LLM 评判 / 重新评判」成功后，只更新评语与 `loadSessionsData({ skipDetail: true })`，**不**调 `strategy-path-summary`。能力卡「过程依据」的路径类型 / 策略分可能仍是旧缓存。

## 行为（评判连带）
`judgeSession` 成功后：

1. 写回 list 行：`judged` / `verdict` / `gaps` / `judgeResult`；若响应含 `abilityScore` **直接覆盖**（不以 merge，避免冻住旧有限分）。
2. **仅当前 `sessionId`**：`refreshTeacherPathSummary(sess, null, { allowAbilityUpdate: false })`  
   - 客户端始终并行 POST `explore` + `challenge`（与手动「刷新路径摘要」同路径），**强制重算本局路径**。  
   - `allowAbilityUpdate: false`：前端不把 path 返回的 ability 写回 list。  
   - 服务端 path-summary 对已有当前版本有限总分整段跳过重算/落盘（第二道护栏）。
3. `syncSessionTimelineRowBadges` + `renderStudentList`。
4. `loadSessionsData({ skipDetail: true })` 后 `loadSessionDetail(sessionId)`：从盘读 judgeResult + 新路径，重绘评判区与能力卡过程依据。

「刷新路径摘要」全生全量按钮保留，本次未删。

## 能力分保护
| 层 | 策略 |
|----|------|
| judge 响应 | `data.abilityScore` 优先写 list（权威） |
| 连带 path 刷新 | `allowAbilityUpdate: false` |
| 服务端 path-summary | 已有限当前版总分则不重算 ability |
| 详情 list 回写 | 既有 freeze / `mergeAbilityScorePreferFinite` |

## 范围
- 改动：`apps/web/ui/pages/teacher.html`（`judgeSession`）
- 未改公式 / 游戏包；未 commit。

## 验收
- 重新规则评判 → 评语更新，且本局能力卡过程依据路径/策略分最新
- 只打当前局 path-summary，不刷全班
- 能力总分不被过期 path 缓存覆盖
