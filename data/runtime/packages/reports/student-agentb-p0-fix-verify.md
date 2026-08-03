# P0 修复验收（相对 full-playtest No-Go）

生成时间：2026-08-03  
对照基线：`student-agentb-full-playtest-report.md`（虚拟验收 69/82，结论 No-Go）

## 1. 修复摘要

### P0-1 Agent B 误表扬 CV 重度
- `metricCvTouchStats` + `metrics.cvHeavy`：竞赛段无关拧动占比高时标记。
- `singleVariableRate`：CV 重度时压低（S3 典型 sv≈0.06，不再等于 1）。
- `guessStrategyRoute`：CV 重度不加主路径分，偏向试探旁路。
- `ruleJudge` / `applyCvHeavyPolicy`：禁止「符合控制变量途径」类 strengths，补 gaps「试探旁路/拧无关量」。
- 回归：`tests/regression/suites/parts/judge-cv-heavy.js`（已挂入 contract）。

### P0-2 学生目录 / 局内剧透
- `data/runtime/platform/catalog.json`：去掉公式与「混淆/不影响」预告（10 条 description）。
- `catalog-badges.js`：`混淆` → `多控件`。
- `photoelectric` 局内画布文案去掉 `hf≤W` 预告；样本 html 已同步。
- 过关后公式（craft-win / veil-win）保留。

### P0-3 rc-circuit legacyTypes
- `trace-normalize`：`win` / `snapshot` / `action` / `phase_change` 等不可被 legacyTypes 改写。
- `rc-circuit/chapter.json` 删除 snapshot/win→tuning；`projectile-cannon` 删除 action→tuning。
- 图谱 html（packages + 样本html）已同步。

## 2. 验证分数（虚拟 rule，全量 23 包）

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 验收单元 | 69/82 | **81/82** |
| S1 win→pass | 22/23（rc 失败） | **23/23** |
| S3 CV 重度 | 11 包失败（sv=1 + 表扬） | **13/13 通过**（sv≈0.06，无主推表扬） |
| S4 未完成 | 全过 | 全过 |
| agent-b-virtual | 25/25 | **25/25**（两轮） |

唯一残留失败：**capacitor-era-ch4 / S2**（仅 1 个 AV，多参陷阱不可构造）——原报告 P1，非本轮 P0。

### 抽样对照
| 包 | S1 | S2 | S3 | S4 |
|----|----|----|----|----|
| projectile-basic | pass/sv=1 | pass/sv=0.57 | in_progress/sv=0.06 ✓ | in_progress |
| rc-circuit | **pass**/sv=1 | pass/sv=0.57 | skip | in_progress |
| multi-kp | pass/sv=1 | pass/sv=0.57 | in_progress/sv=0.06 ✓ | in_progress |
| capacitor-era-ch4 | pass/sv=1 | ✗（P1 仅 1 AV） | in_progress/sv=0.06 ✓ | in_progress |

## 3. 状态建议

**由 No-Go → 条件 Go（小范围试点）**

可优先开放清洁包：`series-parallel`、`circular-motion`、`thin-lens-implicit`、`projectile-basic`、`rc-circuit`（legacy 已修）。

仍非全面 Go：
- capacitor-era-ch4 单 AV 的 S2 伪失败
- FixedChallenge 严公差导致真实浏览器通关难（原 P1）
- 部分局内 teach/注释仍含「混淆」字样（学生主路径已去剧透；教师章内可保留）

## 4. 相关产物
- `student-agentb-full-eval.{json,md}`（本轮重跑）
- `agent-b-virtual-trace-eval.{json,md}`
- 本文件：`student-agentb-p0-fix-verify.md`
