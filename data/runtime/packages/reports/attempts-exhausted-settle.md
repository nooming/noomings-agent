# 竞赛机会用尽统一结算层 · 短报

日期：2026-08-11 · 未 commit

## 行为

竞赛 `attempts` 扣到 0 且本局未过关 → 弹出轻量层（非归因卡）：

- 标题：**机会用尽**
- 短文：本局急单未完成；目标仍按本局规则（口位/标定带等）
- **返回探究** → `modeSelect=explore`，关层并恢复可操作
- **再开一局竞赛** → `applyMode/apply('challenge')` 重置次数并重锁目标
- **返回列表**（有 `__eaNavigateToStudentList` / `craftBackBtn` 时显示）

过关成功仍只走证据→归因；末发同时过关时延迟检查 + `#craft-win` 守卫，不弹用尽层。`gateActions` 禁用主按钮保留。

## 实现

| 路径 | 说明 |
|------|------|
| `scripts/patch-attempts-exhausted-settle.js` | 幂等批量补丁（shell / manual / 自定义） |
| `scripts/fixup-attempts-exhausted.js` | applyMode 关层 + win-guard 启动补齐 |
| `tests/scripts/inject-dual-mode-shell.js` | 新注入模板已含结算层 |
| `tests/scripts/patch-manual-dual-mode.js` | manual 模板已含结算层 |

扣次后 `scheduleAttemptsExhausted()`（~650ms），若已开 `#craft-win` / `__craftWinOpen` 则跳过。

## 覆盖（24）

- **shell**：multi-kp、circular-motion、momentum-collision、gas-ideal、thin-lens、friction、heat、efield、refraction、rc、photoelectric、cyclotron、magnetic、series-parallel、transformer、capacitor-confound-ui 等
- **manual**：capacitor-era-ch1/ch2/ch4、pendulum-clock/target、projectile-cannon
- **自定义**：projectile-basic（对齐原「机会用尽」文案，改走统一层）；ramp-rolling-collision（原「挑战结束/次数用尽」改走统一层）

对应 `样本html/` 已同步。`multi-kp` 仅改 dual-mode-shell，未动归因块。

## 验收

1. 竞赛故意打空次数 → 「机会用尽」层 → 返回探究可继续；再开竞赛恢复次数。
2. 过关成功 → 归因卡，不用尽卡。
3. 切探究/再开竞赛时用尽层关闭。
