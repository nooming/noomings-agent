# 再开一局：终局信号 flush 竞态修复

日期：2026-08-11 · 未 commit

## 问题

竞赛机会用尽 →「再开一局」时，旧会话偶发被标成 `incomplete` / 教师结果档「未完成」（王五两局故意用尽仍显示未完成）。

根因链路：

1. `showAttemptsExhausted` 里 `PlatformTraceAdapter.record('attempts_exhausted')` → `postEvents` fire-and-forget，不 await。
2. `student-play.html` `beginPlatformTraceNewRound` 立刻对旧 sid `auto-judge-on-leave`，再马上 `beginNewRound` 换新 id。
3. 服务端 `judge-session-core` leaveAuto 对非终局 skip → 写入 `terminalOutcome: incomplete`。
4. 教师端 `mapSessionResultBand` 若陈旧 `abilityScore.bands.result === '未完成'` 会短路，盖住后来的 `exhausted_fail`。

## 改动

### A. 客户端 flush（`trace-adapter-platform.js`）

- `postEvents` 返回 Promise；维护 in-flight `pendingPosts` 队列。
- `record` / `recordAndWait` 可 await。
- `flushPending(timeoutMs)`：等待全部 in-flight ingest（默认 2.5s 超时）。
- `markTerminalAndFlush({ outcome, reason, timeoutMs, emitEvents })`：对当前 session tip `terminalOutcome`（`exhausted_fail` 可再带 safety 事件）并 await flush。

### B. 再开顺序（`student-play.html`）

`beginPlatformTraceNewRound` 固定顺序：

1. **flush 旧局**：iframe adapter `flushPending` → 壳 `markTerminalAndFlush`（`exhausted_retry`→`exhausted_fail`，`craft_win_replay`→`pass`）→ 子 adapter tip（不重复 emit）。
2. **auto-judge 旧局**：`reason: new_round` / `new_round_pass`，body 带 `terminalOutcome`；短 await（≤2.5s）。
3. **`beginNewRound`** 换新 `sessionId`，再同步 iframe。

超时仍 rotate，尽量已带上 terminal tip。探究↔竞赛未终局仍不走此路径。

### C. 服务端加固

| 位置 | 行为 |
|------|------|
| `trace-store.ingestTrace` | 接受 `terminalOutcome` / `attemptsExhausted`；允许 tip-only（空 events）更新已有 session；单调 `mergeTerminalOutcome` |
| `judge-session-core.judgeAndSaveSession` | 评判前合并 tip；`new_round_pass` 可先标 `pass` |
| `api.js` auto-judge / judge-session | 把 body tip 传入 core |

### D. 教师端（`teacher.html`）

`mapSessionResultBand`：优先 `SessionTerminal.deriveTerminalOutcome` / `terminalOutcome === exhausted_fail|pass` → 未达标/达标；**不再**被陈旧 `abilityScore.bands.result === '未完成'` 盖住。达标/未达标能力分仍可作补充。

## 验收步骤

1. 竞赛打空 → 机会用尽（确认有 `attempts_exhausted` emit）→「再开一局」→ 旧 `sess-*.json` 含 `attempts_exhausted` 且 `terminalOutcome: exhausted_fail`；教师结果档「未达标」。
2. 新 session 正常开始（新文件、可继续记事件）。
3. 过关「再玩一次」→ 旧局仍为 `pass` / 「达标」。
4. 探究↔竞赛未终局 → sessionId 不轮换。

## 变更文件

- `apps/web/ui/trace-adapter-platform.js`
- `apps/web/ui/pages/student-play.html`
- `packages/platform/trace-store.js`
- `packages/platform/judge-session-core.js`
- `apps/server/api.js`
- `apps/web/ui/pages/teacher.html`
- `data/runtime/packages/reports/new-round-terminal-flush.md`
