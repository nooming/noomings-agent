# pulley-rigid

滑轮·刚体转动：定滑轮阿特伍德示意，滑轮转动惯量 \(I\) 进入 \(a=(m_1-m_2)g/(m_1+m_2+I/R^2)\)（\(a\) 为左侧 \(m_1\) 向下加速度），强调 \(a=R\alpha\)。探究对照读数，竞赛打进本局锁定的 \(|\alpha|\) 带（并显示对应 \(a\)）。

## 运行

在仓库根目录用任意静态服务器打开，例如：

```bash
npx serve data/runtime/packages/pulley-rigid
```

浏览器访问 `game.html`（或经平台 iframe 加载同路径）。

## 滑条顺序

左侧质量 → 右侧质量 → **绳子粗细（CV，仅视觉；2.0–4.0 mm 细绳近似区间）** → 滑轮质量 → 滑轮形状（实心盘 / 圆环）。

在此窄带内模型取理想细绳 + 固定槽半径 \(R\)，粗细不进入 \(a/\alpha\)；故为混淆量。

## 模式

- **探究**：释放后显示线加速度 \(a\) 与角加速度 \(\alpha\)；多次对照可触发 `explore_success`。
- **竞赛**：进入时锁定目标 \(|\alpha|\) 带；测前「待测」；测后给出 \(|\alpha|\)、\(a\)（m₁ 向下）数值 + 偏低/偏高/已落入。

## 图谱 / chapter

本包为 **craft:gold**（力学课堂五关）：完整 `chapter.json`（inquiryScript + traceMap + strategy）已对齐控件 id，路径摘要走 `/api/platform/strategy-path-summary`。

同目录附带 Strategy-first `图谱.html`（读本地 `chapter.json`，vendor 为 `../vendor/`）。
