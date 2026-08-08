# 仓库目录结构（方案 C）

HTTP 路径（`/static/*`、`/output/*`）保持不变；磁盘布局按 **apps + packages + tests** 分层，由 [`packages/shared/data-paths.js`](../packages/shared/data-paths.js) 集中管理并兼容旧目录。

```
agent/
  server.js              # 入口，require('./apps/server')
  start-agent.bat
  package.json
  apps/
    server/              # HTTP、静态资源映射（static.js、api.js）
    web/                 # 浏览器资源
      ui/pages/          # 平台、教师、学生
      viewer/js/         # 图谱预览 shell
  packages/
    shared/              # paths、data-paths、env、llm、浏览器共用模块
    contract/            # enrich、校验、修复
      enrich/
      repair/
      validate/
      strategy/
      graph/
      classify/
      index.js, constants.js, schema-prompt.js
    generate/            # Agent A 管线、导出、持久化
      hints/
      level-detect/
      level-detect.js    # 薄 re-export → level-detect/index.js
    judge/               # Agent B 评判引擎
    platform/            # 任务 catalog、学情 traces
  tests/
    regression/          # check.js + suites/
    fixtures/
    lib/
    demos/
    scripts/             # npm 脚本工具（stop-server、seed-* 等）
  样本html/              # 23 份编辑源（中文夹；游戏 + 图谱.html）
  安排/                  # 方案 / 会议纪要
  data/
    games/
      preset/
      legacy/
      generated/
    datasets/
      design-samples/
      expert-graphs/
      html-samples/        # 批跑兼容残留：deprecated manifest 镜像（chapters 已删）
      training/            # SFT：v1 历史 / v2-packages 现行
    runtime/
      packages/            # 探究包真相源（manifest 23+）+ vendor + reports
      platform/
  docs/
    structure.md
    DATA_LAYOUT.md
    TESTING.md
    advisor/
```

## 根目录约定

根目录保留：**入口**（`server.js`、`start-agent.bat`）、**配置**（`package.json`、`.env*`）、**README**、代码目录（`apps/`、`packages/`、`tests/`、`data/`、`docs/`）、编辑源 `样本html/`、方案 `安排/`。

## HTTP URL 与磁盘路径

| HTTP URL | 磁盘路径（优先 → 回退） |
|----------|-------------------------|
| `/static/shared/*` | `packages/shared/` |
| `/static/samples/*` | `data/games/preset/` → `data/samples/` |
| `/static/samples/generated/*` | `data/games/generated/` → `data/samples/generated/` |
| `/static/legacy-samples/*` | `data/games/legacy/` → `legacy-samples/` |
| `/static/packages/*` | `data/runtime/packages/` |
| `/packages/*` | `data/runtime/packages/{id}/index.html` |
| `/static/html-samples/*` | alias → `data/runtime/packages/` |
| `/static/samples/*` | alias → packages / `data/games/preset/` |
| `/output/*` | alias → `data/runtime/packages/` |
| `/static/viewer/js/*` | `apps/web/viewer/js/`（部分模块回退到 `packages/shared/`） |

实现：[`apps/server/static.js`](../apps/server/static.js)、[`packages/shared/data-paths.js`](../packages/shared/data-paths.js)。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `AGENT_OUTPUT_ROOT` | `data/runtime/packages`（经 data-paths 回退 output） | 探究包落盘 |
| `AGENT_VIEWER_ROOT` | `apps/web/viewer` | 预览 viewer |

## contract 子包

| 子目录 | 职责 |
|--------|------|
| `enrich/` | `enrichChapterContract` 流水线编排 |
| `repair/` | scope、mapsTo、route highlight、dt 分支、coupled 等后处理 |
| `validate/` | `validate-structure` / `validate-scope` / `validate-quality` |
| `strategy/` | mermaid 规则、sanitize、compact |
| `graph/` | KG play 图、traceMap、DT–KG 耦合校验 |
| `classify/` | outcome / constraint gate 分类 |

## generate 拆分

| 模块 | 文件 |
|------|------|
| **hints** | `source-scan.js`、`controls.js`、`level-context.js`、`prompt.js`、`index.js` |
| **level-detect** | `parse-utils.js`、`strategy-*.js`、`merge.js`、`index.js` |

对外 `require('./hints')`、`require('./level-detect')`（`level-detect.js` re-export 目录实现）。

## 跨层依赖

`packages/contract/*` 与 `tests/regression/suites/*` 引用 [`packages/shared/strategy-mermaid-parse.js`](../packages/shared/strategy-mermaid-parse.js)，浏览器经 `/static/shared/` 加载；避免 packages → apps/web 反向依赖。
