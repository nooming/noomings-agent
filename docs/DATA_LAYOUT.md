# 数据目录布局

磁盘路径与 HTTP URL 对照。路径解析见 [`packages/shared/data-paths.js`](../packages/shared/data-paths.js)。

## 三区（`data/runtime/`）

| 磁盘路径 | 角色 |
|----------|------|
| `data/runtime/platform/` | **热数据**：catalog、adapters、本地 `traces/`（通常 gitignore，勿用分析快照覆盖） |
| `data/runtime/packages/` | **探究包真相源**：`manifest.json` + `{id}/game.html`、`chapter.json`、`meta.json`、图谱等（**不含**业务 reports） |
| `data/runtime/analysis/` | **离线分析区**：`traces-全部-YYYYMMDD/` 快照（gitignore）+ `reports/` 报告产物（可入库） |

## 其它路径

| 磁盘路径 | 内容 |
|----------|------|
| `样本html/` | **单向镜像**（中文夹名；游戏 HTML + `图谱.html`）。改完须同步到 packages；运行时不以此处为真相源 |
| `data/games/legacy/` | 历史样本 HTML（design-samples 引用；HTTP `/static/legacy-samples/`） |
| `data/games/manual-backups/` | 人工 HTML 原件归档（不挂载 HTTP） |
| `data/games/generated/` | Agent A API 生成的 HTML（新探究包优先落 packages） |
| `data/datasets/html-samples/` | **批跑兼容残留**：`manifest*.json`、`catalog-demo.json`（镜像 / 演示子集）。**已删除** `chapters/`；训练与评判读 packages |
| `tests/fixtures/judge-fixtures.json` | Agent B 离线评判 fixtures（`chapterRef`: bundle 或 `packageId`） |
| `data/datasets/design-samples/` | 设计态 fixture |
| `data/datasets/training/` | SFT JSONL 输出：`v1/`（历史）、`v2-packages/`（现行，`npm run export-training-jsonl`） |
| `data/datasets/expert-graphs/` | 专家图谱数据集 |

## 禁止

- **仓库根目录禁止长期保留** `traces-全部-*`（只解压到 `data/runtime/analysis/`）。
- 不要用 analysis 快照覆盖 `platform/traces/` 热数据。
- 历史路径 `data/runtime/packages/reports/` 已迁至 `data/runtime/analysis/reports/`。

## HTTP URL

| URL | 说明 |
|-----|------|
| `/static/packages/{id}/game.html` | 探究包可玩 HTML（canonical） |
| `/packages/{id}/index.html` | 探究包图谱预览页 |
| `/graph.html?graphId={id}` | 动态图谱预览 API 页 |
| `/api/graph-preview?graphId=...` | 预览数据 JSON API |
| `/static/legacy-samples/` | 历史样本 |
| `/static/html-samples/` | 兼容 alias → packages |
| `/static/samples/` | 兼容 alias |
| `/output/` | 兼容 alias → packages |
| `/static/shared/` | 共用 JS（strategy-mermaid-parse、tab-label） |

`resources/shiguangtongxue/`（拾光物理离线镜像）**默认不存在**、不挂载 HTTP；需要时用 `npm run crawl-shiguang-physics` 重建。

## graphId 约定

- 新探究包：`{packageId}`（如 `projectile-basic`）
- 兼容别名：`html-samples-{id}` 等 → 见 `packages/shared/package-layout.js`

## 路径 API

业务脚本应通过 `packages/shared/data-paths.js`：

- `getPackagesRoot` / `getPackageManifestPath`
- `getPackageChapterPath` / `getPackageGamePath` / `getPackageMetaPath`
- `loadChapterForSample` / `loadMetaForSample`
- `getJudgeFixturesPath`
- `getAnalysisRoot` / `getReportsRoot`（PCA、审计、批跑报告输出）

`getPackagesRoot` **不再**回退到 `html-samples`（布局不同，易指错根）。其它旧目录若新路径不存在，仍见 `resolveWithFallback`。
