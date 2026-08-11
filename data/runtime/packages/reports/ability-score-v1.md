# 能力总分 v1 · 短报

日期：2026-08-11 · 未 commit  
受众：**仅教师端**（student-play 不展示、学生受众 API 不返回 `abilityScore`）

## 冻结决策

| # | 项 | 决议 |
|---|-----|------|
| 1 | 权重 | R 30 / Pe 25 / Pc 25 / E 20 |
| 2 | 可见性 | 仅教师 |
| 3 | 多关 R | 通关数 / 规定关（大炮 4；自由要塞不计） |
| 4 | 过程档 | **B**：由能力分 Pe/Pc/门闩映射 |
| 5 | 归因 | 一致时加权和后 **+5**（封顶 100）；无归因不罚 |

## 公式

\[
S = 0.30\,R + 0.25\,P_e + 0.25\,P_c + 0.20\,E
\]

- 缺 Pe 或 Pc（无该阶段操作）时对非 null 项 **renorm**（权重归一）。**(v3 已取消 renorm，见 `ability-score-v3-explore-fixed.md`)**
- 归因对齐：在加权和之后扁平 **+5**，再 `min(100, ·)`；明细见 `parts.attribution`。
- 未完成（结果 pending 且无 win）→ `total = null`，列表显示 `—`，避免伪高分。

## 分项要点

- **R**：单关 pass→100；已评未过且有操作→20；无操作→0；多关 `100 * cleared/total`（优先 `levelsCleared` / interim+至多一个 final；**legacy 无旗标 win 按 win 次数计关**，修大炮 R=0/4）。
- **Pe / Pc**：`strategy-segment-score` ×100；Pc 对 cvOver/多参封顶；explore_converge 小奖、thrash 小罚。有 phase 且探究 `effectiveTrials=0` 时 **Pe→null（renorm）**，避免挑战-only 通关被 Pe=0 拖成「尚不清晰」。
- **E**：`processGate`（过程合格且非 cvOver、非单试次多参）为真时一次过≈100；门闩失败一次过≈40；随试次递增下降。
- **归因**：snapshot.`attribution` 与主导单变量 AV（或证据摘要）一致 → +5；`mixed`/`unsure`/无事件 → 0。

## 过程档映射（B）

| 档 | 条件（摘要） |
|----|----------------|
| 未评估 | total null 且无过程分 / 两端 Pe·Pc 皆空 |
| 清楚 | processGate 且 min(可用 Pe/Pc)≥75，无严重 trap/cvOver |
| 尚不清晰 | 过程分偏低或 trap/cvOver |
| 部分清楚 | 其余 |

教师页 `mapSessionProcessBand`：有匹配当前公式版本的 `abilityScore` 时优先用 `bands.process`（UI 常量须与 `ABILITY_SCORE_VERSION` 同步；现为 **3**，见 `ability-score-v3-explore-fixed.md`）。

## 交付文件

- `packages/judge/ability-score.js`
- `tests/regression/suites/parts/ability-score.js`（画像 A–G）
- 接入：`apps/server/api.js`（path-summary 懒算并落盘）、`packages/platform/trace-store.js`（列表带出）
- UI：`apps/web/ui/pages/teacher.html` + `platform-shell.css`
- **未改** `student-play.html`

## 验收画像（单测快照）

见回归输出：A 高分+归因；C 蒙对 E/Pc 低；D>C；F total null；G R=75（3/4）。

## 校准补丁（大炮 R / 人样）

- 根因：`projectile-cannon` 强制多关 R，但真实/旧轨迹 win 常只有 `{winOk:true}`（无 interim/final）→ 曾计 `0/4`。
- 人样表：`ability-score-calibration-human.md`（排除 `full-eval-*` / `playtest-S*`）。
- 复跑：`node tests/scripts/backfill-ability-score.js --force --report --human-report`

## Follow-ups

- 评判流水线结束时也可主动写入 `abilityScore`（当前靠教师打开详情懒算）。
- ~~真实课数据调权后升 `version: 2`。~~（已升 v2；教师 UI 须跟踪 scorer 版本，见下）
- 课堂看板 CSV 可加总分列（本期未做）。

## UI / 版本同步（必读）

- 公式版本以 `packages/judge/ability-score.js` 的 `ABILITY_SCORE_VERSION` 为准。
- `apps/web/ui/pages/teacher.html` 无法 import 该常量，须手改对齐；path-summary 另返回 `abilityScoreVersion`，教师页优先采用服务端值。
- 版本不一致时列表总分显示「—」、过程档跳过 `bands.process`。
