# 全量学生试玩 + Agent B 虚拟评判报告（Phase V）

生成时间：2026-08-03T09:48:03.217Z
模式：rule (no LLM API key required)
包数：23
验收通过：81/82（99%）
S3 跳过（无 CV controlId）：10

## 覆盖矩阵（虚拟）

| 包 | AV | CV | S1 | S2 | S3 | S4 | 验收 |
|----|----|----|----|----|----|----|------|
| capacitor-confound-ui | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| capacitor-era-ch1 | 2 | 2 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| capacitor-era-ch2 | 4 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| capacitor-era-ch4 | 1 | 1 | ✓ pass sv=1 | ✗ pass sv=1 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 3/4 |
| circular-motion | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| cyclotron-radius | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| efield-charge | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| friction-incline | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| gas-ideal | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| heat-conduction | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| magnetic-force | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| momentum-collision | 5 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| multi-kp | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| pendulum-clock | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| pendulum-target | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| photoelectric | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| projectile-basic | 3 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| projectile-cannon | 5 | 2 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| rc-circuit | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| refraction-snell | 2 | 1 | ✓ pass sv=1 | ✓ pass sv=0.57 | ✓ in_progress sv=0.06 | ✓ in_progress sv=1 | 4/4 |
| series-parallel | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| thin-lens-implicit | 3 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |
| transformer-turns | 4 | 0 | ✓ pass sv=1 | ✓ pass sv=0.57 | skip | ✓ in_progress sv=1 | 3/3 |

## 失败明细

- **capacitor-era-ch4 / S2_multi_param_trap**: S2 expect low svRate, got 1; S2 trap-leaning fail: route=main svRate=1 (verdict=pass, sv=1, route=main)

## Agent B 验收口径

- S1 win → 应为 pass，不应长期 in_progress
- S2 → 低 singleVariableRate / trap 倾向
- S3 → 不得表扬为 primary AV 成功
- S4 → 不得 pass
- explore 噪声在 phase_change 后不得主导