# 策略高亮稀疏 + 混淆变量可视 分析报告

生成时间：2026-07-30T14:24:21.823Z

## 1. 总览

- 抽样包数（样本地图）：**23**
- 路由总数：**111**；稀疏（≤3 或仅 Start/Select/Win 骨架 / 无边且 <6 节点）：**0**（0.0%）
- 「单变量·」路由：**67**；其中稀疏：**0**（0.0%）
- 运行时 expand 后仍缺 Fire/Observe/入口：**0**（多为边标签与 route 不匹配或缺边）
- 有 CV 数据的包：**21/23**；策略图/路由已体现 CV：**21/23**

## 2. 根因分类

1. **route 数据残缺（主因）**：`makeRoute` / 单变量 plan 默认 `highlightNodes: [Start, StrategySelect]`、`highlightEdges: []`；次优「优先2/3」常落盘为 Start/Select/Win。
2. **repair 未全量跑**：`repairStrategyRouteHighlights` + seed spine 已能补全；先前只修了约 5 个包（斜面/斜抛/机械能/电容介质/圆周），其余 chapter 仍骨架。
3. **pathRespectsHlOrig 历史坑**：expand  pairwise 要求路径节点已在原 highlight；已由 `seedSingleVarRouteSpine`（按 StrategySelect\|label\| 播种）缓解。viewer 点击会 expand，但若种子匹配失败仍只亮骨架。
4. **标签改写后匹配**：优先注解会改边标签为「·优先n·score」；normalize 会 strip。仍有 **语义串名**（route「逸出功」→ 边目标 PathIntensity 等）——高亮跟边走，路径可亮但教学节点名错。
5. **导出未带上 repair 后 chapter**：部分样本夹曾缺或旧 图谱.html；需 repair 后 `writePriorityGraphFiles` 全量重导。
6. **CV 可视缺失**：`confoundingVariables` / KG `irrelevant` 在 JSON 中常见，但 **strategy.mermaid 无「试探混淆」支路**，routes 无 `confoundProbe`，图例只列 AV/陷阱。

## 3. 样本×路由问题表（重点包）

| 包 | 稀疏单变量 | expand失败 | CV数 | 图有CV支路 | 样本图谱 | 根因摘要 |
|----|------------|------------|------|------------|----------|----------|
| projectile-basic（斜抛） | 0/3 | 0 | 1 | 是 | 有 | OK |
| projectile-cannon（抛体大炮） | 0/5 | 0 | 2 | 是 | 有 | OK |
| friction-incline（斜面摩擦） | 0/2 | 0 | 1 | 是 | 有 | OK |
| multi-kp（机械能） | 0/2 | 0 | 1 | 是 | 有 | OK |
| circular-motion（圆周运动） | 0/3 | 0 | 1 | 是 | 有 | OK |
| momentum-collision（动量） | 0/5 | 0 | 1 | 是 | 有 | OK |
| pendulum-clock（单摆秒摆） | 0/2 | 0 | 1 | 是 | 有 | OK |
| pendulum-target（单摆投靶） | 0/2 | 0 | 1 | 是 | 有 | OK |
| efield-charge（电场） | 0/3 | 0 | 0 | 否 | 有 | OK |
| cyclotron-radius（回旋加速器） | 0/3 | 0 | 1 | 是 | 有 | OK |
| capacitor-confound-ui（电容） | 0/2 | 0 | 1 | 是 | 有 | OK |
| series-parallel（电路） | 0/3 | 0 | 1 | 是 | 有 | OK |

### 稀疏路由明细（单变量）

| 包 | route.id | label | pr | 落盘节点 | expand后 | select边 |
|----|-----------|-------|----|----------|----------|----------|

## 4. 混淆变量现状

- **数据层**：多数包 `inquiryScript.confoundingVariables` 非空；KG 常有 `group=irrelevant` 的 I*。
- **策略图**：StrategySelect 出边几乎只有「单变量·* / 多参盲调」；**无「试探混淆·{label}」虚线/低分支**。
- **图例**：仅调节优先级 + AV/陷阱按钮；CV 预览不可见。
- **会议要求**：须识别混淆量；图谱可见无关/混淆支路（迷思环或侧枝）；**不得**抬成高优单变量主路径（无 priorityRank 竞争，低分 confoundProbe）。

## 5. 管线改造建议（阶段2）

1. 全量 `repairStrategyRouteHighlights` + export 所有 yangben 样本。
2. 新增 CV 可视 repair：注入 StrategySelect `-.->|试探混淆·L| ProbeCV` → Invalid → 回主策略；routes 增加 `kind:confoundProbe` 低分。
3. analyze prompt / route-plan / sanitize：生成时带 CV 支路；priority annotate 对 confound 用虚线且不参与优先1–n。
4. 抽验：斜面摩擦、斜抛、电容、机械能 + ≥2 个曾稀疏包；优先2/3 整路亮；混淆支路可见。
