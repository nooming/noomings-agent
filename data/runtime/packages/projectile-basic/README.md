# projectile-basic

- 源：样本html/斜抛/斜抛.html
- 图谱：样本html/斜抛/chapter.json
- 知识点：调节发射角、初速度与高度探究抛物线轨迹；质量为混淆控件。
- 场景：野战炮兵郊外靶场试射（非实验室示意）

## 双模式目标（FixedChallenge 旗舰样板）

| 模式 | 目标 | 失败后 |
|------|------|--------|
| explore | 自由试射，读落点距离，归纳角度/速度/高度对射程的影响（无固定靶） | — |
| challenge | 进入时锁定一处靶距，限次命中 | **不重 roll**；只扣次数/清场，靶距保持至过关或切回探究再进竞赛 |

衔接要点：`MODE_GOALS` → 进入 challenge 时 `spawnTarget()` 一次 / `refreshModeGoals()` → `modeSelect` 触发 `__platformTraceSetPhase`；`checkHit` 失败禁止再 `spawnTarget()`。
- 过关：挑战模式命中靶心
