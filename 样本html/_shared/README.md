# 探究包共享（`_shared`）— UI / 埋点契约

课堂演示包可复用的**薄**共享层。真相源仍是各包自己的 `game.html` 物理与舞台；这里只统一**壳层 UI 语言**与埋点约定。

> **原则：统一 UI 语言，不统一舞台脸。**  
> Canvas / WebGL / 粒子 / p-V / s(t) 等实验读出与舞台 HUD 保持关卡身份。

## 文件

| 文件 | 用途 |
|------|------|
| `craft-tokens.css` | 色板 / 圆角 token；**关卡只覆盖 `--craft-accent`** |
| `craft-shell.css` | 侧栏 IA、当前目标卡、舞台 mode pill、滑条、按钮、observe、intro/win 卡 |
| `craft-telemetry.js` | 双模 `phase_change` + 可选 `explore_success` 门闩 |
| `craft-feedback.js` | 竞赛测后文案：待测 → 偏低 / 偏高 / 已落入 |

## 侧栏信息架构（课堂标准）

顺序固定（**projectile 模式**）：

1. **`.bench-hd`**：标题 + 副标题 ‖ `#modeSelect`（勿再用无标题的 `.mode-row`）
2. **`.side-goal-box`**：当前目标卡
3. **滑条 / 参数区**（`.essence-scroll` / 等价滚动区）
4. **操作按钮**（有则放底部 `.essence-ft` / footer）
5. Observe / 读数（可在滚动区内、按钮附近）

舞台：紧凑 **`.craft-mode-pill`** — 文案为「探究模式」或「竞赛模式 | 剩余机会 N」。放置避开关卡专属 HUD（如滑轮 s(t) 右上 → pill 左上）。深色 craft token，勿用浅色 glass。

## 择优来源（UI 件 → 胜出包）

| UI 件 | 胜出参考 | 说明 |
|------|----------|------|
| Token 体系 / accent 覆盖 | thermo + pulley | 链 `_shared`，关卡只改 accent |
| Bench 壳 / 滚动区 | **pulley-rigid** / **gas-pressure-micro** | `#essence-app` / `#essence-bench` / `.essence-scroll` |
| 侧栏 IA（头+模式） | **projectile-basic** | `.bench-hd`：title + sub ‖ `#modeSelect` |
| 当前目标卡 | **projectile-basic** | `.side-goal-box`：深色卡 + accent 描边；头用 `var(--craft-accent)` |
| 舞台 mode pill | **projectile-basic** 文案 | `.craft-mode-pill` |
| 滑条行（label + 值） | pulley + nezha `.value` 色 | 禁止 CV 剧透小字；CV 不垫底 |
| Observe / pass-badge | pulley + **nezha** 状态边 | `pending` / `measured` / `ok` / `fail` |
| Intro / Win 卡 | **Template A** intro + ramp color-mix 边 | intro：标题+钩子+`.craft-intro-meta`+开始探究（**无公式**）；win：标题「过关 · 本局对照」+ 归因 MCQ |
| 竞赛测后措辞 | **thermo / pulley** | `CraftFeedback` |
| 双模 phase 上报 | `_shared/craft-telemetry.js` | `CraftTelemetry.initDualModePhase()` |

## 新关 / 改关约定

```html
<link rel="stylesheet" href="../_shared/craft-tokens.css">
<link rel="stylesheet" href="../_shared/craft-shell.css">
<style>:root { --craft-accent: #你的关卡色; }</style>
…
<script src="../_shared/craft-telemetry.js"></script>
<script src="../_shared/craft-feedback.js"></script>
<script>
  if (window.CraftTelemetry) CraftTelemetry.initDualModePhase();
</script>
```

侧栏骨架：

```html
<aside id="essence-bench">
  <div class="bench-hd">
    <div class="bench-hd-text">
      <div class="bench-hd-title">关卡工作台</div>
      <div class="bench-hd-sub">一句副标题</div>
    </div>
    <select id="modeSelect" aria-label="探究阶段">
      <option value="explore">探究</option>
      <option value="challenge">竞赛</option>
    </select>
  </div>
  <div class="essence-scroll">
    <div class="side-goal-box">
      <div class="side-goal-cap">当前目标</div>
      <p id="sideGoal">…</p>
    </div>
    <!-- sliders … -->
  </div>
  <div class="essence-ft"><!-- 主操作按钮 --></div>
</aside>
```

舞台 pill（示例）：

```html
<div class="craft-mode-pill" id="craftModePill" data-mode="explore">探究模式</div>
<!-- 或：#modeLabel + #challengeStats/#attemptsDisplay，由 CSS 按 data-mode / .is-visible 显隐 -->
```

勿再写关卡私有 goal-card CSS；关卡只覆盖 `--craft-accent`。

## Intro 卡 · Template A（探究优先）

`#craft-intro` 统一为 **Template A**（gas-pressure / projectile 风格）：**标题 + 现象钩子 + meta +「开始探究」**；**intro 不放公式**（无 `.formula` / 方程块）。

```html
<div id="craft-intro">
  <div class="craft-card">
    <h2><!-- 关名 · 主题 --></h2>
    <p><!-- 1段现象钩子：调侧栏对照什么 --></p>
    <p class="craft-intro-meta"><!-- 探究≠竞赛；目标本局锁定；未命中扣次数（可微调节奏） --></p>
    <button type="button" id="craftIntroBtn">开始探究</button>
  </div>
</div>
```

| 规则 | 说明 |
|------|------|
| 无 intro 公式 | `.formula` 只出现在 `#craft-win` 揭示区或图谱；勿在开局剧透方程 |
| 按钮文案 | 统一 **开始探究**（勿用「开始」） |
| `.craft-intro-meta` |  muted ~12px（见 `craft-shell.css`）；符号约定（如滑轮 a：m₁ 向下）可用**白话句**留在 meta/正文 |
| 钩子文案 | 各关自拟；勿剧透哪个滑条是 CV |

择优参考：`gas-pressure-micro` / `projectile-basic`。

### 例外 / 跳过（保留身份）

| 包 | 做法 | 跳过 |
|----|------|------|
| **classroom 8**（力学五 + 热学三） | 完整链 `_shared` + IA | — |
| **cyclotron-radius** | 完整链 `_shared` + `#essence-app` / bench scroll+footer；保留 Three.js 与 `r=mv/(qB)`，腔压仅观感 | — |
| **capacitor-era-ch1/2/4** | 链 `craft-tokens` + telemetry + feedback；**不**整链 `craft-shell.css`（避免盖掉 Tesla 青 HUD / 城景）。侧栏已对齐 `.bench-hd` + `.side-goal-box` + mode pill；`--craft-accent:#00c8ff`。过场动画 / 对话 cinematic **按需求移除**：`beginChapterIntro` → 直进 `openPuzzle`；`#dialogue` 隐藏。Template A「开始探究」后即可玩。 | 保留 Tesla 顶栏 / 地图 / 介质台与时代控件；**cutscenes removed by request** |

1. **探究达成**只发 `explore_success`；**竞赛通关**只发 `win`。勿混用。
2. 生成单文件 HTML：把 token **内联**进 `:root`，勿依赖 `../_shared` 外链；可注释指向本契约。
3. 图谱侧继续用 `../vendor/` + shared mermaid-parse；**不要**把游戏壳做成图谱框架。

## 样本同步

```bash
npm run sync:packages-samples
npm run sync:packages-samples:check
```

脚本会同步各包 `game.html`，并复制本目录到 `样本html/_shared/`。

**例外**：图谱继续用 `样本html/vendor/`。游戏壳走 `样本html/_shared/`（由 sync 从 `packages/_shared` 复制）。`滑轮刚体/滑轮刚体.html` 现与包一致外链 `_shared`（不再内联 tokens）。
