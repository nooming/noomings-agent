# 教师端信息简化

日期：2026-08-11 · 未 commit  
受众：教师端 `teacher.html`（+ 轻量 `judge.js` / `platform-shell.css`）  
原则：一块屏一件主事；终局详、未终局短；同一事实只出现一次；弱信号折叠。  
约束：不改能力公式 v3；不改游戏包；与能力卡 / 时间轴折叠 / 自动 rescore 共存。

## 改了什么

### 1. 未终局短详情（优先）

- `buildJudgeAreaHtml` / `buildIncompleteJudgeArea`：当 `!isTerminalSessionRow(session)` 时，详情评判区默认**不**展示完整 `buildJudgeBlock`。
- 首屏一行：`未完成 · 阶段 · N事件 · 不计入综合分`；有评判结果时提供「展开评语」再出完整卡。
- 评判按钮保留（可强制规则/LLM）；`renderJudgeResult` 同样走短详情逻辑。
- 能力卡顶部增加未终局横幅「未终局 · 不计入综合分」；过程依据阶段行更短（`compact`）。

### 2. 评判卡去重（终局也瘦）

`buildJudgeBlock`（`teacher.html`）：

- 亮点与 summary 文本相同/高度重复 → 不渲染该亮点。
- 默认弱句（「有基本操作…」）不占满亮点 + 摘要两处。
- 建议与待改进重复时只留 gaps。
- 能力卡已展示路径时：探究路径降为标题行短徽标；「本关推荐控制变量…」收入 `<details>`。

可选小改 `packages/judge/judge.js`：无实质亮点时不再塞默认 strength「有基本操作与状态记录。」；摘要仍有「有基本操作记录」兜底。

### 3. 过程依据 / 原始分折叠

- `buildSessionPathBlock`：探究段/竞赛段默认各一行类型+策略分；「评分范围」、路径长建议放入 `<details summary="评分范围与建议">`。
- `buildAbilityScoreBlock`：「原始分：结果…」收入 `<details summary="原始分与门闩">`。

### 4. 列表

- 未大改时间轴结构（总分 + 过程 + 结果徽章保持）。

## UI 差异摘要

| | 未终局（incomplete） | 终局（pass / exhausted_fail） |
|--|---------------------|------------------------------|
| 详情评判区 | 一行级摘要；完整评判卡折叠在「展开评语」 | 完整但去重后的评判卡；路径短徽标；控制变量提示折叠 |
| 能力卡 | 顶部未终局横幅；四维保留；过程依据更短 | 终局态在 meta；四维 + 过程依据可见 |
| 过程依据 | 类型+策略分行；范围/建议折叠 | 同左（可展开看全） |
| 原始分 | 默认折叠 | 默认折叠 |
| 综合分 | 不计入（文案明示） | 计入画像聚合（逻辑未改） |

## 验收点

1. 点未终局：详情首屏短，无冗长亮点 / win 建议轰炸；可「展开评语」。
2. 点终局：评判更干净，无双重「有基本操作」；控制变量提示不与过程依据双份刷屏。
3. 能力卡过程依据 / 原始分可展开看全。
4. 学情画像与 v3 能力公式不变；自动 rescore / 时间轴折叠行为不变。

## 变更文件

- `apps/web/ui/pages/teacher.html`
- `apps/web/ui/platform-shell.css`
- `packages/judge/judge.js`（小改：少塞默认 strengths）
- `data/runtime/packages/reports/teacher-info-simplify.md`（本报告）
