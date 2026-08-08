# 证据 + 短归因扩包 · 短报

日期：2026-08-08 · 未 commit

模式对齐试点：`ramp-rolling-collision` / `projectile-basic`（证据行 → 本局归因点选 → `.craft-reveal` → 再玩一次）。  
批量脚本：`scripts/patch-evidence-attribution-expand.js`（可幂等重跑）。

## 汇总

| 类别 | 数量 |
|------|------|
| 第二波完成 | 12 |
| 第三波完成 | 9 |
| 跳过（含试点） | 3 |
| judge 是否用 attribution 判分 | 否（未改） |

## 完成

| 波次 | 包 id | 归因选项（主 AV） | 样本同步 | 静态检查 |
|------|-------|-------------------|----------|----------|
| 2 | `circular-motion` | s-radius, s-omega | `样本html/圆周运动/圆周运动.html` | OK |
| 2 | `pendulum-target` | s-length, s-angle | `样本html/单摆投靶/单摆投靶.html` | OK |
| 2 | `pendulum-clock` | s-len, s-angle | `样本html/钟表铺校时/钟表铺校时.html` | OK |
| 2 | `momentum-collision` | s-vel1, s-vel2, s-mass1, s-mass2 | `样本html/动量碰撞/动量碰撞.html` | OK |
| 2 | `refraction-snell` | s-incident-angle, s-refractive-index | `样本html/折射/折射.html` | OK |
| 2 | `heat-conduction` | s-thermal-conductivity, s-area, s-temperature-diff | `样本html/热传导/热传导.html` | OK |
| 2 | `rc-circuit` | s-resistance, s-capacitance, s-supply-v | `样本html/RC电路/RC电路.html` | OK |
| 2 | `photoelectric` | s-frequency, s-intensity, s-workfunction | `样本html/光电效应/光电效应.html` | OK |
| 2 | `cyclotron-radius` | s-magnetic, s-velocity | `样本html/回旋加速器/回旋加速器.html` | OK |
| 2 | `magnetic-force` | s-current, s-magnetic | `样本html/安培力/安培力.html` | OK |
| 2 | `friction-incline` | s-angle, s-friction | `样本html/斜面摩擦/斜面摩擦.html` | OK |
| 2 | `gas-ideal` | s-pressure, s-volume, s-temp | `样本html/理想气体/理想气体.html` | OK |
| 3 | `capacitor-era-ch1` | s-area, s-dist, s-thickness | `样本html/电容_介质与击穿/电容_介质与击穿.html` | OK |
| 3 | `capacitor-era-ch2` | s-c1, s-c2, s-c3 | `样本html/电容_串并联/电容_串并联.html` | OK |
| 3 | `capacitor-era-ch4` | c4-c, c4-v, s-cable（C/V 为选择格） | `样本html/电容_储能与充电/电容_储能与充电.html` | OK |
| 3 | `capacitor-confound-ui` | s-area, s-distance | `样本html/电容混淆/电容混淆.html` | OK |
| 3 | `series-parallel` | s-r1, s-r2 | `样本html/串并联电路/串并联电路.html` | OK |
| 3 | `transformer-turns` | s-n1, s-n2, s-U1 | `样本html/变压器/变压器.html` | OK |
| 3 | `efield-charge` | s-fieldStrength, s-charge | `样本html/电场/电场.html` | OK |
| 3 | `thin-lens-implicit` | s-object-distance, s-focal-length | `样本html/透镜/透镜.html` | OK |
| 3 | `projectile-cannon` | in-angle, in-power, in-drag, in-wind | `样本html/抛体大炮/抛体大炮.html` | OK |

每包均含：`craftAttr` + 自动证据行 + `.craft-reveal` 门闩 + 点选后 `snapshot` emit `attribution`/`evidenceSummary`；另有 `mixed`/`unsure`。

## 跳过

| 波次 | 包 id | 原因 |
|------|-------|------|
| 1 | `ramp-rolling-collision` | 已有完整归因试点 |
| 1 | `projectile-basic` | 已有完整归因试点 |
| 3 | `multi-kp` | 多知识点结构，不宜套单局短归因最小集 |

## 约定（与试点一致）

1. 过关自动「本局证据」一行（读数 + 主调控件次数）
2. 归因单选：本局对照问法（含 mixed/unsure）；非考全局最优物理量
3. 点选前隐藏 `.craft-reveal`；「再玩一次」需先点选
4. 点选后 `__emit('snapshot', { attribution, evidenceSummary, winOk: true })`
5. 不改 judge 用 attribution 判分；不改 Agent B 达标逻辑
6. 电容章若有冗长 summary/victory，打开 `#craft-win` 时尽量隐藏，以结算卡为主
