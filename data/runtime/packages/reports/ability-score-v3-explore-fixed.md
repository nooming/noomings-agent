# 能力总分 v3 · 探究固定占 25

日期：2026-08-11 · 未 commit  
受众：**仅教师端**  
公式版本：`ABILITY_SCORE_VERSION = 3`

## 动机

v2 在缺 Pe（仅竞赛 / 探究 trials=0）时对非 null 维 **renorm**，结果条贡献可到 **40/30**，名义分母失真。  
v3 把探究定为满分 100 中固定一块（25 分）：有本局探究过程才计分，否则 **+0/25**，且**永不**把 Pe 的 25 摊给 R/Pc/E。

## 公式

```
weights: R=0.30, Pe=0.25, Pc=0.25, E=0.20   # 份额 → 满分贡献 30/25/25/20

contrib(i) = (raw_i == null) ? 0 : w_i * raw_i     # raw ∈ [0,100]
S_base     = Σ contrib(i)                          # 固定权重，无 renorm
S          = clamp(round(S_base + (aligned ? 5 : 0)), 0, 100)
```

- 归因 +0～5 仍叠在加权和之后，封顶 100。
- 幸运一发软封顶（E≤25、总分≤62）沿用 v2。
- 未完成（结果 pending 且无 win）→ `total = null`。

## Pe（探究块）规则

| 条件 | Pe raw | Pe contrib |
|------|--------|------------|
| 有 `phase_change` 且探究段 `effectiveTrials>0` | 策略分×100（±微调） | `0.25 * raw`（≤25） |
| 有分段但探究 trials=0 / 无探究操作 | `null` | **0** |
| **无** `phase_change` | `null`（不把整局当探究） | **0** |

- 仅本会话探究段：`phase_change` + `filterEventsByExplorePhase`；按任务/会话独立，不跨 catalog。
- Pc：无 phase 仍为 null（过程不进竞赛块）；缺 Pc 同样贡献 0，不抬其它维。

## 与 v2 差异

| 项 | v2 | v3 |
|----|----|----|
| 缺维合计 | renorm（权重归一） | 固定权重，缺则 0 |
| 缺 Pe 时 R 条 | 可 >30（如 40/30） | ≤30 |
| 无 phase | 整局进 Pe | Pe=+0/25 |
| UI | 四条平铺 | **主分**（结果/竞赛/效率）+ **探究（占25分·本任务）** + 归因 |
| version | 2 | **3** |

## UI

- `buildAbilityScoreBlock`：主分组 + 探究分组；探究行 `+12/25` 或 `未探究 · +0/25`。
- 教师页 `ABILITY_SCORE_VERSION = 3`；优先采信 API `abilityScoreVersion`。
- 旧 v2 冻结分：version 不符时列表/详情不显示错版（提示刷新路径摘要后重算）。

## 过程档

- `mapProcessBand`：无探究（Pe null）且竞赛一发仍最多「部分清楚」（试次≥2 才可「清楚」）。
- 固定权重下无探究不会靠 renorm 虚高总分，与档位更一致。

## Backfill

**不强制**全量 backfill。教师打开详情刷新 path-summary / 重判即可写出 v3；需要批量时再跑：

```
node tests/scripts/backfill-ability-score.js --force --report
```

## 验收

- [x] 仅竞赛、无探究：Pe=+0/25，结果条 ≤30，不出现 40/30
- [x] 有探究段：Pe 有 +contrib/25，总分可接近 100
- [x] UI 探究区分组可见
- [x] version=3；教师端认 v3
- [x] 回归 `ability-score` 断言固定权重

## 交付文件

- `packages/judge/ability-score.js`
- `apps/web/ui/pages/teacher.html`
- `apps/web/ui/platform-shell.css`
- `tests/regression/suites/parts/ability-score.js`
- 本报告；`ability-score-v1.md` / `ability-score-next-steps.md` 交叉引用

## 交叉引用

- 总览/历史：`ability-score-v1.md`
- 校准与 v2：`ability-score-next-steps.md`、`ability-score-calibration*.md`
