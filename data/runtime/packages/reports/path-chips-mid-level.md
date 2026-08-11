# 多关中途路径芯片粘滞修复

生成时间：2026-08-11  
问题：`showPathType=1` 时，多关包（尤指抛体大炮）每关 `win` 都会拉 `/api/platform/strategy-path-summary` 并置 `pathChipWantVisible`；仅在 `craft-settle` 打开时隐藏，结算关闭或未挡住后芯片一直贴在底部。

## 规则（shell）

| 时机 | 行为 |
|------|------|
| `win` 且 `interim===true` 或 `final===false` | **不**拉 summary；`clearPathChips()` |
| `win` 无 interim / 或 `final===true`（含旧包无字段） | 拉 summary；settle 关闭后可显示芯片 |
| `platform-level-continue` / `platform-path-chips-clear` | 立即清芯片 |
| `craft-settle` close 且带 `final:false` / `interim:true` | 清芯片（防御） |
| 异步 fetch | `pathChipFetchGen` 令牌，clear/interim 后过期响应不得再显示 |

## 大炮

- 突击 1–3：`__emit('win', { interim:true, final:false })`（仍有 snapshot/telemetry）
- 突击 4（及之后）：`final:true`，可出路径/建议芯片
- 「下一关」中途：`postMessage({ type:'platform-level-continue' })`
- 进入自由要塞：同样 continue，避免战役结束芯片粘进自由玩

样本已同步：`样本html/抛体大炮/抛体大炮.html`。

## 改动文件

- `apps/web/ui/pages/student-play.html`
- `data/runtime/packages/projectile-cannon/game.html`
- `样本html/抛体大炮/抛体大炮.html`

## 手工冒烟

1. 学生端打开抛体大炮且开启「显示探究路径类型」。
2. 突击 1 命中 → 归因卡关闭后、点「下一关」进 2/3：**底部无**「建议 / 探究路径类型」。
3. 突击 4 命中并完成归因结算后：允许出现路径/建议芯片。
4. 单关包（如斜抛）最终 `win`：芯片仍可按原逻辑出现。
