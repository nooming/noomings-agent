# 学生列表综合分（按任务均分）+ 六维学情雷达

日期：2026-08-11 · 未 commit  
受众：**仅教师端**（学生 UI 未改）

## 问题

列表徽章用 `pickLatestPathSession` → 最近一局能力总分。多任务学生若最近一局 total=0，会显示 **0**，与结果档「达标（any-pass）」矛盾。

## A. 综合分（方案 B · 仅终局）

范围：**当前筛选下的可见终局 `student.sessions`**（过关 / win，或机会用尽未过关；与列表同源）。

1. 按任务键分组：`catalogId || graphId || packageId || taskCode`（列表 API 现带出 `catalogId` / `graphId` / `taskCode`）。
2. 每任务：当前公式版本下有限 `abilityScore.total` 的**终局**会话，取**最近 1–2 局**均值；无有限分则跳过该任务。
3. **综合分** = 各任务分的算术平均，四舍五入为整数。
4. **过程档**：同一套代表局上 `mapSessionProcessBand`；全同取该档；严格多数（>半）取多数；否则「部分清楚」。无代表局 →「未评估」。
5. **结果档三态**：达标 / **未完成** / 未达标（机会用尽）。无终局会话但有可见会话 →「未完成」。
6. 徽章 title / `studentAggMetaHtml`：**「综合分（按任务均分·仅终局）」**。

辅助函数：`aggregateStudentAbilityByTask(student)`、`terminalSessionsOf`（`teacher.html` + `session-terminal.js`）。

## B. 六维雷达

面板标题：**学情画像**；默认只显示雷达 + 综合分 + 六轴图例。

| 维 | 公式 | 会话范围 |
|----|------|----------|
| 结果 | 代表局 `parts.result.raw` 均值；若皆空 → 终局 pass 率 ×100 | 终局 |
| 探究过程 | 代表局 `parts.exploreProcess.raw` 均值（跳过 null） | 终局 |
| 竞赛过程 | 代表局 `parts.challengeProcess.raw` 均值（跳过 null） | 终局 |
| 效率 | 代表局 `parts.efficiency.raw` 均值 | 终局 |
| 一致性 | 见下；样本 &lt;2 → 不评分并提示 | 终局代表局 / 任务分 |
| **完成度** | \(\mathrm{round}(100 \times N_{\mathrm{terminal}} / (N_{\mathrm{terminal}}+N_{\mathrm{incomplete}}))\)；无会话 → null | **全部可见会话** |

**一致性**（总体标准差）：

\[
C = \mathrm{round}\bigl(100 \cdot (1 - \min(1,\ \sigma / \max(\mu, 1)))\bigr)
\]

- 任务数 ≥2：对**任务分**序列算 \(\mu,\sigma\)。
- 否则：对代表局**总分**序列算；不足 2 个有限值 → `null`（提示「样本不足」）。

**完成度检测**：`SessionTerminal.deriveTerminalOutcome` / `terminalOutcome`  
- terminal = `pass`（过关/win）或 `exhausted_fail`（机会用尽）  
- incomplete = 其余  

列表轻量徽章：未终局过多（`incomplete≥5`，或 `incomplete/total≥50%` 且 `incomplete≥3`）→「未终局×N」（不替代综合分）。

UI：纯 SVG 雷达，cyan（`--edu-primary`）描边/填充；综合分在雷达上方。

## C. 结果档文案

结果三态展示：**达标 / 未完成 / 未达标**（原「待评」在结果档语义下改为「未完成」）。  
评判工作流「尚未评判」用 **未评判**，与结果档区分。

## 交付文件

- `apps/web/ui/pages/teacher.html` — 聚合、六维雷达、完成度徽章、结果档文案
- `apps/web/ui/session-terminal.js` / `packages/judge/session-terminal.js` — 终局判定
- `packages/judge/ability-score.js` — `mapResultBand` →「未完成」
- `apps/web/ui/platform-shell.css` — 雷达 / 未终局徽章样式
- `packages/platform/trace-store.js` — 列表会话带 `terminalOutcome`
- 本短报；另见 `terminal-session-filter.md`

## 未做

- 「调节明细」折叠表（time-boxed 跳过）
- 学生端 / 评判公式本体权重调整
