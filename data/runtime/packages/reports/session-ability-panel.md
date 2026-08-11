# 本局能力独立卡（教师端）

日期：2026-08-11 · 未 commit  
受众：仅教师端 `teacher.html`

## 问题

会话详情内嵌「能力总分」时，多局学生需滑完时间轴/评判区才能看到本局四维分。

## 改动

1. 在 `#crossGamePanel`（学情画像）**上方**新增独立面板 `#sessionAbilityPanel` / `#sessionAbilitySummary`。
2. `renderSessionDetail`（`loadSessionDetail` 内拼装）去掉内嵌 `buildAbilityScoreBlock`；路径摘要 / 任务 / 阶段仍留在详情 `session-detail-summary`。
3. 新函数 `loadSessionAbilitySummary`：有学生+会话时写任务名 / 时间 / 终局态 + 复用 `buildAbilityScoreBlock`；有学生无会话空态；无学生隐藏。
4. 刷新时机与 `loadCrossGameSummary` 对齐：详情加载成功、换学生无会话、列表清空、会话不存在等。
5. CSS：`platform-shell.css` 中 `session-ability-panel` 与 `cross-game-panel` 标题/hint 对齐。

## 验收

- 选学生 → 能力卡在画像上方，显示当前局四维
- 点时间轴换局 → 能力卡更新，无需滑完详情
- 详情区不再重复整块能力总分
- 未选学生 → 能力卡隐藏；画像行为不变
