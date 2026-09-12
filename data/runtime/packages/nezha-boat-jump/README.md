# nezha-boat-jump

哪吒跳船 · 水平动量守恒（3D）：相对起跳船 A 起跳、A 船反冲、抛物线登 B 船。

## 本地打开

- 直接打开：`data/runtime/packages/nezha-boat-jump/game.html`（需同目录 `vendor/` 与 `../_shared/craft-tokens.css`）
- 若项目已启静态服务：`/static/packages/nezha-boat-jump/game.html`

## 模式

- **探究**：可调目标船净空；场景标注水平射程；侧栏不直播动量总和；≥3 次起跳且触达 2 个以上主滑条可 `explore_success`
- **竞赛**：目标间距随机锁定（侧栏不显示）；5 次机会；测前「待测」；落地后给登船/落水 + 水平距离（勿「未入」黑话）；登船 emit `win`

## 滑条顺序

θ → 相对起跳船速度 → m → **甲板摩擦系数 μ (CV)** → 起跳船质量 M → **目标船质量 (CV)** → 净空（仅探究）

混淆项：
- 「甲板摩擦系数 μ」只改甲板色泽与轻微摇曳，不参与动量计算
- 「目标船质量」只缩放 B 船外观，不进动量、飞行与登船判定半宽

## 图谱 / chapter

本包为 **craft:gold**（力学课堂五关）：提供完整 `chapter.json`（inquiryScript + traceMap + strategy），供平台路径摘要与 Agent B 使用。

**不附带** `图谱.html` 可视化页（与热学三关同口径：chapter 驱动评分，图谱页非课堂必需）。勿回退到 `/api/demo/strategy-path-summary`。
