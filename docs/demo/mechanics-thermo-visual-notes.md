# 力学 + 热学课堂 · 视觉 / UI 观感笔记

> 日期：2026-09-09  
> 范围：白名单 10 关 `game.html`（对照 `mechanics-thermo-level-audit.md`，**只谈演示观感**，不谈埋点/公式口径）  
> 方法：静态读布局 / CSS 变量 / 双模壳 / 弹层文案；对照 `platform-shell.css` + `student-play.html` 播放壳。未改玩法数值；本次**无代码改动**（未见「按钮被挡住」级硬破损）。

---

## 总评

十关已共用一套**双模运行时壳**（`#dual-mode-hud` / `modeSelect` / `#craft-intro` · `#craft-win` · `#attempts-exhausted`），课堂流程能讲通；但**皮肤与布局骨架仍像多次贴皮**：accent 各关一色、侧栏有 Tailwind 亮色壳 / essence 暗侧栏 / 木纹钟表台 / pixel 炮台 / Three.js 自研面板五套并存，再叠加 11–12px 目标文案与「旁路滑条与主 AV 同权」，投屏时更像「能跑的课件合集」而非同一产品线。平台列表页是浅色蓝图工业风，进关后 iframe 内多为深色 craft，播放页 `play-page` 已用深底过渡，**壳→关衔接尚可，关与关之间跳色最伤演示连贯性**。

---

## 共性优化（可执行）

### P0（演示当场会被注意）

1. **必演示 3 关统一「一眼结构」**：`projectile-basic` / `pendulum-clock` / `gas-ideal`  
   - 侧栏顶：模式切换 +「当前目标」一块（字号 ≥14px，对比度足够投屏）。  
   - 主 CTA 一颗、次要操作弱化；旁路量（质量 / 活塞质量等）移到折叠或虚线「试探」区。  
2. **目标文案去重**：舞台左上 `dual-mode-hud`、右上 `essence-hud`、侧栏 `sideGoal` 经常三处说同一句话 → 演示前选定「侧栏主目标 + HUD 只留模式/计时/机会」，关掉或缩短重复句（多关已有 `#goalMission{display:none}` 先例，可推广）。  
3. **遗留浅色/像素弹层与深色 craft 叠用**：  
   - `projectile-basic` 的 `#messageBox`（灰字玻璃条）  
   - `projectile-cannon` 的 `pixel-modal`（「挑战成功 / 下一关 / 解锁自由模式」）  
   演示路径尽量只走 `#craft-win` / `#attempts-exhausted`，避免老师切模式后弹出「另一套游戏 UI」。

### P1（半小时～一天，观感明显提升）

1. **旁路滑条视觉降权**（与审计 P1 一致，属 UI）：`circular-motion` 底座倾角、`heat-conduction` 截面积、`gas-ideal` 活塞质量、`momentum` 轨温、各关质量滑条——同色同高主滑条 → 改更小字号 / 虚线框 / 「仅改观感」角标，或默认折叠。  
2. **字号地板**：侧栏 label、`sideGoal`、hint 从 11–12px 提到 ≥13–14px；投屏场景避免 `.text-xs` / `font-size:11px` 作为主信息。  
3. **移动端 / 窄窗挤兑**：多数关 `48vh` 舞台 + `max 42vh` 侧栏；投屏笔记本竖分时画布过扁。演示机优先**横屏宽窗**；若要适配，把侧栏改为可折叠抽屉优于再压画布。  
4. **固定 canvas 尺寸**（如 gas `600×200`、circular `640×320`）在大屏两侧留灰边 → 中期改为随 `#essence-stage` 拉伸并保持比例。  
5. **竞赛选项文案统一**：有的写「靶心挑战 / 要塞突击 / 竞赛挑战 / 竞赛」，建议白名单统一为「探究 / 竞赛」二字，专有玩法名放目标句里。

### P2（产品化皮肤，非演示前必做）

1. **抽一层共享 craft token**：`--craft-bg / --craft-panel / --craft-accent / --craft-text` + 统一 radius（现平台壳偏 4–6px 工业锐角，关内多 12–18px 圆角——二选一）。  
2. **领域 tint 只改 accent**，不改布局 DOM（力学黄铜/暖橙、热学冷青/暖红即可）。  
3. **清除 CSS 考古层**：原浅底 `#f5f7fa` / `#edf2f7` / Tailwind `bg-blue-50` / `text-gray-*` 被 `!important` 盖掉，源文件仍显「课件+补丁」。整理时删死代码比再加一层覆盖干净。  
4. **emoji 装饰收敛**：`📊` / 画布 `💀` / `💔` 等在严肃课堂投屏偏玩具感；改短中文状态即可。  
5. **与 platform-shell 对齐字体序**：壳层 `Segoe UI` 优先，关内 `PingFang SC` 优先——同机切换时字重微跳；可统一为壳层 token。

---

## 分关视觉印象

| 关卡 | 一句话印象 | 具体点（1–2） |
|---|---|---|
| **projectile-basic** | 旗舰叙事清晰，但仍是「Tailwind 亮色壳 + 深绿 craft 覆盖」。 | ① 侧栏标题「野战炮台」与 intro「靶场·斜抛」命名不一致。② 仍保留浅色 `messageBox`，与深色过关卡并存。 |
| **projectile-cannon** | 信息密度最高，最像独立小游戏而非课堂关。 | ① 7 条主滑条挤满侧栏，投屏难讲「先拧哪根」。② 残留 `pixel-modal` /「下一关」「自由模式」文案，与双模 craft 结算违和。 |
| **friction-incline** | 暖橙暗侧栏，结构接近 essence 标准关，观感中上。 | ① 质量滑条与 μ/θ 同权，旁路不醒目。② 目标句偏长（竞赛锁 μ 说明），窄侧栏易换行成墙。 |
| **pendulum-clock** | **本批观感标杆**：木纹/黄铜一体，HUD 与周期尺可读。 | ① 左上 dual + 光电计时叠放已处理，仍略挤。② `♪ 滴答声` 角标可爱，演示可保留；注意勿与机会条抢视线。 |
| **pendulum-target** | 偏「游戏关」：矿车叙事强，失败态偏戏剧。 | ① 画布失败用 `💀` 等，课堂投屏略跳戏。② 侧栏另有「竞赛」按钮与 `modeSelect` 双入口风险（认知重复）。 |
| **momentum-collision** | 粉紫 accent 在力学线里跳色最明显。 | ① 滑条偏多（质量/速度/轨温等），侧栏滚动演示时老师易丢焦点。② 与 ramp「碰撞」主题视觉也重复，连开两关易审美疲劳。 |
| **circular-motion** | 标准 essence 暗壳，但旁路倾角抢戏。 | ① `底座倾角 φ` 与 r/ω 同一 `slider-row`。② 「📊 观测读数」+ 双目标句，信息层偏多。 |
| **ramp-rolling-collision** | **唯一 Three.js / 无 essence-gold 骨架**，像另一产品。 | ① 自研 `#sidePanel` + 深棕 token，与其余 9 关切换最突兀。② 概念重 + UI 自成一套，不建议放进主演示串。 |
| **gas-ideal** | 冷青热学皮肤清楚，画布偏「扁条示意」。 | ① `600×200` 气缸在大屏显小、留白多。② 活塞质量滑条与 p/V 同列（教学旁路，视觉未降权）。 |
| **heat-conduction** | 暖红热工台可用，截面积滑条仍「看起来很重要」。 | ① `s-area` 带数字框，视觉权重不低于 κ/ΔT。② 过关归因仍可选「主要是截面积」，强化错误操作欲（观感+教学双重问题）。 |

---

## 演示前最小美化清单（约 2 小时）

只动**必演示三关** + 去掉会出丑的残留；不碰玩法数值。

| # | 任务 | 预估 | 落点 |
|---|---|---|---|
| 1 | 三关侧栏「当前目标」字号提到 ≥14px；关掉舞台重复 `goalMission` / 缩短 HUD 副文案 | 25 min | basic / clock / gas |
| 2 | 三关旁路滑条：加一行「仅改观感 / 不进判定」并降低透明度或移到滑条区底部 | 35 min | 质量、活塞质量等 |
| 3 | `projectile-basic`：演示路径确认失败/机会用尽只走 craft 弹层；隐藏或不再调用浅色 `messageBox` | 20 min | basic |
| 4 | `projectile-cannon`：**若不演示可跳过**；若演示，CSS/`hidden` 掉 `pixel-modal` / `level-clear-overlay`，避免弹出「下一关」 | 15 min | cannon |
| 5 | 去掉投屏尴尬 emoji（至少 target 画布 `💀`、circular `📊`）→ 纯中文 | 15 min | target / circular |
| 6 | 统一三关 `modeSelect` 选项文案为「自由探究 / 竞赛」 | 10 min | basic / clock / gas |

**演示机操作（0 代码）**：浏览器全屏、缩放置 100%、窗口宽度 ≥1280；勿用手机竖屏投屏。

---

## 中期统一皮肤建议

1. **以 `pendulum-clock` 的一体感 + `essence-stage / essence-bench` 栅格为母版**，抽公共 CSS（或构建时注入一段 `craft-shell.css`），十关只保留：画布内容、滑条 id、intro 文案、accent 变量。  
2. **accent 表**（建议）：力学共用暖黄铜 `#c9973f` 系微调；热学共用冷青 `#6a9ab8` / 导热红 `#e07060`——避免 momentum 单独粉紫、cannon 单独「像素要塞」叙事皮肤。  
3. **弹层三件套唯一入口**：intro / win（含归因）/ attempts-exhausted；删除各关 legacy `messageBox`、`pixel-modal`、`showMessage` 平行 UI。  
4. **控制区信息架构**：`[模式][目标]` → `[主 AV 滑条 2–3]` → `[主按钮]` → `[观测读数]` → `<details>试探量（CV）</details>`。  
5. **平台壳**：列表保持浅色蓝图；`play-page` 深底已合理。中期可让 iframe 顶条（若加关卡名）用 `--edu-primary` 细线，与关内 `--craft-accent` 分工（壳=导航，关=实验台），不必把关内改成浅色去「强行一致」。  
6. **ramp-rolling-collision**：要么补齐 essence/craft 外壳再留在目录，要么课堂白名单默认不下架展示（与审计一致）。

---

## 与平台壳的违和点（摘要）

| 维度 | 平台壳 | 关内现状 | 演示影响 |
|---|---|---|---|
| 底色 | 列表浅灰蓝图；`play-page` 深 `#12181f` | 关内深 craft 为主 | 进关尚可；关间跳色更大 |
| 圆角 | 4–6px 锐利 | 12–18px 软圆 | 细看不统一 |
| 字体 | Segoe 优先 | PingFang 优先 | 微跳 |
| 组件 | `.edu-btn` / 工业角标 | craft-card / 偶发 pixel / Tailwind | 老师端与学生关「不像一套」 |

---

## 附录：皮肤 / 壳快速对照

| package | 布局骨架 | accent（约） | 双模壳 | 过关/机会弹层 | 备注 |
|---|---|---|---|---|---|
| projectile-basic | Tailwind 左右栏 | 绿 `#6aaa78` | ✅ | craft + 浅色 messageBox | 唯一 Tailwind CDN |
| projectile-cannon | stage + controls-area | 橙 `#c88850` | ✅ | craft + pixel-modal | 控件最密 |
| friction-incline | essence | 橙 `#d08850` | ✅ | craft | |
| pendulum-clock | 自研 #app/#bench | 黄铜 `#c9973f` | ✅ | craft | 观感标杆 |
| pendulum-target | app + control-panel | 黄铜系 | ✅ | craft + 画布情绪字 | |
| momentum-collision | essence | 粉 `#c878a0` | ✅ | craft | 跳色 |
| circular-motion | essence | 金 `#e0a040` | ✅ | craft | 倾角同权 |
| ramp-rolling-collision | Three 自研 | 棕 `#b8956c` | 部分 | craft exhausted + showMessage | 无 essence-gold |
| gas-ideal | essence | 青 `#6a9ab8` | ✅ | craft | 画布偏扁 |
| heat-conduction | essence | 红 `#e07060` | ✅ | craft | 面积滑条抢戏 |

---

## 已实施（五关精致化）

> 日期：2026-09-09 · 范围：`projectile-basic` / `projectile-cannon` / `pendulum-clock` / `gas-ideal` / `heat-conduction`  
> 原则：只动观感与演示弹层路径，不改物理数值 / attempts / catalog。packages 为真相源，已同步对应 `样本html/` 镜像。

| 关卡 | 改动要点 |
|---|---|
| **projectile-basic** | 侧栏标题统一为「靶场·斜抛」；`当前目标` ≥14px；舞台 `#goalMission` 隐藏；质量滑条归入「次要参数·仅改观感」；浅色 `#messageBox` 停用，未中改舞台短提示、机会用尽走 craft；`modeSelect` →「自由探究 / 竞赛」；主按钮 / craft 主色混入平台青 `#0c8aad`。 |
| **projectile-cannon** | `当前目标` ≥14px；主 AV（角/力度/阻力/风）前置，重力·质量·弹种归「次要参数」；CSS 隐藏 pixel `modal-overlay` / `level-clear-overlay`；未中改舞台 tip、中途过关自动 `nextLevel`，末关仍走 `#craft-win` / `explore_success`；模式文案「竞赛」。 |
| **pendulum-clock** | 侧栏目标盒 ≥14px；质量滑条降权分组；模式「竞赛」；测量钮触控高度；滴答角标略降对比；craft 按钮与平台青微调。 |
| **gas-ideal** | 侧栏「当前目标」盒 ≥14px；舞台 `goalMission` 隐藏；活塞质量虚线「次要参数」；模式文案统一「竞赛」；画布轻微圆角阴影；craft 主色混青。 |
| **heat-conduction** | 同上结构；截面积 `s-area` 降权为旁路试探组；主 CTA 触控高度；`goalMission` 去重。 |

**验证**：五关 HTML 仍含 `explore_success` / `win`（或 `__craftShowWin`）关键字；`trace-package-hooks` 回归 OK。  
**样本同步**：`斜抛.html` / `抛体大炮.html` / `钟表铺校时.html` / `理想气体.html` / `热传导.html`。
