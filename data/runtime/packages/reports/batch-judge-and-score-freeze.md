# 批量 rules 评判 + 教师端能力分冻结

生成时间：2026-08-11

## A. 批量评判 pending traces

### 脚本
- `tests/scripts/batch-judge-pending-traces.js`
- 选项：`--dry-run` / `--limit N` / `--force` / `--concurrency N`（默认 3）
- 共享核心：`packages/platform/judge-session-core.js` → `judgeAndSaveSession`
  - 与 `POST /api/platform/judge-session` / `auto-judge-on-leave` 同一落盘路径
  - 成功后写入 `judgeResult` + `abilityScore`（镜像 API）

### 执行结果（全量，非 dry-run）

| 指标 | 值 |
|------|-----|
| traces 总数 | 211 |
| pendingBefore | 124 |
| pendingAfter | 0 |
| judged（本次成功） | 124 |
| skipped | 0 |
| failed | 0 |
| failures | [] |

事后盘点：211 会话全部 `judged`，且全部带有限 `abilityScore.total`。

### API 重构
- `apps/server/api.js`：`handlePlatformJudgeSession` 改为调用 `judgeAndSaveSession`
- leave：`force=false`（已评判幂等跳过）
- 教师手动评判：`force=true`（可重评）

## B. 能力分冻结（粘性加固）

### 根因补强
1. **列表丢分**：`readFilteredTraceRows` 未带 `abilityScore`，`loadStudents` 重载后内存有限分被冲成「—」。
2. **背景补刷仍可能回写**：`refreshMissing` / `refreshTeacherPathSummary` 对 list stub 合并 API 返回的 abilityScore。

### 冻结规则
1. **Freeze**：`sessionAbilityScoreFrozen` = 当前版本 + 有限 `total`；此类会话：
   - `refreshMissingPathSummariesForStudent` **完全跳过**（不调 path-summary）
   - `applyPathRefreshResultToListSession` / `mergeAbilityScorePreferFinite` **不替换整个 abilityScore 对象**
2. **merge**：仅当 incoming 有限且 `Number(version)` 更新时才允许替换；否则保留 existing。
3. **loadSessionDetail listSess**：冻结局不接受 null/pending；必要时用 list 冻结分回灌详情。
4. **refreshTeacherPathSummary**：默认仅 `sessionId === selectedSessionId` 允许 ability 回写；背景补刷 `allowAbilityUpdate: false`。
5. **服务端 path-summary**：已有当前版本有限总分时整段跳过重算/落盘；二次护栏防并发覆盖。
6. **徽章**：`Number.isFinite(total)` 始终胜出；版本用 `Number(...)` 比较。
7. **列表 API**：`abilityScore` 进入 `readFilteredTraceRows` → 学生列表不再丢分。

### 相关文件
- `packages/platform/judge-session-core.js`（新）
- `tests/scripts/batch-judge-pending-traces.js`（新）
- `apps/server/api.js`
- `packages/platform/trace-store.js`
- `apps/web/ui/pages/teacher.html`

### 回归
- `require('./tests/regression/suites/parts/ability-score').run()` → **ok**（version 2）

未 commit。
