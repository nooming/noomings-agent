# Expert 图谱评测

生成时间：2026-07-30T10:44:41.630Z

## 匹配规则

```
1. controlId 精确相等（最高优先）
2. 语义归一 label：去空白/下划线/间隔符后小写；去掉「单变量·」「试探混淆·」前缀
3. 同义词桶（速度/初速度、角度/倾角、音量/主音量等）
4. KG 节点：优先 id；其次归一 label；再同义词
5. AV/CV 角色：adjustment / confounding / operation / irrelevant 辅助配对 priority
说明：不以「仅 label 字符串全等」为唯一依据；报告中的 matchedBy 标明规则。
```

## 指标说明

- **节点 F1 / AV F1**：增强匹配（controlId / 归一 label / 同义词），非裸字符串全等
- **priority ρ / r**：配对 priorityRank 的 Spearman / Pearson（不足 2 对为 —）
- **单变量 route 召回**：专家 AV 是否在 Agent strategy.routes 中有对应支路
- **叙事干净度**：1=干净；检测机械 LoopObserve 门控、空环、边标签↔routes 不一致（structural 全绿仍可能叙事脏）

## 诚实声明（金标局限）

- **hand-authored**：目前仅 `projectile-basic`、`pendulum-clock` 为整理/手写金标；**不是**「全班真人专家重画」的学术级金标。
- **curated-from-package-chapter**：其余样本由 `seed-expert-graphs.js` 自 packages chapter 固化，属**可复现对照基线**。
- **禁止误读**：curated 子集上的高 F1 **不能**宣传为「Agent 对齐真人专家」——那是自己和固化快照比对；学术主张请只用 hand-authored 子集，并写明样本极少。
- 全量汇总仅供工程回归； intrinsic 局限见上。

## 分栏汇总

### A. hand-authored（手写/整理金标）

> 唯一适合谨慎引用为「专家对齐」的子集；n 很小，勿过度外推。

| 覆盖 | 节点 F1 均 | AV F1 均 | Spearman 均 | Pearson 均 | route 召回均 | 叙事干净度均 | 叙事脏条数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 0.667 | 0.9 | 0.5 | 1 | 1 | 1 | 0 |

### B. curated-from-package-chapter（固化金标）

> 可复现工程基线；**非**真人专家重画。高分不代表学术对齐。

| 覆盖 | 节点 F1 均 | AV F1 均 | Spearman 均 | Pearson 均 | route 召回均 | 叙事干净度均 | 叙事脏条数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 21 | 1 | 1 | 0.968 | 0.984 | 1 | 1 | 0 |

### C. 全量（含上述局限）

> 工程覆盖用；解读时必须拆开 A/B，勿只报全量均值。

| 覆盖 | 节点 F1 均 | AV F1 均 | Spearman 均 | Pearson 均 | route 召回均 | 叙事干净度均 | 叙事脏条数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 23 | 0.971 | 0.991 | 0.925 | 0.985 | 1 | 1 | 0 |

## 明细

| id | 金标来源 | 节点 F1 | AV F1 | priority ρ | priority r | route 召回 | 叙事干净度 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| capacitor-confound-ui | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| capacitor-era-ch1 | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| capacitor-era-ch2 | curated-from-package-chapter | 1 | 1 | 0.5 | 0.775 | 1 | 1 |
| capacitor-era-ch4 | curated-from-package-chapter | 1 | 1 | — | — | 1 | 1 |
| circular-motion | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| cyclotron-radius | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| efield-charge | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| friction-incline | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| gas-ideal | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| heat-conduction | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| magnetic-force | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| momentum-collision | curated-from-package-chapter | 1 | 1 | 0.9 | 0.938 | 1 | 1 |
| multi-kp | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| pendulum-clock | hand-authored | 0.667 | 1 | 0 | — | 1 | 1 |
| pendulum-target | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| photoelectric | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| projectile-basic | hand-authored | 0.667 | 0.8 | 1 | 1 | 1 | 1 |
| projectile-cannon | curated-from-package-chapter | 1 | 1 | 0.95 | 0.972 | 1 | 1 |
| rc-circuit | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| refraction-snell | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| series-parallel | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| thin-lens-implicit | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |
| transformer-turns | curated-from-package-chapter | 1 | 1 | 1 | 1 | 1 | 1 |