# 能力总分 v2 · 真人抽样校准表

生成时间：2026-08-10T20:31:29.026Z
轨迹根：`C:\Users\20844\Desktop\myweb-re\agent\data\runtime\platform\traces`
过滤：排除合成学号 `full-eval-*` / `playtest-S*` / `synth-*`（保留如「李四」等真人标签）。
回填仍覆盖全量 traces；本表仅统计过滤后子集。
本趟回填：更新 0 · 跳过 211 · 失败 0 · 扫描 211（跳过=version+inputsHash 未变）
分布基于磁盘上 47 条会话的 abilityScore（含本趟跳过未改写者）。
公式版本：abilityScore.version=2 · 权重 R 30 / Pe 25 / Pc 25 / E 20 · 归因对齐 +5 · 仅教师侧

## 1. 总体分布

| 指标 | 值 |
|------|-----|
| 会话数 n | 47 |
| 有总分 | 19（40.4%） |
| total=null | 28（59.6%） |
| mean | 77.4 |
| median | 87 |
| p25 | 58 |
| p75 | 92 |

### 按 studentLabel

| studentLabel | n | 有总分 | mean(有分) |
|--------------|---|--------|------------|
| 李四 | 40 | 18 | 79.6 |
| 全量试玩 | 7 | 1 | 39 |

非「李四」课堂标签会话合计：**7** / 47（扩大人样需另行采集，不可合成）。

### 直方图

| 桶 | 人数 | 占比 |
|----|------|------|
| null/待评 | 28 | 59.6% |
| 0–49 | 2 | 4.3% |
| 50–59 | 3 | 6.4% |
| 60–69 | 2 | 4.3% |
| 70–79 | 0 | 0% |
| 80–89 | 4 | 8.5% |
| 90–100 | 8 | 17% |

## 2. 按 package / graph（Top）

| packageId | n | null | mean(有分) |
|-----------|---|------|------------|
| `ramp-rolling-collision` | 6 | 2 | 88.5 |
| `projectile-basic` | 4 | 4 | — |
| `capacitor-era-ch2` | 4 | 4 | — |
| `transformer-turns` | 4 | 0 | 65.5 |
| `multi-kp` | 3 | 2 | 39 |
| `capacitor-era-ch1` | 3 | 2 | 53 |
| `refraction-snell` | 2 | 1 | 95 |
| `pendulum-clock` | 2 | 1 | 100 |
| `magnetic-force` | 2 | 1 | 89 |
| `gas-ideal` | 2 | 0 | 87.5 |
| `momentum-collision` | 2 | 2 | — |
| `friction-incline` | 2 | 1 | 100 |
| `series-parallel` | 1 | 1 | — |
| `capacitor-confound-ui` | 1 | 1 | — |
| `rc-circuit` | 1 | 1 | — |

### projectile-cannon 快照

| n | mean(有分) | R 列表 | levels 注记 |
|---|------------|--------|-------------|
| 1 | 41 | 25 | 1/4 |

## 3. 分层抽样表

共 28 行（高/中/低/null · 一发过 gate 真假 · 多关部分 R）。

| 分层 | session | package | studentLabel | total | R | Pe | Pc | E | attr | processBand | result/verdict | trials | gate | 策略摘要 | win |
|------|---------|---------|--------------|-------|---|----|----|---|------|-------------|----------------|--------|------|----------|-----|
| 高分≥85 | `sess-1786390…3xhn44` | `friction-incline` | 李四 | 100 | 100 | 91 | 100 | 85 | 5 | 清楚 | 达标 | 3 | true | Pe:单变量·摩擦系数 · Pc:单变量·斜面倾角 · 探究·单变量 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1786389…2yoz24` | `gas-ideal` | 李四 | 91 | 100 | 86.5 | 100 | 70 | 0 | 清楚 | 达标 | 4 | true | Pe:单变量·压强 · Pc:单变量·压强 · 探究·单变量 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1786389…g5ku15` | `magnetic-force` | 李四 | 89 | 100 | 91 | 89.8 | 70 | 0 | 清楚 | 达标 | 4 | true | Pe:单变量·磁场 · Pc:单变量·磁场 · 探究·单变量 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1786391…ai2fop` | `pendulum-clock` | 李四 | 100 | 100 | — | 100 | 100 | 0 | 部分清楚 | 达标 | 1 | true | Pc:单变量·摆长 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1786391…6k1ctz` | `photoelectric` | 李四 | 100 | 100 | 100 | 100 | 100 | 5 | 清楚 | 达标 | 1 | true | Pe:单变量·频率 · Pc:单变量·频率 · 探究·单变量 · 竞赛·单变量 | Y |
| 高分≥85 | `sess-1786173…7b3hkc` | `ramp-rolling-collision` | 李四 | 90 | 100 | — | 78 | 70 | 5 | 清楚 | 达标/pass | 4 | true | Pc:单变量·靶球质量 · 竞赛·单变量 | Y |
| 中分60–84 | `sess-1786389…xro9dc` | `efield-charge` | 李四 | 63 | 100 | 100 | 0 | 40 | 0 | 尚不清晰 | 达标 | 0 | false | Pe:单变量·场强 · 探究·单变量 | Y |
| 中分60–84 | `sess-1786389…yia4op` | `gas-ideal` | 李四 | 84 | 100 | 69.3 | 88.7 | 70 | 0 | 部分清楚 | 达标 | 6 | true | Pe:单变量·压强 · Pc:单变量·压强 · 探究·单变量 · 竞赛·单变量 | Y |
| 中分60–84 | `sess-1786173…ydfrls` | `ramp-rolling-collision` | 李四 | 81 | 100 | 59.8 | 78 | 85 | 0 | 部分清楚 | 达标/pass | 3 | true | Pe:单变量·斜坡倾角 · Pc:单变量·靶球质量 · 探究·单变量 · 竞赛·单变量 | Y |
| 中分60–84 | `sess-1786390…gfw6d9` | `transformer-turns` | 李四 | 69 | 100 | — | 51.6 | 45 | 0 | 部分清楚 | 达标 | 2 | false | Pc:单变量·副边匝数 · 竞赛·单变量 | Y |
| 低分<60 | `sess-1786389…mqfgeb` | `capacitor-era-ch1` | 李四 | 53 | 100 | — | 20 | 25 | 0 | 尚不清晰 | 达标 | 1 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 低分<60 | `sess-1785749…gxuohz` | `multi-kp` | 全量试玩 | 39 | 20 | 91 | 20 | 25 | 0 | 尚不清晰 | 未达标/learning | 1 | false | Pe:单变量·起始高度 · Pc:多参盲调 · 探究·单变量 · 竞赛·混调 | N |
| 低分<60 | `sess-1786391…nypz09` | `projectile-cannon` | 李四 | 41 | 25 | — | 53.3 | 50 | 0 | 部分清楚 | 待评/1/4 | 4 | false | Pc:单变量·风速 · 竞赛·单变量 | Y |
| 低分<60 | `sess-1786390…eqhe24` | `transformer-turns` | 李四 | 53 | 100 | — | 20 | 25 | 0 | 尚不清晰 | 达标 | 1 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| 低分<60 | `sess-1786391…85m7ca` | `transformer-turns` | 李四 | 53 | 100 | — | 20 | 25 | 0 | 尚不清晰 | 达标 | 1 | false | Pc:多参盲调 · 竞赛·混调 | Y |
| null/待评 | `sess-1785749…201qxf` | `capacitor-confound-ui` | 全量试玩 | — | — | 91 | 55 | 25 | 0 | 未评估 | 待评 | 1 | false | Pe:单变量·极板面积 · Pc:单变量·极板面积 · 探究·单变量 · 竞赛·单变量 | N |
| null/待评 | `sess-1786389…fdqezq` | `capacitor-era-ch1` | 李四 | — | — | — | 0 | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| null/待评 | `sess-1786389…e84b4l` | `capacitor-era-ch1` | 李四 | — | — | — | — | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| null/待评 | `sess-1786390…kdfmqt` | `capacitor-era-ch2` | 李四 | — | — | — | — | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| 一发过·gate真 | `sess-1786174…j8h7cy` | `ramp-rolling-collision` | 李四 | 93 | 100 | — | 78 | 100 | 0 | 部分清楚 | 达标/pass | 1 | true | Pc:单变量·靶球质量 · 竞赛·单变量 | Y |
| 补样 | `sess-1786390…4xax22` | `capacitor-era-ch2` | 李四 | — | — | — | — | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| 补样 | `sess-1786390…qfxoo6` | `capacitor-era-ch2` | 李四 | — | — | — | — | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| 补样 | `sess-1786391…idw4sg` | `capacitor-era-ch2` | 李四 | — | — | — | — | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| 补样 | `sess-1786390…exdkkm` | `capacitor-era-ch4` | 李四 | — | — | — | — | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| 补样 | `sess-1786390…zv5umb` | `circular-motion` | 李四 | — | — | 94 | 44.1 | 45 | 0 | 未评估 | 待评 | 2 | false | Pe:单变量·半径 · Pc:单变量·半径 · 探究·单变量 · 竞赛·单变量 | N |
| 补样 | `sess-1786390…tslwbt` | `friction-incline` | 李四 | — | — | — | — | — | 0 | 未评估 | 待评 | 0 | false | — | N |
| 补样 | `sess-1786391…6sm2mr` | `heat-conduction` | 李四 | — | — | 78.1 | 81 | 85 | 0 | 未评估 | 待评 | 3 | true | Pe:单变量·导热系数 · Pc:单变量·温差 · 探究·单变量 · 竞赛·单变量 | N |
| 补样 | `sess-1786390…2kefci` | `magnetic-force` | 李四 | — | — | — | 0 | — | 0 | 未评估 | 待评 | 0 | false | — | N |

## 4. 看点（定性）

- **幸运一发**（过关 + trials==1 + gate 假且 Pc/E 偏低）：**3** 例。
  - 例：`sess-1786389…mqfgeb`(capacitor-era-ch1, Pc=20, E=25)；`sess-1786390…eqhe24`(transformer-turns, Pc=20, E=25)；`sess-1786391…85m7ca`(transformer-turns, Pc=20, E=25)
- **扎实一发**（过关 + trials==1 + gate 真且 Pc/E 较高）：**3** 例。
  - 例：`sess-1786174…j8h7cy`(ramp-rolling-collision, total=93)；`sess-1786391…ai2fop`(pendulum-clock, total=100)；`sess-1786391…6k1ctz`(photoelectric, total=100)
- **缺 phase_change**（整局进 Pe、Pc=null）：约 **0** 条有分会话；renorm 会抬高 Pe/R 权重，对照时注意勿当「竞赛过程」。
- **多关部分 R**：1 条（0 < cleared < total）；任意多关标记 **1** 条。
- **Pe 空 renorm**：探究 effectiveTrials=0 时 Pe→null（不再记 0）；本批有分且 Pe=null、Pc 有值约 **9** 条。
- **Pe-null 过程档**：清楚 **2** / 部分清楚 **4**（v2：Pe-null 且竞赛试次<2 不得标清楚；本批此类残留清楚 **0**）。
- **权重建议**：null/待评占比偏高（多未评判或进行中）属预期；校准请以有总分子集为主，权重可先不动。

## 5. 复跑

```bash
node tests/scripts/backfill-ability-score.js --report --human-report
node tests/scripts/backfill-ability-score.js --force --report --human-report
node tests/scripts/backfill-ability-score.js --package projectile-cannon --limit 10
```

## 6. 下下步

1. 人样扩大：课堂采集更多非「李四」标签会话（当前人样仍偏单标签；不可合成）。
2. 大炮真人复测：用新 emit（interim/final/levelsCleared）再打一局，确认磁盘 win payload 含旗标。
3. 合成夹具：若重跑 full-eval/playtest ingest，大炮 S1/S2 已带 final+levelsCleared=4；旧合成轨迹仍为 legacy 1/4。
4. 权重：人样多样后再评估是否动 30/25/25/20。

