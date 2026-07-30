# 控件 ↔ chapter AV/CV 对齐审计

生成时间：2026-07-30T10:27:34.051Z

覆盖 23/23；存在合成 AV 缺失 HTML：**2**

| id | HTML 控件数 | AV | CV | AV∉HTML | 错误数 |
| --- | ---: | ---: | ---: | --- | ---: |
| projectile-basic | 10 | 3 | 1 | — | 0 |
| projectile-cannon | 16 | 5 | 2 | — | 0 |
| friction-incline | 8 | 2 | 1 | — | 0 |
| multi-kp | 8 | 2 | 1 | — | 0 |
| circular-motion | 7 | 3 | 1 | — | 0 |
| momentum-collision | 10 | 5 | 1 | — | 0 |
| pendulum-clock | 6 | 2 | 1 | — | 0 |
| pendulum-target | 10 | 2 | 1 | — | 0 |
| efield-charge | 9 | 3 | 0 | — | 0 |
| cyclotron-radius | 8 | 3 | 1 | — | 0 |
| capacitor-confound-ui | 8 | 2 | 1 | — | 0 |
| series-parallel | 9 | 3 | 1 | — | 0 |
| rc-circuit | 7 | 3 | 0 | — | 0 |
| magnetic-force | 8 | 3 | 1 | — | 0 |
| transformer-turns | 8 | 4 | 1 | — | 0 |
| capacitor-era-ch1 | 9 | 3 | 2 | mat-grid | 1 |
| capacitor-era-ch2 | 10 | 4 | 1 | — | 0 |
| capacitor-era-ch4 | 6 | 4 | 1 | s-c, s-volt, s-time | 3 |
| heat-conduction | 8 | 3 | 1 | — | 0 |
| gas-ideal | 8 | 3 | 1 | — | 0 |
| thin-lens-implicit | 8 | 3 | 1 | — | 0 |
| refraction-snell | 7 | 3 | 1 | — | 0 |
| photoelectric | 8 | 3 | 1 | — | 0 |

## 自动修复

- **capacitor-era-ch1**：AV 3→2，移除 mat-grid
- **capacitor-era-ch4**：AV 4→1，移除 s-c, s-volt, s-time

## 说明

- `av_missing_in_html`：chapter 声明了 HTML 中不存在的 controlId（典型：电容纪元合成 AV）。
- `--fix` 会删除缺失 AV 并重排同包 routes/priorityRank；mermaid 全文可能仍含旧标签，需后续 surgical 清理。
