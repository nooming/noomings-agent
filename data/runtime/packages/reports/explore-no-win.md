# 探究模式误触发过关 — 修复简报

日期：2026-08-11

## 根因

双模式壳（`explore` / `challenge`）落地后，部分包在**自由探究**命中观察目标时仍走竞赛过关链路：

1. 直接 `emit('win')` / `__emit('win')` → craft-gold 包装打开 `#craft-win` 结算卡与归因
2. 显示醒目「过关！」类模态（如 `#winOverlay`）
3. 画布/文案含「过关！」→ legacy `WIN_TEXT` MutationObserver 二次 `emit('win')`
4. 旧「探究完成」里程碑（`exploreWon`）同样 `emit('win')` + `__craftShowWin`

教学约定：**竞赛才过关**；探究可发观察反馈与 `snapshot(winOk:false)`，不进结算。

## 已修包（runtime + 已同步样本）

| 包 | 样本 | 改动要点 |
|---|---|---|
| `efield-charge` | `样本html/电场/电场.html` | 探究进靶只写 observe；去掉 overlay / emit win |
| `pendulum-target` | `单摆投靶` | 探究命中仅 snapshot；画布文案去「过关」 |
| `pendulum-clock` | `钟表铺校时` | 探究入带不计时过关 |
| `friction-incline` | `斜面摩擦` | 探究里程碑改为轻提示 |
| `momentum-collision` | `动量碰撞` | 同上 |
| `circular-motion` | `圆周运动` | 同上 |
| `multi-kp` | `机械能` | 同上 |
| `projectile-cannon` | `抛体大炮` | 去掉 explore emit win / 过关模态 |
| `capacitor-era-ch1` | `电容_介质与击穿` | 探究入带不 `capTryShowWin` |
| `capacitor-era-ch2` | `电容_串并联` | 探究入带不 `showWin` |
| `capacitor-era-ch4` | `电容_储能与充电` | 探究可看门开动画，不结算 |

## 已正确跳过（扫描确认 explore 已分流）

- `projectile-basic`（斜抛）— 仅 challenge 判靶
- `ramp-rolling-collision`（斜坡）— explore 只出探究结果卡
- `thin-lens-implicit`、`photoelectric`、`heat-conduction`、`gas-ideal`
- `cyclotron-radius`、`refraction-snell`、`magnetic-force`
- `series-parallel`、`transformer-turns`、`rc-circuit`
- `capacitor-confound-ui`

## 未改

- 路径类型浮层（`showPathType` / path chip）：学生端控制，非本次范围
- 未 commit

## 验收建议

1. 电场自由探究：进目标区 → 侧栏「光点进入目标区域」，无白色「过关！」模态、无 craft-win
2. 切竞赛后再命中 → 过关模态 + win 结算
3. 抽查单摆投靶 / 电容 ch1：探究达标仅观察文案
