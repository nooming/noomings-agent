# 会话详情时间轴：限高滚动 + 终局折叠 + 调参默认收起

日期：2026-08-11 · 未 commit  
受众：教师端会话详情（`teacher.html`）

## 问题

多终局学生详情里时间轴全部平铺，把评判卡顶出首屏；调参表也常占一截。未终局已默认折叠，终局仍全量展示。

## 取值

| 项 | 值 |
|----|-----|
| 最近终局可见条数 **N** | **6**（`TERMINAL_TIMELINE_VISIBLE_N`，落在 5～8） |
| `.session-timeline` max-height | **24rem**（约 8～12 行）+ `overflow-y: auto` |

## 改动

1. **时间轴限高区内滚**：`platform-shell.css` 给 `.session-timeline` 设 `max-height: 24rem; overflow-y: auto; overscroll-behavior: contain`。
2. **终局「最近 N + 更早折叠」**：`buildSessionTimelineHtml` 对终局按时间新→旧排序，`slice(0, N)` 平铺，其余进「更早的终局 · N」fold；交互/样式复用 `.session-timeline-fold*`；状态 `olderTerminalTimelineExpanded`（per-student）。未终局折叠不变。
3. **选中局在折叠内**：若 `activeSessionId` 落在更早终局或未终局 fold，渲染前自动 `set(true)` 展开；渲染后 `scrollSessionTimelineActiveIntoView` 把 active 行滚进时间轴可视区。
4. **调参默认收起**：详情拼装改为 `<details class="session-detail-section session-detail-tuning">`，summary「调参明细」，默认不带 `open`。

## 变更文件

- `apps/web/ui/pages/teacher.html`
- `apps/web/ui/platform-shell.css`
- `data/runtime/packages/reports/session-timeline-scroll-fold.md`（本报告）

未改能力公式 / 自动 rescore。

## 验收

- 多终局学生：详情首屏附近能看到评判区；时间轴自行滚动
- 未终局仍默认折叠；终局默认最近 6 条 +「更早的终局」
- 调参默认收起
- 点折叠内的局或从别处选中仍可定位（自动展开 + 区内滚动）
