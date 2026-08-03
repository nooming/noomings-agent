# AV responseShape / priorityRank rollout

generated: 2026-08-03T09:21:46.373Z

## capacitor-confound-ui

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 极板间距 | s-distance | nonlinear-monotone | monotone | 1 |
| 2 | 极板面积 | s-area | linear-approx | monotone | 0.85 |

## capacitor-era-ch1

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 极板间距 | s-dist | nonlinear-monotone | monotone | 1 |
| 2 | 极板面积 | s-area | linear-approx | monotone | 0.85 |

## capacitor-era-ch2

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 电容C1 | s-c1 | nonlinear-monotone | monotone | 1 |
| 2 | 电容C2 | s-c2 | nonlinear-monotone | monotone | 0.85 |
| 3 | 电容C3 | s-c3 | nonlinear-monotone | monotone | 0.7 |
| 4 | 馈线长度 | s-cable | unknown | unknown | 0.55 |

residuals: s-cable

## capacitor-era-ch4

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 馈线长度 | s-cable | unknown | unknown | 1 |

residuals: s-cable

## circular-motion

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 角速度 | s-omega | nonlinear-monotone | monotone | 1 |
| 2 | 半径 | s-radius | linear-approx | monotone | 0.85 |
| 3 | 倾角 | s-base-tilt | linear-approx | monotone | 0.7 |

## cyclotron-radius

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 速度 | s-velocity | linear-approx | monotone | 1 |
| 2 | 磁场 | s-magnetic | nonlinear-monotone | monotone | 0.85 |
| 3 | 腔室气压 | s-chamber-p | linear-approx | monotone | 0.7 |

## efield-charge

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 场强 | s-fieldStrength | linear-approx | monotone | 1 |
| 2 | 电荷量 | s-charge | linear-approx | monotone | 0.85 |

## friction-incline

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 斜面倾角 | s-angle | nonlinear-monotone | monotone | 1 |
| 2 | 摩擦系数 | s-friction | linear-approx | monotone | 0.85 |

## gas-ideal

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 压强 | s-pressure | linear-approx | monotone | 1 |
| 2 | 体积 | s-volume | linear-approx | monotone | 0.85 |
| 3 | 温度 | s-temp | unknown | unknown | 0.7 |

residuals: s-temp

## heat-conduction

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 导热系数 | s-thermal-conductivity | linear-approx | monotone | 1 |
| 2 | 截面积 | s-area | linear-approx | monotone | 0.85 |
| 3 | 温差 | s-temperature-diff | linear-approx | monotone | 0.7 |

## magnetic-force

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 电流 | s-current | linear-approx | monotone | 1 |
| 2 | 磁场 | s-magnetic | linear-approx | monotone | 0.85 |

## momentum-collision

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 速度1 | s-vel1 | linear-approx | monotone | 1 |
| 2 | 速度2 | s-vel2 | linear-approx | monotone | 0.85 |
| 3 | 质量 | s-mass1 | linear-approx | monotone | 0.7 |
| 4 | 质量 | s-mass2 | linear-approx | monotone | 0.7 |
| 5 | 导轨温度 | s-rail-temp | linear-approx | monotone | 0.47000000000000003 |

## multi-kp

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 初速度 | s-speed | linear-approx | monotone | 1 |
| 2 | 起始高度 | s-height | linear-approx | monotone | 0.85 |

## pendulum-clock

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 摆长 | s-len | nonlinear-monotone | monotone | 1 |
| 2 | 摆角 | s-angle | nonlinear-monotone | monotone | 0.85 |

## pendulum-target

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 摆长 | s-length | nonlinear-monotone | monotone | 1 |
| 2 | 摆角 | s-angle | nonlinear-monotone | monotone | 0.85 |

## photoelectric

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 频率 | s-frequency | linear-approx | monotone | 1 |
| 2 | 逸出功 | s-workfunction | linear-approx | monotone | 0.85 |
| 3 | 光强 | s-intensity | linear-approx | monotone | 0.2 |

## projectile-basic

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 初速度 | s-speed | linear-approx | monotone | 1 |
| 2 | 发射高度 | s-height | linear-approx | monotone | 0.85 |
| 3 | 发射角度 | s-angle | non-monotone | non-monotone | 0.7 |

## projectile-cannon

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 初速度 | in-power | linear-approx | monotone | 1 |
| 2 | 重力加速度 | in-grav | linear-approx | monotone | 0.85 |
| 3 | 风速 | in-wind | linear-approx | monotone | 0.7 |
| 4 | 发射角度 | in-angle | non-monotone | non-monotone | 0.55 |
| 5 | 空气阻力 | in-drag | nonlinear-monotone | monotone | 0.47000000000000003 |

## rc-circuit

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 电阻 | s-resistance | linear-approx | monotone | 1 |
| 2 | 电容 | s-capacitance | linear-approx | monotone | 0.85 |
| 3 | 电源电压 | s-supply-v | linear-approx | monotone | 0.7 |

## refraction-snell

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 入射角 | s-incident-angle | nonlinear-monotone | monotone | 1 |
| 2 | 折射率 | s-refractive-index | nonlinear-monotone | monotone | 0.85 |

## series-parallel

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 电阻R1 | s-r1 | nonlinear-monotone | monotone | 1 |
| 2 | 电阻R2 | s-r2 | nonlinear-monotone | monotone | 0.85 |
| 3 | 电表内阻 | s-meter-r | linear-approx | monotone | 0.7 |

## thin-lens-implicit

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 物距 | s-object-distance | nonlinear-monotone | monotone | 1 |
| 2 | 焦距 | s-focal-length | nonlinear-monotone | monotone | 0.85 |
| 3 | 光圈 | s-aperture | linear-approx | monotone | 0.7 |

## transformer-turns

| rank | label | controlId | responseShape | monotonicity | score |
| --- | --- | --- | --- | --- | --- |
| 1 | 副边匝数 | s-n2 | linear-approx | monotone | 1 |
| 2 | 原边匝数 | s-n1 | nonlinear-monotone | monotone | 0.85 |
| 3 | 原边电压 | s-U1 | linear-approx | monotone | 0.7 |
| 4 | 绕组温度 | s-winding-temp | unknown | unknown | 0.55 |

residuals: s-winding-temp
