/** CLI: node tests/scripts/extract-shiguang-patterns.js
 * 只读 resources，输出供 HTML 生成 prompt 引用的模式文档。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const ATWOOD_SHELL = path.join(ROOT, 'resources/shiguangtongxue/content/senior/mechanics/atwood/index.html');
const OUT = path.join(ROOT, 'packages/generate/export/shiguang-patterns.md');

const SHELL_SNIPPET = `<div id="app">
  <div id="simCanvasArea"><canvas id="simCanvas"></canvas></div>
  <div id="controlsPanel"></div>
</div>`;

const RAF_SNIPPET = `let last = performance.now();
function loop(now) {
  const dt = Math.min(50, now - last);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);`;

const DPR_SNIPPET = `function resizeCanvas() {
  const area = document.getElementById('simCanvasArea');
  const dpr = window.devicePixelRatio || 1;
  const w = area.clientWidth, h = area.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}`;

function main() {
  if (!fs.existsSync(ATWOOD_SHELL)) {
    console.error('extract-shiguang-patterns: atwood shell missing — run crawl/playback first');
    process.exit(1);
  }

  const md = `# 拾光物理仿真模式（离线参照摘要）

> 来源：\`resources/shiguangtongxue/\` · 仅供 Agent HTML 生成 prompt 引用，**不挂载网站**。

## 布局：canvas 主区 + 控件侧栏

- 左侧/上方：深色仿真区 \`#simCanvasArea\` + \`#simCanvas\`
- 右侧/下方：浅色控件区 \`#controlsPanel\`
- 移动端纵向堆叠（flex-direction: column）

\`\`\`html
${SHELL_SNIPPET}
\`\`\`

## DPR 感知画布

\`\`\`javascript
${DPR_SNIPPET}
\`\`\`

## RAF 主循环（update / draw 分离）

\`\`\`javascript
${RAF_SNIPPET}
\`\`\`

## 控件模式

- 每个 range 滑条：label + \`input[type=range]\` + 数值显示（双向同步）
- 主操作：发射/测试按钮（type=button，id 对齐 traceMap）
- 辅助：复位、暂停/继续
- 混淆变量：仅 teach 区文案或弱化样式，勿与主滑条同级强调

## 实时反馈

- 仿真区旁或下方：≥2 个物理量实时读数（速度、位移、能量等）
- Observe 区：测试/发射后显示判定结果，支持再调 retry
- 过关态：明确文案 + \`emit('snapshot', …)\` + \`emit('win', …)\`

## Agent 生成约束（相对拾光的差异）

- **单文件 HTML**：内联 CSS/JS，禁止外部 CDN（拾光用 tailwind CDN，Agent 不可用）
- **trace 埋点**：保留 \`<!-- trace-adapter-hook -->\`
- **运动类**：必须 RAF + dt 限幅，禁止调参即过关（须可见轨迹/读数变化）

## 参考实验路径

| 类型 | 路径 |
|------|------|
| 标准 engine 壳 | \`senior/mechanics/atwood/index.html\` |
| 抛体 | \`senior/mechanics/projectile/index.html\` |
| 碰撞 | \`senior/mechanics/momentum/index.html\` |
`;

  fs.writeFileSync(OUT, md, 'utf8');
  console.log(`extract-shiguang-patterns: wrote ${OUT}`);
}

main();
