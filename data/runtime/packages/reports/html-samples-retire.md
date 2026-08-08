# html-samples/chapters 退役报告（M1→M4）

**日期**：2026-08-08  
**目标**：chapter 真相源统一为 `data/runtime/packages/{id}/`；删除 `data/datasets/html-samples/chapters/`。

## 完成的里程碑

| 里程碑 | 状态 | 摘要 |
|--------|------|------|
| M1 适配层 | ✅ | `loadChapterForSample` / `loadMetaForSample` / `getPackageMetaPath` / `getJudgeFixturesPath`；盘点见 [`html-samples-retire-m1.md`](./html-samples-retire-m1.md) |
| M2 迁读 | ✅ | 训练/批跑/评判/seed-demo 等改读 packages；默认 SFT → `training/v2-packages` |
| M3 Fixtures | ✅ | `judge-fixtures.json` → `tests/fixtures/`；`chapterRef` 支持 bundle 或 `packageId` |
| M4 删除与防回归 | ✅ | 删除 `chapters/`；去掉 chapters fallback；新增 `packages-chapter-load`（24/24） |

## 删除了什么

- **目录**：`data/datasets/html-samples/chapters/`（原 17 条 chapter/meta）
- **文件迁移**：`data/datasets/html-samples/judge-fixtures.json` → `tests/fixtures/judge-fixtures.json`（旧路径已移除）
- **API**：`getHtmlSampleChapterPath` 不再回退 chapters（等同 `getPackageChapterPath`）
- **`getPackagesRoot`**：不再回退到 `html-samples`（布局不同，易指错根）

删前漂移摘要：[`html-samples-chapter-drift.md`](./html-samples-chapter-drift.md)（重叠 17 条全部与 packages 不一致；packages 更完整）。

## Fixtures 新路径

- **路径**：`tests/fixtures/judge-fixtures.json`
- **解析**：`getJudgeFixturesPath()`（`packages/shared/data-paths.js`）
- **chapterRef**：
  - `{ "bundle": "judge", "key": "generic" }` → `tests/fixtures/*.bundle.json`
  - `{ "packageId": "multi-kp" }` → `data/runtime/packages/{id}/chapter.json`

## 关键代码改动

- `packages/shared/data-paths.js` — loaders + fixtures path + 去掉错误 fallback
- `tests/lib/chapter-loader.js` — 薄 re-export
- 脚本：`export-llm-training-jsonl`、`html-sft-eval`、`upload-html-finetune`、`batch-graph-quality-eval`、`batch-judge-eval`、`seed-platform-demo`、`batch-analyze-graph-eval`、`retag-essence-craft`、`seed-html-samples`、`ingest-teammate-samples`
- 回归：`packages-chapter-load`；`batch-judge-fixtures` 挂入 contract suite
- 文档：`docs/DATA_LAYOUT.md`、`data/datasets/html-samples/README.md`、`reports/README.md`、`docs/structure.md`

## 如何跑验证

```bash
# Fixtures / chapter 加载
node tests/regression/check.js --suite contract --filter batch-judge-fixtures
node tests/regression/check.js --suite generate --filter packages-chapter-load
node tests/regression/check.js --suite generate --filter html-samples-chapter-load

# 冒烟
npm run export-training-jsonl          # → data/datasets/training/v2-packages
npm run batch-graph-quality-eval       # 24 samples，不因路径炸掉
npm run batch-judge-eval -- --fixtures-only
npm run html-sft-eval                  # 读 packages game.html（见残留风险）
```

### 本次实测

| 检查 | 结果 |
|------|------|
| batch-judge-fixtures | OK |
| packages-chapter-load | OK **24/24**（含 `ramp-rolling-collision`） |
| html-samples-chapter-load | OK |
| export-training-jsonl | OK → v2-packages（parse 20/4，html 16/2，reject 6） |
| batch-graph-quality-eval | OK（24 samples，quality 23/24） |
| batch-judge-eval --fixtures-only | OK 3/3 |
| html-sft-eval | **2/4 FAIL**（内容门控，非路径） |

## 残留风险

1. **`html-sft-eval`**：`multi-kp`（`missing_sim_loop`）、`heat-conduction`（`missing_control_id:I1`）相对 packages `game.html` 未过 `validateGeneratedHtml`。路径已正确；属内容/金标漂移，非 chapters 退役阻断。
2. **`data/datasets/html-samples/manifest.json`** 仍作 deprecated 镜像（seed/retag/ingest 可双写）；业务读路径已统一 packages。长期可只留 packages。
3. **`training/v1`** 未删、未覆盖；新导出默认 `v2-packages`。
4. **`样本html` 双写流程未改**（按原则）。
5. 历史报告文案中可能仍出现 `html-samples/chapters` 字样（说明性）；**业务 `.js` 已无硬编码读路径**。

## 成功标准对照

- [x] 无业务脚本再硬编码读 `html-samples/chapters`
- [x] `chapters/` 目录已删除
- [x] 训练/批跑以 packages 23+ 章为准（实测 24，含 `ramp-rolling-collision`）
- [x] `judge-fixtures` 新家且 batch-judge-fixtures 绿
- [x] DATA_LAYOUT / html-samples README / reports README 已更新
- [x] 防回归：`packages-chapter-load` 对 manifest 全量断言
