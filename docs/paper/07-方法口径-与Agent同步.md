# 7. 方法口径 · 与 Agent 同步（写作主参考）

> **用途**：写 Method / 平台描述时用；**不替代** PCA 数字源（仍见 `02` §2.3 与 `session-pca-kmo-20260816.md`）。  
> **轨迹快照、复算 n 等数据更新**：本轮**暂缓**，不在正文展开。  
> Agent 路径根：`C:\Users\20844\Desktop\myweb-re\agent`

---

## 7.1 方法总览（一段话）

Agent A 产出 **探究脚本 + 事理图谱 + 物理模型规格** → 学生试玩产生 **标准事件轨迹** → Agent B / 规则评判层输出 **strengths·gaps、形成性诊断、abilityScore v4** → 教师读 **三出口**；离线 **探索性 PCA** 仅对 **会话级 4D 规则分** 做结构描述，**不**等于检测器效度研究，**不**替代诊断出口。

---

## 7.2 学习环境与双模式（产品方法）

| 要素 | 口径 |
|------|------|
| 结构 | 左舞台仿真 + 右侧工作台（AV 滑条等）；样本内 **探究 / 竞赛** 切换（`#modeSelect` + `__platformTraceSetPhase`） |
| 探究段 | 对照、里程碑；达成上报 **`explore_success`** |
| 竞赛段 | 挑战限次、达标上报 **`win`**；**禁止**用竞赛通关代替探究达成 |
| 阶段证据 | `phase_change`（`explore` \| `challenge`）；Agent B 默认以 **challenge 段** 调参/动作为主评控制变量策略（无 phase 时退化为全会话） |
| UI 边界 | 学生端 **不再** 提供外挂阶段条；双模以 **游戏内** 为准 |

参考：`docs/advisor/sample-spec.md`、`data/runtime/platform/README.md`（埋点 v4）。

---

## 7.3 探究脚本与「论文三要素 + 调节量」

**正文（论文三要素）**：公式、混淆变量、输出变量（因变量/可观测）。  
**方法补充（Parse 第四块，一句）**：**调节变量（AV）** 由 `inquiryScript.adjustmentVariables` 与 `traceMap` 显式列出，供埋点与过程评价；**不**与三要素并列成「四要素构念」。

| 论文说法 | Agent 字段 | 写作注意 |
|----------|------------|----------|
| 公式 | `knowledgePoints[].formulas` | 多公式可拆多个 KP |
| 混淆变量 CV | `confoundingVariables` | 须在 **真实实验 setup** 下亦不影响核心结论；禁止装饰型 CV |
| 输出变量 | `outputVariables` | 非按钮、为可观测因变量 |
| 调节量 AV | `adjustmentVariables` | `priorityRank` / `responseShape` 表探究路径优先级，非单纯 \|∂y/∂x\| |

**事理图谱（含 KG）**：约束 **策略路线、里程碑与 trace 对齐**（决策树 + 知识图谱 + 策略路线）；过程分在 **对齐后** 聚合。  
**慎写**：无 KG 消融/对照时，不写「验证了 KG 促进探究」。

参考：`docs/advisor/README.md`（Parse 四块表）、`docs/advisor/sample-spec.md` §4 CV、`packages/generate/design-pipeline.js`（设计轨，正文一句即可）。

---

## 7.4 轨迹契约（可复现采集）

- `tuning`：带 **唯一 id** 的 range 变更  
- `action`：发射/确认等  
- `explore_success` / `win`：分阶段结局  
- `phase_change`：双模切换  

采集经平台 trace adapter 注入；与 **chapter.json**（`inquiryScript` / `traceMap` / `strategy`）共同决定路径摘要与 Pe/Pc 等。

---

## 7.5 规则评判层（过程性评价方法）

**原则**：**规则为主**；LLM 仅润色 `summary/strengths/gaps/comment`；`verdict`、`formativeAssessment`、`teacherSummary.level` **以规则为准**（`mergeLlmJudgeWithRuleStable`）。

**可读证据（教师半页）**：

- 路径摘要 / 策略分（单参对照 vs 多参盲调）  
- AV 调节 vs CV 试探（旁路）  
- strengths / gaps（各最多 2 条）；与 ability **相关但不等同**  

**子技能操作化（大学 AV/CV 课件，非中学 CVS 选择题）**：对照/单参（`controlled_contrast`）、旁路混淆（`confound_bypass`）、过关但缺对照（`pass_without_contrast`）、探究 solid/lucky（`explore_solid` / `explore_lucky`）等——见 `process-detectors.md`。**编排「需关注」旗标 ≠ 能力鉴定定论**。

**证据不足**：`diagnostics.evidenceSufficiency` 区分「未评估」与「做得差」（缺 `phase_change`、traceMap 缺失等）。

---

## 7.6 形成性三出口（与 PCA 分工）

| 出口 | 字段 | 论文中位置 |
|------|------|------------|
| A 本局诊断（默认） | `formativeAssessment` | Method 一句 + Discussion 教师可读性 |
| B 过程结构 | `abilityScore.parts`、六维雷达 | Method v4；Results **PCA 输入来自 parts 聚合后的 4D** |
| C 综合分摘要 | `abilityScore.total`（v4） | Method 终局/班级均分规则；**非** PCA 主叙事 |

**终局**：`pass` \| `exhausted_fail` 才进班级有限 `total`；未终局可 `previewTotal`（规则 preview，非 LLM）。详见 `judge-contract.md`。

---

## 7.7 abilityScore v4（固定权重，缺维贡献 0）

- **Er（探究结果）**：none / lucky / solid；来自探究段 **`explore_success`**（兼容旧轨迹 win 门闩，新产品禁止探究段 win 冒充）  
- **R（竞赛结果）**：**仅竞赛段**；禁止 Er / explore 顶替  
- **Pe / Pc / E**：探究过程、竞赛过程、效率  
- **权重**：R 0.25 + Er 0.08 + Pe 0.24 + Pc 0.24 + E 0.19；**不 renorm**  

**学生级主六维**：Er, R, Pe, Pc, E, 完成度（incomplete 纳入完成度规则见 radar 报告）。  
**会话级 PCA 4D**：`[R, Pe, Pc, E]`（Er、完成度 **不进** 该矩阵）。

**写盘**：`computeSessionAbilityScore` + `mergeAbilityScoreRecords`；避免并行 explore/challenge 覆盖 ability（path-summary `dualPhase: true` 单次落盘）。

---

## 7.8 离线 PCA 在方法链中的位置

- **输入**：终局会话、v4 有限总分、4D raw（缺失填 0，与 v4 语义一致）  
- **默认排除**：observe-only / `researchInclude: false`（观察包不作竞赛作业口径）  
- **定位**：探索性相关 + KMO/MSA + 等权 PCA；**非 CFA**；载荷命名贴边，口头「动机/解决问题/操作」仅教学脚手架  

**主结果数字**：仍用既有冻结报告（见 `02`），本轮不改轨迹不改数。

---

## 7.9 可写 / 慎写

**方法 + 数字的一页总表** → [`02-论文能写什么一页.md`](./02-论文能写什么一页.md) §2.5（与老师对齐用）；本节只记 Method 专条：双模/explore≠win、规则三出口、AV/CV 轨迹 ≠ Inq-ITS 金标准、PCA 非 CFA。

---

## 7.10 文献钩子（方法向，与 `04` 同步）

| 写作位置 | 可引文献（见 `04` B1–B6） |
|----------|---------------------------|
| §2.7 形成性 | Gamebrics；LA×FA 系统综述（epod） |
| §2.2 CVS/AV | Concord systematicity；Virtual labs CVS 章节 |
| GLA 设计闭环 | JLA Mission HydroSci（Analytics by Design） |
| 方法谱系（非主结果） | L@S 2021 问题解决实践自动化 |

**原则**：补强文献支撑 **规则形成性 + AV/CV 轨迹** 的合法性；**不**把其效应量或模型当作本文结果。

---

## 7.11 Agent 文档索引（方法）

- `docs/advisor/process-assessment-teacher-note.md`  
- `docs/advisor/formative-assessment-layer.md`  
- `docs/advisor/process-detectors.md`  
- `docs/advisor/sample-spec.md`  
- `docs/demo/judge-contract.md`  
- `docs/advisor/README.md`（Parse / 三要素）
