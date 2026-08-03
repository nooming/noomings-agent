# Agent B 虚拟轨迹评判报告

生成时间：2026-08-03T09:48:14.362Z

## 公式

`S = Σ α_i s(route_i) + β_main 1[主策略清晰] - λ_switch N_switch - λ_cv f(N_cv) + β_probe`

禁止最后一发定局：primaryStrategy 取有效试次主导单变量，而非 lastSegmentLabel

## 调优前后

| 轮次 | 通过 | 总数 | 通过率 |
|------|------|------|--------|
| Round1 基线 | 25 | 25 | 100% |
| Round2 调优 | 25 | 25 | 100% |
| 竞赛模式探针 | 25 | 25 | 100% |

### Round2 常数变更

- switchPenalty: 0.03 → 0.025
- cvProbeBonus: 0.02 → 0.025
- mainClarityThreshold: 0.55 → 0.5

## 样本 × 轨迹（Round2）

| 样本 | 轨迹 | strategyScore | primary | last | verdict | pass |
|------|------|---------------|---------|------|---------|------|
| projectile-basic | pure_high_av | 1 | 单变量·初速度 | 单变量·初速度 | in_progress | ✓ |
| projectile-basic | switch_a_to_b | 0.975 | 单变量·初速度 | 单变量·发射高度 | in_progress | ✓ |
| projectile-basic | single_plus_cv_probe | 1 | 单变量·初速度 | 单变量·初速度 | in_progress | ✓ |
| projectile-basic | multi_param_blind | 0.2 | 多参盲调 | 多参盲调 | in_progress | ✓ |
| projectile-basic | over_cv | 0.88 | 单变量·初速度 | 单变量·初速度 | in_progress | ✓ |
| friction-incline | pure_high_av | 1 | 单变量·斜面倾角 | 单变量·斜面倾角 | in_progress | ✓ |
| friction-incline | switch_a_to_b | 0.975 | 单变量·斜面倾角 | 单变量·摩擦系数 | in_progress | ✓ |
| friction-incline | single_plus_cv_probe | 1 | 单变量·斜面倾角 | 单变量·斜面倾角 | in_progress | ✓ |
| friction-incline | multi_param_blind | 0.2 | 多参盲调 | 多参盲调 | in_progress | ✓ |
| friction-incline | over_cv | 0.88 | 单变量·斜面倾角 | 单变量·斜面倾角 | in_progress | ✓ |
| multi-kp | pure_high_av | 1 | 单变量·初速度 | 单变量·初速度 | in_progress | ✓ |
| multi-kp | switch_a_to_b | 0.975 | 单变量·初速度 | 单变量·起始高度 | in_progress | ✓ |
| multi-kp | single_plus_cv_probe | 1 | 单变量·初速度 | 单变量·初速度 | in_progress | ✓ |
| multi-kp | multi_param_blind | 0.2 | 多参盲调 | 多参盲调 | in_progress | ✓ |
| multi-kp | over_cv | 0.88 | 单变量·初速度 | 单变量·初速度 | in_progress | ✓ |
| capacitor-era-ch1 | pure_high_av | 1 | 单变量·极板间距 | 单变量·极板间距 | in_progress | ✓ |
| capacitor-era-ch1 | switch_a_to_b | 0.975 | 单变量·极板间距 | 单变量·极板面积 | in_progress | ✓ |
| capacitor-era-ch1 | single_plus_cv_probe | 1 | 单变量·极板间距 | 单变量·极板间距 | in_progress | ✓ |
| capacitor-era-ch1 | multi_param_blind | 0.2 | 多参盲调 | 多参盲调 | in_progress | ✓ |
| capacitor-era-ch1 | over_cv | 0.88 | 单变量·极板间距 | 单变量·极板间距 | in_progress | ✓ |
| circular-motion | pure_high_av | 1 | 单变量·角速度 | 单变量·角速度 | in_progress | ✓ |
| circular-motion | switch_a_to_b | 0.975 | 单变量·角速度 | 单变量·半径 | in_progress | ✓ |
| circular-motion | single_plus_cv_probe | 1 | 单变量·角速度 | 单变量·角速度 | in_progress | ✓ |
| circular-motion | multi_param_blind | 0.2 | 多参盲调 | 多参盲调 | in_progress | ✓ |
| circular-motion | over_cv | 1 | 单变量·角速度 | 单变量·角速度 | in_progress | ✓ |

## Round1 vs Round2（strategyScore）

| 样本 | 轨迹 | R1 | R2 | Δ |
|------|------|----|----|---|
| projectile-basic | pure_high_av | 1 | 1 | +0 |
| projectile-basic | switch_a_to_b | 0.97 | 0.975 | +0.005 |
| projectile-basic | single_plus_cv_probe | 1 | 1 | +0 |
| projectile-basic | multi_param_blind | 0.2 | 0.2 | +0 |
| projectile-basic | over_cv | 0.88 | 0.88 | +0 |
| friction-incline | pure_high_av | 1 | 1 | +0 |
| friction-incline | switch_a_to_b | 0.97 | 0.975 | +0.005 |
| friction-incline | single_plus_cv_probe | 1 | 1 | +0 |
| friction-incline | multi_param_blind | 0.2 | 0.2 | +0 |
| friction-incline | over_cv | 0.88 | 0.88 | +0 |
| multi-kp | pure_high_av | 1 | 1 | +0 |
| multi-kp | switch_a_to_b | 0.97 | 0.975 | +0.005 |
| multi-kp | single_plus_cv_probe | 1 | 1 | +0 |
| multi-kp | multi_param_blind | 0.2 | 0.2 | +0 |
| multi-kp | over_cv | 0.88 | 0.88 | +0 |
| capacitor-era-ch1 | pure_high_av | 1 | 1 | +0 |
| capacitor-era-ch1 | switch_a_to_b | 0.97 | 0.975 | +0.005 |
| capacitor-era-ch1 | single_plus_cv_probe | 1 | 1 | +0 |
| capacitor-era-ch1 | multi_param_blind | 0.2 | 0.2 | +0 |
| capacitor-era-ch1 | over_cv | 0.88 | 0.88 | +0 |
| circular-motion | pure_high_av | 1 | 1 | +0 |
| circular-motion | switch_a_to_b | 0.97 | 0.975 | +0.005 |
| circular-motion | single_plus_cv_probe | 1 | 1 | +0 |
| circular-motion | multi_param_blind | 0.2 | 0.2 | +0 |
| circular-motion | over_cv | 1 | 1 | +0 |