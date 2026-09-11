# 游戏 QA 清单（关卡回归）

给开发 / 助教在**改关、上架、演示前**做关卡回归。可勾选。

| 文档 | 管什么 |
|------|--------|
| **本文** | 双模、埋点、结算、可达、旁路文案、场景观感 |
| [`classroom-demo-checklist.md`](./classroom-demo-checklist.md) | 课堂码、发布白名单、学生可见 6 关、学情流程 |
| [`thermo-three.md`](./thermo-three.md) | 热学三关公式 / AV·CV·OV 设计要点（极短） |

历史审计 / 视觉快照（勿当现行白名单）：[`_archive/mechanics-thermo-level-audit.md`](./_archive/mechanics-thermo-level-audit.md)、[`_archive/mechanics-thermo-visual-notes.md`](./_archive/mechanics-thermo-visual-notes.md)。热学开测长表已并入本文，原稿归档：[`_archive/thermo-three-qa.md`](./_archive/thermo-three-qa.md)。

现行 **6 关**：力学 `projectile-basic` · `pendulum-clock` · `ramp-rolling-collision`；热学 `gas-pressure-micro` · `maxwell-speed-dist` · `adiabatic-process`。

---

## 1. 通用检查（每关都跑）

- [ ] **双模**：`#modeSelect`（或等价）可切「探究 / 竞赛」；文案统一，无「靶心挑战 / 要塞」等平行叫法抢戏
- [ ] **埋点分口径**：探究达成只发 `explore_success`；竞赛通关只发 `win`；二者**不得**混用同一时机
- [ ] **`phase_change`**：模式切换上报且同模式不重复 emit（`__craftPhaseEmitted` / dualModeInit 去重）
- [ ] **其它埋点**：滑条 `tuning`、主操作 `action`；竞赛末次失败才 `attempts_exhausted`（勿一失败就耗尽）
- [ ] **结算延迟**：命中后约 **0.8–1.2 s** 再弹 craft-win / emit `win`（防点按钮秒过）；可立刻置 `__challengeWon` 防连点
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

### `ramp-rolling-collision`（斜坡滚球 · pilot）

- [ ] 双模 + `explore_success` / `win` 齐全（含 Three.js 包）
- [ ] AV/CV（如轨温）与判定一致；CV 不进 win
- [ ] 概念重（滚动+碰撞+爬升）：回归时确认可通关、不白屏
- [ ] 与 essence 壳观感不同属已知差异；不因此跳过埋点检查

---

## 3. 分关要点 · 热学

设计卡摘要见 [`thermo-three.md`](./thermo-three.md)。包：`data/runtime/packages/{gas-pressure-micro,maxwell-speed-dist,adiabatic-process}/`。

### `gas-pressure-micro`（气体压强微观）

- [ ] 探究：`explore_success` 需 ≥3 次测试且至少动过 **2 个** AV（N/T/V）
- [ ] 竞赛：实测 P 落入 `lockBand`；`win` 仅竞赛；CV=`s-wall` 不改 P
- [ ] 结算延迟 ~950ms；竞赛可达（相对刻度 k 与抽样带匹配，勿必输）
- [ ] 场景：实验室气室、碰壁闪光/壁脉冲；口播 P 为 arb，勿当 SI
- [ ] 风险留意：`suggestedRange` 占位可能与真实滑条不完全一致（不挡玩）

### `maxwell-speed-dist`（麦克斯韦速率分布）

- [ ] 探究：≥3 测且 **T、m 都动过** 才 `explore_success`
- [ ] 竞赛：\(v_p\) 落入特征区间；CV=`s-palette`（柱描边）不改 \(v_p\)
- [ ] 结算延迟 ~1000ms；`lockBand` 从可达 (T,m) 抽样
- [ ] 双视口：分子云 + 直方图/曲线；竖屏云区偏矮可接受
- [ ] 口播以侧栏测试读数为准（画布 \(v_p\) 标记为示意映射）

### `adiabatic-process`（绝热过程）

- [ ] 探究：≥3 测且动过 V/T₀ **或** 切换绝热/等温路径
- [ ] 竞赛：沿绝热落到目标 \((V^*,P^*)\)；CV=`s-tag` 铭牌不改态方程
- [ ] 结算延迟 ~1100ms；p–V 图板与气缸**不溢出**画布/侧栏
- [ ] 活塞随 V 运动；绝热↔等温有过渡；窄屏并排略挤可接受
- [ ] 竞赛 `lockTarget` 可能改写 `s-T0`：先拧初温再测需回到锁定初温（玩法约束，非必输）

---

## 4. 视觉 / 门面冒烟（可选）

点到为止；课堂码与列表以课堂清单为准。

- [ ] 首页 `/` 门厅可进学生 / 教师入口
- [ ] favicon / 站点图标正常（无破图）
- [ ] 教师登录 → 工作台；学生课堂码 → 探究区列表为现行 **6** 关
- [ ] 进关后壳→iframe 不白屏；模式切换与过关弹层可见

平台脚本冒烟（可选）：`npm run smoke:platform`。
