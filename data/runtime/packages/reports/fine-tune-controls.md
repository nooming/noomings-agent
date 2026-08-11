# 精调控件修复短报

生成时间：2026-08-11  
原则：优先减小 AV `step` + 数值输入（滑条粗调 / 输入精调），必要时略放宽容差；CV / 装饰滑条不动。  
布局：**已去掉 ±（sval-nudge），仅滑条 + 可编辑数字**。

## 电容主包

| 包 | step | 数字输入 | 容差 | 说明 |
|----|------|----------|------|------|
| `capacitor-era-ch1` | A: 1→**0.1**；d: 0.1→**0.01** | A/d 可输入（无 ±） | `CAP_WIN_HALF[1]` 0.015→**0.018**；竞赛倍率 0.45→**0.55** | 厚度 t 仍为 CV，只读滑条 |
| `capacitor-era-ch2` | C1/C2/C3: 10→**1** | C1–C3 可输入（无 ±） | 竞赛 ±1.2%→**±1.5%**；探究仍 ±3% | 馈线 L 不精调；**布局已改为 ch1 式横排长滑条**（见 `craft-win-over-victory.md`） |
| `capacitor-confound-ui` | A: 0.01→**0.001**；d: 0.001→**0.0001** | A/d 可输入（无 ±） | 探究带不变 | 极板质量仍为 CV |
| `capacitor-era-ch4` | — | — | — | 过关依赖离散 C/V 卡片；`s-cable` 为 CV，无需精调 |

样本已同步：`样本html/电容_介质与击穿`、`电容_串并联`、`电容混淆`。

`chapter.json`：ch1 目标带文案与 suggestedRange step 已对齐；ch2 竞赛容差文案改为 ±1.5%。

## 同类包（连续量精调依赖过关）

| 包 | 改动 |
|----|------|
| `thin-lens-implicit` | u、f：step 1→**0.1** + number input（口径 D 仍粗） |
| `projectile-basic` | 初速度、高度：step 1→**0.1** + number input（质量仍为旁路） |
| `heat-conduction` | ΔT step 0.5；A step **0.001**；k/ΔT/A 均可数字输入 |
| `pendulum-clock` | 摆长 L：step 0.02→**0.005** + number input |

## 实现要点

- 保留原有 `s-*` range id；number 变更会 `dispatchEvent(input/change)`，既有 tuning / Telemetry 仍走 range。
- 数值 pill 匹配暗色 craft（圆角描边输入框）；同步时避开正在编辑的 `activeElement`。
- range 使用 `min-width:0; flex:1`，数字 pill `flex-shrink:0`，避免窄侧栏拇指叠层。
- **横排 `.srow`**：craft 全局 `input[type=range]{width:100%}` 会把滑条压成拇指宽；已改为 `.srow` 内 `flex:1 1 auto; width:auto!important; min-width:96px`，`slabel` 收至 ~108px（ch1/ch2/ch4 及对应样本）。竖排 `slider-group`（如 confound）不受影响。
- 未改物理公式与探究意图。

## 手工验证

1. 打开 `capacitor-era-ch1` → 选非空气介质（如陶瓷）→ 用滑条粗调 A/d，或点 pill 输入精调，使读数落入过关带 →「读取电容」过关。  
2. `capacitor-era-ch2`：微调 C1–C3 进入 500 µF（或竞赛急单）带后「确认配置」。  
3. `capacitor-confound-ui`：竞赛模式下用 A/d 数字输入打进目标区间。  
4. 抽测 thin-lens / projectile-basic / heat-conduction / pendulum-clock：数字输入与滑条双向同步，可稳定进带。
