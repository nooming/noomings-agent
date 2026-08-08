# 结算 UI 收束 · 短报

日期：2026-08-08 · 未 commit

## 改动文件

| 区域 | 路径 |
|------|------|
| 斜坡 runtime↔样本 | `data/runtime/packages/ramp-rolling-collision/game.html` ↔ `样本html/斜坡滚球/game.html` |
| 斜抛 runtime↔样本 | `data/runtime/packages/projectile-basic/game.html` ↔ `样本html/斜抛/斜抛.html` |
| 学生壳 | `apps/web/ui/pages/student-play.html` |

## 结算流程

1. **命中成功**：不再叠长文 messageBox（斜坡直开 `#craft-win`；斜抛隐藏命中弹层，由 `__emit('win')` 打开结算卡）。
2. **`#craft-win` 分层**：证据（自动）→ 本局归因点选 → 点选后才显示 `.craft-reveal`（公式 + CV）并启用「再玩一次」。
3. **路径浮层**：游戏 `postMessage({ type: 'craft-settle', open })`；壳内结算打开时隐藏路径类型/建议芯片，关闭后按原意图恢复。
4. **速度行（斜坡）**：`v₁'/v₂'` 放证据区次要灰字，不进成功弹层。

## 本局归因问法

- 斜坡：「就你这几发的对照来看，高度变化主要跟着哪一项变？」
- 斜抛：「就你这几发的对照来看，射程/命中主要跟着哪一项变？」
- 选项仍贴本包 AV + `mixed` + `unsure`；非 CER。
- 轻提示：证据主 AV 已知且点选其它具体 AV 时，灰字提示「本局证据主调是…此处问的是本局对照」；不阻断再玩。

## 返回列表

- 卡内按钮区：主「再玩一次」+ 次「返回列表」。
- `navigateToStudentList()`：iframe 内 `postMessage({ type: 'platform-navigate', to: 'student-list' })` 并尝试 `parent.location.href = '/student.html'`；离线样本回 `../index.html`。
- 壳 FAB「← 返回列表」目标一致（`/student.html`）；已监听上述 postMessage。

## 如何验收

1. 竞赛过关：仅一层结算卡；公式/CV 仅归因后出现；路径浮层不叠在卡上。
2. 问法含「本局/对照」语义。
3. 选与证据主调不符的具体 AV → 灰字轻提示，仍可「再玩一次」。
4. 「返回列表」：平台壳回学生列表；离线回样本 `index.html`。
5. 斜坡/斜抛 runtime 与样本html 哈希一致。
