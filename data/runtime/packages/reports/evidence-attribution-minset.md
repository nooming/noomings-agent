# 证据 + 短归因最小集 · 短报

日期：2026-08-08 · 未 commit

## 改动文件

| 区域 | 路径 |
|------|------|
| A1 斜坡 | `data/runtime/packages/ramp-rolling-collision/game.html` → 同步 `样本html/斜坡滚球/game.html` |
| A2 斜抛 | `data/runtime/packages/projectile-basic/game.html` → 同步 `样本html/斜抛/斜抛.html` |
| B 评判 | `packages/judge/judge.js`；回归 `tests/regression/suites/parts/judge-pass-weak-compare.js` + `index.js` |
| C 教师说明 | `docs/advisor/process-assessment-teacher-note.md` |

## 证据行字段（自动生成，学生不手填）

**斜坡** `evidenceSummary` 示例：

- 竞赛：`竞赛证据：主调 初速度×N · 达成高度 H m · 目标 T m · 发射 F 次`
- 探究：`探究证据：本次高度 H m · 主调节 … · 发射 F 次`

归因单选 value：`s-speed` / `s-mass1` / `s-mass2` / `s-angle` / `s-shape` / `mixed` / `unsure`  
点选后 `__emit('snapshot', { attribution, evidenceSummary, winOk: true })`；「再玩一次」需先点选。

**斜抛**：

- 竞赛：`竞赛证据：命中靶心|未命中 · 射程约 R m · 主调 … · 发射 F 次`
- 探究：`探究证据：射程约 R m · 主调节 … · 发射 F 次`

归因：`s-speed` / `s-angle` / `s-height` / `mixed` / `unsure`（不含质量）。

过关卡顺序：证据行 → 归因点选 → 公式/揭示（斜坡：平动+转动与轨温）→ 再玩一次。

## 对照不足启发式（Agent B / 规则）

已 `pass`/`win` 且非 CV 重度时，满足其一则 gaps 插入：

> 过关偏少对照，建议同一变量多测几次再下结论

1. `metrics.avTunings < 2`（有效参几乎没拧就过关）
2. `tunedControls.length >= 3` 且 `singleVariableRate < 0.6`（种类多且无一占优）

不改 CV 重度旁路逻辑；不改 verdict。

## 如何验证

1. 打开斜坡 / 斜抛竞赛过关 → 见证据行 + 归因单选 + 后置公式；未点选时「再玩一次」禁用；点选后可再玩，轨迹可含 attribution。
2. 规则评判：`node -e "require('./tests/regression/suites/parts/judge-pass-weak-compare').run()"` 或跑 contract 组回归。
3. 教师说明：打开 `docs/advisor/process-assessment-teacher-note.md`。
