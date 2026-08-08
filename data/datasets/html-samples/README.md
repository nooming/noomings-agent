# HTML 样本集（批跑兼容残留）

**现行金标 / chapter 真相源不在这里**：见 `样本html/清单.md` 与 `data/runtime/packages/`（manifest + `{id}/chapter.json`）。

本目录仅保留历史镜像与演示子集；**`chapters/` 已删除**（2026-08 退役）。

## 目录

| 路径 | 说明 |
|------|------|
| `manifest.json` | **deprecated 镜像**：与 packages manifest 同步副本；脚本应以 `getPackageManifestPath()` 为准 |
| `manifest-regression.json` | 回归专用（不上架 catalog） |
| `catalog-demo.json` | 演示 catalog 子集 |
| ~~`judge-fixtures.json`~~ | **已迁至** `tests/fixtures/judge-fixtures.json` |
| ~~`chapters/`~~ | **已删除**；请读 `data/runtime/packages/{id}/chapter.json` |
| 批跑报告 | `data/runtime/packages/reports/` |

## 常用命令

```bash
npm run seed-sample-catalog
npm run batch-html-dataset -- --id multi-kp --force
npm run export-training-jsonl          # → data/datasets/training/v2-packages
npm run html-sft-eval
npm run batch-graph-quality-eval
npm run batch-judge-eval -- --fixtures-only
```

详见 [`../../runtime/packages/reports/README.md`](../../runtime/packages/reports/README.md) 与退役报告 [`../../runtime/packages/reports/html-samples-retire.md`](../../runtime/packages/reports/html-samples-retire.md)。
