# ramp-rolling-collision · 审计修复短报

包 id：`ramp-rolling-collision` · craft：`pilot`（未升 gold）  
权威：`data/runtime/packages/ramp-rolling-collision/`  
镜像：`样本html/斜坡滚球/`（已同步）

## 已修

| 级别 | 项 | 处理 |
|------|----|------|
| P0 | catalog 剧透 | `catalog.json` 描述改为中性「调节质量、初速、倾角与形状，对准目标高度（探究碰撞后爬升）」；全库学生可见文案无「轨温仅改观感」 |
| P1 | 竞赛目标 | `generateChallenge()` 按当前 m1/m2/v0/shape 预测可达带，随机目标；倾角/形状切换仍会重生成 |
| P1 | CV 后置揭示 | 过关文案 +「只拧轨温再发射」复盘（对比 `lastFireAvKey`）揭示轨温不改变爬升高度 |
| P1 | 过程仪表 | HUD 增加当前 h / Δ；移除无用 `#timerDisplay` |
| P2 | chapter | `btnReset` 改为 `skip`（不再映射 I1）；I1/CV 教师注降剧透；ProbeCV 仍为「试探·轨温」；已重导出图谱 |

## 目标高度算法要点

1. 与仿真一致：`v₂'=2m₁/(m₁+m₂)·v₀`，`h=β v₂'²/g`（球 β=0.7，圆柱 β=0.75；θ 不影响垂直高度）。  
2. 滑条网格估全局可达带；常态在 `hNow` 邻域随机（0.1 m）；`hNow` 过低则取中下段（加参有解），过高则取 ≤16 m 可读区（减参有解）。  
3. 与 `hNow` 相差过近则轻推，避免零调节躺赢；公差仍 ±0.2 m。  
4. CV（轨温）不进预测、不进 win。

## 手动验证

1. 打开权威或样本 `game.html`：catalog/侧栏无「仅改观感」预告；HUD 无 `--:--`，有「当前 h」。  
2. 多次切入「定高挑战」：目标高度会变，默认参量附近可调到 ±0.2 m。  
3. 发射一次 → 只拧轨温再发射：结果弹层出现「轨温不改变爬升高度」。  
4. 过关：`#craft-win` 含同类后置揭示。  
5. `chapter.json` 中 `btnReset` 非 I1；图谱 ProbeCV 标签仍为「试探·轨温」。  
6. `样本html/斜坡滚球/game.html` 与 runtime 一致。
