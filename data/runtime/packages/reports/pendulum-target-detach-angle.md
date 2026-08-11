# 单摆投靶：脱钩阈值 + 落地角同步

生成时间：2026-08-11  
包：`pendulum-target`（样本：`样本html/单摆投靶/单摆投靶.html`）

## Bug A — 首落后角度 UI / 画布不同步

- **原因**：落地后 `state=READY` 但 `theta≈0`（底点脱钩）；释放时 `theta0=theta` 用近零角覆盖滑条意图角。
- **修复**：
  - 释放：`theta0 = degToRad(parseFloat(angleSlider.value)); theta = theta0; omega = 0;`
  - 落地后：保留 `attemptUsed`/命中标记，仅把摆姿同步回 `theta0`（不 `resetPhysics` 清标记）。

## Bug B — 小角 / 长摆永不脱钩

- **原因**：硬阈值 `|omega| > 1.0`；`G=980, L≈188, θ≈16°` 时理想 `|ω|_max≈0.63`，永远不触发。
- **修复**：过底穿越 + 能量感知阈值 + 摆动方向：

```text
crossedBottom = (prevθ·θ 变号) || |θ| < 0.04
ω_ideal = √(max(0, 2(G/L)(1-cos θ0)))
ω_min = max(0.15, 0.35 · ω_ideal)
dirOk = (θ0≤0 ∧ ω>0) ∨ (θ0>0 ∧ ω<0)
detach if crossedBottom ∧ |ω|>ω_min ∧ dirOk ∧ !attemptUsed
```

## 手工验证

1. L≈188、θ≈-16°：释放后应脱钩飞出，不再卡在「摆动中…」。
2. θ≈-45°：行为与原先一致，首次过底脱钩。
3. 落地后画布摆锤应回到滑条角度；再点释放仍按滑条角摆出，不从竖直近零起步。
4. READY 下调 L/θ 滑条仍可预览摆姿。
