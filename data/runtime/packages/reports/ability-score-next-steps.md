# 能力分校准 · 下下步执行短报

生成时间：2026-08-11  
公式版本：曾为 `ABILITY_SCORE_VERSION = 2`；**现行见 v3** → `ability-score-v3-explore-fixed.md`（固定权重、Pe 占 25、无 renorm）  
回填：全量 **211** 更新 / 0 跳过 / 0 失败  
人样 mean（有分 n=19）：**77.4**（v1 曾约 78.2）

## 1–6 状态

| # | 项 | 状态 | 说明 |
|---|----|------|------|
| 1 | Trace 旗标落盘 | **done** | adapter/ingest 禁止剥离；大炮 emit 增 `levelsCleared`/`level`；TRACE_HOOK 同步绑定 `__emit` |
| 2 | 合成多关夹具 | **done** | full-eval / playtest-ingest 对 cannon 的 S1/S2 win 带 `final:true` + `levelsCleared:4` |
| 3 | 非李四人样 | **blocked** | 不可发明课堂数据；见下 |
| 4 | Pe-null 过程档 | **done** | 收紧：Pe-null 且竞赛试次&lt;2 → 最多「部分清楚」 |
| 5 | judge 写 abilityScore | **done** | `judge-session` 落盘时计算并写入；教师懒算仍保留 |
| 6 | v2 轻量调分 | **done** | 幸运一发 E≤25、总分≤62；多关无 win → R=0；version→2 |

## Trace 字段（before / after）

**Before（李四大炮 `…inypz09`，历史会话）**

- `snapshot`: `{ controls, winOk, hintKey }` — **无** interim/final/levelsCleared  
- `win`: `{ winOk: true }`  
- 评分侧靠 legacy win 计数 → R=25（1/4）

**After（代码路径）**

- 大炮 emit：`winOk` + `interim`/`final` + `level` + `levelsCleared` + `levelsTotal`  
- `PlatformTraceAdapter.record` / `ingestTrace`：浅拷贝全量 payload，无 allowlist 剥离  
- TRACE_HOOK：同步挂 `__emit`，避免 DOMContentLoaded 竞态丢钩子  
- 回归：`trace-win-progress-persist` 验证 ingest 后磁盘仍含上述字段  
- 旧轨迹不会自动回填旗标；需新对局或重跑合成 ingest

## 过程档 / 版本

- **v2**：幸运一发更严；Pe-null「清楚」需竞赛有效试次≥2  
- 人样证据：`pendulum-clock` / ramp 一发 Pe-null 由「清楚」→「部分清楚」；多试次 Pe-null 仍可「清楚」  
- 权重 30/25/25/20 **未改**

## 人样扩大（blocked）

| studentLabel | n | 有总分 | mean |
|--------------|---|--------|------|
| 李四 | 40 | 18 | 79.6 |
| 全量试玩 | 7 | 1 | 39 |

非「李四」合计 **7/47**，且「全量试玩」偏试玩标签，**不能**当课堂多样本。  
建议：课堂登录用真实学号/姓名标签再采 20+ 会话后再动权重。

## 仍待跟进

1. 课堂采集非李四标签（主阻塞）  
2. 大炮真人复测：确认新 win payload 进盘  
3. 可选：重跑 full-eval/playtest ingest，刷新旧合成 cannon 的 1/4 R  
4. 人样多样后再评估权重  
5. **UI 版本跟踪**：教师页 `ABILITY_SCORE_VERSION` 必须与 scorer 同号（曾卡在 1 导致 v2 分显示「—」）；path-summary 已回传 `abilityScoreVersion` 作兜底  
6. **v3 探究固定块**：取消 renorm；Pe 缺则 +0/25；见 `ability-score-v3-explore-fixed.md`

## 测试

- `ability-score`：OK（A=100, B=100, C=62 capped, D=94, E=55, F=null, G=86）  
- `trace-win-progress-persist`：OK  
- 未 commit

## 主要改动文件

- `packages/judge/ability-score.js`（v2）  
- `packages/platform/trace-win-fields.js`（新）  
- `packages/platform/trace-store.js` / `legacy-trace-inject.js`  
- `apps/web/ui/trace-adapter-platform.js`  
- `apps/server/api.js`（judge 写分）  
- `data/runtime/packages/projectile-cannon/game.html` + 样本 HTML  
- `tests/scripts/student-agentb-full-eval.js` / `student-agentb-ingest-rule-judge.js`  
- `tests/scripts/backfill-ability-score.js`（--human-report 按 label）  
- `tests/regression/suites/parts/ability-score.js` / `trace-win-progress-persist.js`  
- 报告：`ability-score-calibration*.md`、本文件  
