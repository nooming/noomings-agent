# 课堂金标壳 + 拾光布局（离线参照摘要）

> 布局骨架可参考历史拾光结构；**视觉与交互以 `data/runtime/packages/_shared` + craft:gold 包为准（较新）**。仅供 Agent HTML 生成 prompt，**不挂载网站**。

## 视觉 token（较新 · 优先）

```css
:root {
  --craft-bg: #0e1418;
  --craft-panel: #162028;
  --craft-accent: #0c8aad; /* 关卡可换色，勿改 bg/panel 体系 */
  --craft-text: #e6eef2;
  --craft-muted: #8a9aa6;
  --craft-radius: 12px;
}
body { background: var(--craft-bg); color: var(--craft-text); }
#controlsPanel { background: var(--craft-panel); border-radius: var(--craft-radius); }
```

生成单文件须**内联**上述变量与壳层规则（含 `.bench-hd` / `.side-goal-box` / `.craft-mode-pill`）；勿依赖 CDN。包目录演示可链 `../_shared/craft-tokens.css` + `craft-shell.css` + `craft-telemetry.js` + `craft-feedback.js`。契约真相源：`data/runtime/packages/_shared/README.md`。

侧栏 IA（课堂标准）：**.bench-hd → .side-goal-box → sliders → actions → observe**。勿再用仅标题的裸 `.mode-row`。舞台：**`.craft-mode-pill`**（探究模式 / 竞赛模式 | 剩余机会 N）。通关卡标题：**过关 · 本局对照**。

## 布局：canvas 主区 + 控件侧栏

- 主仿真区 `#simCanvasArea` / `#essence-stage` + canvas（深色舞台）
- 控件区 `#controlsPanel` / `#essence-bench`（craft-panel）
- 移动端纵向堆叠（flex-direction: column）

```html
<div id="essence-app">
  <div id="essence-stage" style="position:relative">
    <canvas id="simCanvas"></canvas>
    <div class="craft-mode-pill" id="craftModePill" data-mode="explore">
      <span id="modeLabel">探究模式</span>
      <span id="challengeStats">
        <span class="craft-mode-sep">|</span>
        <span>剩余机会</span>
        <span id="attemptsDisplay">5</span>
      </span>
    </div>
  </div>
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
      <!-- AV 滑条… → CV 插在中间（勿垫底）→ 更多 AV… -->
    </div>
    <div class="essence-ft"><!-- 发射/复位 --></div>
  </aside>
</div>
```

## DPR 感知画布

```javascript
function resizeCanvas() {
  const area = document.getElementById('simCanvasArea');
  const dpr = window.devicePixelRatio || 1;
  const w = area.clientWidth, h = area.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
```

## RAF 主循环（update / draw 分离）

```javascript
let last = performance.now();
function loop(now) {
  const dt = Math.min(50, now - last);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

## 控件与 CV

- 每个 range：label + `input[type=range]` + 数值显示（双向同步）
- 主操作：发射/测试按钮（id 对齐 traceMap）+ 复位
- **CV（有 controlId）**：interactive 滑条，插在 AV **中间**（不垫底）；标签不剧透；只改观感/旁路量
- 无 controlId 的 CV：教案区一句话即可

## 竞赛测后反馈（模板级，勿绑死某关物理）

- 测前：目标读数 =「待测」（不直播拖动中的判定量）
- 测后：`实测 … · 偏低|偏高|已落入`（带目标带文案）
- Observe 支持 retry；可选 `measuring` 短态

## Intro 卡 · Template A（探究优先）

```html
<div id="craft-intro">
  <div class="craft-card">
    <h2><!-- 关名 · 主题 --></h2>
    <p><!-- 1段现象钩子：调侧栏对照什么 --></p>
    <p class="craft-intro-meta"><!-- 探究≠竞赛；目标本局锁定；未命中扣次数 --></p>
    <button type="button" id="craftIntroBtn">开始探究</button>
  </div>
</div>
```

- **禁止**在 intro 放 `.formula` / 方程块（探究优先；公式只在 `#craft-win` 揭示区或图谱）
- 按钮文案统一 **开始探究**
- 符号约定可用白话句写在 meta/正文（勿用公式框）

## 通关 overlay / 归因

- `#craft-win`：证据行 + radio 归因（主 AV + mixed + unsure；CV 非正确项）
- 选后揭示 `#craftCv`；未选归因则禁用「再玩/关闭」
- `emit('snapshot', { …, attribution })` 可选

## 双模埋点

- `#modeSelect` → `phase_change`
- 探究里程碑：`explore_success`；竞赛通关：`snapshot` + `win`（勿混用）

## Agent 生成约束

- **单文件 HTML**：内联 CSS/JS，禁止外部 CDN
- **trace 埋点**：保留 `<!-- trace-adapter-hook -->`
- **运动类**：必须 RAF + dt 限幅，禁止调参即过关
- **勿**把某一关的特殊公式/图表硬编码进通用生成器（如滑轮 α–t 专有曲线仅作可选观感，非必出）
