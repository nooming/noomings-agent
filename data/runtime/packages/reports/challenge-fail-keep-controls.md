# 竞赛失败保留滑条短报

生成时间：2026-08-11  
原则：FixedChallenge 发射/测试失败只复位场景与读数，不把 `s-*` 写回默认；口位/安全带等本局锁定不变。

## 已修

| 包 | 问题 | 改动 |
|----|------|------|
| `momentum-collision` | 竞赛未投进后写回 m/v 默认 | 失败分支只 `resetSim(true)`，保留滑条 |
| `circular-motion` | 竞赛未达标动画结束后写回 r/ω 默认 | 回调只 `measured=false`，保留滑条 |

样本已同步：`样本html/动量碰撞`、`样本html/圆周运动`。

## 扫描结论（无同类失败清参）

`friction-incline`、`pendulum-target`、`pendulum-clock`、`projectile-basic`、`projectile-cannon`、`ramp-rolling-collision` 等：失败分支只提示/清场，不写回滑条默认。  
进入竞赛时的开局故意偏低默认（`lockChallenge*`）保留，属预期张力，非失败清参。

## 验收

1. 竞赛调参 → 发射未进区 → 滑条仍为刚才所调；接货口/安全带不变。  
2. 探究模式行为不变。
