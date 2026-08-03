# 策略换向感知（switchKind）验证笔记

日期：2026-08-03  
样本包：`series-parallel`、`projectile-basic`  
路径：合成轨迹 → `scoreTraceStrategy` → `evaluateTraceRules`（规则 Agent B）

## 三类换向（实现）

| switchKind | 含义 | 计分 |
|---|---|---|
| `focused_redirect` | ≥2 连发同单变量后换到另一单变量 | `nBlockSwitch * λ_switch * 0.3` |
| `explore_converge` | 早期陷阱/较重 CV → 后期稳定单变量 | `nSwitch * λ_switch * 0.45` + 后期清晰小奖励 |
| `thrash` | 频繁短块横跳 | `nSwitch * λ_switch * 1.15` |
| `stable` | 单一策略块 | 无切换惩罚 |

说明：AV↔AV 切换本身不是陷阱；陷阱仍是**同一试次内多 AV**。

## 合成轨迹结果（explore）

| 包 | 模式 | switchKind | score | nSwitch | nBlockSwitch | primary |
|---|---|---|---|---|---|---|
| series-parallel | S_stable | stable | 1.000 | 0 | 0 | 单变量·电阻R1 |
| series-parallel | S_redirect | focused_redirect | 0.977 | 1 | 1 | 单变量·电阻R1 |
| series-parallel | S_converge | explore_converge | 0.802 | 1 | 1 | 单变量·电阻R1 |
| series-parallel | S_thrash | thrash | 0.841 | 5 | 5 | 单变量·电阻R1 |
| projectile-basic | S_stable | stable | 1.000 | 0 | 0 | 单变量·初速度 |
| projectile-basic | S_redirect | focused_redirect | 0.977 | 1 | 1 | 单变量·初速度 |
| projectile-basic | S_converge | explore_converge | 0.802 | 1 | 1 | 单变量·初速度 |
| projectile-basic | S_thrash | thrash | 0.841 | 5 | 5 | 单变量·初速度 |

关键断言（两包均成立）：

- `S_redirect.score > S_thrash.score`（同长度 6 发）
- `S_stable.score >= S_redirect.score`
- `metrics.switchKind` / `nSwitch` / `nBlockSwitch` / `strategySequence` 已进入 `inquiryPath`
- redirect/thrash/stable 的 `primaryStrategy` **不是**「多参盲调」

## 回归

- `strategy-segment-score`：ok（含 3A→2B → focused_redirect）
- `strategy-switch-awareness`：ok
- `strategy-path-summary`：ok（三类中文提示，无「最优」剧透）
- `judge-cv-heavy` / `judge-single-variable`：ok（未破坏 P0）

## 残留

- 未做浏览器实机游玩（合成轨迹已覆盖 switchKind 与规则评判接线）
- `explore_converge` 分数可低于 thrash：因早期陷阱段拉低 base，属加权切段预期，不与「redirect > thrash」冲突
- 竞赛模式常数更严（`thrashSwitchFactor=1.2` 等），本笔记表为 explore
