# 同学 HTML 探究样本交付规格

> 供 5 名同学 + 崔交付约 20 条 HTML 样本时对照自检；验收后由平台负责人写入 `data/runtime/packages/` 并登记 manifest。

## 1. 文件与命名

- 每条样本一个目录：`{topic-id}/game.html`（单文件或多文件均可，但须能独立打开运行）
- `topic-id` 使用英文 kebab-case，如 `projectile-basic`
- 禁止依赖外网 CDN 才能运行（可内联或相对路径）

## 2. 玩法结构（导师三步法对齐）

| 要素 | 要求 |
|------|------|
| 过关目标 | 明确可判定（命中区域、进洞、达标读数等），过关时须触发可采集事件 |
| 调节变量（AV） | ≥1 个滑条/输入，id 稳定（如 `s-speed`），对应物理自变量 |
| 混淆变量（CV） | ≥0 个科学外观、中性标签的无关控件；**勿**在调参前剧透「混淆 / 不改变 / 请调××」；揭示放在测量后反馈或过关总结。优先质量/厚度/温度等可信物理量，避免色调/主题/「玄学」类外观开关 |
| 输出可观察 | 射程、高度、示数等可在界面或 snapshot 中体现 |
| 探索 / 竞赛 | **样本内必达**：左舞台 + 右工作台；侧栏 `#modeSelect`（`explore` / `challenge`）+ HUD（`#modeLabel` / `#timerDisplay` / `#challengeStats`）；切换时调用 `__platformTraceSetPhase` |

结构范本见组员样本「哪吒跳船」与旗舰包 [`projectile-basic`](../../data/runtime/packages/projectile-basic/game.html)。学生端 [`student-play.html`](../../apps/web/ui/pages/student-play.html) **不再**提供阶段切换条，以游戏内切换为准并转发 `phase_change`。Agent B 默认只评价竞赛（`challenge`）段轨迹。

## 3. 轨迹契约（步骤 3 评判）

样本须能被 [`apps/web/ui/trace-adapter-platform.js`](../../apps/web/ui/trace-adapter-platform.js) 采集（学生端会自动注入）：

- 滑条 `input[type=range]` 须有 **唯一 `id`**，变更时上报 `tuning`
- 发射/确认等按钮点击上报 `action`
- 过关时上报 `win`（推荐显式调用）：

```js
if (window.__emit) window.__emit('win', { winOk: true });
// 或
if (window.PlatformTraceAdapter) PlatformTraceAdapter.record('win', { winOk: true });
```

- **探索/竞赛阶段**：样本内 `#modeSelect` 切换时须调用：

```js
if (window.__platformTraceSetPhase) window.__platformTraceSetPhase(mode); // 'explore' | 'challenge'
```

Agent B 默认 **仅统计 challenge 段** 的 tuning/action 用于控制变量策略评价；无 `phase_change` 时退化为全 session。

## 4. 物理与 UI

- 布局：**左舞台（canvas/仿真）+ 右侧工作台（滑条与主操作）**；移动端可上下堆叠
- 核心更新循环（`requestAnimationFrame` 或等价）与过关判定函数保持在 `game.html` 内可读
- 过关文案、控件 label 使用中文，与教案一致
- 勿插入与平台冲突的重复操作提示（平台会自动 strip legacy hint）

### 4.1 混淆变量（CV）呈现

- **外观**：CV 控件看起来像正经物理量（质量、厚度、温度等），标签中性；禁止「（混淆）」「玄学参数」「仅示意·不影响…」等预告式文案出现在滑条旁
- **发现路径**：学生通过测量对比或过关/复盘总结自行发现「与××无关」；intro / 工作台旁注不得剧透
- **过关计算**：CV **不得**进入 win / 达标判定公式（可改视觉厚度、阴影、炮弹颜色等）
- **图谱**：StrategySelect 旁路边标签用「试探·{量名}」，避免「试探混淆」字样直接面向学生图例

## 5. 精致度（精品门禁）

轨迹契约只保证「能评」；**精品上架**还须达到探究体验工艺水准。

- **金标准 / 参考实现**：[`pendulum-clock/game.html`](../../data/runtime/packages/pendulum-clock/game.html)（钟表铺·校时）
- **验收表**：[`sample-craft-rubric.md`](sample-craft-rubric.md)（主题视觉、intro/win、目标仪表、可验证 CV 等）
- 达不到必达项：可交底稿（manifest 标 `craft:draft`），**不**标 `craft:gold` / featured
- 不要求抄「钟表铺」题材，要求同等级工艺结构（色板、引导、仪表、总结）

## 6. 交付清单

- [ ] `game.html` 本地双击或 `/static/packages/{id}/game.html` 可玩
- [ ] 至少 2 个 AV 滑条 + 过关条件（精品）；底稿可 ≥1
- [ ] 滑条 id 与 label 一一对应
- [ ] 过关可触发 win 轨迹（`__emit('win')` 或等价）
- [ ] 无外网硬依赖（字体/脚本 CDN）
- [ ] 简短 README 或 manifest 条目：知识点一句话、混淆变量说明
- [ ] （精品）对照 [sample-craft-rubric.md](sample-craft-rubric.md) 必达全勾
- [ ] 游戏内探究/竞赛：`#modeSelect` + HUD + `__platformTraceSetPhase`；竞赛限次（如剩余机会）

## 7. 验收流程

1. 同学 PR / 提交 zip
2. 负责人在学生端试玩：切换探索/竞赛，确认轨迹含 `phase_change`，过关后教师端见 win + 参数次数
3. 精品：再过精致度表；底稿可先入库 `craft:draft`
4. Agent A **分析源码** 生成 `chapter.json`，与 expert 图谱对比（F1 / priority ρ）
5. 写入 `data/runtime/packages/{id}/` 并更新 `manifest.json`
6. 可选上架 catalog；仅 `craft:gold` 建议 featured
