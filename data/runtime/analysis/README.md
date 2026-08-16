# analysis/

离线分析快照与报告流水线（与 `data/runtime/platform/traces/` **热数据**、`data/runtime/packages/` **探究包真相源**分离）。

## 目录

| 路径 | 说明 |
|------|------|
| `traces-全部-YYYYMMDD/` | 课堂 traces **只读快照**（大 JSON；本目录 `.gitignore` + 仓库根 `/traces-全部-*/`） |
| `reports/` | PCA / 审计 / 批跑报告产物（可入库；原 `packages/reports` 已迁入） |

## 流水线（快照 → 口径 → 报告）

```
1) 快照
   将课堂 traces **只解压/复制到本目录**：
   data/runtime/analysis/traces-全部-YYYYMMDD/
   （禁止长期留在仓库根目录；勿覆盖 platform/traces 热数据）

2) 口径
   - 能力分 v4：探究达成 = explore_success；竞赛通关 = win（二者不可互换）
   - 默认排除 observe-only / researchInclude=false（catalog 字段或 sampleTags）
   - 旧轨迹探究段 win 仍兼容，但新产品埋点应发 explore_success

3) 报告
   node scripts/radar-pca-analysis.js
     [--traces-root=./data/runtime/analysis/traces-全部-YYYYMMDD]
     [--include-observe-only]
   → data/runtime/analysis/reports/radar-pca-analysis.md

   node scripts/session-pca-kmo-approx49.js
     [--traces-root=...]
   → data/runtime/analysis/reports/session-pca-kmo-approx49.md
```

脚本通过 `getReportsRoot()`（`packages/shared/data-paths.js`）写报告，勿再硬编码 `packages/reports`。

## 入口脚本

| 脚本 | 作用 |
|------|------|
| `scripts/radar-pca-analysis.js` | 学生级六维 PCA / KMO |
| `scripts/session-pca-kmo-approx49.js` | 会话级四维 PCA / KMO |

## 注意

- 不要用本目录覆盖 `platform/traces/` 热数据。
- 热路径请勿挪入 analysis；分析只用快照副本。
- 根目录若出现 `traces-全部-*`，应移入本目录或删除重复后再分析。
