# 数据目录布局

磁盘路径与 HTTP URL 对照。路径解析见 [`packages/shared/data-paths.js`](../packages/shared/data-paths.js)。

| 磁盘路径 | 内容 |
|----------|------|
| `data/runtime/packages/` | **探究包统一目录**（23 包：`game.html`、图谱、`chapter.json` 等） |
| `样本html/` | **编辑源**（中文夹名；仅游戏 HTML + `图谱.html`）。改完须同步到 packages，勿只改此处却期望运行时自动更新 |
| `data/games/legacy/` | 历史样本 HTML（design-samples 引用；HTTP `/static/legacy-samples/`） |
| `data/games/manual-backups/` | 人工 HTML 原件归档（不挂载 HTTP） |
| `data/games/generated/` | Agent A API 生成的 HTML（新探究包优先落 packages） |
| `data/datasets/html-samples/` | 批跑/SFT 兼容层：`manifest*.json` + `chapters/`（17 条遗留章，见夹内 README）。**不是**现行 23 样本真相源 |
| `data/datasets/design-samples/` | 设计态 fixture |
| `data/datasets/training/` | SFT JSONL 输出目录（`npm run export-training-jsonl`） |
| `data/datasets/expert-graphs/` | 专家图谱数据集 |
| `data/runtime/platform/` | 平台 catalog、adapters；`traces/` 本地运行数据（通常 gitignore） |

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

## 旧路径兼容

若新目录不存在，自动回退：`data/html-samples`、`data/output`、`data/samples` 等。详见 `data-paths.js` 中 `resolveWithFallback`。
