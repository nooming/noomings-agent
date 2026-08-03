# Strategy switchKind 全量分布

生成时间：2026-08-03T10:05:08.732Z

## 摘要

- 包数：23（多 AV 22 / 单 AV 1 / 零 AV 0）
- 合成轨迹数：90
- 异常数：0

### 总体 switchKind 直方图

| switchKind | count |
|------------|------:|
| stable | 24 |
| focused_redirect | 22 |
| explore_converge | 22 |
| thrash | 22 |

### 按合成模式

| pattern | switchKind 分布 |
|---------|-----------------|
| S_stable | stable:23 |
| S_redirect | focused_redirect:22 |
| S_converge | explore_converge:22 |
| S_thrash | thrash:22 |
| S_converge_cv | stable:1 |

## 分包

| 包 | AV | 模式→kind | redirect>thrash |
|----|----|-----------|-----------------|
| capacitor-confound-ui | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| capacitor-era-ch1 | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| capacitor-era-ch2 | 4 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| capacitor-era-ch4 | 1 | S_stable→stable; S_converge_cv→stable | — |
| circular-motion | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| cyclotron-radius | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| efield-charge | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| friction-incline | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| gas-ideal | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| heat-conduction | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| magnetic-force | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| momentum-collision | 5 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| multi-kp | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| pendulum-clock | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| pendulum-target | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| photoelectric | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| projectile-basic | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| projectile-cannon | 5 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| rc-circuit | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| refraction-snell | 2 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| series-parallel | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| thin-lens-implicit | 3 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
| transformer-turns | 4 | S_stable→stable; S_redirect→focused_redirect; S_converge→explore_converge; S_thrash→thrash | ✓ |
