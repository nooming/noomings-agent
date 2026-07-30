# HTML 样本集批跑报告

本目录保留：本 README、各类可复现批跑产物（`sample-quality-overview.json`、`expert-graph-eval.*`、`control-alignment-audit.*`、`narrative-cleanliness.json`、`trace-event-audit.*`、`priority-physics-audit.json`、`repair-narrative-surgical.json` 等）。过程临时文件勿长期堆放。

## 真相源（勿混用）

| 路径 | 职责 |
| --- | --- |
| `样本html/` | **编辑源**：23 份中文夹，仅游戏 HTML + `图谱.html` |
| `data/runtime/packages/{id}/` | **运行时权威**：`game.html`、`chapter.json`、`meta.json`、图谱；平台与评测读这里 |
| `data/datasets/html-samples/` | **批跑/SFT 兼容层**：manifest + 17 条遗留 chapters；**不是**现行 23 金标 |
| `data/datasets/expert-graphs/` | 专家评测金标：手写 2 + curated 固化 |

漂移警告：改 `样本html` 后需同步到 packages（现有 seed/organize 脚本）；勿只改 html-samples/chapters 以为已更新 yangben。

Vendor：权威 `apps/web/viewer/vendor/` → 导出同步到 `data/runtime/packages/vendor/`（见该夹 README）。

## 叙事干净度 v2（2026-07-30）

按稳序完成：**先改门控 → 试点 → 达标后逐包 surgical 扩到 23**。**禁止**全量 `batch-package-analyze` / enrich 回退。

### 门控新口径

| 项 | 规则 |
| --- | --- |
| 反馈环合格 | 须落到真实 AV / 调参 / 发射（域 `Observe→Adjust→Fire`）；`Adjust*` 节点 id 也可认 |
| **不计合格** | 纯 `LoopObserve` / `LoopAdjust` / `LoopRetest` / 空 `RPref*` 机械脚手架单独凑 structural |
| 降权 | 域环已合格但仍残留 Loop* → quality **warning**（推动拆除） |
| repair | `repair-quality-surgical` / `repair-narrative-surgical` **不再注入** Loop* 三联环；改为桥接域节点 |
| 混淆支路 | `ObserveCV` / confound route **不要求**域 Observe→Adjust→Fire 高亮 |
| 宏路径计数 | `StrategySelect` 的 `-->` 与 `-·->`（混淆）边标签均计入 |

### 结果（narrative v2 基线）

| 指标 | 清理前 | 清理后 |
| --- | ---: | ---: |
| 叙事干净度均（全量） | ~0.37（23/23 dirty） | **1.0**（0 dirty） |
| design-mode quality | 23/23 | **23/23** |
| hand-authored 节点 F1 | 0.667 | **0.667**（未恶化） |
| hand-authored 斜抛干净度 | 0.35 | **1.0** |
| curated 金标 | 旧 chapter 快照 | 已 re-seed（**非**真人专家；报告须诚实） |

- 手写金标 **未覆盖**：`projectile-basic` / `pendulum-clock` 的 expert-graphs 保持 hand-authored（`seed-expert-graphs` 默认 keep）。
- 试点先跑：`projectile-basic`、`multi-kp`、`friction-incline`、`projectile-cannon`、`momentum-collision`；随后分批 surgical 覆盖其余 18 个。
- 复现清理：`npm run repair-narrative-surgical`（可 `--id` / `--ids a,b`）；报告见 `repair-narrative-surgical.json`。

### 复现命令

```bash
npm run repair-narrative-surgical          # 叙事 surgical（无 enrich）
node tests/scripts/seed-expert-graphs.js   # curated re-seed；手写 2 条默认保留
npm run batch-expert-graph-eval
npm run audit-control-alignment
npm run audit-priority-physics
npm run audit-trace-events
npm run build-sample-quality-overview
npm run test:check:contract
npm run test:check:strategy
```

### API 契约（Agent B / 课堂）

| 接口 | 说明 |
| --- | --- |
| `POST /api/platform/strategy-path-summary` | body: `sessionId`, `audience=student\|teacher`, `showScore`；返回 `summary.text` + `summary.advice`（学生默认无分） |
| `GET /api/platform/traces/classroom` | 课堂看板 JSON；`?format=csv` 导出 |
| 图谱预览 | `/graph.html?graphId=…&audience=student` 对学生隐藏混淆剧透与最优优先级措辞 |

### 跨模型稳定性（脚手架）

无 API Key 时不必真跑。有 Key 时可：

```bash
# 同一 id 换模型环境变量后对比 chapter / overview（自行归档 diff）
# DEEPSEEK_API_KEY=… npm run batch-html-dataset -- --id projectile-basic
```

## 给老师看（一页摘要）

| 维度 | 指标 | 来源 |
|------|------|------|
| 样本规模 | **23 条样本html** | `tests/lib/yangben-sample-map.js` |
| 设计轨 quality | 通过率 | `sample-quality-overview.json` |
| 探究效度 | 强/中/弱启发式 | overview `inquiryValidity*` |
| 专家对齐 | 须看 **hand-authored 分栏**，勿只报全量 | `expert-graph-eval.md` |
| 叙事干净度 | v2：域反馈环；禁纯 Loop* 凑数 | `narrative-cleanliness.json` |
| 课堂看板 | 调节次数 / CV 倾向 / 路径类型与分 | 教师「学情」Tab |
| 学情评判 | verdict 一致率 | `agent-b-report.json` |

**已知项：** `test:check:strategy` 中 multiFork 等 fixture 的 never-lit-edge **警告**属宏分叉隔离预期（已标注非 yangben 缺陷）；fail 已用 fixture 节点声明收口。

## 说明

- curated 金标高 F1 **≠** 真人专家对齐；报告已诚实声明。v2 re-seed 后 curated≈1.0 仍是「自己比自己」。
- `diag/` 下为一次性补丁脚本，非正式管线（见 `tests/scripts/diag/README.txt`）。
- **风险**：旧 session 轨迹高亮可能与新 StrategySelect 目标不完全对齐；勿再跑会回灌 Loop* 的旧 enrich 全量批。
