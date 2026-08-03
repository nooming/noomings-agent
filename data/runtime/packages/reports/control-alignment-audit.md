# 控件 ↔ chapter AV/CV 对齐审计

生成时间：2026-08-03T09:21:02.220Z

覆盖 23/23；存在合成 AV 缺失 HTML：**0**

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
| efield-charge | 9 | 2 | 1 | — | 0 |
| cyclotron-radius | 8 | 3 | 1 | — | 0 |
| capacitor-confound-ui | 8 | 2 | 1 | — | 0 |
| series-parallel | 9 | 3 | 1 | — | 0 |
| rc-circuit | 7 | 3 | 0 | — | 0 |
| magnetic-force | 8 | 2 | 1 | — | 0 |
| transformer-turns | 8 | 4 | 1 | — | 0 |
| capacitor-era-ch1 | 9 | 2 | 2 | — | 0 |
| capacitor-era-ch2 | 10 | 4 | 1 | — | 0 |
| capacitor-era-ch4 | 6 | 1 | 1 | — | 0 |
| heat-conduction | 8 | 3 | 1 | — | 0 |
| gas-ideal | 8 | 3 | 1 | — | 0 |
| thin-lens-implicit | 8 | 3 | 1 | — | 0 |
| refraction-snell | 7 | 2 | 1 | — | 0 |
| photoelectric | 8 | 3 | 1 | — | 0 |

## 说明

- `av_missing_in_html`：chapter 声明了 HTML 中不存在的 controlId（典型：电容纪元合成 AV）。
- `--fix` 会删除缺失 AV 并重排同包 routes/priorityRank；mermaid 全文可能仍含旧标签，需后续 surgical 清理。
