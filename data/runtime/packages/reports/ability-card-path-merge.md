# 本局能力卡并入过程依据（路径）

日期：2026-08-11 · 未 commit  
受众：仅教师端 `teacher.html`

## 问题

会话详情 `session-detail-summary` 与上方「本局能力」卡重复展示任务 / 阶段 / 探究·竞赛路径；路径本是能力分的过程依据，应随能力卡换局可见，不必滑到详情中部。

## 改动

1. **能力卡结构**：`#sessionAbilitySummary` = 四维条（`buildAbilityScoreBlock`）+「过程依据」区块（`buildAbilityProcessEvidenceBlock`）。
2. **过程依据内容**：任务名 · 时间 · 终局态；当前阶段（explore/challenge）；`buildSessionPathBlock`（探究段 / 竞赛段 / 评分范围 / 建议 / 刷新失败 hint）。
3. **详情区**：去掉整段 `session-detail-summary`（task / phase / path 裸文本）。保留时间轴、评判按钮、`#judgeResult` 评判卡、调参块。评判卡不并入能力卡。
4. **同步**：`loadSessionDetail` 在 path-summary 刷新后写入能力卡；手动「刷新路径摘要」在 sync 徽章后先用列表缓存重绘过程依据，再 `loadSessionDetail` 补齐阶段。
5. **CSS**：`platform-shell.css` 中 `.session-ability-evidence` 对齐 `judge-route-hint` 灰底轻分区。

## 验收

- 选局 → 本局能力卡含四维 + 过程依据（路径）
- 详情不再出现重复的任务 / 路径裸文本段
- 换局 / 刷新路径摘要 → 能力卡路径跟着变
- 评判卡仍在详情时间轴下方
- 学情画像不变
