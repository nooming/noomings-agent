# 模拟课堂 UI 跟进修（压测建议项）

日期：2026-08-11 · **未 commit**  
承接：`mock-classroom-ui-stress.md`  
原则：模拟数据保留；不改能力公式；不 clean `sess-mock-ui-*`。

## 已做

| # | 项 | 做法 |
|---|----|------|
| H1/M4 | 概览隐藏达标×0 | `renderJudgedOverview` 默认只渲染 `passCount > 0`；hint「另有 N 名暂无达标局」+「显示全部 / 隐藏暂无达标」切换 |
| H2 | 默认全部探究任务 | `fillFilterGraphOptions` 去掉 `pickRecentGraphWithData`；首次/无存储 → `""`；存储键升为 `filterGraph.v2`（甩掉旧自动锁）；仍记住上次（含全部） |
| H3 | 看板路径类型 Top-N | `formatPathTypeDistTopN`（默认 Top 6）+「其余 n 类（会话数）」；表体仍可滚 |
| M3 | 未完成综合分「—」 | 根因 `Number(null)===0`；新增 `isFiniteAbilityTotal`，徽章/终局有限分/合并冻结共用 |
| M1 | sessions-split 高度 | `#panel-sessions > .edu-panel` flex + `calc(100vh - 380px)`；窄屏列表 `max-height` 220→280 |
| M2 | 列表行布局 | 名+次数一行，徽章次行 |

## 未做（后续）

| # | 项 | 说明 |
|---|----|------|
| M5 | API `limit` + 截断提示 | 见 `teacher-sessions-wrapup.md`（默认 200 / 上限 300 + 列表 tip） |
| L1 | 详情自动 path-summary 叠加 | 仍观察 |

## 变更文件

- `apps/web/ui/pages/teacher.html`
- `apps/web/ui/platform-shell.css`
- `data/runtime/packages/reports/mock-classroom-ui-stress.md`（状态列）
- `data/runtime/packages/reports/mock-classroom-ui-followups.md`（本报告）

## 本机抽验（2026-08-11）

隐藏试玩开：`statStudents=32`；`filterGraph=""`（全部探究任务）；概览芯片 12 枚且无「达标×0」，hint「另有 20 名…显示全部」；模拟01 综合分「—」；看板路径类型含「其余 16 类」；`sessions-split` 高约 406px。

## 验收提示

- 存储键已升 `teacher.sessions.filterGraph.v2`，旧自动锁不再生效。
- 模拟数据未 clean；**未 commit**。
