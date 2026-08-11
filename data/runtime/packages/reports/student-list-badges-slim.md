# 教师端学生列表徽章精简 + 去掉刷新路径摘要按钮

日期：2026-08-11 · 未 commit  
受众：教师端 `teacher.html` + `platform-shell.css`  
原则：列表行只留决策用强信号；路径/能力靠选学生自动补刷与评判连带刷新，不再暴露手动全刷按钮。

## A. 列表徽章精简

`studentAggBadgesHtml` / `renderStudentList`：

| 原先 | 现在 |
|------|------|
| 综合分 + 过程档 + 结果档 +（可选）未终局×N | **综合分 + 结果档** +（可选）短未终局 |

- **去掉过程档**（清楚 / 部分清楚等）在左侧列表行的渲染；详情头 `studentAggMetaHtml` 仍可写「过程·…」。
- `incompleteBadgeHtml`：文案 `未终局×N` → **`未×N`**；`title` 仍为完整说明；仍仅在 `incompleteTooMany` 时显示。
- CSS：`.student-list-name { min-width: 3em; }`；`.student-list-row { flex-wrap: wrap; }`，避免徽章把名字挤没。

验收期望（如李四）：名字可见；标签主要为分 + 达标/未达标/未完成；未终局偏多时最多再多一个短 `未×23`。

## B. 删除「刷新路径摘要」按钮

- 去掉 `#refreshPathSummariesLocal` 按钮 DOM（全选 / 删除选中保留）。
- 去掉 click 委托绑定；删除仅被该按钮调用的 `refreshPathSummariesForStudent`。
- **保留**：
  - `refreshStaleAbilityScoresForStudent`（选学生自动升级过期/缺失能力分 + 补路径）
  - `judgeSession` 内对本局的 `refreshTeacherPathSummary`（评判连带刷路径）

## 变更文件

- `apps/web/ui/pages/teacher.html`
- `apps/web/ui/platform-shell.css`
- `data/runtime/packages/reports/student-list-badges-slim.md`（本报告）

## 未改

- 雷达 / 能力公式
- 自动 rescore / 评判刷路径逻辑
- 未 commit
