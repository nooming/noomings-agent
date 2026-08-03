# 全量学生试玩 + Agent B 评判报告

生成时间：2026-08-03T09:39:44.584Z

评判模式：**rule**（虚拟/注入轨迹）+ 教师端抽样 **llm**（环境有 DEEPSEEK_API_KEY）。

## 1. 覆盖矩阵

| 包 | AV/CV | V脚本 | R冒烟 | S1 | S2 | S3 | S4 | 剧透 | 深度 |
|----|-------|-------|-------|----|----|----|----|------|------|
| projectile-basic | 3/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | ok | 深 |
| pendulum-clock | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | P0 | 深 |
| pendulum-target | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | ok | 浅 |
| projectile-cannon | 5/2 | ✓ | ✓ | ✓:pass/sv=0.57 | ✓:pass/sv=0.55 | ✓:in_progress/sv=0.57 | ✓:in_progress/sv=0.67 | ok | 浅 |
| capacitor-era-ch1 | 2/2 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✓:in_progress/sv=1 | ✓:in_progress/sv=1 | P0 | 浅 |
| capacitor-era-ch2 | 4/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | P0 | 浅 |
| capacitor-era-ch4 | 1/1 | ✓ | ✓ | ✓:pass/sv=1 | ✗:pass/sv=1 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | P0 | 浅 |
| photoelectric | 3/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | P0 | 浅 |
| gas-ideal | 3/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | P0 | 浅 |
| transformer-turns | 4/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | ok | 浅 |
| magnetic-force | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | ok | 深 |
| momentum-collision | 5/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | ok | 浅 |
| circular-motion | 3/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | ok | 浅 |
| refraction-snell | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | ok | 深 |
| thin-lens-implicit | 3/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | ok | 深 |
| rc-circuit | 3/0 | ✓ | ✓ | ✗:in_progress/sv=0.63 | ✓:in_progress/sv=0.58 | skip | ✓:in_progress/sv=0.67 | P0 | 深 |
| heat-conduction | 3/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | ok | 浅 |
| series-parallel | 3/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | ok | 深 |
| capacitor-confound-ui | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | P0 | 深 |
| multi-kp | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | P0 | 深 |
| cyclotron-radius | 3/0 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | skip | ✓:in_progress/sv=1 | ok | 浅 |
| efield-charge | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | ok | 深 |
| friction-incline | 2/1 | ✓ | ✓ | ✓:pass/sv=1 | ✓:pass/sv=0.57 | ✗:in_progress/sv=1 | ✓:in_progress/sv=1 | ok | 浅 |

虚拟验收：69/82（S3 无 CV 的包已 skip）

### UX 快评（0–2，节选）

| 包 | 目标 | 无剧透 | CV诚实 | 反馈 | 可过 | 图谱 | 埋点 |
|----|------|--------|--------|------|------|------|------|
| projectile-basic | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| pendulum-clock | 2 | 0 | 0 | 2 | 1 | 2 | 2 |
| pendulum-target | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| projectile-cannon | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| capacitor-era-ch1 | 2 | 0 | 1 | 2 | 1 | 2 | 2 |
| capacitor-era-ch2 | 2 | 0 | 1 | 2 | 1 | 2 | 2 |
| capacitor-era-ch4 | 2 | 0 | 1 | 2 | 1 | 2 | 2 |
| photoelectric | 2 | 0 | 1 | 2 | 1 | 2 | 2 |
| gas-ideal | 2 | 0 | 1 | 2 | 1 | 2 | 2 |
| transformer-turns | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| magnetic-force | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| momentum-collision | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| circular-motion | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| refraction-snell | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| thin-lens-implicit | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| rc-circuit | 2 | 0 | 1 | 2 | 1 | 2 | 2 |
| heat-conduction | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| series-parallel | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| capacitor-confound-ui | 2 | 0 | 0 | 2 | 1 | 2 | 2 |
| multi-kp | 2 | 0 | 1 | 2 | 1 | 2 | 2 |
| cyclotron-radius | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| efield-charge | 2 | 2 | 1 | 2 | 1 | 2 | 2 |
| friction-incline | 2 | 2 | 1 | 2 | 1 | 2 | 2 |

## 2. P0 / P1 / P2

### P0
- **Agent B · S3 CV 重度仍表扬单变量**：CV 在 traceMap 为 `irrelevant`，不计入 `singleVariableRate`，svRate=1 且 strengths 含「符合控制变量途径」；gaps 同时写「操作了永久无关控件」。含 CV 包几乎全中。
- **学生目录剧透**：multi-kp（mgh/½mv²）、rc-circuit（τ=RC）、capacitor-era-ch4（E=½CV²）、pendulum-clock（不进入周期公式）、gas-ideal（pV）、photoelectric（hf>W）等。
- **rc-circuit · legacyTypes**：`snapshot`/`win`→`tuning`，有 win 仍判 `in_progress`。

### P1
- **projectile-cannon · legacyTypes**：`action→tuning`，干扰 svRate。
- **capacitor-era-ch4 仅 1 个 AV**：S2 多参陷阱不可构造（伪失败）。
- **CV 诚实**：目录/文案点明「混淆/不影响」破坏探究。
- **教师端 judge-session**：默认 LLM，全量可能慢/超时；规则模式需无 Key 或本地 evaluateTraceRules。
- **FixedChallenge 严公差**：pendulum-clock / projectile-basic 等短时难通关 → reachability/timebox miss，非 Agent B 失败。

### P2
- 轨迹计数 flush 偶发延迟。
- 部分目标文案模板化。
- S2 若最终 win，verdict 可为 pass（可接受），但不应表扬单变量。

## 3. Agent B 验收对照

| 场景 | 期望 | 实测摘要 |
|------|------|----------|
| S1 win | pass | 22/23 pass；**rc-circuit 失败** |
| S2 多参 | 低 svRate / trap 倾向 | 多数 sv≈0.57；ch4 例外 |
| S3 CV重 | 不得表扬 primary AV | **大面积失败（11 包）** |
| S4 未完成 | 不得 pass | 全部通过 |
| explore 噪声 | 不主导 | 通过 |

## 4. Go / No-Go

**结论：No-Go（附条件）** — 不宜对全体 23 关直接做真实学生试点。

阻断项：
1. Agent B 对 CV 拧动的误表扬是系统性错误。
2. 学生任务列表公式/混淆剧透破坏探究目标。
3. rc-circuit 等 legacyTypes 导致通关轨迹无法判 pass。

**条件 Go（小范围）**：先修 CV 计量 + 目录去剧透 + legacyTypes，再开放 `series-parallel`、`circular-motion`、`thin-lens-implicit`、`projectile-basic`（改文案后）等清洁包。

## 5. 报告路径

- `data/runtime/packages/reports/student-agentb-full-eval.{json,md}`
- `data/runtime/packages/reports/student-agentb-ingest-rule-judge.json`
- `data/runtime/packages/reports/student-play-smoke-http.json`
- `data/runtime/packages/reports/agent-b-virtual-trace-eval.{json,md}`（5 样本 25/25）
- `data/runtime/packages/reports/student-agentb-full-matrix.json`
- `data/runtime/packages/reports/student-agentb-full-playtest-report.md`（本文件）

## 6. P0 修复后复验（2026-08-03）

详见 [`student-agentb-p0-fix-verify.md`](./student-agentb-p0-fix-verify.md)。

- 虚拟验收 **69/82 → 81/82**；S3 全部不再 sv=1 表扬；rc-circuit S1 → pass。
- 目录剧透文案已中性化；legacyTypes 不再吞 win/snapshot。
- **状态：No-Go → 条件 Go（小范围）**；唯一虚拟残留为 capacitor-era-ch4 单 AV 的 S2（原 P1）。