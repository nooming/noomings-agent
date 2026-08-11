# 能力总分 v2 · 抽样校准表

生成时间：2026-08-10T20:31:29.022Z
轨迹根：`C:\Users\20844\Desktop\myweb-re\agent\data\runtime\platform\traces`
本趟回填：更新 0 · 跳过 211 · 失败 0 · 扫描 211（跳过=version+inputsHash 未变）
分布基于磁盘上 211 条会话的 abilityScore（含本趟跳过未改写者）。
公式版本：本报告快照为 abilityScore.version=2；**现行 v3**（固定权重、Pe 占 25、无 renorm）见 `ability-score-v3-explore-fixed.md` · 权重 R 30 / Pe 25 / Pc 25 / E 20 · 归因对齐 +5 · 仅教师侧

## 1. 总体分布

| 指标 | 值 |
|------|-----|
| 会话数 n | 211 |
| 有总分 | 118（55.9%） |
| total=null | 93（44.1%） |
| mean | 74.2 |
| median | 66.5 |
| p25 | 60 |
| p75 | 92 |

### 直方图

| 桶 | 人数 | 占比 |
|----|------|------|
| null/待评 | 93 | 44.1% |
| 0–49 | 7 | 3.3% |
| 50–59 | 5 | 2.4% |
| 60–69 | 48 | 22.7% |
| 70–79 | 0 | 0% |
| 80–89 | 4 | 1.9% |
| 90–100 | 54 | 25.6% |

## 2. 按 package / graph（Top）

| packageId | n | null | mean(有分) |
|-----------|---|------|------------|
| `capacitor-era-ch2` | 12 | 8 | 76 |
| `projectile-basic` | 12 | 8 | 76 |
| `capacitor-era-ch1` | 11 | 4 | 65.9 |
| `multi-kp` | 11 | 6 | 68.6 |
| `friction-incline` | 10 | 5 | 80.8 |
| `magnetic-force` | 10 | 5 | 78.6 |
| `pendulum-clock` | 10 | 5 | 80.8 |
| `refraction-snell` | 10 | 5 | 79.8 |
| `transformer-turns` | 10 | 2 | 70.8 |
| `capacitor-confound-ui` | 9 | 5 | 76 |
| `capacitor-era-ch4` | 9 | 5 | 92 |
| `efield-charge` | 9 | 4 | 73.4 |
| `pendulum-target` | 9 | 5 | 76 |
| `projectile-cannon` | 9 | 0 | 44.6 |
| `gas-ideal` | 8 | 2 | 79.8 |

### projectile-cannon 快照

| n | mean(有分) | R 列表 | levels 注记 |
|---|------------|--------|-------------|
| 9 | 44.6 | 25, 25, 0, 0, 25, 25, 0, 0, 25 | 1/4; 1/4; 0/4; 0/4; 1/4; 1/4; 0/4; 0/4; 1/4 |

## 3. 分层抽样表

共 30 行（高/中/低/null · 一发过 gate 真假 · 多关部分 R）。

| 分层 | session | package | studentLabel | total | R | Pe | Pc | E | attr | processBand | result/verdict | trials | gate | 策略摘要 | win |
|------|---------|---------|--------------|-------|---|----|----|---|------|-------------|----------------|--------|------|----------|-----|
| 高分≥85 | `sess-1785749…733zc1` | `capacitor-confound-ui` | full-eval-S1_pure_high_av_win | 92 | 100 | — | 100 | 70 | 0 | 清楚 | 达标/pass | 4 | true | Pc:单变量·极板间距 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1785749…nz5rdc` | `capacitor-confound-ui` | playtest-S1 | 92 | 100 | — | 100 | 70 | 0 | 清楚 | 达标 | 4 | true | Pc:单变量·极板间距 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1785749…wbmrgu` | `capacitor-era-ch1` | full-eval-S1_pure_high_av_win | 92 | 100 | — | 100 | 70 | 0 | 清楚 | 达标/pass | 4 | true | Pc:单变量·极板间距 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1785749…67x74i` | `capacitor-era-ch1` | playtest-S1 | 92 | 100 | — | 100 | 70 | 0 | 清楚 | 达标 | 4 | true | Pc:单变量·极板间距 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1785749…r3klmu` | `capacitor-era-ch2` | full-eval-S1_pure_high_av_win | 92 | 100 | — | 100 | 70 | 0 | 清楚 | 达标/pass | 4 | true | Pc:单变量·电容C1 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1785749…6m9zpk` | `capacitor-era-ch2` | playtest-S1 | 92 | 100 | — | 100 | 70 | 0 | 清楚 | 达标 | 4 | true | Pc:单变量·电容C1 · 竞赛·单变量 | Y |
| 中分60–84 | `sess-1785749…8z44mk` | `capacitor-confound-ui` | full-eval-S2_multi_param_trap | 60 | 100 | — | 20 | 50 | 0 | 尚不清晰 | 达标/pass | 4 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 中分60–84 | `sess-1785749…mikp89` | `capacitor-confound-ui` | playtest-S2 | 60 | 100 | — | 20 | 50 | 0 | 尚不清晰 | 达标 | 4 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 中分60–84 | `sess-1785749…1ehanr` | `capacitor-era-ch1` | full-eval-S2_multi_param_trap | 60 | 100 | — | 20 | 50 | 0 | 尚不清晰 | 达标/pass | 4 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 中分60–84 | `sess-1785749…zglo1l` | `capacitor-era-ch1` | full-eval-S4_incomplete | 64 | 20 | — | 100 | 85 | 0 | 清楚 | 未达标/learning | 2 | true | Pc:单变量·极板间距 · 竞赛·单变量 | N |
| 中分60–84 | `sess-1785749…issu1f` | `capacitor-era-ch1` | playtest-S2 | 60 | 100 | — | 20 | 50 | 0 | 尚不清晰 | 达标 | 4 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 中分60–84 | `sess-1785749…9delw6` | `capacitor-era-ch2` | full-eval-S2_multi_param_trap | 60 | 100 | — | 20 | 50 | 0 | 尚不清晰 | 达标/pass | 4 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 低分<60 | `sess-1785749…0peox0` | `capacitor-era-ch1` | full-eval-S3_cv_heavy | 40 | 20 | — | 55 | 50 | 0 | 尚不清晰 | 未达标/learning | 4 | false | Pc:单变量·极板间距 · 竞赛·单变量 | N |
| 低分<60 | `sess-1786389…mqfgeb` | `capacitor-era-ch1` | 李四 | 53 | 100 | — | 20 | 25 | 0 | 尚不清晰 | 达标 | 1 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 低分<60 | `sess-1785749…gxuohz` | `multi-kp` | 全量试玩 | 39 | 20 | 91 | 20 | 25 | 0 | 尚不清晰 | 未达标/learning | 1 | false | Pe:单变量·起始高度 · Pc:多参盲调 · 探究·单变量 · 竞赛·混调 | N |
| 低分<60 | `sess-1785749…ztlmlf` | `projectile-cannon` | full-eval-S2_multi_param_trap | 30 | 25 | — | 20 | 50 | 0 | 尚不清晰 | 达标/pass/1/4 | 4 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 低分<60 | `sess-1785749…1qbg0r` | `projectile-cannon` | full-eval-S3_cv_heavy | 32 | 0 | — | 55 | 50 | 0 | 尚不清晰 | 未达标/learning/0/4 | 4 | false | Pc:单变量·初速度 · 竞赛·单变量 | N |
| null/待评 | `sess-1785749…58927e` | `capacitor-confound-ui` | full-eval-S3_cv_heavy | — | — | — | 55 | 50 | 0 | 未评估 | 待评/in_progress | 4 | false | Pc:单变量·极板间距 · 竞赛·单变量 | N |
| null/待评 | `sess-1785749…0ld0me` | `capacitor-confound-ui` | full-eval-S4_incomplete | — | — | — | 100 | 85 | 0 | 未评估 | 待评/in_progress | 2 | true | Pc:单变量·极板间距 · 竞赛·单变量 | N |
| null/待评 | `sess-1785749…n48bq8` | `capacitor-confound-ui` | playtest-S3 | — | — | — | 55 | 50 | 0 | 未评估 | 待评 | 4 | false | Pc:单变量·极板间距 · 竞赛·单变量 | N |
| null/待评 | `sess-1785749…iu4f5s` | `capacitor-confound-ui` | playtest-S4 | — | — | — | 100 | 85 | 0 | 未评估 | 待评 | 2 | true | Pc:单变量·极板间距 · 竞赛·单变量 | N |
| 一发过·gate真 | `sess-1786391…ai2fop` | `pendulum-clock` | 李四 | 100 | 100 | — | 100 | 100 | 0 | 部分清楚 | 达标 | 1 | true | Pc:单变量·摆长 · 竞赛·单变量 | Y |
| 一发过·gate真 | `sess-1786391…6k1ctz` | `photoelectric` | 李四 | 100 | 100 | 100 | 100 | 100 | 5 | 清楚 | 达标 | 1 | true | Pe:单变量·频率 · Pc:单变量·频率 · 探究·单变量 · 竞赛·单变量 | Y |
| 一发过·gate真 | `sess-1786174…j8h7cy` | `ramp-rolling-collision` | 李四 | 93 | 100 | — | 78 | 100 | 0 | 部分清楚 | 达标/pass | 1 | true | Pc:单变量·靶球质量 · 竞赛·单变量 | Y |
| 一发过·gate假 | `sess-1786390…eqhe24` | `transformer-turns` | 李四 | 53 | 100 | — | 20 | 25 | 0 | 尚不清晰 | 达标 | 1 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 一发过·gate假 | `sess-1786391…85m7ca` | `transformer-turns` | 李四 | 53 | 100 | — | 20 | 25 | 0 | 尚不清晰 | 达标 | 1 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 多关部分R | `sess-1785749…aradgo` | `projectile-cannon` | full-eval-S1_pure_high_av_win | 62 | 25 | — | 100 | 70 | 0 | 清楚 | 达标/pass/1/4 | 4 | true | Pc:单变量·初速度 · 竞赛·单变量 | Y |
| 多关部分R | `sess-1785749…x18a47` | `projectile-cannon` | playtest-S1 | 62 | 25 | — | 100 | 70 | 0 | 清楚 | 待评/1/4 | 4 | true | Pc:单变量·初速度 · 竞赛·单变量 | Y |
| 多关部分R | `sess-1785749…9h0m9p` | `projectile-cannon` | playtest-S2 | 30 | 25 | — | 20 | 50 | 0 | 尚不清晰 | 待评/1/4 | 4 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 多关部分R | `sess-1786391…nypz09` | `projectile-cannon` | 李四 | 41 | 25 | — | 53.3 | 50 | 0 | 部分清楚 | 待评/1/4 | 4 | false | Pc:单变量·风速 · 竞赛·单变量 | Y |

## 4. 看点（定性）

- **幸运一发**（过关 + trials==1 + gate 假且 Pc/E 偏低）：**3** 例。
  - 例：`sess-1786389…mqfgeb`(capacitor-era-ch1, Pc=20, E=25)；`sess-1786390…eqhe24`(transformer-turns, Pc=20, E=25)；`sess-1786391…85m7ca`(transformer-turns, Pc=20, E=25)
- **扎实一发**（过关 + trials==1 + gate 真且 Pc/E 较高）：**3** 例。
  - 例：`sess-1786174…j8h7cy`(ramp-rolling-collision, total=93)；`sess-1786391…ai2fop`(pendulum-clock, total=100)；`sess-1786391…6k1ctz`(photoelectric, total=100)
- **缺 phase_change**（整局进 Pe、Pc=null）：约 **0** 条有分会话；renorm 会抬高 Pe/R 权重，对照时注意勿当「竞赛过程」。
- **多关部分 R**：5 条（0 < cleared < total）；任意多关标记 **9** 条。
- **Pe 空 renorm**：探究 effectiveTrials=0 时 Pe→null（不再记 0）；本批有分且 Pe=null、Pc 有值约 **108** 条。
- **Pe-null 过程档**：清楚 **54** / 部分清楚 **4**（v2：Pe-null 且竞赛试次<2 不得标清楚；本批此类残留清楚 **0**）。
- **权重建议**：权重 30/25/25/20 在本批上**暂可沿用**（未见明显全员贴顶或贴底）。

## 5. 复跑

```bash
node tests/scripts/backfill-ability-score.js --report --human-report
node tests/scripts/backfill-ability-score.js --force --report --human-report
node tests/scripts/backfill-ability-score.js --package projectile-cannon --limit 10
```

