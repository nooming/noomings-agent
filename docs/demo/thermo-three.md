# 热学三关 · 设计要点

> 关卡回归检查见 [`game-qa-checklist.md`](./game-qa-checklist.md)。  
> 课堂上架见 [`classroom-demo-checklist.md`](./classroom-demo-checklist.md)。  
> 替换计划 / 开测长表 / 旧设计卡全文：[`_archive/`](./_archive/)（`thermo-three-plan` · `thermo-three-qa` · `thermo-three-design`）。  
> **Craft**：三关为 **`craft:pilot`（非 gold）**，仍在课堂 8 关白名单上架演示；力学五关为 gold。

CV 与主参同栏；文案**不出现**「次要 / 旁路 / 不进判定」。CV **不进** win。

| 关 | 公式（要点） | AV | CV | OV | explore_success | win |
|----|--------------|----|----|----|-----------------|-----|
| **gas-pressure-micro** | \(P=NkT/V\)（相对单位） | N, T, V | 容器质量（`s-box-mass`） | P | ≥3 测且动过 ≥2 个 AV | P 落入本局带 |
| **maxwell-speed-dist** | \(v_p=\sqrt{2kT/m}\) 等 | T, m | 容器容积（`s-vol`） | \(v_p\) | ≥3 测且 T、m 都动过 | \(v_p\) 落入区间 |
| **adiabatic-process** | \(PV^\gamma=\mathrm{const}\)（γ=1.4）+ 等温对照 | V, \(T_0\) | 活塞配重（`s-tag`） | (P,T) / W\* | ≥3 测且改 V/T₀ 或切路径 | 特定功 W\* 入带 |

三关共用：竞赛约 6 次；`phase_change` 去重；`explore_success` ≠ `win`；通关 UI 延迟约 0.8–1.2 s；热学冷青 accent。
