# craft-win 优先于 victory / ch2 横排滑条

日期：2026-08-11  
不 commit。

## 1. ch2 电容卡 → 横排长滑条

**包：** `capacitor-era-ch2` + 样本 `样本html/电容_串并联/`

| 之前 | 之后 |
|------|------|
| `.ch2-caps` 四列竖卡，滑条 `width:100%` 被压扁 | 侧栏纵向 `.srow`：标签 \| `flex` 长滑条 \| 数字 pill |
| C1/C2/C3 大数字居中 + 短轨 | 与 ch1 同模式；`s-c1`…`s-cable` / `n-c1`… 与埋点保留 |
| L 与电容同权卡片 | L 用 `.srow-irrelevant` 弱化（旁路） |

CSS：复用 ch1 `.srow` 的 `flex:1; min-width:96px; width:auto`，覆盖 craft 全局 `range{width:100%}`。窄屏仍单列横排行，不再四列竖卡。

## 2. 过关强制归因卡（victory 抢戏）

**根因：** 章节 `showWin()` 先 `__emit('win')`（craft 打开 `#craft-win`），随后又把 `#victory` 设为 `display:flex`，且会排程 `showSummary`；路径浮层/观测卡在 settle 时也应让位。

**修复（runtime + 样本）：**

| 包 | 改动 |
|----|------|
| `capacitor-era-ch1` | `showWin` 见 craft-win 则 `__craftShowWin()` 并 **return**，不播 victory/summary；`__emit` try/finally；craft 打开时关掉 victory / formula-float；推导层不自动盖归因 |
| `capacitor-era-ch2` | 同上 |
| `capacitor-era-ch4` | 同上 |
| `capacitor-confound-ui` | 无 `#victory`；补 `__emit` try/finally + craft 打开时清 summary/victory/formula |

样本同步：`电容_介质与击穿`、`电容_串并联`、`电容_储能与充电`、`电容混淆`。

## 3. 同类扫描（`data/runtime/packages/*/game.html`）

同时含 `#craft-win` 与 `#victory` 且 win 时 `victory` 抢戏：

- **已修：** ch1 / ch2 / ch4

**已正确只走 craft-win（跳过）：**  
`capacitor-confound-ui`、`circular-motion`、`cyclotron-radius`、`efield-charge`、`friction-incline`、`gas-ideal`、`heat-conduction`、`magnetic-force`、`momentum-collision`、`multi-kp`、`pendulum-target`、`photoelectric`、`rc-circuit`、`refraction-snell`、`series-parallel`、`thin-lens-implicit`、`transformer-turns`、`pendulum-clock`、`projectile-basic`、`projectile-cannon`、`ramp-rolling-collision`

说明：部分包另有 `#winOverlay`（如电场/回旋），z-index 低于全屏 `#craft-win`，竞赛过关仍以归因卡为准，未改。

## 验收步骤

1. **ch2 布局：** 打开串并联 → C1–C3、L 为侧栏横排行，滑条可拖长；L 样式偏淡；数字 pill 与滑条双向同步。  
2. **ch1 归因：** 竞赛模式 → 调入过关带 →「读取电容」→ **必现** `#craft-win`（证据→归因→揭示）；`#victory` 不应出现；settle 打开时路径/观测浮层隐藏。  
3. **同类：** ch2「确认配置」、ch4 竞赛过关同样只见归因卡；探究仍按 explore-no-win 不结算。
