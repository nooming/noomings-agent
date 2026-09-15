# 过程检测对照表（Inq-ITS 式子技能 ↔ 本平台）

面向教研与 Agent 迭代：把本仓库已有 **strengths / gaps / Pe·路径 / 需关注旗标** 对齐到「可控实验」类子技能概念。  
**场景**：大学生 + AV（调节变量）/ CV（混淆/旁路）互动课件；与中学纸笔 CVS（控制变量策略）测验不同——此处证据来自操作轨迹与双模（探究 / 竞赛），不是选择题得分。

> 编排告警 ≠ 能力鉴定。教师端「需关注」旗标文案已标明基于近阶段/代表局过程证据。

## 固定子技能 ID（建议）

| ID | 概念（Inq-ITS / CVS 近似） | 本平台证据 | 代码落点 |
|----|---------------------------|------------|----------|
| `controlled_contrast` | 可控对照 / 单参改变 | strengths：单参/控制变量/主推；路径 main；`singleVariableRate` 偏高；Pe 偏高 | `packages/judge/judge.js`（单变量政策）；`literacy-mapping` 探究/推理维 |
| `confound_bypass` | 混淆旁路 / 拧无关量 | gaps：旁路/无关/混淆；`metrics.cvHeavy`；ability `cvOver` | `judge.js` `applyCvHeavyPolicy`；`trace-path-align.js`；需关注 **旁路偏高** |
| `pass_without_contrast` | 过关但缺对照 | gaps：`PASS_WEAK_COMPARE_GAP`（过关偏少对照…）；通关 + 薄过程 | `judge.js` `applyPassWeakComparisonPolicy`；需关注 **对照不足已过关** |
| `explore_solid` | 探究扎实达成 | `explore_success` → Er tier=`solid` / raw≥90 | `ability-score.js` 探究结果维；literacy 探究维偏强 |
| `explore_lucky` | 探究幸运一发 / 未扎实 | Er=`lucky` 或 raw 中低；有探究试次但无 solid | literacy 探究维一般/待加强；需关注 **有探究无达成** |
| `timing_rush` / `timing_dense` | 偏快出手 / 连拧未测 | soft gaps：调参↔动作过短且少对照未达成；密 tuning 少 action | `judge.js` `applyTimingSoftGaps`；`trace-timing.js`；literacy 辅证句 |

## 需关注旗标 ↔ 子技能

| 教师端旗标 | flag id | 子技能 ID | 触发要点（摘要） |
|------------|---------|-----------|------------------|
| 对照不足已过关 | `pass_weak_compare` | `pass_without_contrast` | 竞赛通关/达标 + 偏少对照类 gaps（或极薄过程启发式） |
| 旁路偏高 | `cv_bypass_heavy` | `confound_bypass` | bypass gaps / `cvHeavy` / `cvOver` |
| 有探究无达成 | `explore_no_solid` | `explore_solid`（缺省）/ `explore_lucky` | 触达探究段且无扎实 Er |

实现：`packages/judge/attention-flags.js`（浏览器镜像 `/static/ui/attention-flags.js`）。教师端列表徽章 + 画像「需关注」摘要调用 `detectStudentAttentionFlags`。

## 与中学 CVS 的差异（务必写清）

| | 中学 CVS 常见测法 | 本平台（大学 AV/CV 课件） |
|--|------------------|---------------------------|
| 证据形态 | 题面选择 / 书面实验设计 | 事件轨迹：`tuning` / `action` / `phase_change` / `explore_success` / `win` |
| 「控制变量」 | 口头/选项声明保持哪些量不变 | 操作上是否单参拧 AV、是否少对照就 win、竞赛段是否 cvHeavy |
| 混淆变量 | 题目中的无关因子识别 | 可操作 CV 控件 + 旁路 gaps；不是「认出标签」即过关 |
| 达成 | 答对即分 | **探究达成**（`explore_success`）≠ **竞赛通关**（`win`）；能力分 v4 分维 |
| 用途 | 标准化/常模 | 过程诊断 + 编排告警；四维为表现倾向，非标准化测评 |

## Pe · 路径 · gaps 怎么读

- **路径 / Pe（探究过程）**：更像「有没有沿约束链做对照」，对齐 `controlled_contrast`。
- **gaps**：短句诊断；旁路与「过关偏少对照」不要混成能力总分。
- **Pc / 竞赛过程**：收敛与旁路；`cvHeavy` 时不得表扬单参主推。
- **Er / 探究结果**：solid vs lucky vs 未达成 → `explore_solid` / `explore_lucky`。
- **时间特征**：仅 soft gaps / 依据辅证，不改 ability v4 大权重、不单独定 level。

## 代码索引

| 模块 | 路径 |
|------|------|
| 规则评判 / 政策 gaps | `packages/judge/judge.js` |
| 时间衍生特征 | `packages/judge/trace-timing.js` |
| 四维学习表现解读 | `packages/judge/literacy-mapping.js`（浏览器镜像：`apps/web/ui/literacy-mapping.js`；改 packages 后须同步复制） |
| 需关注旗标 | `packages/judge/attention-flags.js` |
| 教师半页说明 | [`process-assessment-teacher-note.md`](./process-assessment-teacher-note.md) |
| 生成物抽检（Craft） | [`generation-craft-checklist.md`](./generation-craft-checklist.md) |

## 修订原则

- 不新增素养维、不删六维过程指标。
- 旗标只做编排提示；能力鉴定口径仍以 ability v4 + 规则评判为准。
- 阈值变更应同步回归：`attention-flags`、`judge-pass-weak-compare`、`judge-timing-soft`、`literacy-mapping`。
