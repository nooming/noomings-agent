# 热学三关 QA（埋点 / 口径 / UI / 可达）

> 对照清单来自历史力学·热学审计典型问题；设计卡见 [thermo-three-design.md](./thermo-three-design.md)。  
> 包路径：`data/runtime/packages/{gas-pressure-micro,maxwell-speed-dist,adiabatic-process}/`；样本已镜像同步。  
> 判定：`通过` = 原本合规；`已修` = 本次改动后合规；`风险` = 仍需留意、非阻塞。

`assertPublishReady`（三关，`published:true`）：**ok，warnings=[]，blocked=false**（无 `dual_mode_missing_explore_success`）。

---

## 1. `gas-pressure-micro` · 气体压强微观

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 1 双模 `#modeSelect` + `phase_change` 去重 | 通过 | explore/竞赛；`__craftPhaseEmitted` + dualModeInit |
| 2 `explore_success` / `win` 分口径 | 已修 | 探究门闩：≥3 次测试且至少动过 2 个 AV（N/T/V）；竞赛才 `win` |
| 3 trace / action / tuning | 通过 | hook + `btn-test` action；滑条稳定 id |
| 4 成功延迟 + `__challengeWon` | 已修 | ~950ms 再弹 craft-win；命中立刻 `__challengeWon`；末次失败才 `attempts_exhausted` |
| 5 chapter 公式不串台 | 通过 | `P = NkT / V`，domain gas |
| 6 AV/CV/OV；CV 不进 win | 通过 | CV=`s-wall` 仅线宽/纹理；判定只用 N,T,V |
| 7 strategy 不把 CV 当主路径 | 通过 | `confound_CV1` suboptimal / 低分 |
| 8 无「次要/旁路/不进判定」明示；CV 视觉平行 | 已修 | 去掉 win 卡「只改外观」；滑条同栏平行 |
| 9 目标 ≥14px；避免三重刷屏 | 已修 | `#sideGoal` 14px；舞台 `#goalMission` 隐藏 |
| 10 无调试 / 无平行「下一关」弹层 | 通过 | 仅 craft-intro / craft-win |
| 11 无尴尬 emoji；模式「探究/竞赛」 | 通过 | — |
| 12 归因不引导拧 CV | 通过 | strategy warn 指向主路径 |
| 13 竞赛可达；探究有对照 | 已修 | **原 k=0.045 时 P∈[~27,6480] 而带~16–34，必输**；改为 k=0.002 + 可达抽样 `lockBand`（仿真 200/200） |
| 14 publish 无 blocking | 通过 | warnings 空 |

**本关仍存风险**：相对刻度 k 与设计卡「并入刻度」一致，但读数单位为 arb，口播勿当成 SI；`gameSpec.suggestedRange` 仍为占位 0–100（与真实滑条范围不完全一致，不挡玩）。

---

## 2. `maxwell-speed-dist` · 麦克斯韦速率分布

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 1 双模 + `phase_change` | 通过 | 同壳 |
| 2 explore / win 分口径 | 已修 | ≥3 测且 T、m 都动过才 `explore_success` |
| 3 trace / action / tuning | 通过 | — |
| 4 延迟 + `__challengeWon` | 已修 | ~1000ms；末次失败 `attempts_exhausted` |
| 5 公式不串台 | 通过 | `v_p=√(2kT/m)` 等 |
| 6 AV/CV/OV；CV 不进 win | 已修 | CV 由「直方图配色」改为中性 **柱描边粗细**（id 仍 `s-palette`，不改 vp） |
| 7 strategy CV 非主路径 | 通过 | confound 低权 |
| 8 无禁语；CV 平行 | 已修 | 去「只改外观」；CV 与 AV 同栏 |
| 9 目标字号 / 不刷屏 | 已修 | 同气体关 |
| 10–12 UI/emoji/归因 | 通过 | — |
| 13 可达 + 探究对照 | 已修 | `lockBand` 从可达 (T,m) 抽样（200/200） |
| 14 publish | 通过 | warnings 空 |

**本关仍存风险**：控制 id 仍名 `s-palette`（与「描边」语义略旧）；设计卡仍写「直方图配色」，以 HTML/chapter 现文案为准。画布上 v_p 标记与读数刻度有示意映射，口播以侧栏测试读数为准。

---

## 3. `adiabatic-process` · 绝热过程

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 1 双模 + `phase_change` | 通过 | 同壳 |
| 2 explore / win 分口径 | 已修 | ≥3 测且动过 V/T₀ 或切换绝热/等温路径 |
| 3 trace / action / tuning | 通过 | — |
| 4 延迟 + `__challengeWon` | 已修 | ~1100ms；末次失败 `attempts_exhausted` |
| 5 公式不串台 | 通过 | `PV^γ=const`（γ=1.4）+ 等温对照 |
| 6 AV/CV/OV；CV 不进 win | 通过 | CV=`s-tag` 铭牌；判定用绝热 (V,P) |
| 7 strategy | 通过 | confound 低权 |
| 8 无禁语；CV 平行 | 已修 | 去「不改态方程」剧透式收束句；铭牌同栏 |
| 9 目标字号 / 不刷屏 | 已修 | 同气体关 |
| 10–12 UI/emoji/归因 | 通过 | — |
| 13 可达 + 探究对照 | 通过 | 目标点落在本局绝热曲线上；探究可切等温对照 |
| 14 publish | 通过 | warnings 空 |

**本关仍存风险**：竞赛进入时 `lockTarget` 会改写 `s-T0`（定曲线）；若学员先拧 T₀ 再测，需回到锁定初温才易命中——属玩法约束，非必输。chapter OV 主标 P，界面同时显示 T（与设计卡一致，可后续补 OV2）。

---

## 修复摘要（包 + `样本html` 镜像）

| 关 | 主要修改 |
|----|----------|
| gas-pressure-micro | 修正 k 与 `lockBand` 可达；目标 UI；explore AV 门闩；`attempts_exhausted`；文案 |
| maxwell-speed-dist | CV 改为柱描边；可达抽样带；explore 需 T+m；目标 UI；耗尽埋点；chapter 同步 |
| adiabatic-process | 目标 UI；explore 对照门闩；耗尽埋点；win 文案去 CV 剧透 |

样本：`样本html/气体压强微观|麦克斯韦速率分布|绝热过程/` 已与包内 `game.html` 同步。
