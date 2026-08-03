# 样本精致度验收表（金标准：钟表铺·校时）

> 参考实现：[`/static/packages/pendulum-clock/game.html`](../../data/runtime/packages/pendulum-clock/game.html)  
> 对照规格：[`sample-spec.md`](sample-spec.md)（轨迹与双模式）  
> 用途：组员自检 + 负责人精品上架门禁。达不到「必达」的只收底稿（`craft:draft`），不进精品（`craft:gold`）。

## 为何以钟表铺为尺

钟表铺不是「更花哨」，而是完整探究工艺：主题视觉、情境引导、目标仪表、可验证混淆变量、测量与调参分步、过关后公式回放。旧 Agent 白板模板多半只有滑条+发射，缺少读数—归因闭环。

## 必达（精品入库）

| # | 项 | 对照钟表铺 | 勾选 |
|---|----|------------|------|
| 1 | **主题视觉** | CSS 变量色板；非 system/Inter/Roboto 默认栈；禁止白底蓝条通用模板照搬 | [ ] |
| 2 | **情境引导** | 至少一层 intro（为何调参）+ win 总结（规律/公式一句） | [ ] |
| 3 | **可观测仪表** | 目标相关读数或进度带（逼近/偏出一目了然） | [ ] |
| 4 | **AV ≥ 2** | `input[type=range]` 稳定 id（如 `s-len`） | [ ] |
| 5 | **CV ≥ 1** | 可操作、科学外观的无关控件（如钟表 `s-mass`）；标签中性无剧透；过关后或复盘可揭示「与××无关」；CV 不进入 win 公式 | [ ] |
| 6 | **过关 win** | `__emit('win')` 或平台可采集；可离线 | [ ] |
| 7 | **探索/竞赛** | 游戏内 `#modeSelect` + HUD；切换调用 `__platformTraceSetPhase`；竞赛可限次（不必血槽） | [ ] |

## 加分（钟表铺级）

| # | 项 | 说明 |
|---|----|------|
| A | 测量/发射与调参分步 | 避免盲拧滑条 |
| B | 过关公式回放或「你学到了什么」卡 | 教学收束 |
| C | canvas 叙事道具 | 非纯几何示意 |
| D | 微动效 2–3 处 | 针、高光、锁定态；不噪声 |

## 分级标签

| 标签 | 含义 | catalog |
|------|------|---------|
| `craft:gold` | 必达全过；可加分 | 可 `featured` |
| `craft:pilot` | 组员/拆章试点：可玩+win+轨迹，精致度未满金 | 可上架；精华清单可扩展 |
| `craft:draft` | 玩法可用、轨迹可用，精致度未过 | 可上架试玩，不标精品 |
| （无标签旧包） | 迁移时默认视为 `craft:draft` | — |

## 试点包（仓库内）

| 包 | 目标 |
|----|------|
| `pendulum-clock` | 金标准本体（组员源） |
| `projectile-basic` | 斜抛旗舰；组员源 `斜抛游戏(1).html` |
| `pendulum-target` / `projectile-cannon` | P1 对齐工艺结构 |
| `capacitor-era-ch1` / `ch2` / `ch4` | 电容纪元拆章组员试点（`craft:pilot`） |

`组员做的样本/` 须 **全量** 入库映射（见 `tests/lib/teammate-sample-map.js`，含斜抛）。整包 `capacitor-era` 仍仅展示。其余样本默认 `craft:draft`，有公式回放者可标 `craft:pilot`，分批升级。

## 验收流程（精品）

1. 对照本表勾选必达  
2. 学生端试玩：intro → 调参 → 仪表反馈 → 过关总结；游戏内切换探究/竞赛  
3. 教师端见 win + 参数次数  
4. Agent A 分析源码生成/更新 `chapter.json`  
5. manifest `tags` 含 `craft:gold`，catalog 可 `featured: true`
