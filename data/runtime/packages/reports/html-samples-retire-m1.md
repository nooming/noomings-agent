# M1 依赖盘点：`html-samples/chapters` → packages

| 脚本 / 模块 | 原硬依赖 | 迁后 |
|-------------|----------|------|
| `packages/shared/data-paths.js` | `getHtmlSampleChapterPath` fallback chapters | `loadChapterForSample` / `loadMetaForSample`；无 chapters fallback |
| `tests/lib/chapter-loader.js` | （新建） | re-export loaders |
| `tests/lib/html-samples-manifest.js` | 已读 packages manifest | 保持 |
| `export-llm-training-jsonl.js` | manifest + chapters + generated HTML | packages manifest + chapter + `game.html` → `training/v2-packages` |
| `html-sft-eval.js` | chapters + generated | packages chapter + game.html |
| `batch-graph-quality-eval.js` | CHAPTER_ROOT chapters | `loadMetaForSample` / packages chapter |
| `batch-judge-eval.js` | chapters + 夹内 fixtures | packages + `tests/fixtures/judge-fixtures.json` |
| `seed-platform-demo.js` | chapters + generated | packages chapter/game + canonical playUrl |
| `batch-analyze-graph-eval.js` | 夹内 manifest | packages manifest |
| `retag-essence-craft.js` | 双写 HS manifest | packages 为主；HS 标记 deprecated mirror |
| `seed-html-samples.js` | 未使用的 OUT_CHAPTER_LEGACY | 删除死变量 |
| `ingest-teammate-samples.js` | 双写 HS | packages 为主；HS deprecated |
| `batch-judge-fixtures` regression | 夹内 fixtures | `getJudgeFixturesPath()`；已挂入 contract suite |
| `packages-chapter-load` regression | （新建） | manifest 全量 chapter 可 parse |

详见 [`html-samples-retire.md`](./html-samples-retire.md)。
