# 已评判概览：按达标局数统计

日期：2026-08-11 · 未 commit  
受众：教师端「已评判概览」+ `GET /api/platform/traces/stats`  
原则：概览以**局数**为准，不再用「每生最近一局 verdict」盖住历史达标。

## 问题

`getTraceStats` 对每个学生只保留 `updatedAt` 最新的已评判会话的 `verdict`。  
李四多局 `pass` 后若最新一局为探索中/`in_progress`，概览会显示「探索中」，达标被盖住。

## 口径（对齐终局结果档）

**达标局**：会话终局过关 —— `deriveTerminalOutcome`（`terminalOutcome === 'pass'` / `verdict === 'pass'` / ability `bands.result === '达标'` 等）。

仅统计**已评判**会话；隐藏试玩过滤仍在前端 `renderJudgedOverview` 内完成。

## API 字段变化（`getTraceStats`）

### `verdictSummary`（局数合计，非学生数）

| 字段 | 含义 |
|------|------|
| `pass` | 达标局数 |
| `exhausted_fail` | 未达标（次数用尽等）局数 |
| `incomplete` | 已评判但未终局/未完成局数 |

旧：`{ pass, in_progress, learning, other }`（且曾按「每生一条」在前端再汇总）。

### `judgedStudents[]`

| 字段 | 含义 |
|------|------|
| `studentKey` / `studentLabel` | 同前 |
| `passCount` | 该生达标局数 |
| `exhaustedFailCount` | 该生未达标局数 |
| `incompleteCount` | 该生未完成局数 |
| `judgedCount` | 该生已评判局数 |
| `updatedAt` | 该生最近已评判活动时间 |
| `sessionId` | 点击跳转：最近达标局 → 否则最近未达标终局 → 否则最近已评判会话 |

排序：`passCount` 降序，其次 `updatedAt`。

已移除每生单条 `verdict`（前端不再依赖）。

## UI 文案（`renderJudgedOverview`）

- 顶部 pills：`达标 N` /（有则）`未达标 N` / `未完成 N` —— **N 为局数合计**（过滤试玩后按芯片字段重算）。
- 学生芯片：`{姓名} 达标×k`；`k>0` 用 pass 样式，否则弱化样式仍列出。
- 点击芯片仍设 `selectedStudentKey` + `sessionId` 并 `loadStudents()`。

## 变更文件

- `packages/platform/trace-store.js` — `getTraceStats`
- `apps/web/ui/pages/teacher.html` — `renderJudgedOverview`
- `data/runtime/packages/reports/judged-overview-pass-count.md`（本报告）

## 未改

- 课堂看板表结构 / classroom API
- 学生列表结果档逻辑（仅概览口径对齐同一套 terminal 辅助）
- 未 commit

## 验收

1. 李四多局达标、最新一局探索中 → 概览芯片 `达标×多`，不被最新局盖住。  
2. pills「达标 N」= 过滤后各生 `passCount` 之和。  
3. 点芯片仍能选中该生并打开对应会话。
