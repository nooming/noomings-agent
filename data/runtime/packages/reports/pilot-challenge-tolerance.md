# 试点包 FixedChallenge 容差调整

生成时间：2026-08-03  
原则：仍需对准探究目标，避免「随便拧就过」；对照 playtest P1（严公差 → timebox/reachability miss）。

| 包 | 参数 | 改前 | 改后 | 说明 |
|----|------|------|------|------|
| series-parallel | challenge `iTol` | 0.004 A | **0.008 A** | 探究仍 0.012；仪表提示带同步 0.008 |
| thin-lens-implicit | challenge 像距容差 | 0.85 cm | **1.2 cm** | 探究仍 2.0；focusTol 同步 |
| circular-motion | 安全带上界倍率 | V/F ×1.28 | **×1.42** | 带宽下限略增；仍须同时落入 v 与 F 带 |
| projectile-basic | `targetWidth`（hitMargin） | 40 px ≈2.7 m | **56 px ≈3.7 m** | 仍需瞄准本局固定靶 |
| pendulum-clock | challenge `T_HALF` | 0.005 s | **0.012 s** | 探究仍 ±0.020；急单仍严于探究 |
| rc-circuit | challenge τ 容差 | 0.03 s | **0.05 s** | checkWin / 读数近带 / 绘制带同步 |

样本 html 已同步对应文件。
