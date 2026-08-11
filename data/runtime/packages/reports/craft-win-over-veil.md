# craft-win 优先于 veil-win（钟表铺）

日期：2026-08-11  
不 commit。

## 根因

`pendulum-clock` 竞赛过关走 `tryShowWin()`：先 `__emit('win')`（craft-gold 打开 `#craft-win`），随后又填充 `sum-rows` / `sum-formula` / `sum-rules` 并 `$('veil-win').classList.add('show')`，弹出「校准完成 / 钟声·归位」叙事总结，在归因点选前泄露公式与物理规则。

## 修复

**包：** `data/runtime/packages/pendulum-clock/game.html`  
**样本：** `样本html/钟表铺校时/钟表铺校时.html`

| 之前 | 之后 |
|------|------|
| 过关展示 `#veil-win` 全屏总结 | 只开 `#craft-win`（`__emit('win')` → `__craftShowWin`） |
| 公式/规则写进 veil 总结卡 | 写入 `.craft-reveal`（`#craftWinRows` / `#craftWinFormula` / `#craftWinRules`），归因点选后才揭示 |
| craft-gold `showWin` 不屏蔽 veil | `showWin` 顺带关掉 `#veil-win`（去 `.show` + `display:none`） |

探究模式：仍仅 `explore_in_band` 反馈，不进结算、不弹 craft-win / veil-win。  
`#veil-win` DOM 与 `#btn-done` 保留（无害）；过关路径不再 `.show`。

## 同类扫描

在 `data/runtime/packages/*/game.html` 与相关 `样本html/**` 检索 `veil-win` / `校准完成` / 与 craft-win 竞态的叙事总结：

| 结果 | 说明 |
|------|------|
| **本批修复** | `pendulum-clock`（+ 钟表铺样本）——唯一 `#veil-win` 抢戏包 |
| **此前已修** | `capacitor-era-ch1/ch2/ch4`：`#victory` / summary 已让位于 craft-win（见 `craft-win-over-victory.md`） |
| **未改（非同类）** | `efield-charge` / `cyclotron-radius` 的 `#winOverlay`：短庆祝条，z-index 低于全屏 craft-win，不含归因前公式总结 |

## 验收

1. 竞赛 → 调入目标带 → 计时过关 → **只见** `#craft-win`（证据→归因→揭示）；不见「校准完成 / 钟声·归位」。  
2. 点选归因后 `.craft-reveal` 出现本局 L/θ/m/T、公式与规则。  
3. 探究落入对照带：无过关覆盖层。  
4. settle 打开时 craft-gold 仍 postMessage `craft-settle`，并压制 veil-win。
