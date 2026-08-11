# 终局再开一局 → 新 PlatformTrace 会话

日期：2026-08-11 · 未 commit

## 问题

机会用尽「再开一局竞赛」/ 过关「再玩一次」只在页内重置挑战，**仍沿用** student-play 注入的同一 `sessionId`。教师端一局轨迹跨两局，后局 `terminalOutcome` 可能覆盖前局 `exhausted_fail`。

## 行为

| 触发 | 动作 |
|------|------|
| `#attemptsExhaustedRetry`（再开一局竞赛） | 请求新 session，再重置次数 / challenge |
| `#craftWinBtn`（再玩一次） | 请求新 session，再 replay |
| 探究↔竞赛（未终局） | **不**轮换，同 session |

轮换时（student-play）：

1. 对**旧** `sessionId` best-effort `auto-judge-on-leave`（`reason: new_round` / `new_round_pass`），不阻塞 UI；不置 `leaveJudgeSent`。
2. `PlatformTraceAdapter.beginNewRound`：新 `sessionId`，保留 studentLabel / catalogId / graphId / taskCode；写 `puzzle_open`；按上一 phase 再发 `phase_change`。
3. 同步 iframe 内 adapter 到同一新 id（`skipPuzzleOpen`，不重绑控件）。
4. 清空路径 chips；离开时仍可评判**当前**新局。

## 桥接

游戏（iframe）→ 壳：

- `window.parent.__platformTraceNewRound({ reason })`
- 或 `postMessage({ type: 'platform-trace-new-round', reason })`
- 游戏内统一入口：`window.__platformTraceRequestNewRound(reason)`

## 实现

| 路径 | 说明 |
|------|------|
| `apps/web/ui/trace-adapter-platform.js` | `beginNewRound` / `rotateSession`；`start` 换 id 时清 `lastPhase`；ingest 回写不覆盖已轮换 id |
| `apps/web/ui/pages/student-play.html` | `__platformTraceNewRound` + postMessage；旧局 auto-judge |
| `scripts/patch-trace-new-round-on-retry.js` | 幂等批量补丁（helper + 两按钮） |
| dual-mode / craft 模板脚本 | 已写入调用，供后续再注入 |

## 覆盖

- **packages**：24（含 ramp-rolling 自定义 craftWinBtn）
- **样本html**：24 同步

## 验收要点

1. 竞赛打空 → 机会用尽 →「再开一局」→ 新 `sess-*` 文件；旧文件保持 `exhausted_fail` 可评判。
2. 过关归因后「再玩一次」→ 新 session；旧为 `pass`。
3. 同访探究进竞赛（未用尽）→ sessionId 不变。
4. 再离开页面 → 仍触发当前局 leave auto-judge。
