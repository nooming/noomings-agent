# 旧 chapters vs packages 差异摘要（删前快照）

生成时机：`html-samples/chapters` 删除前（2026-08-08）。

| 集合 | 数量 |
|------|------|
| 旧 `html-samples/chapters` | 17 |
| `packages/manifest.json` samples | 24（含 `ramp-rolling-collision`） |
| 仅 packages 有 | 7：`pendulum-clock`、`pendulum-target`、`projectile-cannon`、`capacitor-era-ch1/2/4`、`ramp-rolling-collision` |
| 字节级相同 | **0 / 17**（重叠 id 全部漂移） |

重叠 17 条均以 packages 为准（节点数普遍更多，叙事/质量 surgical 后产物）。旧 chapters 不可再作为训练或评判真相源。

| id | old nodes | pkg nodes | old bytes | pkg bytes |
|----|----------:|----------:|----------:|----------:|
| capacitor-confound-ui | 9 | 11 | 13799 | 22430 |
| circular-motion | 8 | 12 | 12820 | 27388 |
| cyclotron-radius | 8 | 12 | 13063 | 27271 |
| efield-charge | 8 | 11 | 13354 | 21044 |
| friction-incline | 9 | 11 | 13659 | 29676 |
| gas-ideal | 7 | 11 | 10592 | 24985 |
| heat-conduction | 9 | 10 | 14526 | 24577 |
| magnetic-force | 9 | 13 | 14539 | 29370 |
| momentum-collision | 9 | 12 | 17012 | 33230 |
| multi-kp | 10 | 11 | 15232 | 25099 |
| photoelectric | 8 | 11 | 13366 | 27743 |
| projectile-basic | 10 | 14 | 17119 | 26367 |
| rc-circuit | 6 | 10 | 10958 | 20289 |
| refraction-snell | 8 | 12 | 12016 | 24748 |
| series-parallel | 8 | 10 | 12568 | 24789 |
| thin-lens-implicit | 9 | 12 | 13928 | 27296 |
| transformer-turns | 6 | 11 | 11282 | 26932 |
