# 理想气体竞赛扣次 + 过关卡住 · 短报

日期：2026-08-11 · 未 commit

## A. 侧栏滑条（电容横排）

根因：craft `input[type=range]{width:100%}` 打在 `.srow` 横排 flex 上，轨道被压扁。

已修：`capacitor-era-ch1/ch2/ch4` + 样本 `电容_介质与击穿` / `电容_串并联` / `电容_储能与充电` — `.srow` 内 range `flex:1 1 auto; width:auto!important; min-width:96px`，`slabel` ~108px。  
`capacitor-confound-ui` 为竖排 `slider-group`，无此压扁问题，未改布局。

## B. 理想气体扣次 / 结算

根因：

1. dual-mode-shell 把 `onPrimaryClick` 绑在空的 `#essence-bench .essence-ft`，而 `#btn-test` 在 `.essence-scroll` → 竞赛不扣次。
2. `.win-badge` + `__craftShowWin` + MutationObserver 可反复 `showWin`，结算感卡住。

已修包（runtime + 样本）：

| 包 | 样本 | 改动 |
|---|---|---|
| `gas-ideal` | `样本html/理想气体` | 扣次绑 `#essence-bench` + `FIRE_SEL`（含 `#btn-test`）；`__craftWinOpen` 防重入；提示先点归因 |
| `thin-lens-implicit` | `样本html/透镜` | 同上（同为空 `essence-ft`） |

扫描：仅上述 4 个 HTML 为「空 essence-ft + 按钮在 scroll」；其余包按钮已在 `.essence-ft`，原绑定可用。

## 验收

1. 电容 ch1：A/d 滑条明显变长可拖。
2. 理想气体竞赛：点「测试」剩余机会 5→4→…（含过关那次也扣）。
3. 过关弹出归因卡；先点归因再「再玩一次」可继续。
