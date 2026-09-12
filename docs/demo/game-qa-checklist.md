# 游戏 QA 清单（关卡回归）

给开发 / 助教在**改关、上架、演示前**做关卡回归。可勾选。

| 文档 | 管什么 |
|------|--------|
| **本文** | 双模、埋点、结算、可达、旁路文案、场景观感 |
| [`classroom-demo-checklist.md`](./classroom-demo-checklist.md) | 课堂码、发布白名单、学生可见 8 关、学情流程 |
| [`thermo-three.md`](./thermo-three.md) | 热学三关公式 / AV·CV·OV 设计要点（极短） |

历史审计 / 视觉快照（勿当现行白名单）：[`_archive/mechanics-thermo-level-audit.md`](./_archive/mechanics-thermo-level-audit.md)、[`_archive/mechanics-thermo-visual-notes.md`](./_archive/mechanics-thermo-visual-notes.md)。热学开测长表已并入本文，原稿归档：[`_archive/thermo-three-qa.md`](./_archive/thermo-three-qa.md)。

现行 **8 关**：力学 `projectile-basic` · `pendulum-clock` · `ramp-rolling-collision` · `nezha-boat-jump` · `pulley-rigid`（**craft:gold**）；热学 `gas-pressure-micro` · `maxwell-speed-dist` · `adiabatic-process`（**craft:pilot**，非 gold，仍上架演示）。

---

## 1. 通用检查（每关都跑）

- [ ] **双模**：`#modeSelect`（或等价）可切「探究 / 竞赛」；文案统一，无「靶心挑战 / 要塞」等平行叫法抢戏
- [ ] **埋点分口径**：探究达成只发 `explore_success`；竞赛通关只发 `win`；二者**不得**混用同一时机
- [ ] **`phase_change`**：模式切换上报且同模式不重复 emit（`__craftPhaseEmitted` / dualModeInit 去重）
- [ ] **其它埋点**：滑条 `tuning`、主操作 `action`；竞赛末次失败才 `attempts_exhausted`（勿一失败就耗尽）
- [ ] **结算延迟**：命中后约 **0.8–1.2 s** 再弹 craft-win / emit `win`（防点按钮秒过）；可立刻置 `__challengeWon` 防连点。`win` 可用 `__emit` / `traceEmit`（publish-gate 均识别）
- [ ] **publish-gate**：`assertPublishReady` → `ok`，无 `dual_mode_missing_explore_success`；生产可参考 `PLATFORM_PUBLISH_STRICT=1`
- [ ] **旁路 / CV**：CV **不进** win 判定；UI **无**「次要 / 旁路 / 不进判定」剧透文案；CV 与主参视觉平行或同栏，勿靠文案剧透
- [ ] **公式不串台**：`chapter.json` / 侧栏 KP 与本关物理一致（勿残留电容等串台）
- [ ] **弹层唯一**：演示路径只走 craft-intro / craft-win / attempts-exhausted；无调试层、无平行「下一关」弹层
- [ ] **桌面 + 窄屏**：宽窗可玩；窄屏不崩、主 CTA 可点（投屏优先横屏 ≥1280）
- [ ] **场所感**：有台面/墙/灯影等层次，主体够大；旗舰对照 `pendulum-clock`（工坊一体）、`projectile-basic`（纵深与运动反馈）

---

## 2. 分关要点 · 力学

### `projectile-basic`（斜抛 · gold）

- [ ] AV：初速 / 高度 / 角度；CV：质量（不进射程判定）
- [ ] OV：射程 / 最大高度；公式为斜抛，非电容串台
- [ ] 探究 / 竞赛分口径齐全；适合开场演示
- [ ] 侧栏标题与 intro 一致（靶场·斜抛）；过关走 craft，勿依赖浅色 legacy messageBox

### `pendulum-clock`（单摆秒摆 · gold）

- [ ] AV：摆长、摆角；CV：质量
- [ ] OV：周期 T / 摆幅；探究测量→反馈→精校闭环清楚
- [ ] 包内或适配器有稳定 `phase_change`（本关观感标杆）
- [ ] 目标字号可读（≥14px）；质量不抢主滑条叙事

### `ramp-rolling-collision`（斜坡滚球 · gold）

- [ ] 双模 + `explore_success` / `win` 齐全（含 Three.js 包）
- [ ] AV/CV（轨温）与判定一致；CV 不进 win
- [ ] 滑条顺序：m₁/m₂ 等真滑条合理；**轨温插缝不垫底、不打断靶球质量卡叙事**
- [ ] 概念重（滚动+碰撞+爬升）：回归时确认可通关、不白屏
- [ ] 与 essence 壳观感不同属已知差异；不因此跳过埋点检查

### `nezha-boat-jump`（哪吒跳船 · gold）

- [ ] 双模 + `explore_success` / `win` 分口径（探究对照登船+落水；竞赛登甲板才 `win`）
- [ ] AV：θ / v相对 / m / M（探究可调净空）；CV=`s-deck-mu`（**甲板摩擦系数 μ**），仅视觉不进动量
- [ ] 滑条顺序：θ → v相对 → m → **CV 插缝** → M → 净空（仅探究）
- [ ] 竞赛：间距锁定且侧栏测前「待测」；落点后给 **登船/落水 + 距离**（勿「未入」黑话）
- [ ] Three.js + vendor：进关不白屏；起跳 / 反冲 / 抛物线可见

### `pulley-rigid`（滑轮·刚体 · gold）

- [ ] 双模 + `explore_success` / `win` 齐全；竞赛打入 **|α|** 标定带（非仅 |a|）
- [ ] AV：m₁ / m₂ / 滑轮质量 / 形状（I）；CV=`s-rope-thick`（**绳子粗细**，2–4 mm），仅视觉不进动力学
- [ ] 滑条顺序：左质量 → 右质量 → **CV 插缝** → 滑轮质量 → 形状（UI 顺序不变；策略优先级强调 I）
- [ ] 探究对照 α、盘 vs 环、a=Rα；`explore_success` 需动过滑轮质量或形状之一
- [ ] 竞赛测后读数：α≈… + 相对目标 + 次要 a（m₁ 向下）；勿只显示含糊「未入」
- [ ] 公式口播：\(a=(m_1-m_2)g/(m_1+m_2+I/R^2)\)，\(\alpha=a/R\)，强调刚体转动 / I

---

## 3. 分关要点 · 热学

设计卡摘要见 [`thermo-three.md`](./thermo-three.md)。包：`data/runtime/packages/{gas-pressure-micro,maxwell-speed-dist,adiabatic-process}/`。

### `gas-pressure-micro`（气体压强微观 · pilot）

- [ ] 探究：`explore_success` 需 ≥3 次测试且至少动过 **2 个** AV（N/T/V）
- [ ] 竞赛：实测 P 落入 `lockBand`；`win` 仅竞赛；CV=`s-box-mass`（**容器质量**）不改 P
- [ ] 结算延迟 ~950ms；竞赛可达（相对刻度 k 与抽样带匹配，勿必输）
- [ ] 场景：实验室气室、碰壁闪光/壁脉冲；口播 P 为 arb，勿当 SI
- [ ] 竞赛测前 P 为「待测」；测后 **P≈… + 偏低/偏高/已落入**；勿拖动中直播 P
- [ ] 风险留意：`suggestedRange` 占位可能与真实滑条不完全一致（不挡玩）

### `maxwell-speed-dist`（麦克斯韦速率分布 · pilot）

- [ ] 探究：≥3 测且 **T、m 都动过** 才 `explore_success`
- [ ] 竞赛：\(v_p\) 落入特征区间；CV=`s-vol`（容器容积）只改分子云疏密，不改 \(v_p\)；插在 T 与 m 之间
- [ ] 结算延迟 ~1000ms；`lockBand` 从可达 (T,m) 抽样
- [ ] 双视口：分子云 + 直方图/曲线；竖屏云区偏矮可接受
- [ ] 竞赛测前不直播三量；测后侧栏 **v_p≈… + 偏低/偏高/已落入**（单次读数，勿拖动中对照目标）

### `adiabatic-process`（绝热过程 · pilot）

- [ ] 探究：≥3 测且动过 V/T₀ **或** 切换绝热/等温路径
- [ ] 竞赛：按特定功 **W\*** 入带过关（非仅对 \((V^*,P^*)\) 点）；CV=`s-tag` 活塞配重不改态方程
- [ ] 结算延迟 ~1100ms；p–V 图板与气缸**不溢出**画布/侧栏
- [ ] 活塞随 V 运动；绝热↔等温有过渡；窄屏并排略挤可接受
- [ ] 竞赛测前 W「待测」、画布可保留 live P/T；测后 **W≈…（+T）+ 偏低/偏高/已落入 W\*±tol**；`lockTarget` 可能改写 `s-T0`（玩法约束）

---

## 4. 近期产品 / 教师反馈回归（必查）

改关或演示前对着勾；与上文分关条目互补，不替代通用检查。

### 混淆变量（CV）

- [ ] **每关有 CV**；`chapter.json` / 侧栏有对应控件
- [ ] **CV 不进过关公式**（改 CV 不改变 win / explore 判定）
- [ ] **真滑条顺序保留**：有效 AV 相对顺序不变；CV **插缝**，勿垫在整栏最底
- [ ] **避免一眼假标签**：勿用「描边粗细 / 器壁纹理 / 海面霞光 / 支架色调」等一眼无关的 CV 名；气压关用**容器质量**、跳船用**甲板摩擦系数 μ**、滑轮用**绳子粗细**等平行观感标签
- [ ] **跳船 / 滑轮 CV**：`s-deck-mu`、`s-rope-thick` 仅视觉，不改动量 / Atwood \(a\)

### 反剧透

- [ ] **探究文案**不点名有效旋钮（勿写「拧 V、T₀」这类）
- [ ] **竞赛反剧透**：测前「待测」、拖动中不直播胜负量；**测后必须给实测值**（P≈ / W≈ / v_p≈ / |α|≈…）+ 短相对提示（偏低/偏高/已落入），禁止以「未入 / 入带」作为主结果

### 图谱高亮（策略全景）

历史同类问题多次出现（稀疏种子、假相同高亮、CV 旁路错挂、route 标签与 Mermaid 边不一致）。可复跑：`node tests/scripts/audit-strategy-highlight-cv.js`（报告写到 `data/runtime/analysis/reports/`）。点选每条「单变量· / 多参 / 试探」后核对：

- [ ] **入口唯一**：高亮只含本路由的 StrategySelect 扇出目标（`*Strat` / `*Route` / `Trap` / `ProbeCV*`），不串到兄弟支路
- [ ] **主链完整**：单变量路径能亮到 Tune/Adjust → Fire/Launch → Observe（勿只剩 Start/Select/Win）
- [ ] **CV 旁路**：`试探·*` 走虚线 ProbeCV，**不要**把 AV 边（如倾角）错接到 ProbeCV；confound 路由勿占 `priorityRank` 主序列
- [ ] **标签对齐**：`routes[].label` 与 Mermaid `|边标签|` 可匹配（括号注记如「（改 I）」须能对上「·改I」）；改 chapter 后须 `writePriorityGraphFiles` 重导 `图谱.html` 并 `sync:packages-samples`

### 分关补丁核对

- [ ] **绝热竞赛**：判定用特定功 **W\***（非仅对 \((V,P)\) 点）
- [ ] **气压 CV**：为**容器质量**，非器壁纹理
- [ ] **斜坡**：轨温（CV）**不打断** m₁/m₂ 靶球卡合理顺序；策略图「初速度 / 倾角 / 形状 / 试探·轨温」扇出勿错挂
- [ ] （可选）**斜抛**：质量→半径落地微泄漏已修或可接受

### 学情 / 平台（短列；详查见课堂清单）

- [ ] 学情索引 / 分目录可用
- [ ] 教师台**回首页停轮询**（离开工作台不再刷学情）

---

## 5. 视觉 / 门面冒烟（可选）

点到为止；课堂码与列表以课堂清单为准。

- [ ] 首页 `/` 门厅可进学生 / 教师入口
- [ ] favicon / 站点图标正常（无破图）
- [ ] 教师登录 → 工作台；学生课堂码 → 探究区列表为现行 **8** 关
- [ ] 进关后壳→iframe 不白屏；模式切换与过关弹层可见

平台脚本冒烟（可选）：`npm run smoke:platform`。
