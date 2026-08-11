# 离开自动评判 + 教师端能力分粘性

生成时间：2026-08-11

## A. 离开页自动 rules 评判

### 行为
- 学生离开 `student-play.html` 时（`pagehide` / `beforeunload` / `visibilitychange→hidden` / FAB「返回列表」/ `platform-navigate→student-list`）触发一次 fire-and-forget 评判。
- 客户端优先 `navigator.sendBeacon`（`Blob` + `application/json`），失败则 `fetch(..., { keepalive: true })`。
- 端点：`POST /api/platform/auto-judge-on-leave`（**无需教师鉴权**），body：`{ sessionId, mode: 'rules', reason: 'leave' }`。
- 服务端强制 **rules**；若 `session.judged` 或 `session.judgeResult` 已存在则 **幂等跳过**（`skipped: true`）。
- 评判成功后照常写入 `abilityScore`（与既有 `judge-session` 一致）；学生 UI **不展示**能力分。
- 多关卡中途离开：对当前 session 轨迹评判即可，不等待最终通关。

### 相关文件
- `apps/web/ui/pages/student-play.html` — 离开触发
- `apps/server/api.js` — `auto-judge-on-leave` + `handlePlatformJudgeSession` leave 分支

## B. 教师端点击空分轨迹导致他局分数变「—」

### 根因
打开任一会话会 `refreshMissingPathSummariesForStudent`；path-summary 在教师受众下每次重算 `abilityScore`；列表回写无条件覆盖 `sess.abilityScore`；`syncSessionTimelineRowBadges` 重绘后有限总分被 pending/null 冲成「—」。

### 修复
1. **列表回写** `mergeAbilityScorePreferFinite`：永不把当前版本有限 `total` 换成 null/pending；仅补缺或升版本。
2. **服务端 path-summary**：仅在缺失、`total` 非有限、或 `Number(version) !== ABILITY_SCORE_VERSION` 时重算；去掉 `|| audience === 'teacher'` 每次重算（有限总分不再被冲掉）。
3. **补刷目标**：已有当前版本有限能力分的会话跳过（且回写仍粘性保留）。
4. **徽章**：`Number.isFinite(total)` 时不因 `pending` 显示「—」。
5. **版本比较**：统一 `Number(a.version) === Number(expected)`。
6. **CSS**：`.badge-ability { flex-shrink: 0 }`。
7. **`stats.ok`**：用 `stats.ok > 0` 判断，避免 `ok === 0` 被当成 falsy 误用（语义澄清）。

### 相关文件
- `apps/web/ui/pages/teacher.html`
- `apps/server/api.js`（path-summary）
- `apps/web/ui/platform-shell.css`
