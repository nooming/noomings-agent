# craft-win MutationObserver 死循环

生成时间：2026-08-11  
脚本：`node scripts/patch-craft-win-observer-loop.js`（幂等）

## 根因

craft-gold `MutationObserver` 匹配 `.win-badge` 等 → `showWin()` 改 `#craft-win` DOM → 再触发 observer → 主线程死循环。  
侧栏「✓ 过关」等常驻标（如 `transformer-turns`）在测中瞬间即可见，最易引爆。  
`legacy-win-bridge` 的 `scanWinText` 每次 mutation 扫 `document.body.innerText`，加重卡顿并可能与过关文案互激。

## 防护点

1. **`showWin` 防重入**：开头若 `__craftWinOpen` 则仅轻量更新文案后 return；成功打开后 `__craftWinOpen = true`。
2. **关闭/再玩**：`__craftWinDismissed = true` 且 `__craftWinOpen = false`。
3. **observer**：`__craftWinDismissed || __craftWinOpen` 直接 return；选择器去掉 `.win-badge`（保留 `.win-banner,#winBanner,[data-win="1"]`）。
4. **UI 标**：`.win-badge` → `.pass-badge`（CSS / HTML / 动态拼接），避免被 observer 匹配。
5. **legacy `scanWinText`**：节流 200ms；只扫可疑节点；开卡/已 dismiss/已 emit 则跳过；轮询 800ms → 2000ms。

## 覆盖

| 范围 | 数量 |
|------|------|
| `data/runtime/packages/*/game.html` | **23** 包 |
| `样本html/` 对应 HTML | **23** 文件 |
| 合计改写 | **46** |

包列表：`capacitor-confound-ui`、`capacitor-era-ch1/2/4`、`circular-motion`、`cyclotron-radius`、`efield-charge`、`friction-incline`、`gas-ideal`、`heat-conduction`、`magnetic-force`、`momentum-collision`、`multi-kp`、`pendulum-clock`、`pendulum-target`、`photoelectric`、`projectile-basic`、`projectile-cannon`、`rc-circuit`、`refraction-snell`、`series-parallel`、`thin-lens-implicit`、`transformer-turns`。

说明：`gas-ideal` / `thin-lens-implicit`（及样本）此前已有 `__craftWinOpen`，本次补 observer 去 `.win-badge`、badge 改名（如有）、`scanWinText` 节流。

## 验收

1. `transformer-turns` 竞赛：参数已在带内 → 点测试 → **不卡死**，正常出归因卡。  
2. 其它包抽测过关同样不卡。  
3. 关闭归因卡后可再玩（`__craftWinOpen` 已清）。
