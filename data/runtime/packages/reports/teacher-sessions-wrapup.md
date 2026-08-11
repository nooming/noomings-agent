# 教师学情收尾（纵览建议）

日期：2026-08-11

承接：`mock-classroom-ui-stress.md` / `mock-classroom-ui-followups.md` 及能力 v3 / 终局聚合系列报告。

## 本次收尾

| # | 项 | 结果 |
|---|----|------|
| 1 | 清理模拟同学数据 | `node tests/scripts/seed-mock-classroom-students.js --clean` → 删除 107 个 `sess-mock-ui-*`；`data/runtime/platform/traces/` 下已无该前缀。李四/王五等真实轨迹保留。seed 脚本仍留在仓库。traces 目录 gitignore，不进 commit。 |
| 2 | 过期文案 | `teacher.html`：「刷新路径摘要后计算」→「打开详情后自动计算」（路径·未评估 title + 能力空态 hint）。 |
| 3 | students limit + 截断提示 | `listTraceStudents` 默认 limit **200**；API 接受 `limit`（夹紧 1–300），响应带 `limit` / `truncated`；教师端传 `limit=200`，触达上限时显示「列表可能已截断，请搜索/筛选…」。 |
| 4 | git commit | 见下方 hash；未 push。 |

## Commit

- hash：*(提交后回填)*
- 说明：教师学情按局终局、能力 v3、UI 简化与课堂压测跟进；本收尾含文案/limit 与模拟数据清理。

## 后续（未做）

- **真实班看一周 v3**：用真实课堂轨迹校准能力分与终局聚合展示；本次不空跑、不改公式权重。
- 分页/虚拟列表：limit=200 仍可能不够时再做；当前靠搜索/筛选 + 截断 tip。
- 详情自动 path-summary 叠加（L1）：继续观察。

## 变更要点

- `packages/platform/trace-store.js` — 默认 limit 200
- `apps/server/api.js` — students API limit / truncated
- `apps/web/ui/pages/teacher.html` — 文案、limit 传参、截断 tip
- `apps/web/ui/platform-shell.css` — tip 样式
- `tests/scripts/seed-mock-classroom-students.js` — 保留（仅 --clean 数据）
