# 热学三关设计卡

> 对应计划：[thermo-three-plan.md](./thermo-three-plan.md)。  
> CV 在 UI 中与主参同栏呈现；文案不出现「次要 / 旁路 / 不进判定」。CV **不进** win 公式。

---

## 1. `gas-pressure-micro` · 气体压强微观模型

| 项 | 内容 |
|----|------|
| **公式** | \(P = \dfrac{NkT}{V}\)（相对单位，\(k\) 并入刻度）；微观：更快/更多粒子 → 更频繁/更猛烈碰壁 |
| **AV** | `s-N` 粒子数 N；`s-T` 温度 T；`s-V` 体积 V |
| **CV** | `s-wall` 器壁纹理（仅视觉，不改 P） |
| **OV** | `P` 压强读数 |
| **explore_success** | 探究下完成 ≥3 次有效对照测试（改参后点测试），且至少动过两个不同 AV |
| **win** | 竞赛：实测 P 落入本局锁定压强带 |
| **次数** | 竞赛 6 次 |

---

## 2. `maxwell-speed-dist` · 麦克斯韦速率分布

| 项 | 内容 |
|----|------|
| **公式** | \(v_p=\sqrt{2kT/m}\)，\(\langle v\rangle=\sqrt{8kT/\pi m}\)，\(v_\mathrm{rms}=\sqrt{3kT/m}\)（相对单位） |
| **AV** | `s-T` 温度 T；`s-m` 分子质量 m |
| **CV** | `s-palette` 直方图配色（仅视觉） |
| **OV** | `v_p` 最概然速率（及可选 \(\langle v\rangle\) 读数） |
| **explore_success** | 探究下 ≥3 次对照测试，且 T 或 m 至少各动过一次（或同参大幅对照） |
| **win** | 竞赛：\(v_p\) 落入本局特征区间 |
| **次数** | 竞赛 6 次 |

---

## 3. `adiabatic-process` · 绝热过程

| 项 | 内容 |
|----|------|
| **公式** | 绝热：\(PV^\gamma=\mathrm{const}\)，\(TV^{\gamma-1}=\mathrm{const}\)（\(\gamma=1.4\)）；等温对照：\(PV=\mathrm{const}\) |
| **AV** | `s-V` 体积 V；`s-T0` 初温 \(T_0\)（定绝热曲线） |
| **CV** | `s-tag` 铭牌质量（装饰，不改态方程） |
| **OV** | 当前态 \((P,T)\)（由过程约束算出） |
| **explore_success** | 探究下对照绝热/等温路径 ≥3 次测试读数 |
| **win** | 竞赛：沿绝热约束将态落到本局目标 \((V^\*,P^\*)\) 邻域 |
| **次数** | 竞赛 6 次 |

---

## 4. 埋点与壳（三关共用）

- `phase_change`：探究 ↔ 竞赛切换去重  
- `tuning` / `action`：滑条与测试/复位  
- `explore_success`：仅探究达成；`win`：仅竞赛通关  
- 通关 UI / emit `win` 延迟约 **0.8–1.2 s**  
- 主色：热学冷青（`--craft-accent` 偏青）  
