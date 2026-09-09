# 力学 + 热学课堂 · 关卡审计报告

> 审计日期：2026-09-09  
> 范围：白名单 10 关（`scripts/set-mechanics-thermo-classroom.js` / `docs/demo/classroom-demo-checklist.md`）  
> 方法：文件完整性、publish gate、`chapter.json` inquiryScript、HTML 埋点/双模粗检；并对 **chapter 公式串台 / AV·CV 错位** 做了小修（未改玩法数值、未 commit）。

---

## 1. 总览表

| catalog id | graphId | 领域 | craft | 文件 | explore_success | win | phase_change* | publish 门禁 | 风险 |
|---|---|---|---|---|---|---|---|---|---|
| demo-projectile-basic | projectile-basic | 力学 | gold | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟢 |
| demo-projectile-cannon | projectile-cannon | 力学 | gold | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟡 |
| demo-friction-incline | friction-incline | 力学 | pilot | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟡 |
| demo-pendulum-clock | pendulum-clock | 力学 | gold | ✅ | ✅ | ✅ | ✅ 包内自报 | 无警告 | 🟢 |
| demo-pendulum-target | pendulum-target | 力学 | gold | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟢 |
| demo-momentum-collision | momentum-collision | 力学 | pilot | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟡 |
| demo-circular-motion | circular-motion | 力学 | pilot | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟡 |
| demo-ramp-rolling-collision | ramp-rolling-collision | 力学 | pilot | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟡 |
| demo-gas-ideal | gas-ideal | 热学 | pilot | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟡 |
| demo-heat-conduction | heat-conduction | 热学 | pilot | ✅ | ✅ | ✅ | 平台注入 | 无警告 | 🟡 |

\* **phase_change**：学生端 iframe（`student-play.html` / `trace-adapter-platform.js`）注入 `__platformTraceSetPhase` 时会上报；**仅 `pendulum-clock` 包内另有原生 `phase_change` log**。直开 `game.html` 无适配器时多数关无分段事件。  
\* 无一关为 observe-only；均非草稿 craft。  
\* meta.quality：金关约 98–100，均 `ok=true`（strategy mapsTo 顺序等警告可忽略）。

**红灯关（打不开 / 缺 explore_success / publish 硬拦）**：无。

---

## 2. 分关要点

### 2.1 projectile-basic（斜抛 · gold）🟢

1. `game.html` + `chapter.json` 齐全；双模齐全；`explore_success` + `win` 均有。  
2. AV：初速 / 高度 / 角度；CV：质量 — 与 HTML、`traceMap` 一致。  
3. OV：射程 / 最大高度 — 合理。  
4. **已修**：`inquiryScript`/`physicsModel` 误塞电容公式 `C=ε₀εᵣA/d` → 斜抛运动学。  
5. 演示友好：控件少、归因清晰，适合开场。  
6. 建议：narrative「识别调节变量」文案仍偏模板重复（P2）。

### 2.2 projectile-cannon（抛体大炮 · gold）🟡

1. 文件与埋点完整；AV 多（角/力/g/阻/风），CV：质量、弹种。  
2. 教学叙事写「质量影响惯性」，但 `traceMap` 把 `in-mass` 标 irrelevant — **玩法与教研口径不一致**（有阻力时质量本应有效）。  
3. **已修**：去掉公式里的源码泄漏 `parseFloat(...)`。  
4. 控件多，课堂演示耗时长，适合作为「进阶抛体」而非首关。  
5. catalog `categoryId` **已修**为 `macro-mechanics`（原 `macro-other`）。  
6. 大改提案：要么让质量进阻力物理并升为 AV，要么改教文案为「本关质量旁路」。

### 2.3 friction-incline（斜面摩擦 · pilot）🟡

1. 双模 + `explore_success`/`win` 正常；AV：倾角、μ；CV：质量 — 物理正确（μ vs tanθ）。  
2. **已修**：domain/`OV` 从「抛体射程」改为下滑/接货区；公式改为 `μ < tanθ`。  
3. narrative 仍把「重置按钮」反复写成混淆项（P2 文案）。  
4. 适合演示「控制变量 + 临界条件」。  
5. craft 仍为 pilot，课堂可用但不宜当「金牌样板」宣传。

### 2.4 pendulum-clock（单摆秒摆 · gold）🟢

1. 唯一包内自报 `phase_change`；探究/竞赛目标带设计清晰。  
2. AV：摆长、摆角；CV：质量 — 与秒摆教学一致。  
3. **已修**：OV/domain 从「射程」改为周期 T / 摆幅。  
4. catalog 分类 **已修** → `macro-mechanics`。  
5. 演示强项：测量→反馈→精校，节奏适合讲台。

### 2.5 pendulum-target（单摆投靶 · gold）🟢

1. 文件与埋点完整；AV：摆长/摆角；CV：质量。  
2. **已修**：电容公式串台 → 单摆周期/落点描述。  
3. catalog 分类 **已修** → `macro-mechanics`。  
4. 与 clock 知识点部分重叠，演示二选一即可（投靶更「游戏感」）。  
5. HTML 有兼容占位注释，不影响演示。

### 2.6 momentum-collision（动量碰撞 · pilot）🟡

1. 可玩；`explore_success`/`win` 有。  
2. **已修**：电容公式 → 动量守恒；`s-rail-temp` 从 AV 挪到 CV（HTML 写明仅改观感）。  
3. strategy 仍可能高亮「单变量·导轨温度」旁路（P1：策略图与 CV 对齐）。  
4. 力学线里与 ramp 有「碰撞」主题重叠。  
5. 建议演示：可选；非必开。

### 2.7 circular-motion（圆周运动 · pilot）🟡

1. 可玩；安全带式 v/F 目标。  
2. **已修**：公式从 JS 残片改为 `v=ωr`、`F=mω²r`；底座倾角 AV→CV。  
3. HTML 仍把倾角放在主滑条区，学生易误判（UI 降权属 P1）。  
4. 与抛体/单摆相比教学切口窄，课堂可选。

### 2.8 ramp-rolling-collision（斜坡滚球 · pilot）🟡

1. 文件完整（含 three.js）；双模与埋点齐全；AV/CV（轨温）设计相对自洽。  
2. 概念重：滚动 + 碰撞 + 爬升，**演示成本高**。  
3. 与 momentum / friction 冗余偏高。  
4. 建议：**非核心演示**；人多时先下架或标「进阶自习」。  
5. quality 98，无硬伤。

### 2.9 gas-ideal（理想气体 · pilot）🟡

1. 热学仅 2 关之一；双模与埋点齐全。  
2. **已修**：电容公式 → `pV≈常数`；活塞质量 AV→CV。  
3. HTML `AV_LABELS` 仍把活塞质量列在调节标签集（P1，易误导评测/侧栏）。  
4. 玩法偏「打进标定带」，探究深度一般，但**课堂必须保留至少一条热学**。  
5. 必演示候选。

### 2.10 heat-conduction（热传导 · pilot）🟡

1. 双模与埋点齐全；公式 KG 原文正确（`Q/t=κAΔT/d`）。  
2. **已修**：去掉电容串台；截面积按运行时 `A_PHYS` 固定逻辑改为 CV。  
3. **残留 UX 问题（P1）**：截面积仍是显眼滑条且 craft 归因选项含 A，与「旁路」矛盾，学生会拧无效量。  
4. 热学线过瘦：仅本关 + gas；若要补厚度需另开等温/比热等（大改）。  
5. 演示可用，但老师需口头说明「只看 κ 与 ΔT」。

---

## 3. 教学排序（必演示 / 可选 / 建议先下架或修）

| 优先级 | 关卡 | 理由 |
|---|---|---|
| **必演示** | projectile-basic | 金牌、短、归因清晰 |
| **必演示** | pendulum-clock | 金牌、测量闭环、phase 最稳 |
| **必演示** | gas-ideal | 热学代表，修后口径正确 |
| 可选 | friction-incline | 临界条件好讲，pilot |
| 可选 | pendulum-target | 与 clock 二选一 |
| 可选 | heat-conduction | 热学第二关；需口播面积旁路 |
| 可选 | momentum-collision | 动量主题；注意轨温旁路 |
| 建议后置 | projectile-cannon | 控件多、质量口径矛盾 |
| 建议后置/修 | circular-motion | 倾角旁路 UI 仍抢眼 |
| **建议先下架或标进阶** | ramp-rolling-collision | 最重、与动量/摩擦冗余 |

---

## 4. 可优化清单

| 优先级 | 问题 | 建议改法 | 本次是否已修 |
|---|---|---|---|
| **P0** | 多关 `chapter.json` 电容公式串台（basic / target / momentum / gas / heat） | 按本关物理替换 KP/physicsModel 公式 | ✅ 已修 |
| **P0** | friction / pendulum-clock OV、domain 误标抛体 | 改为摩擦态 / 周期·摆幅 | ✅ 已修 |
| **P0** | gas 活塞质量、heat 截面积、circular 倾角、momentum 轨温误标 AV | 迁入 CV + traceMap irrelevant | ✅ chapter 已修 |
| **P0** | pendulum/cannon catalog 落在 `macro-other` | `categoryId`→`macro-mechanics` | ✅ 已修 |
| **P1** | heat / gas / circular HTML 旁路滑条仍与主 AV 同权展示 | UI 降权或移入「试探」区；craft 单选去掉旁路项 | ❌ 提案 |
| **P1** | cannon「质量影响惯性」vs mass=CV | 统一物理或统一文案 | ❌ 提案 |
| **P1** | 除 clock 外包内无原生 `phase_change` | 模式切换处补 `emit('phase_change')` 兜底（直开也分段） | ❌ 提案 |
| **P1** | momentum/circular strategy 仍有「拧旁路」高优路由 | 策略图与 CV 对齐或降权 | ❌ 提案 |
| **P2** | inquiry narrative 模板重复、friction 重置按钮刷屏 | 重生 narrative | ❌ 提案 |
| **P2** | 力学 8 关偏冗余 | 课堂默认只发布 3–5 关；ramp 默认 unpublished | ❌ 提案（可用现脚本改白名单） |
| **P2** | 热学仅 2 关偏瘦 | 中期补 1 关（如比热/相变 observe） | ❌ 大改 |

---

## 5. 给老师演示的推荐 3 关组合

| # | 关卡 | 演示重点（约 3–5 min/关） |
|---|---|---|
| 1 | **demo-projectile-basic** | 探究：只改初速看落点；竞赛：命中靶心；点出质量旁路 |
| 2 | **demo-pendulum-clock** | 探究：摆长主导周期；竞赛：窄目标带校时；质量无关 |
| 3 | **demo-gas-ideal** | 等温 p–V；打进标定带；强调活塞质量不进 pV |

备选替换：若强调临界条件，用 `demo-friction-incline` 换 gas；若必须露热传导，用 `demo-heat-conduction` 换 gas，并口播「面积滑条本关不改判定」。

---

## 6. 本次已改文件（未 commit）

- `data/runtime/packages/{projectile-basic,projectile-cannon,friction-incline,pendulum-clock,pendulum-target,momentum-collision,circular-motion,gas-ideal,heat-conduction}/chapter.json`
- `data/runtime/platform/catalog.json`（3 条 categoryId）

未改：各关 `game.html` 玩法数值、竞赛阈值、白名单脚本。
