# 教师端自动升级能力分（v3）

生成时间：2026-08-11  
范围：`apps/web/ui/pages/teacher.html`（未改游戏包 / 未改公式）  
未 commit

## 问题

重进教师页后，旧 v2 / 无当前版本有限分的会话在列表徽章上显示「—」，必须逐一点开详情才会经 `path-summary`（`allowAbilityUpdate: true`）落盘 v3。  
后台 `refreshMissingPathSummariesForStudent` 故意 `allowAbilityUpdate: false`，且跳过已有路径摘要的会话，因此「有路径、旧能力分」的局永远不会自动升级。

## 改动要点

1. **`sessionNeedsAbilityRescore(session)`**  
   等价于「非当前版本有限总分」：`abilityScore` 缺失 / `version !== expectedAbilityScoreVersion()` / `total` 非有限。  
   `sessionAbilityScoreFrozen` 仍仅保护**当前版本有限**分；旧版不 frozen。

2. **`refreshStaleAbilityScoresForStudent`**（原缺路径补刷扩展）  
   目标 = 缺路径 **或** 需 rescore；已当前版本有限 → 跳过。  
   排序：终局优先，再 `updatedAt` 新→旧；`slice(recentN)`。  
   需 rescore → `refreshTeacherPathSummary(..., { allowAbilityUpdate: true })` + `applyPathRefreshResultToListSession(..., { allowAbilityUpdate: true })`。  
   仅缺路径且已冻结 → 只刷路径。  
   过程中成功升级则 `syncSessionTimelineRowBadges` + `renderStudentList`（徽章/综合分陆续更新）。

3. **触发时机**  
   `loadSessionDetail` 成功后后台触发（选学生 / 打开学情会话区都会进详情）。  
   仅当前选中学生；不扫全班。

4. **「刷新路径摘要」按钮**  
   全量刷路径；对需 rescore 的会话一并 `allowAbilityUpdate: true`；已 v3 有限分仍冻结不改写。

5. **服务端**  
   `api.js` path-summary 已在版本不符 / 无有限 total 时重算并落盘；客户端打到该 API 后写回列表内存。无需改服务端。

## 限流参数

| 参数 | 值 |
|------|-----|
| `PATH_REFRESH_CONCURRENCY` | **3** |
| `PATH_REFRESH_RECENT_N` | **16**（原 8，略增大；终局优先） |

## 验收对照

- 选有多局旧分的学生 → 数秒内时间轴徽章陆续变为 v3，无需逐点  
- 已是 v3 有限分的局不被改写  
- 左侧综合分随补刷更新  
- 「刷新路径摘要」也会升级过期能力分  

## 相关文件

- `apps/web/ui/pages/teacher.html`
- 报告：`data/runtime/packages/reports/auto-rescore-ability-v3.md`
