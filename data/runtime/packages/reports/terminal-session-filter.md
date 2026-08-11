# 终局会话过滤 · 短报

生成时间：2026-08-11 · 未 commit

## 产品口径（冻结）

| 结果档 | 含义 |
|--------|------|
| 达标 | challenge win / pass / win 事件 |
| 待评 | 未终局（仅探究、仍有次数离开、进行中等） |
| 未达标 | **仅**竞赛机会用尽且未过关 |

综合分 / 五维雷达 / 学生列表结果档：**只计终局会话** = 过关 **或** 机会用尽未过关。

## A. `attempts_exhausted` 事件契约

首次弹出「机会用尽」settle（challenge、attempts≤0、未过关）时上报：

```js
__emit('attempts_exhausted', { attempts: 0, mode: 'challenge' })
__emit('snapshot', {
  winOk: false,
  attemptsExhausted: true,
  hintKey: 'attempts_exhausted',
})
```

无 `__emit` 时回退 `PlatformTraceAdapter.record(...)`。`firstShow` 防重复；关层后再弹可再发。

实现：`scripts/patch-attempts-exhausted-emit.js`（已跑 24 包 + 样本）；settle / inject / manual 模板已同步。

## B. `terminalOutcome` 落盘

字段：`session.terminalOutcome` ∈ `pass` | `exhausted_fail` | `incomplete`

| 时机 | 行为 |
|------|------|
| ingest | 由 events 推导，单调升级（incomplete→exhausted_fail→pass） |
| judge / leave | `judge-session-core` 写入；leave 对 incomplete **跳过评判** |
| 列表 API | `listTraceStudents` 带 `terminalOutcome`（无落盘时现场 derive） |

Helper：`packages/judge/session-terminal.js`（Node）+ `apps/web/ui/session-terminal.js`（教师页）。

## C. 汇总 / 雷达

`aggregateStudentAbilityByTask` / `computeStudentRadarDims` / 学生结果档：只吃终局会话。文案注明「仅终局会话（过关或机会用尽）」。

## D. `mapResultBand`

- pass/win/多关全清 → 达标  
- attempts exhausted 且未过关 → 未达标  
- 其余（含 judged `in_progress` / `learning`）→ **待评**（不再把通用 fail 当未达标）

机会用尽终局会给结果分（R≈0/20）并参与总分；非终局 `total` 仍为 null（待评）。

## E. 时间线折叠

非终局默认收进「N 条未终局会话（不计入汇总）」；终局行正常列出。展开状态按学生本地记忆。展开后行徽章仍可为待评。

## F. Leave 自动评判

**选择：incomplete 跳过 auto-judge**（`reason: incomplete_non_terminal`），仅写 `terminalOutcome: incomplete`。终局（过关或机会用尽）仍走 rules 评判。已评判 incomplete 亦不进雷达。

## 回填计数（现有 traces）

`node scripts/retag-terminal-outcome.js --recompute-ability`

| outcome | count |
|---------|------:|
| pass | 111 |
| exhausted_fail | 6 |
| incomplete | 96 |
| **total** | **213** |

（历史轨迹若无 `attempts_exhausted` 事件，机会用尽无法回溯，会落在 incomplete。）

## 关键文件

- `scripts/patch-attempts-exhausted-emit.js` / `patch-attempts-exhausted-settle.js`
- `tests/scripts/inject-dual-mode-shell.js` / `patch-manual-dual-mode.js`
- `packages/judge/session-terminal.js` · `ability-score.js`
- `packages/platform/trace-store.js` · `judge-session-core.js`
- `apps/server/api.js` · `apps/web/ui/session-terminal.js` · `pages/teacher.html` · `platform-shell.css`
- `scripts/retag-terminal-outcome.js`
- `data/runtime/packages/*/game.html` + 对应 `样本html/`
